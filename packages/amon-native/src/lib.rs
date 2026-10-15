use goblin::pe::PE;
use napi::bindgen_prelude::{AsyncTask, Env, Error, Result, Status, Task};
use napi_derive::napi;
use sha2::{Digest, Sha256};
use std::borrow::Cow;
use std::fs;
use std::path::Path;

const MAX_INPUT: usize = 512 * 1024 * 1024;
const MAX_OUTPUT: usize = 1024 * 1024 * 1024;

#[napi(object)]
pub struct EngineInfo {
    pub name: String,
    pub version: String,
    pub napi: u32,
    pub target: String,
}

#[napi(object)]
pub struct SectionInfo {
    pub name: String,
    pub virtual_address: u32,
    pub virtual_size: u32,
    pub raw_offset: u32,
    pub raw_size: u32,
}

#[napi(object)]
pub struct PeInfo {
    pub architecture: String,
    pub entrypoint: u32,
    pub image_base: String,
    pub section_alignment: u32,
    pub file_alignment: u32,
    pub image_size: u32,
    pub header_size: u32,
    pub has_relocations: bool,
    pub has_tls: bool,
    pub is_dot_net: bool,
    pub overlay_size: u32,
    pub sections: Vec<SectionInfo>,
}

#[napi(object)]
pub struct ConvertResult {
    pub architecture: String,
    pub input_size: u32,
    pub output_size: u32,
    pub stub_offset: u32,
    pub sha256: String,
}

#[napi]
pub fn engine_info() -> EngineInfo {
    EngineInfo {
        name: "amon-native".into(),
        version: env!("CARGO_PKG_VERSION").into(),
        napi: 8,
        target: format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH),
    }
}

pub struct InspectTask {
    path: String,
}

impl Task for InspectTask {
    type Output = PeInfo;
    type JsValue = PeInfo;

    fn compute(&mut self) -> Result<Self::Output> {
        inspect(&self.path)
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

#[napi]
pub fn inspect_pe(path: String) -> AsyncTask<InspectTask> {
    AsyncTask::new(InspectTask { path })
}

pub struct ConvertTask {
    input_path: String,
    stub_path: String,
    output_path: String,
    scheme: String,
}

impl Task for ConvertTask {
    type Output = ConvertResult;
    type JsValue = ConvertResult;

    fn compute(&mut self) -> Result<Self::Output> {
        convert(
            &self.input_path,
            &self.stub_path,
            &self.output_path,
            &self.scheme,
        )
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

#[napi]
pub fn convert_pe(
    input_path: String,
    stub_path: String,
    output_path: String,
    scheme: String,
) -> AsyncTask<ConvertTask> {
    AsyncTask::new(ConvertTask {
        input_path,
        stub_path,
        output_path,
        scheme,
    })
}

fn inspect(path: &str) -> Result<PeInfo> {
    let raw = read_limited(path, MAX_INPUT)?;
    let layout = Layout::parse(&raw)?;
    let binary = PE::parse(&raw)
        .map_err(|error| invalid(&format!("PE parser rejected the image: {error}")))?;
    let sections = binary
        .sections
        .iter()
        .map(|section| SectionInfo {
            name: section.name().unwrap_or("").to_string(),
            virtual_address: section.virtual_address,
            virtual_size: section.virtual_size,
            raw_offset: section.pointer_to_raw_data,
            raw_size: section.size_of_raw_data,
        })
        .collect();

    Ok(PeInfo {
        architecture: layout.architecture().into(),
        entrypoint: layout.entrypoint,
        image_base: layout.image_base.to_string(),
        section_alignment: layout.section_alignment,
        file_alignment: layout.file_alignment,
        image_size: layout.image_size,
        header_size: layout.header_size,
        has_relocations: layout
            .directory(5)
            .is_some_and(|item| item.0 != 0 && item.1 != 0),
        has_tls: layout
            .directory(9)
            .is_some_and(|item| item.0 != 0 && item.1 != 0),
        is_dot_net: layout
            .directory(14)
            .is_some_and(|item| item.0 != 0 && item.1 != 0),
        overlay_size: u32::try_from(layout.overlay_size(raw.len())).unwrap_or(u32::MAX),
        sections,
    })
}

fn convert(
    input_path: &str,
    stub_path: &str,
    output_path: &str,
    scheme: &str,
) -> Result<ConvertResult> {
    if scheme != "1" && scheme != "2" {
        return Err(invalid("scheme must be 1 or 2"));
    }
    let raw = read_limited(input_path, MAX_INPUT)?;
    let layout = Layout::parse(&raw)?;
    PE::parse(&raw).map_err(|error| invalid(&format!("PE parser rejected the image: {error}")))?;
    let stub = if stub_path.trim().is_empty() {
        Cow::Borrowed(builtin_stub(layout.is_64, scheme))
    } else {
        Cow::Owned(read_limited(stub_path, MAX_INPUT)?)
    };
    if stub.is_empty() {
        return Err(invalid("stub is empty"));
    }
    if !layout
        .directory(5)
        .is_some_and(|item| item.0 != 0 && item.1 != 0)
    {
        return Err(invalid("PE image has no base relocation table"));
    }
    if layout
        .directory(14)
        .is_some_and(|item| item.0 != 0 && item.1 != 0)
    {
        return Err(invalid(".NET PE images are not supported by this backend"));
    }

    let section_alignment =
        usize::try_from(layout.section_alignment).map_err(|_| invalid("section alignment"))?;
    if section_alignment == 0 || !section_alignment.is_power_of_two() {
        return Err(invalid("invalid section alignment"));
    }
    let overlay_start = layout.overlay_start(raw.len());
    let overlay = &raw[overlay_start..];
    let virtual_end = layout
        .sections
        .iter()
        .try_fold(0usize, |current, section| {
            let end = usize::try_from(section.virtual_address)
                .ok()
                .and_then(|start| {
                    usize::try_from(section.virtual_size)
                        .ok()
                        .and_then(|size| start.checked_add(size))
                })
                .ok_or_else(|| invalid("section range overflow"))?;
            Ok::<usize, Error>(current.max(end))
        })?;
    let stub_offset = align(
        virtual_end
            .checked_add(overlay.len())
            .ok_or_else(|| invalid("output range overflow"))?,
        section_alignment,
    )?;
    if stub_offset > u32::MAX as usize {
        return Err(invalid("stub offset exceeds PE32 range"));
    }

    let mut output = raw[..layout.section_table].to_vec();
    if scheme == "2" && layout.pe_offset > 64 {
        output[64..layout.pe_offset].fill(0);
    }
    for section in &layout.sections {
        let mut header = section.header;
        put_u32(&mut header, 16, section.virtual_size)?;
        put_u32(&mut header, 20, section.virtual_address)?;
        output.extend_from_slice(&header);
    }
    let header_end = align(output.len(), section_alignment)?;
    resize(&mut output, header_end)?;

    let mut sections = layout.sections.clone();
    sections.sort_by_key(|section| section.virtual_address);
    for section in sections {
        let virtual_address =
            usize::try_from(section.virtual_address).map_err(|_| invalid("section address"))?;
        let virtual_size =
            usize::try_from(section.virtual_size).map_err(|_| invalid("section size"))?;
        resize(&mut output, virtual_address)?;
        let raw_offset =
            usize::try_from(section.raw_offset).map_err(|_| invalid("section raw offset"))?;
        let raw_size =
            usize::try_from(section.raw_size).map_err(|_| invalid("section raw size"))?;
        let available = raw.len().saturating_sub(raw_offset);
        let copied = raw_size.min(virtual_size).min(available);
        if copied > 0 {
            output.extend_from_slice(&raw[raw_offset..raw_offset + copied]);
        }
        resize(
            &mut output,
            virtual_address
                .checked_add(virtual_size)
                .ok_or_else(|| invalid("section overflow"))?,
        )?;
    }
    resize(&mut output, virtual_end)?;
    output.extend_from_slice(overlay);
    resize(&mut output, stub_offset)?;
    output.extend_from_slice(stub.as_ref());
    if output.len() > MAX_OUTPUT {
        return Err(invalid("converted image exceeds the output limit"));
    }

    put_u32(
        &mut output,
        layout.optional_offset + 36,
        layout.section_alignment,
    )?;
    let (mut redirection, offset_position): (Vec<u8>, usize) = match (layout.is_64, scheme) {
        (false, "1") => (
            vec![
                0x4d, 0x5a, 0x45, 0x52, 0xe8, 0, 0, 0, 0, 0x58, 0x83, 0xe8, 9, 0x50, 5, 0, 0, 0, 0,
                0xff, 0xd0, 0xc3,
            ],
            15,
        ),
        (true, "1") => (
            vec![
                0x4d, 0x5a, 0x45, 0x52, 0xe8, 0, 0, 0, 0, 0x59, 0x48, 0x83, 0xe9, 9, 0x48, 0x8b,
                0xc1, 0x48, 5, 0, 0, 0, 0, 0xff, 0xd0, 0xc3,
            ],
            19,
        ),
        (false, _) => (
            vec![
                0x90, 0x90, 0x90, 0x90, 0xe8, 0, 0, 0, 0, 0x58, 0x83, 0xe8, 9, 0x50, 5, 0, 0, 0, 0,
                0xff, 0xd0, 0xc3,
            ],
            15,
        ),
        (true, _) => (
            vec![
                0x90, 0x90, 0x90, 0x90, 0xe8, 0, 0, 0, 0, 0x59, 0x48, 0x83, 0xe9, 9, 0x48, 0x8b,
                0xc1, 0x48, 5, 0, 0, 0, 0, 0xff, 0xd0, 0xc3,
            ],
            19,
        ),
    };
    put_u32(&mut redirection, offset_position, stub_offset as u32)?;
    output[..redirection.len()].copy_from_slice(&redirection);

    if let Some(parent) = Path::new(output_path).parent() {
        fs::create_dir_all(parent).map_err(io_error)?;
    }
    fs::write(output_path, &output).map_err(io_error)?;
    Ok(ConvertResult {
        architecture: layout.architecture().into(),
        input_size: u32::try_from(raw.len()).unwrap_or(u32::MAX),
        output_size: u32::try_from(output.len()).unwrap_or(u32::MAX),
        stub_offset: stub_offset as u32,
        sha256: format!("{:x}", Sha256::digest(&output)),
    })
}

fn builtin_stub(is_64: bool, scheme: &str) -> &'static [u8] {
    match (is_64, scheme) {
        (false, "1") => include_bytes!("../assets/scheme1-x86.bin"),
        (true, "1") => include_bytes!("../assets/scheme1-x64.bin"),
        (false, _) => include_bytes!("../assets/scheme2-x86.bin"),
        (true, _) => include_bytes!("../assets/scheme2-x64.bin"),
    }
}

#[derive(Clone)]
struct RawSection {
    header: [u8; 40],
    virtual_size: u32,
    virtual_address: u32,
    raw_size: u32,
    raw_offset: u32,
}

struct Layout {
    pe_offset: usize,
    optional_offset: usize,
    section_table: usize,
    entrypoint: u32,
    image_base: u64,
    section_alignment: u32,
    file_alignment: u32,
    image_size: u32,
    header_size: u32,
    directory_count: usize,
    directories: Vec<(u32, u32)>,
    is_64: bool,
    sections: Vec<RawSection>,
}

impl Layout {
    fn parse(raw: &[u8]) -> Result<Self> {
        if raw.len() < 64 || &raw[..2] != b"MZ" {
            return Err(invalid("input is not a PE image"));
        }
        let pe_offset = usize::try_from(get_u32(raw, 0x3c)?).map_err(|_| invalid("PE offset"))?;
        if checked_slice(raw, pe_offset, 4)? != b"PE\0\0" {
            return Err(invalid("PE signature is missing"));
        }
        let sections = usize::from(get_u16(raw, pe_offset + 6)?);
        let optional_size = usize::from(get_u16(raw, pe_offset + 20)?);
        let optional_offset = pe_offset
            .checked_add(24)
            .ok_or_else(|| invalid("optional header overflow"))?;
        checked_slice(raw, optional_offset, optional_size)?;
        let magic = get_u16(raw, optional_offset)?;
        let is_64 = match magic {
            0x10b => false,
            0x20b => true,
            _ => return Err(invalid("unsupported PE optional header")),
        };
        let directory_offset = optional_offset + if is_64 { 112 } else { 96 };
        let directory_count = usize::try_from(get_u32(
            raw,
            optional_offset + if is_64 { 108 } else { 92 },
        )?)
        .unwrap_or(0)
        .min(16);
        checked_slice(raw, directory_offset, directory_count * 8)?;
        let directories = (0..directory_count)
            .map(|index| {
                let offset = directory_offset + index * 8;
                Ok((get_u32(raw, offset)?, get_u32(raw, offset + 4)?))
            })
            .collect::<Result<Vec<_>>>()?;
        let section_table = optional_offset
            .checked_add(optional_size)
            .ok_or_else(|| invalid("section table overflow"))?;
        checked_slice(
            raw,
            section_table,
            sections
                .checked_mul(40)
                .ok_or_else(|| invalid("section count overflow"))?,
        )?;
        let parsed = (0..sections)
            .map(|index| {
                let offset = section_table + index * 40;
                let mut header = [0u8; 40];
                header.copy_from_slice(&raw[offset..offset + 40]);
                Ok(RawSection {
                    header,
                    virtual_size: get_u32(raw, offset + 8)?,
                    virtual_address: get_u32(raw, offset + 12)?,
                    raw_size: get_u32(raw, offset + 16)?,
                    raw_offset: get_u32(raw, offset + 20)?,
                })
            })
            .collect::<Result<Vec<_>>>()?;
        Ok(Self {
            pe_offset,
            optional_offset,
            section_table,
            entrypoint: get_u32(raw, optional_offset + 16)?,
            image_base: if is_64 {
                get_u64(raw, optional_offset + 24)?
            } else {
                u64::from(get_u32(raw, optional_offset + 28)?)
            },
            section_alignment: get_u32(raw, optional_offset + 32)?,
            file_alignment: get_u32(raw, optional_offset + 36)?,
            image_size: get_u32(raw, optional_offset + 56)?,
            header_size: get_u32(raw, optional_offset + 60)?,
            directory_count,
            directories,
            is_64,
            sections: parsed,
        })
    }

    fn architecture(&self) -> &'static str {
        if self.is_64 { "x64" } else { "x86" }
    }

    fn directory(&self, index: usize) -> Option<(u32, u32)> {
        if index >= self.directory_count {
            return None;
        }
        self.directories.get(index).copied()
    }

    fn overlay_start(&self, length: usize) -> usize {
        self.sections
            .iter()
            .filter_map(|section| {
                usize::try_from(section.raw_offset)
                    .ok()?
                    .checked_add(usize::try_from(section.raw_size).ok()?)
            })
            .max()
            .unwrap_or(0)
            .min(length)
    }

    fn overlay_size(&self, length: usize) -> usize {
        length.saturating_sub(self.overlay_start(length))
    }
}

fn read_limited(path: &str, limit: usize) -> Result<Vec<u8>> {
    let metadata = fs::metadata(path).map_err(io_error)?;
    if metadata.len() > limit as u64 {
        return Err(invalid("input exceeds the size limit"));
    }
    fs::read(path).map_err(io_error)
}

fn checked_slice(input: &[u8], offset: usize, length: usize) -> Result<&[u8]> {
    input
        .get(
            offset
                ..offset
                    .checked_add(length)
                    .ok_or_else(|| invalid("range overflow"))?,
        )
        .ok_or_else(|| invalid("truncated PE image"))
}

fn get_u16(input: &[u8], offset: usize) -> Result<u16> {
    let value = checked_slice(input, offset, 2)?;
    Ok(u16::from_le_bytes([value[0], value[1]]))
}

fn get_u32(input: &[u8], offset: usize) -> Result<u32> {
    let value = checked_slice(input, offset, 4)?;
    Ok(u32::from_le_bytes([value[0], value[1], value[2], value[3]]))
}

fn get_u64(input: &[u8], offset: usize) -> Result<u64> {
    let value = checked_slice(input, offset, 8)?;
    Ok(u64::from_le_bytes([
        value[0], value[1], value[2], value[3], value[4], value[5], value[6], value[7],
    ]))
}

fn put_u32(output: &mut [u8], offset: usize, value: u32) -> Result<()> {
    let target = output
        .get_mut(
            offset
                ..offset
                    .checked_add(4)
                    .ok_or_else(|| invalid("write range overflow"))?,
        )
        .ok_or_else(|| invalid("write is outside the output"))?;
    target.copy_from_slice(&value.to_le_bytes());
    Ok(())
}

fn align(value: usize, alignment: usize) -> Result<usize> {
    if alignment == 0 {
        return Err(invalid("alignment must be greater than zero"));
    }
    value
        .checked_add(alignment - 1)
        .map(|item| item / alignment * alignment)
        .ok_or_else(|| invalid("alignment overflow"))
}

fn resize(output: &mut Vec<u8>, length: usize) -> Result<()> {
    if length > MAX_OUTPUT {
        return Err(invalid("output exceeds the size limit"));
    }
    if output.len() < length {
        output.resize(length, 0);
    }
    Ok(())
}

fn invalid(message: &str) -> Error {
    Error::new(Status::InvalidArg, message)
}

fn io_error(error: std::io::Error) -> Error {
    Error::new(Status::GenericFailure, error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_non_pe_input() {
        assert!(Layout::parse(b"not a portable executable").is_err());
    }

    #[test]
    fn checked_slice_rejects_overflow() {
        assert!(checked_slice(&[0; 4], usize::MAX, 2).is_err());
    }

    #[test]
    fn alignment_is_checked() {
        assert_eq!(align(4097, 4096).unwrap(), 8192);
        assert!(align(usize::MAX, 4096).is_err());
    }
}

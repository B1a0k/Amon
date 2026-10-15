import { createRequire } from "node:module"
import { copyFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

export interface EngineInfo {
  readonly name: string
  readonly version: string
  readonly napi: number
  readonly target: string
}

export interface SectionInfo {
  readonly name: string
  readonly virtualAddress: number
  readonly virtualSize: number
  readonly rawOffset: number
  readonly rawSize: number
}

export interface PeInfo {
  readonly architecture: "x86" | "x64"
  readonly entrypoint: number
  readonly imageBase: string
  readonly sectionAlignment: number
  readonly fileAlignment: number
  readonly imageSize: number
  readonly headerSize: number
  readonly hasRelocations: boolean
  readonly hasTls: boolean
  readonly isDotNet: boolean
  readonly overlaySize: number
  readonly sections: readonly SectionInfo[]
}

export interface ConvertResult {
  readonly architecture: "x86" | "x64"
  readonly inputSize: number
  readonly outputSize: number
  readonly stubOffset: number
  readonly sha256: string
}

interface Native {
  readonly engineInfo: () => EngineInfo
  readonly inspectPe: (path: string) => Promise<PeInfo>
  readonly convertPe: (
    inputPath: string,
    stubPath: string,
    outputPath: string,
    scheme: "1" | "2",
  ) => Promise<ConvertResult>
}

let loaded: Native | undefined

export function native(): Native {
  if (loaded) return loaded
  const source = process.env.AMON_NATIVE_PATH ?? path.join(import.meta.dirname, "..", "prebuilds", localName())
  const target = process.platform === "win32" && !process.env.AMON_NATIVE_PATH ? developmentCopy(source) : source
  loaded = createRequire(import.meta.url)(target) as Native
  return loaded
}

function developmentCopy(source: string) {
  const target = path.join(os.tmpdir(), `amon-native-${process.pid}-${path.basename(source)}`)
  copyFileSync(source, target)
  return target
}

function localName() {
  const platform = process.platform === "win32" ? "win32" : process.platform
  const abi = process.platform === "linux" ? "-gnu" : process.platform === "win32" ? "-msvc" : ""
  return `amon-native.${platform}-${process.arch}${abi}.node`
}

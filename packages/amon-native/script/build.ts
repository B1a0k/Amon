import { $ } from "bun"
import path from "node:path"
import { copyFile, mkdir } from "node:fs/promises"

const root = path.resolve(import.meta.dirname, "..")
const triple = process.env.AMON_NATIVE_TARGET
const target = triple ? ["--target", triple] : []

await $`cargo build --release ${target}`.cwd(root)

const platform = targetPlatform(triple)
const arch = targetArch(triple)
const library = path.join(root, "target", ...(triple ? [triple] : []), "release", libraryName(platform))
const output = path.join(root, "prebuilds", `amon-native.${platform}-${arch}${abi(platform)}.node`)
await mkdir(path.dirname(output), { recursive: true })
await copyFile(library, output)
console.log(output)

function targetPlatform(value: string | undefined) {
  if (!value) return process.platform === "win32" ? "win32" : process.platform
  if (value.includes("windows")) return "win32"
  if (value.includes("darwin")) return "darwin"
  if (value.includes("linux")) return "linux"
  throw new Error(`Unsupported native target: ${value}`)
}

function targetArch(value: string | undefined) {
  if (!value) return process.arch
  if (value.startsWith("aarch64")) return "arm64"
  if (value.startsWith("x86_64")) return "x64"
  throw new Error(`Unsupported native target: ${value}`)
}

function libraryName(platform: string) {
  if (platform === "win32") return "amon_native.dll"
  if (platform === "darwin") return "libamon_native.dylib"
  return "libamon_native.so"
}

function abi(platform: string) {
  if (platform === "win32") return "-msvc"
  if (platform === "linux") return "-gnu"
  return ""
}

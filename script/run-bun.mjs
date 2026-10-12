import { spawn, spawnSync } from "node:child_process"
import { existsSync, mkdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

// Pin the runtime for dev/build without replacing the user's globally installed Bun.
const commands = {
  dev: ["run", "--cwd", "packages/desktop", "dev"],
  build: ["run", "script/build-desktop.ts"],
  package: ["run", "script/build-desktop.ts", "--package"],
  install: ["install"],
  check: ["run", "check:internal"],
  engine: ["run", "--cwd", "packages/cli", "src/index.ts", "serve"],
  "build-engine": ["run", "--cwd", "packages/cli", "script/build.ts", "--single", "--baseline", "--skip-install"],
}
const command = commands[process.argv[2]]
if (!command) throw new Error("Unknown Amon workspace command")
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const runtime = path.join(root, ".cache", "runtime")
const pinned = spawnSync("bun", ["--version"], { encoding: "utf8", windowsHide: true }).stdout?.trim() === "1.4.2"
const binary = pinned ? "bun" : path.join(runtime, "node_modules", "bun", "bin", process.platform === "win32" ? "bun.exe" : "bun")
if (!pinned && !existsSync(binary)) {
  mkdirSync(runtime, { recursive: true })
  const args = ["install", "--prefix", runtime, "--no-save", "--package-lock=false", "bun@1.4.2"]
  const installer = process.platform === "win32"
    ? spawn("cmd.exe", ["/d", "/s", "/c", `npm install --prefix "${runtime}" --no-save --package-lock=false bun@1.4.2`], { stdio: "inherit", windowsHide: true, windowsVerbatimArguments: true })
    : spawn("npm", args, { stdio: "inherit" })
  const code = await new Promise((resolve, reject) => {
    installer.on("error", reject)
    installer.on("exit", resolve)
  })
  if (code !== 0) throw new Error(`Could not install bun@1.4.2 (exit ${code})`)
  // New npm versions may defer postinstall scripts. Run only this explicitly requested runtime's
  // pinned installer if its executable has not been materialized.
  if (!existsSync(binary)) {
    const installRuntime = spawn(process.execPath, [path.join(runtime, "node_modules", "bun", "install.js")], {
      stdio: "inherit", windowsHide: true,
    })
    const installed = await new Promise((resolve, reject) => {
      installRuntime.on("error", reject)
      installRuntime.on("exit", resolve)
    })
    if (installed !== 0 || !existsSync(binary)) throw new Error("Pinned Bun installation did not produce an executable")
  }
}
const child = spawn(binary, [...command, ...process.argv.slice(3)], {
  cwd: root,
  stdio: "inherit",
  windowsHide: true,
  env: pinned ? process.env : { ...process.env, PATH: `${path.dirname(binary)}${path.delimiter}${process.env.PATH}` },
})
child.on("error", error => { console.error(error); process.exitCode = 1 })
child.on("exit", code => { process.exitCode = code ?? 1 })

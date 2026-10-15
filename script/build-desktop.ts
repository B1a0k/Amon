import { $ } from "bun"
import path from "node:path"
import { getCurrentCli } from "../packages/desktop/scripts/utils"
import pkg from "../package.json"

const root = path.resolve(import.meta.dirname, "..")
const target = getCurrentCli()

process.env.AMON_CHANNEL ??= "prod"
process.env.AMON_VERSION ??= pkg.version
process.env.AMON_CLI_DIST = path.join(root, "packages/cli/dist")
process.env.AMON_CLI_TARGET = target.target

// An unset Actions secret becomes an empty environment value. electron-builder treats empty
// certificate paths as the working directory, so omit credentials that were not configured.
for (const key of ["CSC_LINK", "CSC_KEY_PASSWORD", "APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"])
  if (process.env[key] === "") delete process.env[key]

await $`bun run build`.cwd(path.join(root, "packages/amon-native")).env({
  ...process.env,
  AMON_NATIVE_TARGET: target.target,
})
await $`bun run script/build.ts ${`--target=${target.package.replace("@opencode/cli", "opencode")}`} --skip-install`.cwd(
  path.join(root, "packages/cli"),
)
await $`bun run prebuild`.cwd(path.join(root, "packages/desktop"))
// Calling the executable directly avoids running the package's prebuild hook twice.
await $`bunx --no-install electron-vite build`.cwd(path.join(root, "packages/desktop"))

if (process.argv.includes("--package")) {
  const native = target.os === process.platform && target.cpu === process.arch
  if (native) await $`bun run install-electron`.cwd(path.join(root, "packages/desktop"))
  const platform = target.os === "win32" ? "--win" : target.os === "darwin" ? "--mac" : "--linux"
  // A cross-architecture package must download its target Electron, not reuse the host's dist.
  const distribution = native
    ? [`--config.electronDist=${path.join(root, "packages/desktop/node_modules/electron/dist")}`]
    : []
  await $`bunx --no-install electron-builder --publish never --config electron-builder.config.ts ${platform} ${`--${target.cpu}`} ${distribution}`.cwd(
    path.join(root, "packages/desktop"),
  )
}

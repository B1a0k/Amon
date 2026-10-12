# Amon · 阿蒙

Amon is a desktop AI agent based on OpenCode. It includes the Electron desktop, the complete local AI engine, model integrations, filesystem and terminal tools, database, plugins and build scripts. The standalone interactive CLI, mini interface and TUI are excluded. packages/cli contains the headless desktop engine launcher, packaged as amon-engine.

See [中文说明](README.zh.md) for source scope, isolation and development details.

Requires Node.js 24, npm and Bun. Workspace commands install and use Bun 1.4.2 in .cache/runtime without replacing your global Bun.

```powershell
cd E:\Amon
bun run setup
bun run dev
```

```powershell
bun run check
bun run build
bun run package:desktop
```

Windows installer: packages/desktop/dist/amon-desktop-win-x64.exe. Unpacked application: packages/desktop/dist/win-unpacked/Amon.exe. Stop development before building or packaging: both write packages/desktop/out.

Production builds default to the Amon identity. Use AMON_CHANNEL=dev, beta or prod for other channels. App data, project configuration, URL registration, executable names, icons and app translations use Amon. Upstream package scopes and provider/plugin identifiers remain for compatibility. Automatic desktop updates require your own AMON_UPDATE_URL.

The **Amon desktop** GitHub Actions workflow builds Windows, Linux and macOS packages for x64 and ARM64. Run it manually with `target=all`, or select one target after fixing a platform-specific failure. Source checks gate packaging; outputs are uploaded as artifacts. The optional release switch and `amon-v*` tags create a draft release after all targets pass. macOS signing/notarization can use your own credentials; unsigned test builds remain supported. See the Chinese guide for credential names and runner details.

Repeated `npm run dev` focuses the existing development window. Each isolated development profile uses an available port, while production retains its managed background service.

See [branding](AMON_BRANDING.md), [validation](VALIDATION.md) and [source rules](SOURCE_SCOPE.txt). Upstream revision: 773d8621d6bcd311067b225d837c917b3e83573e on dev, version 2.0.27. The Amon repository starts from a desktop source snapshot, excluding the TUI, other products and active upstream workflows. Local upstream history remains available through the upstream remote. Original documentation and the MIT license are preserved. Amon is an independent fork.

# Amon · 阿蒙

基于 OpenCode 的完整桌面 AI Agent，包含桌面窗口、本地 AI 引擎、模型调用、文件与终端工具、数据库、插件和编译打包脚本。当前上游桌面框架为 Electron。

不包含独立的交互式命令行客户端、mini 界面或 TUI。packages/cli 保留的是桌面需要的无界面引擎启动器和进程管理接口，编译后名为 amon-engine。应用自动启动该本地进程，无需部署云服务器。

## 开发与打包

需要 Node.js 24、npm 和 Bun。项目命令自动在 .cache/runtime 安装并使用 Bun 1.4.2，不会替换电脑全局 Bun。

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

Windows x64 安装包：packages/desktop/dist/amon-desktop-win-x64.exe。免安装目录：packages/desktop/dist/win-unpacked，运行其中的 Amon.exe。

默认打包正式版 Amon。使用 AMON_CHANNEL=dev、beta 或 prod 选择渠道。打包前关闭开发进程：两者都会写入 packages/desktop/out。发布签名需要配置自己的凭据。

## 与 OpenCode 隔离

| 项目 | Amon 标识或路径 |
| --- | --- |
| 默认项目 | 系统 Documents 目录下的 Amon |
| 自定义工作目录 | AMON_WORKSPACE_DIR |
| Windows 桌面配置 | %APPDATA%\ai.amon.desktop，开发版 .dev，测试版 .beta |
| 引擎配置、数据、缓存、状态 | 各 XDG 根目录下的 amon |
| 项目配置 | .amon、amon.json、amon.jsonc |
| 数据库 | amon.db 或 amon-渠道.db |
| URL 协议 / Windows 注册项 | amon:// / HKCU\Software\Classes\amon |
| 引擎程序 | amon-engine.exe |
| 桌面内部页面协议 | amon-ui://renderer |
| 引擎端口 | 正式版 42027，开发隔离进程使用系统分配的可用端口 |

应用图标、启动字标、窗口、菜单、安装包与应用国际化文案已改为 Amon。环境变量使用 AMON_* 与 VITE_AMON_*。没有配置自己的 AMON_UPDATE_URL 时，不自动从上游下载桌面更新。

为保持模型服务和插件兼容，保留内部 @opencode/* 包名、供应商 ID、认证用户名、插件协议和外部服务地址。OpenCode Console / Go 等供应商名称与上游许可证署名保留；这些名称不会成为 Amon 的安装、存储或注册表标识。二次开发入口见 [AMON_BRANDING.md](AMON_BRANDING.md)。

## 源码范围与同步

包含 21 个工作区包：桌面与前端、本地引擎、Server、Client、Protocol、Schema、Plugin、UI、Session UI 与它们的构建依赖。终端交互前端通过 sparse-checkout 排除，规则记录于 SOURCE_SCOPE.txt。Windows 的图标与类型声明符号链接占位文件已替换为实际内容。

上游：anomalyco/opencode 的 dev 分支，提交 773d8621d6bcd311067b225d837c917b3e83573e，版本 2.0.27。Amon 仓库以筛选后的桌面源码快照建立，不包含 TUI、其他产品和上游活动工作流。本地默认分支 dev，origin 指向 B1a0k/Amon；上游浅层历史保留在 upstream remote 与 opencode-upstream 分支。同步时应保留 Amon 的入口、标识和目录隔离改动。

保留 MIT 许可证和版权声明；Amon 不是 OpenCode 官方产品。原始说明在 README.upstream.md 和 README.zh.upstream.md，原始发布工作流在 .github/upstream-publish.yml，不自动执行。验证范围见 [VALIDATION.md](VALIDATION.md)。

## GitHub Actions 跨平台构建

`.github/workflows/amon-desktop.yml` 构建 Windows、Linux、macOS 的 x64 与 ARM64 桌面包。Windows ARM64 在 Windows x64 runner 上交叉编译；Linux 与 macOS 使用各自架构的 runner。本地引擎、平台原生依赖和 Electron 都按同一目标架构选取。

在 Actions 中运行 **Amon desktop**，`target=all` 构建全部目标；失败修复后可单选目标，避免重复构建已通过的平台。工作流先完成统一源码检查，通过后才分发打包任务。每个任务有超时，测试引擎进程在结束时释放。

默认上传安装包到该次运行的 Artifacts。勾选 `release` 或推送 `amon-v2.0.27` 形式的 tag，会在所有平台通过后创建草稿 Release。审核并发布草稿后才成为正式发布。各架构更新元数据保存在独立 Artifacts 中，不合并覆盖到 Release；配置更新服务时须按架构管理 feed。

无签名凭据也能构建测试包。macOS 正式签名使用 `MAC_CSC_LINK`、`MAC_CSC_KEY_PASSWORD`，公证使用 `APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID` Secrets。Windows 保留 `script/sign-windows.ps1` 的 Azure 签名入口，需要配置自己的 Azure 凭据及登录步骤；没有配置时跳过签名。

重复执行 `npm run dev` 会聚焦同一源码目录的已有开发窗口，不启动第二套 Vite。开发和打包会写入同一输出目录，打包前仍需关闭开发进程。

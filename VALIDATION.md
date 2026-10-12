# Amon 验证记录

平台：Windows x64。源码版本：2.0.27。固定运行时：Bun 1.4.2；桌面：Electron 44.4.5。

| 验证 | 结果 |
| --- | --- |
| 根目录 `bun run check` | lint 零错误；19 个工作区类型检查通过。保留上游 lint 警告 |
| 完整构建与 NSIS 打包 | 从本地源码编译 amon-engine，生成 Amon Windows x64 安装包 |
| 开发模式 | 127.0.0.1:5173 正常加载，Amon 标题、菜单、默认项目和图标；前端异常记录为空 |
| 正式包启动 | amon-ui://renderer 正常进入中文会话界面，本地引擎已连接 |
| 编译引擎生命周期 | 两个候选进程选出唯一服务；认证与未认证访问、内置 Web 资源、插件发现、停止与注册文件清理通过 |
| 桌面测试 | 43 项通过；最终打包与 Vite 配置的 9 项复查通过 |
| 核心功能复查 | 配置、格式化、Git、工作区、会话执行、压缩、模型请求头与插件重载共 429 项通过 |
| 提示词与技能 | 21 项通过，系统提示身份改为 Amon，保留工具与模型优化行为 |
| 客户端 API 合约 | 40 项通过，保留生成客户端与服务端的接口兼容 |
| 浏览器存储与扩展 | 浏览器模式 63 项、GUI 扩展 12 项通过 |
| OpenCode 隔离 | opencode:// 仍指向原装 OpenCode.exe；amon:// 指向 Amon.exe，桌面和引擎数据使用独立命名 |
| 打包资源 | 使用 amon-desktop 元数据与 amon-engine.exe；旧 opencode-cli 产物已移出打包资源并增加排除规则 |

修复了开发服务器的 IPv4/IPv6 地址差异、正式渠道服务发现文件不一致、Amon 内部页面协议的 CORS 许可，以及名称替换误改模型请求头的问题。客户端 API 的库存测试与当前上游协议同步，生产生成 SDK 保持原有接口。

截图与启动检查结果在 artifacts/verification。构建与检查的本地日志在 .git 中，构建缓存和产物不纳入源码版本管理。品牌修改入口见 AMON_BRANDING.md。

## 验证限制

未使用真实模型密钥执行收费模型任务。验证使用本地服务、实际桌面窗口与测试模型，不能据此声称所有外部模型供应商均已实测。

没有把完整上游测试套件标记为通过。扩大测试曾发现 Windows 进程信号、短时限和测试环境相关失败；已修复测试目录处于 Git 仓库内造成的祖先发现干扰，并通过上述 429 项复查。客户端进程信号相关测试仍存在 Windows 平台失败；实际编译引擎的启动、认证、候选进程选举与停止已单独验证通过。

本地构建并运行验证 Windows x64。GitHub Actions 配置覆盖 Windows、Linux、macOS 的 x64/ARM64；Windows ARM64 使用交叉编译，其引擎不在 x64 runner 上执行。跨平台 CI 的实际结果需看对应运行记录，不能将配置检查算作平台运行通过。WSL/SSH 远程引擎在 .amon 下隔离安装，尚未执行完整远程运行验证。发布签名和自动更新服务需要配置自己的凭据及 AMON_UPDATE_URL。

新增验证：重复运行 npm run dev 正常聚焦已有窗口，Vite 仍只有 5173，开发引擎使用独立动态端口；桌面入口、打包与依赖过滤 10 项合约通过。推理折叠的组件测试在修复前复现 Solid 生命周期警告，修复后 13 项全部通过。生产时间线基准在相同 100 回合历史、30 个增量、30 倍 CPU 节流条件下均通过，前后均无行替换、空白采样或底部漂移；单次时序存在噪声，不作为提速结论。

## GitHub Actions 实测结果

2026-10-12 完成六目标构建。为避免浪费已通过的平台，macOS 签名空变量修复后只重跑 macOS；Windows/Linux 复用此前有效结果。

| 平台 | 构建、打包与上传 | 引擎运行 |
| --- | --- | --- |
| Windows x64 | 通过，NSIS | 原生生命周期测试通过 |
| Windows ARM64 | 通过，NSIS | 在 x64 runner 上交叉编译，未原生运行 |
| Linux x64 | 通过，AppImage/deb/rpm | 原生生命周期测试通过 |
| Linux ARM64 | 通过，AppImage/deb/rpm | 原生生命周期测试通过 |
| macOS Intel x64 | 通过，dmg/zip | 原生生命周期测试通过 |
| macOS Apple Silicon ARM64 | 通过，dmg/zip | 原生生命周期测试通过 |

Windows/Linux：[构建记录及 Artifacts](https://github.com/B1a0k/Amon/actions/runs/38266515566)。macOS：[修复后重跑及 Artifacts](https://github.com/B1a0k/Amon/actions/runs/38268511511)。测试覆盖编译引擎的选举、认证、嵌入网页、插件重载、停止和登记文件清理。跨平台运行测试覆盖本地引擎，不等于在 Linux/macOS 人工操作过完整桌面窗口。

CI 使用无开发者证书的测试打包配置，没有创建或发布 Release。macOS Apple Silicon 使用构建工具的 ad-hoc 签名；正式分发签名与公证须配置自己的证书。修复了 Linux checkout 的链接文件模式、新 npm 暂缓 Bun 安装脚本、跨架构 Electron 分发选择及空签名变量的问题。失败 runner 均已结束。

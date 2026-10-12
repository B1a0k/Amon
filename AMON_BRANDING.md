# Amon 二次开发与品牌入口

| 修改内容 | 位置 |
| --- | --- |
| 应用名、App ID 与渠道 | `packages/desktop/src/main/constants.ts` |
| 安装包、Windows 注册协议 | `packages/desktop/electron-builder.config.ts` |
| 默认工作目录、桌面配置目录 | `packages/desktop/src/main/lifecycle/configure.ts` |
| 项目配置与文件名 | `packages/core/src/config/discovery.ts` |
| 引擎全局目录 | `packages/util/src/global.ts` |
| 引擎服务文件与端口 | `packages/cli/src/services/service-config.ts`，需与 Client 默认发现路径一致 |
| 数据库名 | `packages/cli/src/database-path.ts` |
| 各语言文案与原生菜单 | `packages/app/src/runtime/i18n` |
| 扩展文案 | `packages/gui-extensions/src/*/i18n` |
| 持久化与主题标识 | `packages/app/src/runtime/persistence`、`packages/ui/src/theme` |
| 内部页面协议、扩展资源 | `packages/desktop/src/main/windows/scheme.ts`、`packages/desktop/src/renderer/extensions.ts`、`packages/server/src/cors.ts` |
| SVG 字标与启动动画 | `packages/ui/src/components/logo.tsx` |
| PNG、ICO、ICNS 与 favicon | `script/generate-brand-assets.py`、`packages/desktop/icons`、`packages/ui/src/assets/favicon` |
| 一键构建与固定 Bun | `script/build-desktop.ts`、`script/run-bun.mjs` |

图标生成脚本使用 Pillow，生成正式、开发、测试三组图标和 favicon。前端 public 里的 Windows 实体副本需要与共享 favicon 同步。

内部工作区包名、Provider ID、插件工具 namespace、MCP 元数据、HTTP Basic 用户名有实际兼容性用途，不应仅按名称批量替换。应用层存储标识已经使用 Amon，外部供应商图标和上游版权保留。

修改内部页面协议时，同时更新服务端 CORS 并验证正式包启动。修改引擎渠道名时，同时检查 Client 发现路径与服务注册文件；这两项错误都可能使正式包停在启动页，即使开发界面能够加载。

发布自己的更新时配置 AMON_UPDATE_URL、自己的签名与发布仓库。上游原始发布任务仅作为参考，不应直接使用上游发布地址或凭据。

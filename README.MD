# Nalomu Desktop Note · Tauri

单窗口桌面便签。Tauri 2、Vue 3、TypeScript、Vite 和 Tiptap；支持 macOS、Windows。

## 开发

使用 Node **24.19.0**（`.nvmrc`）、pnpm **11.20.0**、Rust **1.96.0**。最低 Node 22.13；建议使用固定的 Node 24 工具链。
macOS 需要 Xcode Command Line Tools；Windows 需要 Visual Studio C++ Build Tools、Windows SDK 和 WebView2。

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm start
```

`pnpm dev` 只启动前端服务器，正常使用需要 `pnpm start` 提供 Tauri 接口。浏览器自动化测试会模拟接口，不等同于原生验收。

## 使用

- 在便签中输入；300ms 防抖自动保存，失败时显示错误并可重试。
- `Aa` 打开可拖动的浮动格式面板，选中文字时在选区附近显示简短工具条；面板不占正文布局空间。按 Escape 或点击正文收起。支持标题、列表、待办、引用、代码和 HTTPS 图片地址、本地图片与剪贴板图片；链接默认不跳转，避免离开编辑页面。
- 使用 Cmd+V / Ctrl+V 粘贴图片，或在 `Aa` 菜单选择“本地图片”“粘贴图片”；选中图片拖动底角等比例调整尺寸。只调整图片，不缩放整个编辑区。
- 拖动顶部“便签”区域移动窗口，拖动窗口边缘缩放；减号或关闭窗口会隐藏便签。
- 顶部图钉快捷切换始终置顶，自动保存状态；齿轮或托盘菜单打开独立设置窗口，实时预览颜色、透明度和排版，保存后应用。外观保存不会覆盖顶部更新的置顶状态。
- 正文右键打开中文编辑菜单：撤销、重做、剪切、复制、粘贴纯文本、粘贴图片、全选、文字格式、清除文字格式及插入本地图片；支持方向键、Home、End 与 Escape。剪切仅在剪贴板写入成功后删除选区。
- 从托盘退出，或 macOS 使用 Cmd+Q：先保存，失败则保留窗口，重试后再退出。

## 数据

新版本从空便签开始，**不读取、不修改旧版工作目录中的 `config.json`**。

- macOS：`~/Library/Application Support/com.nalomu.desktop-note/`
- Windows：`%APPDATA%\com.nalomu.desktop-note\`

`note.json` 保存 `schemaVersion: 2`、Tiptap JSON 内容和外观；`note.backup.json` 保存上一次有效状态。损坏文件复制为 `note-corrupt-*.json` 后尝试恢复备份；无有效备份时停止编辑并显示错误。恢复前退出应用并备份整个目录。高版本数据不自动降级。

图片保存在应用数据目录的 `images/` 中，导入时转换为 PNG 并按内容哈希去重，正文只记录附件标识和尺寸。图片导入后不再依赖源文件路径或源应用的持续访问权限。此目录属于持久数据，不是可清理的缓存；备份时应连同 JSON 一起复制。为保留撤销与备份恢复，删除正文中的图片暂不删除附件文件。支持 PNG、JPEG、WebP 文件（最多 20 MB）；原生剪贴板支持位图。旧版 schema 1 数据会升级为 schema 2，升级后勿使用旧程序写入。

透明窗口需要 macOS 私有 API，因此当前路线为独立分发，不面向 Mac App Store。

## 检查与打包

```sh
pnpm build
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
cargo test --manifest-path src-tauri/Cargo.toml --locked
cargo clippy --manifest-path src-tauri/Cargo.toml --locked -- -D warnings
pnpm audit
cargo install cargo-audit --version 0.22.2 --locked
pnpm audit:rust
# macOS
pnpm tauri build --bundles app
# macOS 分发镜像
pnpm tauri build --bundles dmg
# Windows
pnpm tauri build --bundles nsis
```

CI 分别生成 macOS ARM64、macOS Intel 的 `.app` ZIP，以及 Windows x64 NSIS 安装包，附 SHA-256 校验值。产物从 Actions 下载；macOS 使用 ad-hoc 签名（`bundle.macOS.signingIdentity: "-"`），未做开发者签名和公证，Windows 包未签名，系统可能要求手动确认打开。`tauri` 推送或手动运行的三平台检查全部通过后，自动为该提交创建 `v版本-test.运行编号.提交短哈希` 标签及 Release 草稿，附安装包和校验值；PR 和定时安全检查不创建草稿。草稿需手动验收后发布。

安全警告与验收边界见 [安全记录](docs/security.md) 和 [验收记录](docs/acceptance.md)。默认分支为 `tauri`，保留旧版 `master` 历史。按仓库维护者要求于 2026-10-03 提前切换默认分支，Windows 原生验收仍未完成；定时安全检查在默认分支运行。

## 图标

应用图标采用暖珊瑚色底与占主体的大张折角便签纸，纸面右下角保留小尺寸 Itsuki 高马尾剪影印记。业务物体决定主要轮廓和颜色，角色仅作为系列签名，以区分紫色人物主导的数据库应用。源图保存在 `design-assets/`，使用内置 Image Gen 生成，旧版人物主导方案以 `*-portrait-v1.png` 保留。

- `design-assets/itsuki-note-icon.png`：完整透明边缘的应用图标源图，通过 `pnpm tauri icon design-assets/itsuki-note-icon.png --output src-tauri/icons` 导出 ICNS、ICO 与 PNG 尺寸。
- `design-assets/itsuki-tray-source.png`：独立单色折角纸张源图；`src-tauri/icons/tray-template.png` 为 44×44 版本。macOS 托盘使用模板模式，由系统适配菜单栏颜色，Windows 托盘使用彩色应用图标。
- `public/favicon.png`：网页预览图标。

图标遵循 [Apple 应用图标设计指导](https://developer.apple.com/design/human-interface-guidelines/app-icons/) 的识别性和安全留白原则，采用适用于当前 Tauri 桌面打包的传统 ICNS；菜单栏模板模式按 [Tauri 系统托盘文档](https://tauri.app/learn/system-tray/) 设置。

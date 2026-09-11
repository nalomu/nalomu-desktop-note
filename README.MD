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
- `Aa` 打开格式菜单，选中文字时显示简短格式工具条。支持标题、列表、待办、引用、代码和 HTTPS 图片地址；链接默认不跳转，避免离开编辑页面。
- 拖动顶部“便签”区域移动窗口，拖动窗口边缘缩放；减号或关闭窗口会隐藏便签。
- 齿轮或托盘菜单打开独立设置窗口，保存后立即应用。
- 从托盘退出，或 macOS 使用 Cmd+Q：先保存，失败则保留窗口，重试后再退出。

## 数据

新版本从空便签开始，**不读取、不修改旧版工作目录中的 `config.json`**。

- macOS：`~/Library/Application Support/com.nalomu.desktop-note/`
- Windows：`%APPDATA%\com.nalomu.desktop-note\`

`note.json` 保存 `schemaVersion: 1`、Tiptap JSON 内容和外观；`note.backup.json` 保存上一次有效状态。损坏文件复制为 `note-corrupt-*.json` 后尝试恢复备份；无有效备份时停止编辑并显示错误。恢复前退出应用并备份整个目录。高版本数据不自动降级。

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
# Windows
pnpm tauri build --bundles nsis
```

CI 分别生成 macOS ARM64、macOS Intel 的 `.app` ZIP，以及 Windows x64 NSIS 安装包，附 SHA-256 校验值。产物从 Actions 下载；这些是未签名/未公证测试包，系统可能要求手动确认打开。暂不自动创建 Release。

安全警告与验收边界见 [安全记录](docs/security.md) 和 [验收记录](docs/acceptance.md)。在 Windows 原生验收完成前保留 `master` 为默认分支。GitHub 定时任务仅在默认分支存在工作流后自动生效；此前由 `tauri` 推送触发检查。

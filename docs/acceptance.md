# Tauri 重构验收记录

## 变更与历史保护

在 `tauri` 分支实施，保留 `master`。开始前已有 package.json browserslist resolution 与 yarn.lock 更新，原始补丁保存在 `/tmp/nalomu-desktop-note-before-tauri.patch`（本机，不上传仓库）。Electron 依赖链已整体移除，该 resolution 不再适用。旧版 config.json 不参与本次重构。

## 验收状态

- 已通过：Vue/TypeScript 检查、Vite 生产构建、保存队列单元测试。
- 已通过：浏览器中文文本输入/刷新恢复、待办转换、不安全链接阻止、保存失败阻止退出并重试、设置保存恢复、小窗口无横向溢出。
- 浏览器环境：Playwright Chromium，320×240 主窗口、480×620 设置；Browser plugin not available，使用项目 Playwright。Tauri IPC 使用测试替身，不能据此证明原生保存或窗口行为。
- 截图：本机 `/tmp/nalomu-note-editor.png`、`/tmp/nalomu-note-settings.png`。
- Rust 存储测试覆盖读写恢复、损坏备份、写入失败、设置内容互不覆盖、高版本拒绝降级、非法内容；以最终执行结果为准。
- 待完成：macOS 原生窗口、托盘、单实例、实际保存重启验收及测试包构建。
- 待完成：Windows 实机/虚拟机原生验收；CI 构建不替代此项。
- 待完成：真实中文输入法组合输入、跨屏缩放与离屏恢复、macOS Intel 实机验收。

## Windows 原生验收步骤

安装 NSIS 测试包，输入中文并调整标题、列表、待办、图片；验证粘贴、撤销和重做。改变颜色/透明度/置顶并保存，检查主窗口即时同步。移动缩放后退出重启，核对内容与位置；关闭窗口后从托盘恢复；重复启动只保留一份。测试不同 DPI 显示器和拔掉副屏后的恢复。

Windows 原生验收与安全门槛完成后，再为旧 master 提交打归档标签、切换默认分支为 tauri，执行 `git remote set-head origin -a`。不删除 master。

# 依赖与本地数据安全

检查日期：2026-10-02。检查覆盖 pnpm 和 Cargo 锁文件，不等同于无未知漏洞保证。

- pnpm：官方 registry 审计，当前 0 已知漏洞；完整开发依赖纳入检查。
- Cargo：当前漏洞分类 0 项，另有以下 7 项警告；未配置忽略 ID。
- `RUSTSEC-2024-0370`：proc-macro-error 1.0.4 未维护。属于 Linux GTK 构建链，macOS/Windows 当前目标依赖树不包含该包。
- `RUSTSEC-2024-0429`：glib 0.18.5 VariantStrIter 健全性问题；修复在 0.20+，Tauri Linux GTK 链仍锁定 0.18。macOS/Windows 目标不编译此包，首版不构建 Linux。未来启用 Linux 前必须重新处理。
- `RUSTSEC-2025-0081`、`RUSTSEC-2025-0075`、`RUSTSEC-2025-0080`、`RUSTSEC-2025-0100`、`RUSTSEC-2025-0098`：unic-char-property、unic-char-range、unic-common、unic-ucd-ident、unic-ucd-version 0.9.0 未维护，经 Tauri utils → urlpattern 引入。继续跟踪上游替换；不任意强制跨版本覆盖。

运行 `cargo tree --manifest-path src-tauri/Cargo.toml -i <包名> --target <目标>` 核实目标依赖。当前 macOS 使用 aarch64-apple-darwin，Windows 使用 x86_64-pc-windows-msvc。

## 控制措施

- Node/Rust/pnpm 固定版本，提交双锁文件，CI 使用 frozen/locked 安装。
- pnpm 禁止依赖安装脚本，要求包发布满一天；GitHub Actions 使用提交 SHA。
- 只加载本地应用前端；CSP 不允许远端脚本、对象或 iframe。远端图片只允许 HTTPS。
- 前端无通用文件系统、Shell、HTTP 插件权限；Rust 命令只操作应用数据目录。
- Rust 验证内容节点、链接协议、设置取值、文档大小和深度；原始 HTML 不执行。
- 文件保存使用同目录临时文件、sync_all 和原子替换；设置与内容共用锁，分别更新各自字段。
- 每次推送审计全部依赖；新发现漏洞优先升级，严重或高危未解决时不交付。现有上游警告明确保留，需随升级重新评估。

## 图片附件

图片由 Rust 验证并转换后存入应用专属目录；前端不能读取任意源文件路径。自定义 note-image 协议仅接受固定长度哈希 PNG 标识，拒绝路径穿越与符号链接文件；CSP 只放行该协议和 HTTPS 图片。导入限 20 MB，尺寸不超过 8192，像素不超过 1600 万；解码限制 64 MiB。附件先落盘后插入正文，退出等待正在进行的导入及正文保存。原生剪贴板命令不向前端开放通用剪贴板权限。

此次新增图片解码及剪贴板依赖后重新审计：pnpm 已知漏洞 0，Cargo 漏洞分类 0，仍为上述 7 项上游警告。

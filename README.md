# 并行工作台 · ParallelDev Workbench

面向独立开发者的**本地优先**多项目并行开发管理系统。基于 PRD 设计的桌面应用，帮助你在多个项目间高效切换、记录上下文、管理任务与时间。

## ✨ 功能

- **总览**：今日计划 + 项目健康度（阻塞×2 + 今日到期×3 + 进行中）
- **项目**：项目档案（技术栈/仓库/本地路径/端口/环境变量）、上下文快照、一键打开本地目录
- **任务**：多维度筛选（状态/优先级/标签/项目）、快速新建（快捷键 `N`）
- **看板**：四列拖拽（待办/进行中/阻塞/完成），拖拽即持久化
- **统计**：每周工时分布、项目维度统计、Markdown 周报导出
- **设置**：JSON/Markdown 导入导出（桌面端走原生对话框）、数据备份（自动保留 7 份）、主题切换

## 🚀 技术栈

| 层 | 技术 |
|---|---|
| 桌面壳 | **Tauri 2**（Rust + WebView2，单文件 exe ≈ 4.7MB，内存 ≈ 30MB） |
| 前端 | 原生 HTML/CSS/JS（无框架依赖，SPA） |
| 数据 | 本地 JSON 文件 `{app_data_dir}/workbench-data.json`，localStorage 作缓存 |
| 构建 | `@tauri-apps/cli`（npm）+ Cargo |

## 📦 快速开始

### 环境要求

- Rust 1.97+（`rustup` + MSVC target）
- VS 2022 Build Tools（C++ 桌面开发工作负载）
- Node.js 20+（仅打包 CLI 需要）
- WebView2（Win10/11 内置）

### 开发调试

```bash
# 1. 安装打包 CLI（自带预编译二进制）
npm install

# 2. 编译 Debug 版（或直接执行 build-dev.cmd）
cargo build --manifest-path src-tauri/Cargo.toml
./src-tauri/target/debug/parallel-workbench.exe

# 3. 打包安装包（NSIS）
node node_modules/@tauri-apps/cli/tauri.js build
```

> 💡 国内网络建议配置 `~/.cargo/config.toml` 使用 rsproxy 镜像，否则依赖下载会非常慢：
> ```toml
> [source.crates-io]
> replace-with = 'rsproxy-sparse'
> [source.rsproxy-sparse]
> registry = "sparse+https://rsproxy.cn/index/"
> ```

## 🧪 测试

```bash
node test-store.js          # 数据层 21 项
node test-ui.js             # UI 层 21 项（happy-dom）
```

## 🗂 目录结构

```
parallel-workbench/
├── index.html            # 前端入口（SPA）
├── css/style.css         # 样式（浅色/深色主题）
├── js/
│   ├── store.js          # 数据层：Store + 种子 + Tauri 桥接
│   └── app.js            # UI 层：六视图渲染与交互
├── src-tauri/            # Tauri 桌面壳（Rust）
│   ├── src/lib.rs        # 命令：load_data / save_data / open_path / backup_to
│   ├── tauri.conf.json   # 窗口、打包、权限配置
│   ├── capabilities/     # 权限（dialog/shell/fs）
│   └── icons/            # 应用图标
├── scripts/              # 工具：图标生成、UI 自动化测试、截图诊断
└── test-*.js             # 测试脚本
```

## 🖥 桌面端能力（Tauri 桥接）

- 数据持久化到本地 JSON 文件（文件为权威源，localStorage 仅缓存）
- 项目详情「本地路径」一键唤起资源管理器（支持 `~/` 展开）
- 导入/导出走系统原生对话框
- 数据自动备份

## 📄 License

MIT

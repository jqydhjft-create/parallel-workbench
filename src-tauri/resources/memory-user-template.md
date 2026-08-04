## 并行工作台 · WorkBench 对接文档维护习惯（跨项目）
- 用户的多个本地项目可能使用「并行工作台」桌面应用（Tauri），应用通过扫描项目根目录的 `workbench.json` 导入项目与任务
- **维护习惯**：当对话涉及用户的项目/任务/进度时，检查该项目目录下是否存在 `workbench.json`；若存在则保持其同步（增改任务、状态、截止日等），若涉及新项目则按需创建
- **定位项目根目录**（不假设固定路径）：① 当前对话工作目录或其子目录；② 用户明确提到的目录；③ 应用数据文件 `{app_data_dir}/workbench-data.json` 的 `workspaces[].path`；④ 询问用户
- 规范细节见已安装的 `workbench-json-sync` 技能（SKILL.md 与 references/schema.md，schema 版本 workbench-v1）
- 用户偏好：中文交流；界面中文；偏好精简方案而非过度工程化

# workbench.json · Schema 完整参考（workbench-v1）

## 顶层结构

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| schema | string | 是 | 固定 `"workbench-v1"`，用于版本演进 |
| updated_at | number | 是 | WorkBuddy 最近更新时间戳（毫秒） |
| project | object | 是 | 项目档案（见下） |
| tasks | array | 否 | 任务列表，空数组或省略均可 |

## project 字段

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| name | string | 是 | 项目名（应用按此显示） |
| description | string | 否 | 一句话描述 |
| status | string | 否 | `active`(默认) / `paused` / `archived` |
| tech_stack | string | 否 | 技术栈描述（可自动识别） |
| repo_url | string | 否 | 代码仓库地址 |
| local_path | string | 否 | 本地路径（应用导入时会自动覆盖为实际目录） |

## tasks[] 元素

| 字段 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| title | string | 是 | — | 任务标题，应用按此去重 |
| status | string | 否 | todo | `todo` / `in_progress` / `blocked` / `done` |
| priority | string | 否 | P2 | `P0`~`P3` |
| due_date | string/null | 否 | null | `YYYY-MM-DD` |
| estimate_min | number | 否 | 60 | 预估耗时（分钟） |
| tags | string[] | 否 | [] | 标签 |
| note | string | 否 | "" | 备注，应用导入为任务 description |

## 应用侧导入规则（只读方行为，供理解）

- 扫描根目录子目录，存在 `workbench.json` 即识别为项目
- 按 `source_dir` 去重：重复导入只更新 tech_stack/description/status，不覆盖用户改过的 name
- 任务按 `title` 去重：更新状态/优先级/截止日/备注/标签
- `status: done` 的任务自动补 `completed_at`
- 无效字段容错：status 不在枚举内回退 `todo`，缺字段用默认值

## 技术栈自动识别参考（应用扫描时用，WorkBuddy 创建文档时也可参考）

- `package.json` 含 react/vue/@tauri-apps/api → React / Vue3 / Tauri
- `Cargo.toml` → Rust + cargo
- `go.mod` → Go
- `pyproject.toml` / `requirements.txt` → Python
- `pom.xml` → Java + Maven

## 示例文件

参考任意已生成的 `workbench.json`（如当前工作区中 `parallel-workbench/workbench.json`，路径按实际项目根目录而定，不做任何路径假设）。

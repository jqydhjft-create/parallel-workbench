---
name: workbench-json-sync
description: 维护「并行工作台」各项目根目录的 workbench.json 对接文档（schema workbench-v1），使 WorkBuddy 管理的项目/任务与桌面应用保持同步。当对话涉及用户的本地项目（新建项目、增改任务、状态流转、进度汇报、截止日期变更）且项目目录存在或应存在 workbench.json 时使用。触发词：workbench.json、对接文档、并行工作台项目、同步项目任务、项目进度更新。
agent_created: true
---

# Workbench JSON Sync

## Overview

维护「并行工作台」（Tauri 桌面应用）的对接文档 `workbench.json`。该文档位于**每个项目的根目录**，由 WorkBuddy（本助手）负责生成与更新，桌面应用通过扫描只读导入。本技能确保用户对话中涉及项目/任务时，文档始终与最新状态一致，实现「AI 管理项目、应用展示」的闭环。

## 触发条件

- 用户新建/删除项目、增改任务、流转状态（todo/in_progress/blocked/done）
- 用户汇报或询问项目进度、截止日期、优先级
- 用户提到「同步」「更新 workbench.json」「对接文档」
- 用户的项目根目录下出现新的子项目目录

## 定位项目根目录

**不要假设任何固定路径**。通过以下方式确定项目根目录：

1. 当前对话的工作目录（cwd）或其子目录
2. 用户明确提到的目录
3. 应用数据文件 `{app_data_dir}/workbench-data.json` 中的 `workspaces[].path`（用户已在应用内配置过工作空间时）
4. 询问用户

若多个项目并存，各项目独立一个 `workbench.json`，互不影响。

## 核心流程

### 1. 定位目标文件

- 每个项目一个文件：`<项目根目录>/workbench.json`
- 若项目目录存在但无该文件 → 按下方 Schema **创建**（项目信息从对话或目录结构推断，技术栈从 package.json/Cargo.toml 读取）
- 若文件存在 → **读取后增量更新**，保持 JSON 合法

### 2. Schema（workbench-v1）

```jsonc
{
  "schema": "workbench-v1",
  "updated_at": 1785841200000,
  "project": {
    "name": "项目名",
    "description": "一句话描述",
    "status": "active",              // active | paused | archived
    "tech_stack": "技术栈",
    "repo_url": "github.com/xx/yy",
    "local_path": "D:/.../项目目录"
  },
  "tasks": [
    {
      "title": "任务标题",
      "status": "todo",              // todo | in_progress | blocked | done
      "priority": "P1",              // P0~P3，默认 P2
      "due_date": "2026-08-10",      // YYYY-MM-DD 或 null
      "estimate_min": 120,
      "tags": ["标签"],
      "note": "备注"
    }
  ]
}
```

完整字段说明与边界规则见 `references/schema.md`。

### 3. 更新规则

1. **用工具读写**：使用文件读写工具（Read/Edit/Write），不直接拼接破坏格式；写完后校验 JSON 可解析
2. **增量更新**：保留已有字段，只增改目标任务/项目字段；`updated_at` 更新为当前时间戳
3. **任务去重**：按 `title` 匹配已有任务，存在则更新，不存在则追加
4. **状态枚举**：仅允许 `todo | in_progress | blocked | done`；`done` 时保留 `completed_at` 隐含（应用侧会自动处理）
5. **不删未知字段**：应用可能写入额外字段（如 source_dir 相关），保留不动

### 4. 完成后确认

- 告知用户已同步到 `workbench.json`（含同步内容摘要）
- 提示应用侧：设置 → WorkBuddy 工作空间 → 扫描/重新扫描即可看到变化

## 边界情况

- 项目目录含中文/空格路径 → 直接用路径字符串，无需转义
- workbench.json 损坏或非 JSON → 读取失败时重新创建（保留能从内容推断的字段）
- 用户删除任务 → 从 tasks 数组移除对应 title 项
- 多项目并存 → 各项目独立文件，互不影响

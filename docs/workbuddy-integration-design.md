# 并行工作台 × WorkBuddy 工作空间集成 · 详细设计文档

> 版本：V1.0（设计评审稿）｜日期：2026-08-04｜状态：待评审
> 对应 PRD 修订：替代原 F12 番茄钟（已确认搁置），新增「工作空间集成」方向

---

## 1. 背景与目标

### 1.1 需求来源

用户希望**不再手动录入项目与进度**，让并行工作台直接对接 WorkBuddy 的项目工作空间：

> "临时想要添加工作台功能：链接 WorkBuddy，把新建项目、任务和进度管理的工作交给 WorkBuddy。不希望在 WorkBuddy 侧做任何操作。或者工作台可以直接读取多个项目工作空间？"

### 1.2 已确认的技术边界

- **连接器不可行**：WorkBuddy 连接器（agent-mail、GitHub 等）是 MCP 工具，只给 WorkBuddy 智能体使用，不是对外 API。并行工作台（独立 Tauri 应用）无法调用。
- **可行路径**：WorkBuddy 项目工作空间 = **本机目录 + `.workbuddy/` 元数据**。应用扫描这些目录即可读取项目与进度，**WorkBuddy 侧零操作**。

### 1.3 设计目标

| 目标 | 验收标准 |
|---|---|
| G1 工作空间发现 | 用户添加一个根目录，应用自动识别其中所有项目，一键导入为项目档案 |
| G2 进度自动读取 | 应用解析 `.workbuddy/memory/` 工作日志，在项目详情展示"最近做了什么" |
| G3 零手动录入 | 新建项目不再需要手填档案，技术栈/路径自动识别 |
| G4 纯只读打通 | 应用只读 WorkBuddy 数据，不写入，无冲突风险 |

---

## 2. 总体架构

```
┌─────────────────────────────────────────────┐
│  并行工作台（Tauri 2 桌面应用）               │
│                                             │
│  前端 (app.js)                               │
│    ├─ 设置页：工作空间管理（增删/扫描/导入）   │
│    ├─ 项目详情：最近进度卡片（读取日志）       │
│    └─ store.js: workspace 状态 + 桥接调用     │
│         │ invoke                              │
│   Rust 命令层 (lib.rs)                        │
│    ├─ scan_workspaces(dir) → 识别项目清单     │
│    ├─ read_project_logs(dir) → 日志摘要       │
│    └─ data_path() / open_path()（已有）       │
└────────────────┬────────────────────────────┘
                 │ 只读（std::fs 直接读取）
┌────────────────▼────────────────────────────┐
│  WorkBuddy 项目工作空间（本机目录）            │
│    <项目目录>/.workbuddy/memory/*.md         │
│    <项目目录>/package.json / Cargo.toml      │
│    <项目目录>/.git / README.md               │
└─────────────────────────────────────────────┘
```

**设计原则**：
- 应用只读 WorkBuddy 目录，**绝不写入** → 无数据竞争
- 导入的项目带 `source_dir` 字段标记来源，可手动编辑档案（升级为完整项目）
- 日志解析纯文本，不引入依赖

---

## 3. 方案 A：多工作区扫描导入

### 3.1 数据结构

`workbench-data.json` 顶层新增 `workspaces` 字段（持久化）：

```jsonc
{
  // ...现有字段（projects/tasks/plans/timeEntries/snapshots/backups/timer/settings）
  "workspaces": [
    {
      "id": "ws_8f2k",
      "path": "D:/个人开发者项目管理器",   // 用户添加的根目录
      "name": "个人开发者项目",            // 默认取目录名，可改
      "enabled": true,                    // 关闭则不再扫描
      "added_at": 1785839680000
    }
  ]
}
```

`Project` 新增可选字段：

```jsonc
{
  "id": "p_...",
  "name": "parallel-workbench",
  "description": "来自工作空间导入",      // 自动填充
  "status": "active",
  "tech_stack": "Tauri + 原生JS",         // 从 package.json/Cargo.toml 自动识别
  "local_path": "D:/个人开发者项目管理器/parallel-workbench",  // 真实路径，可一键打开
  "source_dir": "D:/个人开发者项目管理器/parallel-workbench",  // ★ 标记来自哪个目录
  "source_ws": "ws_8f2k",                 // ★ 属于哪个工作空间
  "workspace": true,                      // ★ 是否工作空间导入项目（区别于手动创建）
  "color": "#0c8599",                     // 工作空间项目用固定色系区分
  "created_at": 1785839680000,
  "updated_at": 1785839680000
}
```

### 3.2 项目识别规则（scan_workspaces）

对根目录的**直接子目录**做特征检测，满足任一即识别为项目：

| 特征文件 | 优先级 | 判定 |
|---|---|---|
| `.workbuddy/` 目录 | ★★★ | WorkBuddy 项目（最高优先） |
| `.git/` 目录 | ★★ | Git 仓库 |
| `package.json` | ★★ | Node 项目 |
| `Cargo.toml` | ★★ | Rust 项目 |
| `README.md` 且非空 | ★ | 有文档的项目 |
| 存在 ≥1 个源文件（src/js/py/go 目录） | ★ | 有代码 |

**技术栈识别**（从配置文件提取，映射到人话）：
- `package.json` 有 `react` → `React`；有 `vue` → `Vue3`；有 `@tauri-apps/api` → `Tauri`；默认 `Node.js`
- `Cargo.toml` → `Rust + cargo`
- `go.mod` → `Go`
- `pyproject.toml` / `requirements.txt` → `Python`
- `pom.xml` → `Java + Maven`

### 3.3 导入流程（前端交互）

**设置页 → 新增卡片「工作空间」**：

```
┌─ 工作空间 ─────────────────────────────┐
│  [＋ 添加工作空间目录]                  │
│  ┌──────────────────────────────────┐  │
│  │ 📁 个人开发者项目                  │  │
│  │ D:/个人开发者项目管理器            │  │
│  │ 已识别 12 个项目 · 上次扫描 10:32  │  │
│  │ [重新扫描] [导入全部] [移除]       │  │
│  └──────────────────────────────────┘  │
│  ┌──────────────────────────────────┐  │
│  │ 📁 开源项目                       │  │
│  │ D:/code/opensource               │  │
│  │ 已识别 3 个项目 · 从未导入         │  │
│  │ [重新扫描] [导入全部] [移除]       │  │
│  └──────────────────────────────────┘  │
└───────────────────────────────────────┘
```

**导入确认弹窗**（避免误导入无关目录）：

```
识别到 12 个项目：
  ☑ parallel-workbench   Tauri + 原生JS    (已有，更新)
  ☑ storyforge-ai        Python            (已有，更新)
  ☑ docs-collection      纯文档             (新增)
  ...
  [取消]  [导入选中 8 个]
```

**去重规则**：
- 已存在 `source_dir === 目录` 的项目 → **更新**（local_path/tech_stack 同步，不覆盖用户修改的 name/status）
- 新增项目默认 `status: 'active'`，`workspace: true`
- 已删除的目录对应项目 → 标记 `status: 'archived'`（不删除，保留数据）

### 3.4 Rust 命令：`scan_workspaces`

```rust
/// 入参：{ dir: String }
/// 返回：Vec<ProjectCandidate>，仅扫描直接子目录（depth=1，防止扫到 node_modules）
#[tauri::command]
fn scan_workspaces(dir: String) -> Result<Vec<Value>, String> {
    let root = PathBuf::from(&dir);
    if !root.is_dir() { return Err("目录不存在".into()); }
    let mut out = vec![];
    for entry in fs::read_dir(&root).map_err(...)? {
        let entry = entry.map_err(...)?;
        let p = entry.path();
        if !p.is_dir() { continue; }
        let name = p.file_name()...;
        if name.starts_with('.') { continue; }        // 跳过隐藏目录
        if name == "node_modules" { continue; }        // 明确排除
        let score = detect_project(&p);                // 特征评分
        if score == 0 { continue; }
        out.push(json!({
            "name": name,
            "path": p.to_string_lossy(),
            "score": score,
            "tech_stack": detect_tech_stack(&p),       // 技术栈识别
            "has_workbuddy": p.join(".workbuddy").is_dir(),
        }));
    }
    Ok(out)
}

fn detect_project(p: &Path) -> i32 { /* 按 3.2 规则加权求和 */ }
fn detect_tech_stack(p: &Path) -> String { /* 按 3.2 配置识别 */ }
```

**性能**：depth=1 + 排除隐藏目录/node_modules，1000 个目录内 <200ms。

---

## 4. 方案 B：读取 `.workbuddy/memory` 工作日志

### 4.1 日志结构（WorkBuddy 现有约定）

```
<项目目录>/.workbuddy/memory/
├── 2026-08-04.md    ← 按日期命名的工作日志
└── MEMORY.md        ← 长期项目笔记
```

日志正文为 Markdown，含 `## 标题`、`**要点**`、列表等（工作日志本身格式自由）。

### 4.2 解析规则（read_project_logs）

1. 读取 `memory/` 目录下 **按日期命名的 `YYYY-MM-DD.md`** 文件（正则匹配）
2. 按文件名倒序取最近 3 天
3. 每个文件提取：
   - **日期**（文件名）
   - **标题行**（`# ` / `## ` 首个标题，若无则取首行非空）
   - **正文摘要**（去 Markdown 符号，截断 200 字）
4. 读取 `MEMORY.md` 首 200 字作为「长期要点」

**返回结构**：

```jsonc
{
  "logs": [
    { "date": "2026-08-04", "title": "F14 统计面板增强", "snippet": "完成 statsRange…测试 57+41+16 全过" },
    { "date": "2026-08-03", "title": "F11 计时器", "snippet": "单计时器模式实现…" }
  ],
  "memory_note": "并行工作台项目约定：测试全过再提交…"
}
```

### 4.3 UI 展示

**项目详情页**（`workspace: true` 的项目显示）：

```
┌─ 🤖 WorkBuddy 最近进度 ──────────────────┐
│  08-04 · F14 统计面板增强                 │
│  「完成 statsRange…测试 57+41+16 全过」    │
│  08-03 · F11 计时器                       │
│  「单计时器模式实现…」                     │
│  [📂 打开目录]  [刷新]                    │
└──────────────────────────────────────────┘
```

- 放在项目详情顶部、上下文快照下方
- 手动创建的项目（无 source_dir）不显示此卡片
- 「刷新」按钮重新调用 `read_project_logs`

### 4.4 Rust 命令：`read_project_logs`

```rust
/// 入参：{ dir: String }
/// 返回：{ logs: [...], memory_note: String }
#[tauri::command]
fn read_project_logs(dir: String) -> Result<Value, String> {
    let mem_dir = PathBuf::from(&dir).join(".workbuddy").join("memory");
    if !mem_dir.is_dir() { return Ok(json!({ "logs": [], "memory_note": "" })); }
    let mut files = vec![];
    for entry in fs::read_dir(&mem_dir).map_err(...)? {
        let p = entry.map_err(...)?.path();
        if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
            if NAME_RE.is_match(name) { files.push(p); }   // ^\d{4}-\d{2}-\d{2}\.md$
        }
    }
    files.sort(); files.reverse();
    let logs = files.iter().take(3).map(|p| parse_log(p)).collect();
    let memory_note = read_first_lines(&mem_dir.join("MEMORY.md"), 200);
    Ok(json!({ "logs": logs, "memory_note": memory_note }))
}
```

---

## 5. 前端改动清单

### 5.1 `js/store.js`
| 改动 | 说明 |
|---|---|
| `seed()` | 顶层加 `workspaces: []` |
| 新增 `getWorkspaces()` / `saveWorkspaces(list)` | 读写 workspaces |
| 新增 `isWorkspaceProject(p)` | `p.workspace === true` |
| 新增 `scanWorkspace(dir)` | `invoke('scan_workspaces', { dir })` 桥接 |
| 新增 `readProjectLogs(dir)` | `invoke('read_project_logs', { dir })` 桥接 |
| `importJSON` 容错 | 旧数据无 workspaces → 补默认值 |

### 5.2 `js/app.js`
| 改动 | 说明 |
|---|---|
| `renderSettings()` | 新增「工作空间」卡片（列表/添加/扫描/导入/移除） |
| `bindSettings()` | 工作空间按钮事件 |
| 新增 `openAddWorkspaceModal()` | 原生对话框选目录（`__TAURI__.dialog.open`，浏览器回退 prompt） |
| 新增 `renderWorkspaceImport()` | 导入确认弹窗（多选） |
| `renderProjectDetail()` | `workspace: true` 时渲染「🤖 最近进度」卡片 |
| 新增 `loadProjectLogs()` | 调 `readProjectLogs` 填充进度卡片 |

### 5.3 `css/style.css`
新增 `.ws-card`、`.ws-progress-card`、`.ws-badge` 等样式。

---

## 6. Rust 改动清单（`src-tauri/src/lib.rs`）

| 改动 | 说明 |
|---|---|
| `scan_workspaces` 命令 | §3.4 |
| `read_project_logs` 命令 | §4.4 |
| `commands` 模块新增 `detect_project`/`detect_tech_stack`/`parse_log` 辅助 | 纯函数，便于测试 |
| `invoke_handler` 注册 2 个新命令 | |
| `Cargo.toml` | 无需新依赖（std::fs 足够） |

> 注：`tauri-plugin-fs` 已有 `fs:default`，但目录枚举用 Rust 侧 `std::fs` 更可控（排除规则、评分逻辑），不走前端 fs 插件。

---

## 7. 边界情况与决策

| 场景 | 处理 |
|---|---|
| 根目录不存在/无权限 | `scan_workspaces` 返回 Err，前端 toast 提示 |
| 目录里嵌套大量无关文件夹 | depth=1 + 特征评分，score=0 跳过 |
| 项目已导入又被删除目录 | 保留项目档案，标 `archived` |
| 日志文件不是 md/日期不匹配 | 忽略，不报错 |
| 日志很大（>500KB） | 只取前 200 字摘要 |
| 用户手动编辑了导入项目的 name/status | 重新扫描时**不覆盖**用户字段（只同步 local_path/tech_stack） |
| 无 `.workbuddy` 的普通代码仓库 | 仍可识别（.git/package.json 特征），只是无日志进度卡 |
| Windows 路径含中文 | 全部用 `PathBuf` + `to_string_lossy`，UTF-8 安全 |

---

## 8. 测试计划

### 8.1 Rust 侧（可选，`#[cfg(test)]`）
- `detect_project`：workbuddy/.git/package.json 各特征加权正确
- `detect_tech_stack`：node/rust/go/python 识别正确
- `parse_log`：标题提取、正文去 Markdown、截断

### 8.2 store.js 单测（test-store.js）
- `workspaces` 默认空数组；save/get 往返
- `isWorkspaceProject` 判定
- 导入 JSON 无 workspaces 字段 → 容错补默认

### 8.3 UI 测试（test-ui.js，happy-dom 模拟）
- 设置页出现「工作空间」卡片
- 模拟 `scan_workspaces` 返回候选 → 导入弹窗渲染 → 确认后 projects 增加
- 项目详情页 workspace 项目渲染进度卡片（mock `read_project_logs`）

### 8.4 真实 UI 验证（pywinauto）
- 添加 `D:\个人开发者项目管理器` 为工作空间 → 扫描 → 导入 → 项目列表出现 `parallel-workbench`
- 项目详情显示「🤖 最近进度」（读取 `memory/2026-08-04.md`）
- 一键打开目录 → 资源管理器弹出

---

## 9. 里程碑与工作量

| 阶段 | 内容 | 预估 |
|---|---|---|
| M1 | Rust 两个命令 + 单测 | 3-4 小时 |
| M2 | store.js 桥接 + 设置页工作空间 UI | 3 小时 |
| M3 | 导入确认弹窗 + 项目详情进度卡 | 2-3 小时 |
| M4 | 测试补齐 + 构建 + 真实 UI 验证 | 2 小时 |
| **合计** | | **约 1~1.5 天** |

---

## 10. 后续演进（本期不做）

- **方案 C**：任务数据文件随项目走（每项目一个 `workbench.json`）
- **双向同步**：应用写回进度到 `.workbuddy/memory`（需用户显式开启）
- **子目录递归**：支持工作空间嵌套（本期 depth=1）
- **文件监听热更新**：目录变化实时刷新导入列表

---

*并行工作台 · WorkBuddy 集成设计 V1.0 · 2026-08-04*

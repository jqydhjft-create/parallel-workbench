# 并行工作台 × WorkBuddy 对接 · 安装说明

本安装包让「并行工作台」桌面应用与 WorkBuddy 协同：WorkBuddy 维护各项目根目录的 `workbench.json` 对接文档，应用扫描只读导入。**技能以项目级安装（写入工作空间目录的 `.workbuddy/skills/`），不写全局配置、不写长期记忆。**

## 安装包内容

```
workbench-integration-pack/
├── skills/workbench-json-sync/   # 维护技能（SKILL.md + references/schema.md）
├── install.py                    # 项目级技能导入脚本
└── INSTALL.md                    # 本说明
```

## 方式一：应用内导入（推荐）

1. 打开「并行工作台」应用 → **设置 → 🤖 WorkBuddy 工作空间 → ＋ 添加**
2. 选择你的**项目根目录**（存放各项目的文件夹）
3. 应用会自动把集成技能导入到该目录 `.workbuddy/skills/`，并扫描其中的 `workbench.json` 项目
4. 之后在 WorkBuddy 对话中提项目/任务（"给 X 项目加任务""Y 任务完成了"），WorkBuddy 会同步更新对应项目的 `workbench.json`，应用重扫即见

## 方式二：脚本导入

```bash
cd workbench-integration-pack
python install.py <工作空间根目录>     # 例如 python install.py D:/code
```

脚本把 `workbench-json-sync` 技能写入 `<工作空间根目录>/.workbuddy/skills/`（项目级）。

> 想先看效果可运行 `python install.py --dry <目录>`。

## 方式三：拖给 WorkBuddy 聊天框

把 `workbench-integration-pack` 文件夹（或压缩包）拖进 WorkBuddy 的聊天输入框，发送"请安装这个 workbench 集成包到 <工作空间目录>"，WorkBuddy 会自动导入技能并说明用法。

## 技能位置与作用域

| 项 | 说明 |
|---|---|
| 技能路径 | `<工作空间根目录>/.workbuddy/skills/workbench-json-sync/`（项目级） |
| 作用域 | 仅该工作空间下的 WorkBuddy 对话加载，不影响全局 |
| 写入内容 | 仅技能文件，不写长期记忆、不写全局配置 |
| 卸载 | 删除 `.workbuddy/skills/workbench-json-sync/` 即可 |

## 常见问题

- **Q：为什么只装项目级？** 用户决策：技能跟随工作空间，避免污染全局配置；技能自带全部规范，无需记忆辅助
- **Q：多个工作空间？** 每个工作空间独立导入，互不影响
- **Q：版本？** schema workbench-v1；技能 workbench-json-sync v1.0

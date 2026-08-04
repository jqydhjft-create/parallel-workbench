# 并行工作台 × WorkBuddy 对接 · 安装说明

本安装包让「并行工作台」桌面应用与 WorkBuddy 协同：WorkBuddy 维护各项目根目录的 `workbench.json` 对接文档，应用扫描只读导入。**安装后无需任何手动配置路径。**

## 安装包内容

```
workbench-integration-pack/
├── skills/workbench-json-sync/   # 维护技能（SKILL.md + references/schema.md）
├── templates/memory-user.md      # 用户级长期记忆模板（合并到 ~/.workbuddy/MEMORY.md）
├── install.py                    # 一键安装脚本
└── INSTALL.md                    # 本说明
```

## 方式一：一键脚本安装（推荐，无需 AI）

```bash
cd workbench-integration-pack
python install.py          # Windows / macOS / Linux 通用
```

脚本会自动：
1. 复制 `workbench-json-sync` 技能到 `~/.workbuddy/skills/`（跨所有项目可用）
2. 把记忆模板合并到 `~/.workbuddy/MEMORY.md`（已存在则不重复追加）

> 想先看效果可运行 `python install.py --dry`。

## 方式二：拖给 WorkBuddy 聊天框

把 `workbench-integration-pack` 文件夹（或压缩包）直接拖进 WorkBuddy 的聊天输入框，然后发送：

```
请安装这个 workbench 集成包
```

WorkBuddy 会自动完成：把技能装到 `~/.workbuddy/skills/`、合并记忆模板，并提示下一步。

## 安装后使用

1. 打开「并行工作台」应用 → **设置 → 🤖 WorkBuddy 工作空间 → ＋ 添加**
2. 选择你的**项目根目录**（存放各项目的文件夹）
3. 点「扫描」→ 勾选 → 导入
4. 之后在 WorkBuddy 对话中提项目/任务（"给 X 项目加任务""Y 任务完成了"），WorkBuddy 会同步更新对应项目的 `workbench.json`，应用重扫即见

## 常见问题

- **Q：技能装到哪了？** `~/.workbuddy/skills/workbench-json-sync/`（用户级，所有项目可用）
- **Q：为什么不用写死路径？** 技能和记忆全部采用动态发现（当前工作目录 / 用户指定 / 应用 workspaces 配置），不假设任何固定路径
- **Q：卸载？** 删除 `~/.workbuddy/skills/workbench-json-sync/`，并从 `~/.workbuddy/MEMORY.md` 移除对应段落即可

## 版本

- schema：workbench-v1
- 技能：workbench-json-sync v1.0

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
并行工作台 × WorkBuddy 对接配置 · 一键安装脚本

作用：
  1. 把 workbench-json-sync 技能复制到 ~/.workbuddy/skills/（用户级，跨项目可用）
  2. 把记忆模板合并到 ~/.workbuddy/MEMORY.md（去重，不重复追加）
  3. 打印后续使用说明（应用侧配置工作空间）

用法：
  python install.py          # 自动安装
  python install.py --dry    # 只预览要做什么，不实际修改

兼容 Windows / macOS / Linux。
"""
import argparse
import os
import shutil
import sys

PACK_DIR = os.path.dirname(os.path.abspath(__file__))
SKILL_SRC = os.path.join(PACK_DIR, "skills", "workbench-json-sync")
MEMORY_TMPL = os.path.join(PACK_DIR, "templates", "memory-user.md")


def user_home():
    return os.path.expanduser("~")


def install(dry: bool):
    home = user_home()
    skills_dir = os.path.join(home, ".workbuddy", "skills")
    skill_dst = os.path.join(skills_dir, "workbench-json-sync")
    memory_file = os.path.join(home, ".workbuddy", "MEMORY.md")

    print(f"[1/2] 安装技能 workbench-json-sync")
    print(f"      目标: {skill_dst}")
    if dry:
        print("      (dry-run) 将复制技能目录")
    else:
        os.makedirs(skills_dir, exist_ok=True)
        if os.path.exists(skill_dst):
            # 已存在 → 备份到 .bak 后替换，避免直接删除失败（权限/占用）
            bak = skill_dst + ".bak"
            if os.path.exists(bak):
                shutil.rmtree(bak, ignore_errors=True)
            try:
                shutil.move(skill_dst, bak)
                print("      已备份旧技能 -> workbench-json-sync.bak")
            except Exception:
                pass
        shutil.copytree(SKILL_SRC, skill_dst)
        print(f"      已安装技能（{len(os.listdir(SKILL_SRC))} 个资源文件）")

    print(f"[2/2] 合并长期记忆")
    print(f"      目标: {memory_file}")
    if not os.path.exists(MEMORY_TMPL):
        print("      跳过：未找到记忆模板")
        return
    if dry:
        print("      (dry-run) 将把模板合并到用户级记忆")
        return
    with open(MEMORY_TMPL, encoding="utf-8") as f:
        tmpl = f.read()
    anchor = "并行工作台 · WorkBench 对接文档维护习惯"
    if os.path.exists(memory_file):
        with open(memory_file, encoding="utf-8") as f:
            existing = f.read()
        if anchor in existing:
            print("      记忆已存在，跳过（不重复追加）")
            return
        merged = existing.rstrip() + "\n\n" + tmpl + "\n"
    else:
        merged = "# 用户长期记忆\n\n" + tmpl + "\n"
    with open(memory_file, "w", encoding="utf-8") as f:
        f.write(merged)
    print("      已合并记忆模板")

    print("\n✅ 配置完成！")
    print("接下来：打开「并行工作台」应用 → 设置 → 🤖 WorkBuddy 工作空间 → ＋ 添加")
    print("选择你的项目根目录，扫描后即可导入含 workbench.json 的项目。")


def main():
    ap = argparse.ArgumentParser(description="并行工作台 × WorkBuddy 对接一键安装")
    ap.add_argument("--dry", action="store_true", help="只预览不修改")
    args = ap.parse_args()
    try:
        install(args.dry)
    except Exception as e:
        print(f"安装失败: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

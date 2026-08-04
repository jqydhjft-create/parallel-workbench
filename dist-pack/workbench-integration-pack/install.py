#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
并行工作台 × WorkBuddy 对接配置 · 项目级技能安装脚本

作用：
  把 workbench-json-sync 技能导入到【指定工作空间目录】的 .workbuddy/skills/（项目级），
  只写项目内，不影响全局配置，不写任何长期记忆。

用法：
  python install.py <工作空间根目录>      # 例如 python install.py D:/code
  python install.py --dry <目录>          # 只预览要做什么

兼容 Windows / macOS / Linux。
"""
import argparse
import os
import shutil
import sys

PACK_DIR = os.path.dirname(os.path.abspath(__file__))
SKILL_SRC = os.path.join(PACK_DIR, "skills", "workbench-json-sync")


def install(ws_dir: str, dry: bool):
    if not ws_dir:
        print("错误：请提供工作空间根目录，如 python install.py D:/code", file=sys.stderr)
        sys.exit(1)
    ws_dir = os.path.abspath(ws_dir)
    if not os.path.isdir(ws_dir):
        print(f"错误：目录不存在: {ws_dir}", file=sys.stderr)
        sys.exit(1)

    skill_dst = os.path.join(ws_dir, ".workbuddy", "skills", "workbench-json-sync")
    print(f"[1/1] 导入技能 workbench-json-sync → 项目级")
    print(f"      目标: {skill_dst}")
    if dry:
        print("      (dry-run) 将写入技能目录（含 references/schema.md）")
        return
    os.makedirs(os.path.dirname(skill_dst), exist_ok=True)
    if os.path.exists(skill_dst):
        bak = skill_dst + ".bak"
        if os.path.exists(bak):
            shutil.rmtree(bak, ignore_errors=True)
        try:
            shutil.move(skill_dst, bak)
            print("      已备份旧技能 -> workbench-json-sync.bak")
        except Exception:
            pass
    shutil.copytree(SKILL_SRC, skill_dst)
    print(f"      已导入技能（{len(os.listdir(SKILL_SRC))} 个资源文件）")

    print("\n✅ 导入完成！")
    print("该工作空间下的 WorkBuddy 对话将自动加载此技能，维护各项目根目录的 workbench.json。")
    print("不影响全局配置，未写入任何长期记忆。")


def main():
    ap = argparse.ArgumentParser(description="并行工作台 × WorkBuddy 项目级技能导入")
    ap.add_argument("dir", nargs="?", help="工作空间根目录（存放各项目的文件夹）")
    ap.add_argument("--dry", action="store_true", help="只预览不修改")
    args = ap.parse_args()
    try:
        install(args.dir, args.dry)
    except Exception as e:
        print(f"安装失败: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

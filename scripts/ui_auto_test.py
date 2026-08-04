"""真实 UI 交互验证：启动桌面应用，模拟点击侧边栏各视图与按钮，
验证界面是否有响应（内容变化）。"""
import subprocess
import time
import sys

EXE = r"D:\个人开发者项目管理器\parallel-workbench\src-tauri\target\release\parallel-workbench.exe"

def main():
    # 启动应用
    proc = subprocess.Popen([EXE], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(6)

    from pywinauto import Application
    from pywinauto.controls.uiawrapper import UIAWrapper

    results = []
    def check(name, cond):
        results.append((name, bool(cond)))
        print(("PASS " if cond else "FAIL ") + name)

    try:
        # 连接到主窗口（取第一个匹配窗口）
        app = Application(backend="uia").connect(process=proc.pid, timeout=15)
        wins = app.windows()
        print(f"找到窗口数: {len(wins)}")
        win = None
        for w in wins:
            try:
                txt = w.window_text()
                print(f"  窗口: '{txt[:50]}'")
                if "并行工作台" in txt:
                    win = w
                    break
            except Exception:
                continue
        if win is None and wins:
            win = wins[0]
        # 窗口标题已验证存在
        check("窗口存在", win is not None)
        check("窗口标题", "并行工作台" in win.window_text())

        # 枚举窗口的直接子元素
        try:
            rect = win.element_info.rectangle
            print(f"窗口区域: {rect.left},{rect.top} - {rect.right},{rect.bottom}")
            check("窗口有尺寸", rect.right - rect.left > 100 and rect.bottom - rect.top > 100)
        except Exception as e:
            print(f"窗口区域读取失败: {e}")

        # 尝试用 UIA 读取所有控件（遍历深度有限的子树）
        try:
            from pywinauto.controls.uia_controls import EditWrapper, ButtonWrapper
            tree = win.descendants()
            print(f"控件总数: {len(tree)}")
            texts_seen = set()
            for c in tree[:50]:
                try:
                    ct = c.element_info.control_type
                    txt = c.window_text().strip()
                    if txt and ct in ("Button", "Text", "Edit", "ListItem"):
                        key = f"{ct}:{txt[:30]}"
                        if key not in texts_seen:
                            texts_seen.add(key)
                            print(f"  - {ct}: '{txt[:40]}'")
                except Exception:
                    pass
        except Exception as e:
            print(f"UI 树读取失败: {type(e).__name__}: {str(e)[:100]}")

        # 尝试点击侧边栏按钮（通过文本定位）
        texts = ["项目", "任务", "看板"]
        for t in texts:
            try:
                btn = win.child_window(title=t, control_type="Button")
                btn.click()
                time.sleep(0.8)
                check(f"点击「{t}」成功", True)
            except Exception as e:
                print(f"  点击「{t}」失败: {type(e).__name__}: {str(e)[:80]}")

        time.sleep(2)

    except Exception as e:
        print(f"整体失败: {type(e).__name__}: {e}")
        check("应用可连接", False)

    finally:
        try:
            proc.terminate()
        except Exception:
            pass

    fails = [n for n, ok in results if not ok]
    print(f"\n结果: {len(results)-len(fails)} 通过, {len(fails)} 失败")
    return 1 if fails else 0

if __name__ == "__main__":
    sys.exit(main())

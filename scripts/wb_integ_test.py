# -*- coding: utf-8 -*-
"""验证设置页 WorkBuddy 集成一键安装：未安装状态显示 → 点击安装 → 文件落盘"""
import subprocess, time, os, sys
from pywinauto import Application
import win32gui, win32ui, ctypes

EXE = r"D:\个人开发者项目管理器\parallel-workbench\src-tauri\target\release\parallel-workbench.exe"
HOME = os.path.expanduser("~")
SKILL = os.path.join(HOME, ".workbuddy", "skills", "workbench-json-sync", "SKILL.md")
MEM = os.path.join(HOME, ".workbuddy", "MEMORY.md")

# 前置：确认当前为"未安装"状态
skill_before = os.path.exists(SKILL)
print("安装前技能存在:", skill_before, "(应为 False)")

proc = subprocess.Popen([EXE], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(10)
try:
    app = Application(backend="uia").connect(process=proc.pid, timeout=15)
    win = None
    for w in app.windows():
        if "并行工作台" in w.window_text():
            win = w; break
    if not win:
        print("FAIL 找不到窗口"); sys.exit(1)
    win.set_focus(); time.sleep(0.3)
    win.type_keys("^6"); time.sleep(2.5)  # 设置页（含自动检查）

    hwnd = win.handle
    l, t, r, b = win32gui.GetClientRect(hwnd)
    # 滚动到工作空间卡片
    import win32api, win32con
    win32api.SetCursorPos((l + 600, t + 400))
    for _ in range(8):
        win32api.mouse_event(win32con.MOUSEEVENTF_WHEEL, 0, 0, -120, 0); time.sleep(0.08)
    time.sleep(1)

    def shot(path):
        hwndDC = win32gui.GetWindowDC(hwnd)
        mfcDC = win32ui.CreateDCFromHandle(hwndDC)
        saveDC = mfcDC.CreateCompatibleDC()
        bmp = win32ui.CreateBitmap()
        bmp.CreateCompatibleBitmap(mfcDC, r - l, b - t)
        saveDC.SelectObject(bmp)
        ctypes.windll.user32.PrintWindow(hwnd, saveDC.GetSafeHdc(), 3)
        bmp.SaveBitmapFile(saveDC, path)
        saveDC.DeleteDC(); mfcDC.DeleteDC()
        win32gui.ReleaseDC(hwnd, hwndDC)

    shot(r"D:\个人开发者项目管理器\parallel-workbench\wi1.png")
    print("安装前截图已保存（应显示⚠未安装 + 一键安装按钮）")

    # 找「一键安装」按钮（accent 蓝 btn-primary）
    from PIL import Image
    img = Image.open(r"D:\个人开发者项目管理器\parallel-workbench\wi1.png").convert("RGB")
    W, H = img.size
    found = None
    for y in range(60, H - 30, 2):
        xs = [x for x in range(240, 1270, 2)
              if abs(img.getpixel((x, y))[0]-59) < 40 and abs(img.getpixel((x, y))[1]-91) < 40 and abs(img.getpixel((x, y))[2]-219) < 50]
        if len(xs) > 12:
            found = (y, (xs[0] + xs[-1]) // 2)
            break
    if not found:
        print("FAIL 未找到一键安装按钮（截图分析）")
        sys.exit(1)
    y, x = found
    print(f"找到按钮 y={y} x={x}，点击…")
    left, top = win32gui.ClientToScreen(hwnd, (0, 0))
    win32api.SetCursorPos((left + x, top + y)); time.sleep(0.2)
    win32api.mouse_event(win32con.MOUSEEVENTF_LEFTDOWN, 0, 0)
    win32api.mouse_event(win32con.MOUSEEVENTF_LEFTUP, 0, 0)
    time.sleep(2.5)

    # 验证文件落盘
    skill_after = os.path.exists(SKILL)
    mem_content = ""
    if os.path.exists(MEM):
        with open(MEM, encoding="utf-8") as f:
            mem_content = f.read()
    mem_merged = "并行工作台 · WorkBench" in mem_content
    print("安装后技能存在:", skill_after)
    print("安装后记忆含规范:", mem_merged)
    print("====")
    print("一键安装:", "PASS" if skill_after and mem_merged else "FAIL")

    shot(r"D:\个人开发者项目管理器\parallel-workbench\wi2.png")
    print("安装后截图已保存（应显示✅已就绪）")
except Exception as e:
    import traceback; traceback.print_exc()
finally:
    try: proc.terminate()
    except Exception: pass

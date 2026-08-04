# -*- coding: utf-8 -*-
"""验证 WorkBuddy 工作空间闭环：滚动设置页 → 点添加 → 选目录 → 扫描 → 确认导入"""
import subprocess, time, os, sys, json
import win32api, win32con
from pywinauto import Application
import win32gui, win32ui, ctypes

EXE = r"D:\个人开发者项目管理器\parallel-workbench\src-tauri\target\release\parallel-workbench.exe"
SHOT_DIR = r"D:\个人开发者项目管理器\parallel-workbench"

def shot(win, path):
    hwnd = win.handle
    l, t, r, b = win32gui.GetClientRect(hwnd)
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
    win32gui.DeleteObject(bmp.GetHandle())

def click(win, x, y):
    hwnd = win.handle
    left, top = win32gui.ClientToScreen(hwnd, (0, 0))
    win32api.SetCursorPos((left + x, top + y)); time.sleep(0.2)
    win32api.mouse_event(win32con.MOUSEEVENTF_LEFTDOWN, 0, 0)
    win32api.mouse_event(win32con.MOUSEEVENTF_LEFTUP, 0, 0)
    time.sleep(0.5)

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
    win.type_keys("^6"); time.sleep(1.5)  # Ctrl+6 设置
    hwnd = win.handle
    l, t, r, b = win32gui.GetClientRect(hwnd)

    # 滚动设置页到底部
    win32api.SetCursorPos((l + 600, t + 400))
    for _ in range(10):
        win32api.mouse_event(win32con.MOUSEEVENTF_WHEEL, 0, 0, -120, 0)
        time.sleep(0.08)
    time.sleep(0.5)
    shot(win, os.path.join(SHOT_DIR, "ws2.png"))
    print("滚动后截图已保存")

    # 找「＋ 添加」accent 按钮（工作空间卡片在底部）
    from PIL import Image
    img = Image.open(os.path.join(SHOT_DIR, "ws2.png")).convert("RGB")
    W, H = img.size
    found = None
    for y in range(60, H - 30, 2):
        xs = [x for x in range(700, 1270, 2)
              if abs(img.getpixel((x, y))[0]-59) < 40 and abs(img.getpixel((x, y))[1]-91) < 40 and abs(img.getpixel((x, y))[2]-219) < 50]
        if len(xs) > 12:
            found = (y, (xs[0] + xs[-1]) // 2)
            break
    if not found:
        print("FAIL 未找到添加按钮")
        sys.exit(1)
    y, x = found
    print(f"找到「＋ 添加」按钮 y={y} x={x}")
    click(win, x, y)
    time.sleep(1.5)
    print("已点击添加（应弹出原生目录选择对话框）")
    shot(win, os.path.join(SHOT_DIR, "ws3.png"))
    # 检查对话框
    try:
        dlg_app = Application(backend="uia").connect(title_re=".*(选择|目录|文件夹|Open).*", timeout=4)
        print("检测到对话框:", [w.window_text() for w in dlg_app.windows()][:3])
        # 在对话框输入路径（可能无法直接输入，尝试键盘）
        try:
            dlg_win = dlg_app.top_window()
            dlg_win.set_focus()
            # 尝试输入路径（许多对话框有地址栏，Ctrl+L）
            dlg_win.type_keys("^l")
            time.sleep(0.3)
            dlg_win.type_keys(r"D:\个人开发者项目管理器")
            time.sleep(0.3)
            dlg_win.type_keys("{ENTER}")
            time.sleep(1.5)
            print("已输入路径并回车")
        except Exception as e2:
            print("对话框输入失败:", e2)
    except Exception:
        print("未检测到原生对话框")
except Exception as e:
    print("异常:", e)
    import traceback; traceback.print_exc()
finally:
    try: proc.terminate()
    except Exception: pass

"""鼠标点击验证（修复后）：启动应用 -> PrintWindow 截图 -> 鼠标点击侧边栏'项目' -> 截图 -> 对比。
修复前：鼠标点击被常驻遮罩拦截，内容 0% 变化。
修复后：应能正常切换视图，内容显著变化。"""
import subprocess
import time
import sys
import win32api
import win32con

EXE = r"D:\个人开发者项目管理器\parallel-workbench\src-tauri\target\release\parallel-workbench.exe"

def shot(win, path, w, h):
    import win32gui, win32ui, win32con, ctypes
    hwnd = win.handle
    hwndDC = win32gui.GetWindowDC(hwnd)
    mfcDC = win32ui.CreateDCFromHandle(hwndDC)
    saveDC = mfcDC.CreateCompatibleDC()
    bitmap = win32ui.CreateBitmap()
    bitmap.CreateCompatibleBitmap(mfcDC, w, h)
    saveDC.SelectObject(bitmap)
    # PrintWindow 抓取 GPU 合成内容
    ctypes.windll.user32.PrintWindow(hwnd, saveDC.GetSafeHdc(), 3)
    bitmap.SaveBitmapFile(saveDC, path)
    saveDC.DeleteDC(); mfcDC.DeleteDC()
    win32gui.ReleaseDC(hwnd, hwndDC)
    win32gui.DeleteObject(bitmap.GetHandle())

def imgdiff(a, b):
    from PIL import Image, ImageChops
    ia = Image.open(a).convert("RGB")
    ib = Image.open(b).convert("RGB").resize(ia.size)
    diff = ImageChops.difference(ia, ib)
    bbox = diff.getbbox()
    if not bbox:
        return 0
    hist = diff.histogram()
    total = sum(hist)
    return sum(hist[30:]) / total * 100

def main():
    from pywinauto import Application
    import win32gui

    proc = subprocess.Popen([EXE], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(8)

    app = Application(backend="uia").connect(process=proc.pid, timeout=15)
    win = None
    for w in app.windows():
        if "并行工作台" in w.window_text():
            win = w
            break
    if win is None:
        print("FAIL 找不到窗口")
        proc.terminate()
        return 1

    win.set_focus()
    time.sleep(1)
    hwnd = win.handle
    l, t, r, b = win32gui.GetClientRect(hwnd)
    w, h = r - l, b - t

    # 截图1：初始总览
    shot(win, r"D:\个人开发者项目管理器\parallel-workbench\m1.png", w, h)

    # 计算侧边栏按钮屏幕坐标
    left, top = win32gui.ClientToScreen(hwnd, (0, 0))
    # 侧边栏 218px；nav 项从品牌区(~60px)开始，每项 ~44px：
    # 项目 = 第2项 → y≈60+44+22≈126 附近。x=110
    btn_x = left + 110
    btn_y = top + 140
    win32api.SetCursorPos((btn_x, btn_y))
    time.sleep(0.3)
    win32api.mouse_event(win32con.MOUSEEVENTF_LEFTDOWN, 0, 0)
    win32api.mouse_event(win32con.MOUSEEVENTF_LEFTUP, 0, 0)
    time.sleep(1.5)

    # 截图2：点击后
    shot(win, r"D:\个人开发者项目管理器\parallel-workbench\m2.png", w, h)

    diff = imgdiff(r"D:\个人开发者项目管理器\parallel-workbench\m1.png", r"D:\个人开发者项目管理器\parallel-workbench\m2.png")
    print(f"鼠标点击「项目」后内容差异: {diff:.2f}%")
    if diff > 3:
        print("PASS: 鼠标交互正常！界面切换响应了")
    else:
        print("FAIL: 鼠标点击仍无响应（可能遮罩仍在或坐标不准）")

    proc.terminate()
    return 0

if __name__ == "__main__":
    sys.exit(main())

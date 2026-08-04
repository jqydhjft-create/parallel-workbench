"""点击验证：启动应用 -> 截图 -> 点击"项目"视图 -> 截图 -> 对比变化。
WebView 内容不暴露给 UIA，采用窗口坐标模拟鼠标点击。"""
import subprocess
import time
import sys

EXE = r"D:\个人开发者项目管理器\parallel-workbench\src-tauri\target\release\parallel-workbench.exe"

def shot(win, path, w, h):
    import win32gui, win32ui, win32con
    hwnd = win.handle
    hwndDC = win32gui.GetWindowDC(hwnd)
    mfcDC = win32ui.CreateDCFromHandle(hwndDC)
    saveDC = mfcDC.CreateCompatibleDC()
    bitmap = win32ui.CreateBitmap()
    bitmap.CreateCompatibleBitmap(mfcDC, w, h)
    saveDC.SelectObject(bitmap)
    saveDC.BitBlt((0, 0), (w, h), mfcDC, (0, 0), win32con.SRCCOPY)
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
    # 计算差异像素占比
    hist = diff.histogram()
    total = sum(hist)
    changed = sum(hist[30:])  # 差异阈值
    return changed / total * 100

def main():
    import win32api, win32con
    from pywinauto import Application
    from PIL import Image

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

    # 激活窗口
    win.set_focus()
    time.sleep(1)

    hwnd = win.handle
    import win32gui
    l, t, r, b = win32gui.GetClientRect(hwnd)
    w, h = r - l, b - t
    print(f"客户区 {w}x{h}")

    # 截图1：初始总览
    shot(win, r"D:\个人开发者项目管理器\parallel-workbench\shot1.png", w, h)

    # 计算侧边栏"项目"按钮位置（侧边栏宽度约 218px，第二个按钮 y 大约 130-170）
    # 窗口左上角在屏幕的位置
    left, top = win32gui.ClientToScreen(hwnd, (0, 0))
    sx, sy = left, top
    # 侧边栏 项目 按钮：x 在侧边栏中部（~100px 处），y 在品牌区下方
    # 品牌 ~60px 高 + nav 项 ~44px 高，第2项 y ≈ 60+44+22 ≈ 130
    btn_x = sx + 110
    btn_y = sy + 145
    win32api.SetCursorPos((btn_x, btn_y))
    time.sleep(0.3)
    win32api.mouse_event(win32con.MOUSEEVENTF_LEFTDOWN, 0, 0)
    win32api.mouse_event(win32con.MOUSEEVENTF_LEFTUP, 0, 0)
    time.sleep(1.5)

    # 截图2：点击后
    shot(win, r"D:\个人开发者项目管理器\parallel-workbench\shot2.png", w, h)

    diff = imgdiff(r"D:\个人开发者项目管理器\parallel-workbench\shot1.png", r"D:\个人开发者项目管理器\parallel-workbench\shot2.png")
    print(f"点击后内容差异: {diff:.2f}%")

    if diff > 3:
        print("PASS: 点击「项目」后界面有响应（内容变化明显）")
    else:
        print("FAIL: 点击「项目」后界面无变化（交互可能失效）")

    proc.terminate()
    return 0

if __name__ == "__main__":
    sys.exit(main())

"""键盘快捷键验证：按 Ctrl+2 切换项目视图，对比内容变化。
如果快捷键有效 -> JS 事件正常，问题在鼠标点击路径；
如果无效 -> JS 事件绑定或渲染层有问题。"""
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
    hist = diff.histogram()
    total = sum(hist)
    changed = sum(hist[30:])
    return changed / total * 100

def main():
    import win32gui
    from pywinauto import Application

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

    shot(win, r"D:\个人开发者项目管理器\parallel-workbench\k1.png", w, h)

    # 按 Ctrl+2 切到项目视图
    win.type_keys("^2")
    time.sleep(1.5)
    shot(win, r"D:\个人开发者项目管理器\parallel-workbench\k2.png", w, h)

    diff = imgdiff(r"D:\个人开发者项目管理器\parallel-workbench\k1.png", r"D:\个人开发者项目管理器\parallel-workbench\k2.png")
    print(f"Ctrl+2 后内容差异: {diff:.2f}%")
    if diff > 3:
        print("PASS: 键盘快捷键有效 -> JS 事件正常")
    else:
        print("FAIL: 键盘快捷键无效 -> JS 事件/渲染层问题")

    proc.terminate()
    return 0

if __name__ == "__main__":
    sys.exit(main())

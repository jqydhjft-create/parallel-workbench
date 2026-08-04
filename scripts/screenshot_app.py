"""抓取并行工作台窗口截图，验证界面是否正常渲染。"""
import subprocess
import time
import sys

EXE = r"D:\个人开发者项目管理器\parallel-workbench\src-tauri\target\release\parallel-workbench.exe"
OUT = r"D:\个人开发者项目管理器\parallel-workbench\app-window.png"

def main():
    proc = subprocess.Popen([EXE], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(8)

    import win32gui
    import win32ui
    import win32con
    from pywinauto import Application

    try:
        app = Application(backend="uia").connect(process=proc.pid, timeout=15)
        win = None
        for w in app.windows():
            if "并行工作台" in w.window_text():
                win = w
                break
        if win is None:
            print("FAIL: 找不到窗口")
            return 1

        hwnd = win.handle
        # 获取客户区矩形
        left, top, right, bottom = win32gui.GetClientRect(hwnd)
        w = right - left
        h = bottom - top
        print(f"客户区: {w}x{h}")

        # 获取窗口 DC 并截图
        hwndDC = win32gui.GetWindowDC(hwnd)
        mfcDC = win32ui.CreateDCFromHandle(hwndDC)
        saveDC = mfcDC.CreateCompatibleDC()
        bitmap = win32ui.CreateBitmap()
        bitmap.CreateCompatibleBitmap(mfcDC, w, h)
        saveDC.SelectObject(bitmap)
        saveDC.BitBlt((0, 0), (w, h), mfcDC, (0, 0), win32con.SRCCOPY)
        bitmap.SaveBitmapFile(saveDC, OUT)

        # 清理
        saveDC.DeleteDC()
        mfcDC.DeleteDC()
        win32gui.ReleaseDC(hwnd, hwndDC)
        win32gui.DeleteObject(bitmap.GetHandle())
        print(f"截图已保存: {OUT}")
        return 0
    except Exception as e:
        print(f"失败: {type(e).__name__}: {e}")
        return 1
    finally:
        try:
            proc.terminate()
        except Exception:
            pass

if __name__ == "__main__":
    sys.exit(main())

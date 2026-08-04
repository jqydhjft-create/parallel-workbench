"""分析应用窗口截图：检查是否为空白/纯色/有内容。"""
from PIL import Image
import sys

def main():
    path = r"D:\个人开发者项目管理器\parallel-workbench\app-window.png"
    img = Image.open(path).convert("RGB")
    w, h = img.size
    pixels = list(img.resize((64, 40)).getdata())  # 采样

    colors = set(pixels)
    print(f"图片尺寸: {w}x{h}")
    print(f"采样颜色数: {len(colors)}")

    # 统计亮度分布
    bright = sum(1 for p in pixels if sum(p) / 3 > 200)
    dark = sum(1 for p in pixels if sum(p) / 3 < 60)
    mid = len(pixels) - bright - dark
    total = len(pixels)
    print(f"亮色(>200): {bright/total*100:.1f}%  暗色(<60): {dark/total*100:.1f}%  中间: {mid/total*100:.1f}%")

    # 检查是否纯白/纯黑/单一颜色
    if len(colors) <= 2:
        print(">>> 结论: 疑似空白/纯色页面（UI 未渲染）")
    elif bright / total > 0.95:
        print(">>> 结论: 页面接近纯白（可能内容未渲染或极简）")
    elif bright / total < 0.05 and dark / total > 0.9:
        print(">>> 结论: 页面接近纯黑（可能崩溃或黑屏）")
    else:
        print(">>> 结论: 页面有丰富内容（UI 正常渲染）")
        # 检查是否包含侧边栏特征（左侧有色块）
        left = list(img.crop((0, 0, w//6, h)).resize((16, 20)).getdata())
        left_colors = set(left)
        print(f"  左侧 1/6 区域颜色数: {len(left_colors)}")

    # 保存缩略图便于人工查看
    img.thumbnail((480, 300))
    img.save(r"D:\个人开发者项目管理器\parallel-workbench\app-thumb.png")
    print("缩略图已保存: app-thumb.png")

if __name__ == "__main__":
    main()

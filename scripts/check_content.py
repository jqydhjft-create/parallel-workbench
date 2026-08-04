"""检查右侧内容区是否为空白（判断 app.js 是否执行）。
内容区 #content 在窗口右侧 ~1060px 宽的区域。"""
from PIL import Image

def main():
    path = r"D:\个人开发者项目管理器\parallel-workbench\app-window.png"
    img = Image.open(path).convert("RGB")
    w, h = img.size
    # 右侧内容区（sidebar ~218px，topbar ~60px）
    content = img.crop((240, 80, w - 20, h - 20))
    pixels = list(content.resize((60, 40)).getdata())
    colors = set(pixels)
    bright = sum(1 for p in pixels if sum(p)/3 > 200)
    dark = sum(1 for p in pixels if sum(p)/3 < 60)
    total = len(pixels)
    print(f"内容区颜色数: {len(colors)}")
    print(f"内容区亮色: {bright/total*100:.1f}% 暗色: {dark/total*100:.1f}%")
    if len(colors) <= 3:
        print(">>> 内容区接近纯色 -> app.js 未执行（动态内容未渲染）")
    else:
        print(">>> 内容区有内容 -> app.js 可能已执行")

    # 左侧侧边栏对比
    side = img.crop((0, 0, 218, h))
    sp = list(side.resize((20, 40)).getdata())
    print(f"侧边栏颜色数: {len(set(sp))}")

if __name__ == "__main__":
    main()

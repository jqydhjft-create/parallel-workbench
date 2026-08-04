"""生成并行工作台应用图标：蓝色渐变圆角方块 + 四块「并行」层叠方块。
输出: icons/icon.png (512), 32x32.png, 128x128.png, 128x128@2x.png, icon.ico, icon.icns
"""
import os
from PIL import Image, ImageDraw

BASE = os.path.join(os.path.dirname(__file__), 'icons')
os.makedirs(BASE, exist_ok=True)

SIZE = 512
img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# 圆角背景（品牌蓝渐变，从 #2b3a67 到 #3b5bdb）
d.rounded_rectangle([0, 0, SIZE-1, SIZE-1], radius=110, fill=(59, 91, 219, 255))
# 渐变叠加（简单模拟）
for y in range(SIZE):
    t = y / SIZE
    r = int(43 + (59-43) * t)
    g = int(58 + (91-58) * t)
    b = int(103 + (219-103) * t)
    d.line([(0, y), (SIZE, y)], fill=(r, g, b, 255))
# 重绘圆角遮罩（保留透明角落）
mask = Image.new('L', (SIZE, SIZE), 0)
dm = ImageDraw.Draw(mask)
dm.rounded_rectangle([0, 0, SIZE-1, SIZE-1], radius=110, fill=255)
img.putalpha(mask)

# 四块「并行」方块（模拟多项目并行），白色半透明到实心
def block(x, y, w, h, color):
    d.rounded_rectangle([x, y, x+w, y+h], radius=int(w*0.22), fill=color)

# 透视层叠：四块从左下到右上，突出"并行推进"
block(84, 292, 190, 130, (255, 255, 255, 235))
block(168, 208, 190, 130, (255, 255, 255, 200))
block(252, 124, 190, 130, (255, 255, 255, 165))
block(60, 60, 120, 120, (255, 255, 255, 255))

# 保存各尺寸
sizes = {
    'icon.png': (512, 512),
    '32x32.png': (32, 32),
    '128x128.png': (128, 128),
    '128x128@2x.png': (256, 256),
}
for name, (w, h) in sizes.items():
    img.resize((w, h), Image.LANCZOS).save(os.path.join(BASE, name))
    print('saved', name)

# ICO（多尺寸）
img.resize((256, 256), Image.LANCZOS).save(os.path.join(BASE, 'icon.ico'), sizes=[(256,256),(128,128),(64,64),(48,48),(32,32),(16,16)])
print('saved icon.ico')

# ICNS（macOS；Windows 下仅占位，构建用 ico）
try:
    img.resize((512, 512), Image.LANCZOS).save(os.path.join(BASE, 'icon.icns'))
    print('saved icon.icns')
except Exception as e:
    print('icns skip:', e)

# 额外: Square*Logo.png (Windows 商店用，占位同款)
for n in ['Square30x30Logo.png','Square44x44Logo.png','Square71x71Logo.png','Square89x89Logo.png','Square107x107Logo.png','Square142x142Logo.png','Square150x150Logo.png','Square284x284Logo.png','Square310x310Logo.png','StoreLogo.png']:
    w = int(n.split('x')[1].split('Logo')[0]) if 'x' in n else 50
    img.resize((w, w), Image.LANCZOS).save(os.path.join(BASE, n))
print('all done')

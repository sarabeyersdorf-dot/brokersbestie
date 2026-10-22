# Draws the app icon (the Look B key tag) as PNGs for phones that need them.
# Run: python3 scripts/make-icons.py
from PIL import Image, ImageDraw

INK = (31, 35, 38)
TEAL = (47, 216, 197)

def draw(size, maskable=False):
    s = 4  # draw big, shrink: smooth edges
    W = size * s
    img = Image.new('RGB' if maskable else 'RGBA', (W, W), INK if maskable else (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if not maskable:
        d.rounded_rectangle([0, 0, W - 1, W - 1], radius=int(W * 0.203), fill=INK)
    k = W / 512 * (0.8 if maskable else 1)   # maskable keeps the mark in the safe zone
    o = (W - 512 * k) / 2
    P = lambda x, y: (o + x * k, o + y * k)
    w = int(30 * k)
    tag = [P(150, 96), P(300, 96), P(370, 166), P(370, 416), P(150, 416), P(150, 96)]
    d.line(tag, fill=TEAL, width=w, joint='curve')
    for x, y in tag:
        d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=TEAL)
    cx, cy = P(260, 200); r = 34 * k
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=TEAL, width=w)
    for (a, b) in [((205, 300), (315, 300)), ((205, 352), (275, 352))]:
        d.line([P(*a), P(*b)], fill=TEAL, width=w)
        for x, y in (P(*a), P(*b)):
            d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=TEAL)
    return img.resize((size, size), Image.LANCZOS)

draw(192).save('icons/icon-192.png')
draw(512).save('icons/icon-512.png')
draw(512, maskable=True).save('icons/icon-maskable-512.png')
draw(180, maskable=True).save('icons/apple-touch-icon.png')
print('icons written')

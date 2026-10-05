# Regenerates the link-preview image (app/opengraph-image.jpg + twitter-image.jpg)
# and the icons (favicon.ico, apple-icon.png) from public/hustlelogo.png.
# Run from the repo root on Windows (uses Segoe UI): python scripts/generate-og-image.py

from PIL import Image, ImageDraw, ImageFont, ImageFilter

NAVY = (0, 17, 45)
ORANGE = (255, 122, 0)
logo = Image.open('public/hustlelogo.png').convert('RGB')

# ── Open Graph / Twitter share image: 1200x630 ──
W, H = 1200, 630
og = Image.new('RGB', (W, H), NAVY)
# soft glow behind the logo
glow = Image.new('RGB', (W, H), NAVY)
gd = ImageDraw.Draw(glow)
gd.ellipse((-40, 20, 600, 660), fill=(14, 52, 110))
glow = glow.filter(ImageFilter.GaussianBlur(120))
og = Image.blend(og, glow, 0.9)

L = 470
lx, ly = 70, (H - L) // 2
# soft shadow + rounded-corner logo card
shadow = Image.new('L', (W, H), 0)
ImageDraw.Draw(shadow).rounded_rectangle((lx + 6, ly + 14, lx + L + 6, ly + L + 14), radius=44, fill=150)
shadow = shadow.filter(ImageFilter.GaussianBlur(18))
og.paste((0, 6, 20), (0, 0), shadow)
mask = Image.new('L', (L, L), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, L - 1, L - 1), radius=44, fill=255)
og.paste(logo.resize((L, L), Image.LANCZOS), (lx, ly), mask)

d = ImageDraw.Draw(og)
bold = lambda s: ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf', s)
reg = lambda s: ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', s)

x = 590
max_w = W - x - 60

def wrap(text, font):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if d.textlength(t, font=font) <= max_w: cur = t
        else: lines.append(cur); cur = w
    lines.append(cur)
    return lines

y = 150
for line in wrap("Get paid to power AI in Ghana", bold(60)):
    d.text((x, y), line, font=bold(60), fill=(255, 255, 255)); y += 72
y += 14
for line in wrap("Record your voice, do data projects and surveys, and get paid to Mobile Money.", reg(28)):
    d.text((x, y), line, font=reg(28), fill=(190, 205, 230)); y += 40
y += 30
url = "hustleclickgh.com"
f = bold(28)
tw = d.textlength(url, font=f)
d.rounded_rectangle((x, y, x + tw + 48, y + 56), radius=28, fill=ORANGE)
d.text((x + 24, y + 9), url, font=f, fill=(255, 255, 255))

og.convert("RGB").save("app/opengraph-image.jpg", quality=88, optimize=True, progressive=True)
og.convert("RGB").save("app/twitter-image.jpg", quality=88, optimize=True, progressive=True)

# ── Icons ──
logo.resize((180, 180), Image.LANCZOS).save('app/apple-icon.png', optimize=True)
logo.convert('RGBA').save('app/favicon.ico', sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print('ok')

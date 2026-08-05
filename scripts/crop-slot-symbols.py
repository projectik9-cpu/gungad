"""Crop/remove Copilot 'Made with AI' watermark from Crimson Cascade symbols."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "все картинки"
DST = ROOT / "gungad-casino" / "public" / "games" / "slots" / "crimson"
OUT_SIZE = 512

DST.mkdir(parents=True, exist_ok=True)

for n in range(1, 14):
    src = SRC / f"{n}.png"
    if not src.exists():
        raise SystemExit(f"Missing: {src}")

    im = Image.open(src).convert("RGBA")
    w, h = im.size

    # Paint over top-right watermark badge (solid black matches asset bg)
    draw = ImageDraw.Draw(im)
    badge_w = int(w * 0.22)
    badge_h = int(h * 0.08)
    draw.rectangle([w - badge_w, 0, w, badge_h], fill=(0, 0, 0, 255))

    # Mild inset crop to kill any leftover badge pixels, then square
    inset_x = int(w * 0.02)
    inset_y = int(h * 0.02)
    # Extra inset on top-right only via asymmetric crop
    left = inset_x
    top = int(h * 0.04)
    right = w - int(w * 0.06)
    bottom = h - inset_y
    cropped = im.crop((left, top, right, bottom))

    # Center-crop to square
    cw, ch = cropped.size
    side = min(cw, ch)
    cx, cy = cw // 2, ch // 2
    half = side // 2
    square = cropped.crop((cx - half, cy - half, cx - half + side, cy - half + side))
    out = square.resize((OUT_SIZE, OUT_SIZE), Image.Resampling.LANCZOS)

    dest = DST / f"{n}.png"
    out.save(dest, "PNG", optimize=True)
    print(f"OK {n}.png -> {dest} ({OUT_SIZE}x{OUT_SIZE})")

print(f"Done. Wrote {len(list(DST.glob('*.png')))} files to {DST}")

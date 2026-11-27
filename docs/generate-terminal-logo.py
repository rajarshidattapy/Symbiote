"""Regenerate the terminal pixel fallback after editing logo_bgremoved.png.

Requires Pillow only when regenerating this data; Symbiote does not require it at runtime.
"""
import json
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent
image = Image.open(root / 'logo_bgremoved.png').convert('RGBA')
bounds = image.getchannel('A').getbbox()
if bounds is None:
    raise ValueError('The logo is fully transparent')
image = image.crop(bounds)
image.thumbnail((12, 12), Image.Resampling.LANCZOS)
canvas = Image.new('RGBA', (12, 12))
canvas.alpha_composite(image, ((12 - image.width) // 2, (12 - image.height) // 2))
pixels = [list(canvas.getpixel((x, y))) for y in range(12) for x in range(12)]
(root / 'symbiote-logo-pixels.json').write_text(json.dumps({'width': 12, 'height': 12, 'pixels': pixels}, separators=(',', ':')) + '\n', encoding='utf-8')

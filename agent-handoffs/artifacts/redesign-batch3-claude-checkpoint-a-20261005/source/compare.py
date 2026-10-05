import sys, numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageChops
# usage: compare.py ref.png sim.png out.png [label]
ref_path, sim_path, out_path = sys.argv[1:4]
label = sys.argv[4] if len(sys.argv) > 4 else ''
sim = Image.open(sim_path).convert('RGB')
ref0 = Image.open(ref_path).convert('RGB')
S = sim.width / 1080.0          # 1206/1080 = 402/360
ref = ref0.resize((sim.width, round(ref0.height * S)), Image.LANCZOS)
def find_rule(img, y0, y1, x=None):
    a = np.asarray(img).astype(int)
    xs = slice(img.width//4, 3*img.width//4)
    best=None
    for y in range(y0, y1):
        row = a[y, xs]; above = a[y-4, xs]; below = a[y+4, xs]
        if row.std(axis=0).max() < 6 and abs(row.mean()-above.mean()) > 8 and abs(row.mean()-below.mean()) > 8:
            best = y; break
    return best
# ref nav rule: css y 76..77 -> px 228..231 *S
ref_rule = round(76*3*S)
sim_rule = find_rule(sim, 250, 420)
off = sim_rule - ref_rule
canvas = Image.new('RGB', (sim.width, sim.height), (0,0,0))
canvas.paste(ref, (0, off))
diff = ImageChops.difference(canvas, sim)
d = np.asarray(diff).astype(float).sum(axis=2)
amp = np.clip(d*3, 0, 255).astype(np.uint8)
diffimg = Image.merge('RGB', [Image.fromarray(amp)]*3)
blend = Image.blend(canvas, sim, 0.5)
W = sim.width
out = Image.new('RGB', (W*3 + 40, sim.height + 60), (30,30,30))
out.paste(canvas, (0, 60)); out.paste(sim, (W+20, 60)); out.paste(diffimg, (2*W+40, 60))
dr = ImageDraw.Draw(out)
try: f = ImageFont.truetype('/System/Library/Fonts/SFNS.ttf', 34)
except: f = None
dr.text((10,10), f'LOCKED REFERENCE (x402/360) {label}', fill=(255,255,255), font=f)
dr.text((W+30,10), 'SIMULATOR', fill=(255,255,255), font=f)
dr.text((2*W+50,10), f'|DIFF| x3  (rule offset {off}px)', fill=(255,255,255), font=f)
out.save(out_path)
blend.save(out_path.replace('.png','-blend.png'))
print('sim_rule', sim_rule, 'ref_rule', ref_rule, 'offset_px', off)

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageChops
J='<work>/'
L=J+'locked/agent-handoffs/artifacts/dexa-photos-timeline-evidence-style-translation-20261004/screens/'
F=J+'shots/final/'; P=J+'pkg/'
def font(sz, bold=False):
    for f in (['/System/Library/Fonts/SFNS.ttf']):
        try: return ImageFont.truetype(f, sz)
        except: pass
    return ImageFont.load_default()
def rule(img, lo, hi):
    a=np.asarray(img).astype(int); xs=slice(img.width//4,3*img.width//4)
    for y in range(lo,hi):
        r=a[y,xs]
        if r.std(axis=0).max()<6 and abs(r.mean()-a[y-4,xs].mean())>8 and abs(r.mean()-a[y+4,xs].mean())>8: return y
def aligned(refp, simp):
    sim=Image.open(simp).convert('RGB'); S=sim.width/1080
    ref=Image.open(refp).convert('RGB'); ref=ref.resize((sim.width, round(ref.height*S)), Image.LANCZOS)
    sr=rule(sim,250,420); rr=rule(ref,200,300); off=sr-rr
    bg=tuple(np.asarray(ref)[rr+30, 5])
    canvas=Image.new('RGB', sim.size, bg); canvas.paste(ref,(0,off))
    return canvas, sim, sr
def pair(refp, simp, out, title, top_pt=-75, bottom_px=None):
    ref, sim, sr = aligned(refp, simp)
    y0=max(0, sr+int(top_pt*3)); y1=bottom_px or sim.height
    ref=ref.crop((0,y0,sim.width,y1)); sim=sim.crop((0,y0,sim.width,y1))
    diff=ImageChops.difference(ref, sim); d=np.clip(np.asarray(diff).astype(float).sum(axis=2)*3,0,255).astype(np.uint8)
    Image.merge('RGB',[Image.fromarray(d)]*3).save(P+'diffs/'+out.replace('.png','-diff.png'))
    Image.blend(ref, sim, 0.5).save(P+'diffs/'+out.replace('.png','-overlay.png'))
    w=sim.width//2; h=sim.height//2
    board=Image.new('RGB',(w*2+30, h+90),(24,26,28)); dr=ImageDraw.Draw(board)
    dr.text((10,12), title, fill=(255,255,255), font=font(30))
    dr.text((10,56), 'LOCKED REFERENCE (402/360 scale)', fill=(185,228,103), font=font(22))
    dr.text((w+20,56), 'REAL SIMULATOR (iPhone 17 Pro)', fill=(185,228,103), font=font(22))
    board.paste(ref.resize((w,h),Image.LANCZOS),(0,90)); board.paste(sim.resize((w,h),Image.LANCZOS),(w+30,90))
    board.save(P+out); return ref, sim
rows=[]
for surf, rid in [('hub','h1'),('timeline','t1')]:
    for th in ['dark','light']:
        sfx='-light' if th=='light' else ''
        r,s=pair(L+f'evidence-{rid}{sfx}.png', F+f'{surf}-{th}.png', f'{surf}-{th}-reference-vs-simulator.png', f'{"Evidence Hub" if surf=="hub" else "Timeline"} · {"Dark" if th=="dark" else "Mineral Light"}')
        rows.append((f'{"Evidence Hub" if surf=="hub" else "Timeline"} · {"Dark" if th=="dark" else "Mineral Light"}', r, s))
# primary mobile board: 2 columns, each 520 wide, cropped to content region (nav rule-75pt .. tab bar top)
CW=520; gap=16; M=24
blocks=[]
for title,r,s in rows:
    crop_h = r.height - 0  # whole visible
    rr=r.resize((CW, round(r.height*CW/r.width)),Image.LANCZOS); ss=s.resize((CW, round(s.height*CW/s.width)),Image.LANCZOS)
    blocks.append((title,rr,ss))
H=110+sum(b[1].height+86 for b in blocks)+40
W=M*2+CW*2+gap
board=Image.new('RGB',(W,H),(18,20,22)); dr=ImageDraw.Draw(board)
dr.text((M,22),'Batch 3 · Checkpoint A — Evidence Hub + Timeline',fill=(255,255,255),font=font(30))
dr.text((M,64),'Left: locked design f7d72f19 (H1/T1). Right: real SwiftUI on iPhone 17 Pro. Aligned on the nav rule.',fill=(190,197,200),font=font(17))
y=110
for title,rr,ss in blocks:
    dr.text((M,y+8),title,fill=(185,228,103),font=font(24))
    dr.text((M,y+44),'Reference',fill=(150,160,165),font=font(17)); dr.text((M+CW+gap,y+44),'Simulator',fill=(150,160,165),font=font(17))
    board.paste(rr,(M,y+70)); board.paste(ss,(M+CW+gap,y+70)); y+=rr.height+86
board.save(P+'checkpoint-a-primary-mobile-review-board.png')
print(board.size)

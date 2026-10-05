import sys, numpy as np
from PIL import Image
# usage: xruns.py ref sim ytop ybot  (pt below nav rule) -> x runs in pt
ref_path, sim_path = sys.argv[1:3]; yt, yb = float(sys.argv[3]), float(sys.argv[4])
sim = Image.open(sim_path).convert('RGB'); S = sim.width/1080
ref = Image.open(ref_path).convert('RGB'); ref = ref.resize((sim.width, round(ref.height*S)), Image.LANCZOS)
def rule(img, lo, hi):
    a=np.asarray(img).astype(int); xs=slice(img.width//4,3*img.width//4)
    for y in range(lo,hi):
        r=a[y,xs]
        if r.std(axis=0).max()<6 and abs(r.mean()-a[y-4,xs].mean())>8 and abs(r.mean()-a[y+4,xs].mean())>8: return y
def xr(img, base):
    a=np.asarray(img).astype(int)[base+int(yt*3):base+int(yb*3)]
    bg=np.median(a.reshape(-1,3)[::31],axis=0)
    ink=(np.abs(a-bg).sum(axis=2)>60).any(axis=0)
    out=[];s=None;gap=0
    for i,v in enumerate(ink):
        if v:
            if s is None: s=i
            last=i
        elif s is not None and i-last>12: out.append((round(s/3,1),round((last+1)/3,1))); s=None
    if s is not None: out.append((round(s/3,1),round((last+1)/3,1)))
    return out
print('ref', xr(ref, round(76*3*S))); print('sim', xr(sim, rule(sim,250,420)))

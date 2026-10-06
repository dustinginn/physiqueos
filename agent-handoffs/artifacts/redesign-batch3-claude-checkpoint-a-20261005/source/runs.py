import sys, numpy as np
from PIL import Image
# usage: runs.py ref.png sim.png x0 x1 [y0pt] [y1pt]   (x in sim px)
ref_path, sim_path = sys.argv[1:3]; x0, x1 = int(sys.argv[3]), int(sys.argv[4])
y0 = float(sys.argv[5]) if len(sys.argv)>5 else 110; y1 = float(sys.argv[6]) if len(sys.argv)>6 else 800
sim = Image.open(sim_path).convert('RGB'); S = sim.width/1080
ref0 = Image.open(ref_path).convert('RGB'); ref = ref0.resize((sim.width, round(ref0.height*S)), Image.LANCZOS)
def rule(img, lo, hi):
    a=np.asarray(img).astype(int); xs=slice(img.width//4,3*img.width//4)
    for y in range(lo,hi):
        r=a[y,xs]
        if r.std(axis=0).max()<6 and abs(r.mean()-a[y-4,xs].mean())>8 and abs(r.mean()-a[y+4,xs].mean())>8: return y
sr = rule(sim,250,420); rr = rule(ref,200,300)
def runs(img, off):
    a=np.asarray(img).astype(int)[:, x0:x1]
    bg=np.median(a[:, :, :].reshape(-1,3)[::97],axis=0)
    ink=(np.abs(a-bg).sum(axis=2)>60).any(axis=1)
    out=[]; y=None
    for i,v in enumerate(ink):
        if v and y is None: y=i
        if not v and y is not None: out.append((y,i)); y=None
    res=[]
    for s,e in out:
        s2=(s-off)/3; e2=(e-off)/3   # pt relative to the nav rule
        if y0 <= s2 <= y1: res.append((round(s2,1), round(e2,1), round((e-s)/3,1)))
    return res
R=runs(ref, rr); Sm=runs(sim, sr)
print(f'rule sim={sr}px ref(scaled)={rr}px; values = pt below nav rule (start,end,height)')
for i in range(max(len(R),len(Sm))):
    r=R[i] if i<len(R) else None; s=Sm[i] if i<len(Sm) else None
    d = f'{s[0]-r[0]:+.1f}' if r and s else ''
    print(f'{str(r):26} {str(s):26} dTop={d}')

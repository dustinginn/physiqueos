import sys, json, numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageChops
# FAMILIES: (ref png dpr, bezel css, anchor css y (nav bottom/rule top) measured from screen top, ref css width of screen)
FAM={'T':dict(dpr=3,bezel=0,anchor=89.0,width=390),'NA':dict(dpr=2,bezel=7,anchor=80.0,width=379),'W':dict(dpr=3,bezel=0,anchor=76.0,width=372)}
SIM_ANCHOR=348  # px: bottom of iOS nav bar (=116 pt)
def load_aligned(ref_path, sim_path, fam, ref_anchor=None):
    f=FAM[fam]; sim=Image.open(sim_path).convert('RGB')
    ref=Image.open(ref_path).convert('RGB')
    phone_css = f['width'] + 2*f['bezel'] if f['bezel'] else f['width']
    f=dict(f); f['dpr']=round(ref.width/phone_css)
    b=f['bezel']*f['dpr']
    if b: ref=ref.crop((b,b,ref.width-b,ref.height))
    S=sim.width/ref.width
    ref=ref.resize((sim.width, round(ref.height*S)), Image.LANCZOS)
    anchor=ref_anchor if ref_anchor is not None else f['anchor']
    ra=round(anchor*f['dpr']*S)
    off=SIM_ANCHOR-ra
    bg=tuple(np.asarray(ref)[min(ref.height-1,ra+40),6])
    canvas=Image.new('RGB',(sim.width,max(sim.height,ref.height+off)),bg); canvas.paste(ref,(0,off))
    return canvas.crop((0,0,sim.width,sim.height)), sim, canvas
def runs(img, x0, x1, y0pt=-5, y1pt=900, merge=2):
    a=np.asarray(img).astype(int)[:, x0:x1]
    bg=np.median(a[SIM_ANCHOR+20:SIM_ANCHOR+60].reshape(-1,3),axis=0)
    ink=(np.abs(a-bg).sum(axis=2)>45).any(axis=1)
    out=[];s=None;last=None
    for i,v in enumerate(ink):
        if v:
            if s is None: s=i
            last=i
        elif s is not None and i-last>merge: out.append((s,last+1)); s=None
    if s is not None: out.append((s,last+1))
    return [(round((s-SIM_ANCHOR)/3,1),round((e-SIM_ANCHOR)/3,1)) for s,e in out if y0pt<=(s-SIM_ANCHOR)/3<=y1pt]
if __name__=='__main__':
    mode=sys.argv[1]
    if mode=='runs':
        ref,sim,fam,x0,x1=sys.argv[2],sys.argv[3],sys.argv[4],int(sys.argv[5]),int(sys.argv[6])
        anc=float(sys.argv[7]) if len(sys.argv)>7 and sys.argv[7]!='-' else None
        r,s,_=load_aligned(ref,sim,fam,anc)
        R=runs(r,x0,x1); Sm=runs(s,x0,x1)
        n=max(len(R),len(Sm))
        for i in range(n):
            a=R[i] if i<len(R) else None; b=Sm[i] if i<len(Sm) else None
            d=f'{b[0]-a[0]:+.1f}' if a and b else ''
            print(f'{str(a):18} {str(b):18} {d}')
    elif mode=='board':
        ref,sim,fam,out,title=sys.argv[2],sys.argv[3],sys.argv[4],sys.argv[5],sys.argv[6]
        anc=float(sys.argv[7]) if len(sys.argv)>7 and sys.argv[7]!='-' else None
        r,s,_=load_aligned(ref,sim,fam,anc)
        d=np.clip(np.asarray(ImageChops.difference(r,s)).astype(float).sum(axis=2)*3,0,255).astype(np.uint8)
        W=s.width//2;H=s.height//2
        b=Image.new('RGB',(W*3+40,H+70),(24,26,28)); dr=ImageDraw.Draw(b)
        f=ImageFont.truetype('/System/Library/Fonts/SFNS.ttf',24)
        dr.text((10,10),title,fill=(255,255,255),font=f)
        for k,(im,lab) in enumerate([(r,'LOCKED REFERENCE'),(s,'SIMULATOR'),(Image.merge('RGB',[Image.fromarray(d)]*3),'|DIFF| x3')]):
            b.paste(im.resize((W,H),Image.LANCZOS),(k*(W+20),70)); dr.text((k*(W+20)+6,42),lab,fill=(185,228,103),font=ImageFont.truetype('/System/Library/Fonts/SFNS.ttf',18))
        b.save(out)

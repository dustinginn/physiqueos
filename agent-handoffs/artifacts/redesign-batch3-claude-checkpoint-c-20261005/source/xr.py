import sys, numpy as np
sys.path.insert(0,'<work>'); from cmp import load_aligned, SIM_ANCHOR
ref,sim,fam,yt,yb=sys.argv[1],sys.argv[2],sys.argv[3],float(sys.argv[4]),float(sys.argv[5])
anc=float(sys.argv[6]) if len(sys.argv)>6 else None
r,s,_=load_aligned(ref,sim,fam,anc)
def xr(img):
    a=np.asarray(img).astype(int)[SIM_ANCHOR+int(yt*3):SIM_ANCHOR+int(yb*3)]
    bg=np.median(a.reshape(-1,3)[::31],axis=0); ink=(np.abs(a-bg).sum(axis=2)>45).any(axis=0)
    out=[];s0=None
    for i,v in enumerate(ink):
        if v:
            if s0 is None: s0=i
            last=i
        elif s0 is not None and i-last>12: out.append((round(s0/3,1),round((last+1)/3,1))); s0=None
    if s0 is not None: out.append((round(s0/3,1),round((last+1)/3,1)))
    return out
print('ref',xr(r)); print('sim',xr(s))

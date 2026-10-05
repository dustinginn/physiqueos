import sys, numpy as np
sys.path.insert(0,'<work>')
from cmp import load_aligned, FAM, SIM_ANCHOR
from PIL import Image, ImageDraw, ImageFont, ImageChops
J='<work>/'
A=J+'lockedBC/agent-handoffs/artifacts/'
TR=A+'training-evidence-style-translation-20261004/screens/training-evidence-%s%s.png'
NA=A+'nutrition-activity-evidence-style-translation-20261004/screens/evidence-%s%s.png'
NC=A+'nutrition-activity-evidence-founder-correction-20261004/screens/%s-root-corrected%s.png'
WR=A+'energy-weight-recovery-evidence-style-translation-20261004/screens/evidence-%s%s.png'
def F(sz): return ImageFont.truetype('/System/Library/Fonts/SFNS.ttf', sz)
def ref_path(spec, theme):
    kind, key = spec
    sfx = '-light' if theme=='light' else ''
    return {'T':TR,'NA':NA,'NC':NC,'W':WR}[kind] % (key, sfx)
def fam_of(kind): return {'T':'T','NA':'NA','NC':'NA','W':'W'}[kind]
def pair(spec, sim_name, theme, mode='top'):
    sim_path = J+f'final-bc/{theme}/{sim_name}.png'
    fam = fam_of(spec[0])
    rp = ref_path(spec, theme)
    if mode=='top':
        r, s, _ = load_aligned(rp, sim_path, fam)
        y0, y1 = SIM_ANCHOR-200, s.height-90
        return r.crop((0,y0,s.width,y1)), s.crop((0,y0,s.width,y1))
    # bottom: show the end of the reference page beside the scrolled simulator
    s = Image.open(sim_path).convert('RGB')
    ref = Image.open(rp).convert('RGB'); f = FAM[fam]
    phone_css = f['width'] + 2*f['bezel'] if f['bezel'] else f['width']
    dpr = round(ref.width/phone_css); b = f['bezel']*dpr
    if b: ref = ref.crop((b,0,ref.width-b,ref.height-b))
    ref = ref.resize((s.width, round(ref.height*s.width/ref.width)), Image.LANCZOS)
    h = s.height - 90 - (SIM_ANCHOR-200)
    rc = ref.crop((0, max(0, ref.height-h-40), s.width, ref.height-40))
    return rc, s.crop((0, SIM_ANCHOR-200, s.width, s.height-90))
def board(rows, out, title, subtitle, colw=520, theme_bg=(18,20,22)):
    M=24; gap=16
    blocks=[]
    for label, r, s in rows:
        rr=r.resize((colw, round(r.height*colw/r.width)), Image.LANCZOS)
        ss=s.resize((colw, round(s.height*colw/s.width)), Image.LANCZOS)
        blocks.append((label, rr, ss))
    H=110+sum(max(b[1].height,b[2].height)+86 for b in blocks)+30
    W=M*2+colw*2+gap
    img=Image.new('RGB',(W,H),theme_bg); d=ImageDraw.Draw(img)
    d.text((M,20),title,fill=(255,255,255),font=F(30)); d.text((M,62),subtitle,fill=(190,197,200),font=F(17))
    y=110
    for label, rr, ss in blocks:
        d.text((M,y+8),label,fill=(185,228,103),font=F(24))
        d.text((M,y+44),'Locked reference',fill=(150,160,165),font=F(17)); d.text((M+colw+gap,y+44),'Simulator (iPhone 17 Pro)',fill=(150,160,165),font=F(17))
        img.paste(rr,(M,y+70)); img.paste(ss,(M+colw+gap,y+70)); y+=max(rr.height,ss.height)+86
    img.save(out); return img.size
def diff_triplet(spec, sim_name, theme, out):
    r, s = pair(spec, sim_name, theme)
    d=np.clip(np.asarray(ImageChops.difference(r,s)).astype(float).sum(axis=2)*3,0,255).astype(np.uint8)
    Image.merge('RGB',[Image.fromarray(d)]*3).save(out)

def pair2(spec, sim_name, theme, mode):
    if mode in ('top','bottom'): return pair(spec, sim_name, theme, mode)
    s = Image.open(J+f'final-bc/{theme}/{sim_name}.png').convert('RGB')
    fam = fam_of(spec[0]); f = FAM[fam]
    ref = Image.open(ref_path(spec, theme)).convert('RGB')
    phone_css = f['width'] + 2*f['bezel'] if f['bezel'] else f['width']
    dpr = round(ref.width/phone_css); b = f['bezel']*dpr
    if b: ref = ref.crop((b,b,ref.width-b,ref.height))
    ref = ref.resize((s.width, round(ref.height*s.width/ref.width)), Image.LANCZOS)
    h = min(ref.height, s.height-90)
    return ref.crop((0,0,s.width,h)), s.crop((0,0,s.width,s.height-90))

ROWS = {
 'B_primary': [('Training root · T1',('T','t1'),'t1','top'),('Training Day · T3',('T','t3'),'t3','top'),('Workout Detail · T4',('T','t4'),'t4','top'),('Apple Health cardio · T6',('T','t6'),'t6','top'),('Exercise · T7',('T','t7'),'t7','top'),('Resistance Reporting · T13',('T','t13'),'t13','top'),('Training Library · T16',('T','t16'),'t16','top'),('Activity root · A1',('NC','activity'),'a1','top'),('Activity Day · A3',('NA','a3'),'a3','top')],
 'B_training': [('T1 root',('T','t1'),'t1','top'),('T1 root · end of page',('T','t1'),'t1b','bottom'),('T3 day',('T','t3'),'t3','top'),('T4 workout detail',('T','t4'),'t4','top'),('T5 exercises (superset · variant · timed · BW)',('T','t5'),'t5','bottom'),('T6 Apple Health cardio',('T','t6'),'t6','top'),('T7 exercise',('T','t7'),'t7','top'),('T7 exercise · end of page',('T','t7'),'t7b','bottom'),('T8 records + variant',('T','t8'),'t8','top'),('T9 volume record (Lat Pulldown)',('T','t9'),'t9','top'),('T13 Resistance Reporting',('T','t13'),'t13','top'),('T13 · end of page',('T','t13'),'t13b','bottom'),('T14 History Reporting',('T','t14'),'t14','top'),('T15 Cardio Foundation',('T','t15'),'t15','top'),('T16 Training Library',('T','t16'),'t16','top'),('Library area (Shoulders)',('T','t16'),'area','top')],
 'B_activity': [('A1 Activity root',('NC','activity'),'a1','top'),('A1 · end of page',('NC','activity'),'a1b','bottom'),('A3 Activity Day',('NA','a3'),'a3','top')],
 'B_states': [('T2 Recent Training History sheet',('T','t2'),'t2','raw'),('T11 expanded exercise history',('T','t11'),'t11','raw'),('T12 empty day',('T','t12'),'t12a','raw'),('T12 exercise not found',('T','t12'),'t12b','raw'),('A5 Recent Activity History sheet',('NA','a5'),'a5','raw'),('A7 empty activity day',('NA','a7'),'a7','raw')],
 'C_primary': [('Nutrition root · N1',('NC','nutrition'),'n1','top'),('Nutrition Day · N3',('NA','n3'),'n3','top'),('Calories report · N5',('NA','n5'),'n5','top'),('Macros report · N6',('NA','n6'),'n6','top'),('Meals report · N7',('NA','n7'),'n7','top'),('Weight · W1',('W','w1'),'w1','top')],
 'C_nutrition': [('N1 root',('NC','nutrition'),'n1','top'),('N1 · end of page',('NC','nutrition'),'n1b','bottom'),('N3 day',('NA','n3'),'n3','top'),('N3 meals',('NA','n3'),'n3b','bottom'),('N5 Calories',('NA','n5'),'n5','top'),('N5 · end of page',('NA','n5'),'n5b','bottom'),('N6 Macros',('NA','n6'),'n6','top'),('N6 · end of page',('NA','n6'),'n6b','bottom'),('N7 Meals',('NA','n7'),'n7','top'),('N7 · end of page',('NA','n7'),'n7b','bottom')],
 'C_weight': [('W1 Weight',('W','w1'),'w1','top'),('W1 · end of page',('W','w1'),'w1b','bottom'),('W1 · Weekly Averages Show All → Close',('W','w1'),'w1x','bottom')],
 'C_states': [('N2 Recent Nutrition History sheet',('NA','n2'),'n2','raw'),('N8 empty nutrition day',('NA','n8'),'n8','raw')],
}
def build(key, theme, out, title, subtitle):
    rows=[(lab,)+pair2(spec,sim,theme,mode) for lab,spec,sim,mode in ROWS[key]]
    return board(rows, out, title, subtitle)

import numpy as np
from PIL import Image, ImageDraw, ImageFont
J='<work>/'; F=J+'shots/final/'; P=J+'pkg/'
def font(sz): return ImageFont.truetype('/System/Library/Fonts/SFNS.ttf', sz)
def col_board(title, sub, cols, out, cw=340):
    ims=[(t, Image.open(p).convert('RGB')) for t,p in cols]
    ims=[(t, i.resize((cw, round(i.height*cw/i.width)), Image.LANCZOS)) for t,i in ims]
    M=20; g=12; H=130+max(i.height for _,i in ims)+20; W=M*2+cw*len(ims)+g*(len(ims)-1)
    b=Image.new('RGB',(W,H),(18,20,22)); d=ImageDraw.Draw(b)
    d.text((M,16),title,fill=(255,255,255),font=font(26)); d.text((M,54),sub,fill=(190,197,200),font=font(15))
    x=M
    for t,i in ims:
        d.text((x,96),t,fill=(185,228,103),font=font(16)); b.paste(i,(x,124)); x+=cw+g
    b.save(P+out); print(out,b.size)
# S1 reference card = clean S1 render (top 3 cards region)
s1=Image.open(J+'ref-s1-states-dark.png'); s1l=Image.open(J+'ref-s1-states-light.png')
col_board('Checkpoint A · loading / empty / failure (Dark)','S1 locked state template vs real Hub/Timeline states. Copy is the exact canonical copy per surface.',
 [('S1 reference', J+'ref-s1-states-dark.png'),('Hub loading',F+'hub-loading-dark.png'),('Hub failure',F+'hub-failed-dark.png'),('Timeline empty',F+'timeline-empty-dark.png'),('Timeline failure',F+'timeline-failed-dark.png')],'checkpoint-a-states-dark.png', cw=300)
col_board('Checkpoint A · loading / empty / failure (Mineral Light)','S1 locked state template vs real Hub/Timeline states.',
 [('S1 reference', J+'ref-s1-states-light.png'),('Hub loading',F+'hub-loading-light.png'),('Hub failure',F+'hub-failed-light.png'),('Timeline empty',F+'timeline-empty-light.png'),('Timeline loading',F+'timeline-loading-light.png')],'checkpoint-a-states-light.png', cw=300)
CA=J+'codexA/agent-handoffs/artifacts/redesign-batch3-checkpoint-a-20261005/screens/'
col_board('Context · what changed (Dark)','Build 87 shipping Hub (Sandbox) · rejected Codex CP-A · this candidate. Timeline: Codex vs candidate.',
 [('Build 87 Hub',J+'shots/baseline/evidence-dark.png'),('Codex Hub (rejected)',CA+'evidence-hub-dark.png'),('Candidate Hub',F+'hub-dark.png'),('Codex Timeline (rejected)',CA+'timeline-dark.png'),('Candidate Timeline',F+'timeline-dark.png')],'context-build87-codex-candidate.png', cw=300)
col_board('Hub lower rows + Dynamic Type','Hub scrolled to end (Recovery then Timeline last) and Accessibility Large text.',
 [('Hub end · Dark',F+'hub-bottom-dark.png'),('Hub end · Mineral',F+'hub-bottom-light.png'),('Hub · AX Large',F+'dt-hub-ax-large.png'),('Timeline · AX Large',F+'dt-timeline-ax-large.png')],'checkpoint-a-hub-end-and-dynamic-type.png', cw=300)

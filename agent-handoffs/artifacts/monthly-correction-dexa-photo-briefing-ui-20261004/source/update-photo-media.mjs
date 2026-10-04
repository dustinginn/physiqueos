import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve(import.meta.dirname, '..', 'event-briefings.html');
let html = fs.readFileSync(file, 'utf8');
const oldCss = `.photo-well img{position:absolute;width:393px;height:2563px;max-width:none}.photo-well.prior img{left:-30px;top:-833px}.photo-well.current img{left:-29px;top:-194px}`;
const newCss = `.photo-well img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center top}`;
const oldFunction = `function sourceImage(cls,label){return \`<div class="photo-well ${'${'}cls}" data-prototype-only="safe-founder-media-reference"><img src="source/FOUNDER-PHOTO-APP-RENDER.png" alt="Founder Back Relaxed progress photo, app-rendered safe reference"><span class="photo-label">${'${'}label}</span></div>\`}`;
const newFunction = `function sourceImage(cls,label){const file=cls==='prior'?'founder-back-relaxed-prior-detail.png':'founder-back-relaxed-current-detail.png';return \`<div class="photo-well ${'${'}cls}" data-prototype-only="safe-founder-media-reference"><img src="media/${'${'}file}" alt="Founder Back Relaxed progress photo, app-rendered safe reference"><span class="photo-label">${'${'}label}</span></div>\`}`;
for(const anchor of [oldCss,oldFunction])if(!html.includes(anchor))throw new Error(`Photo media anchor missing: ${anchor.slice(0,80)}`);
html=html.replace(oldCss,newCss).replace(oldFunction,newFunction);
fs.writeFileSync(file,html);


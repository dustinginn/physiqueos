import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve(import.meta.dirname, '..', 'event-briefings.html');
let html = fs.readFileSync(file, 'utf8');
const oldUnavailable = `${'${'}i===1?\`<div class="image-unavailable" data-state="static-prototype-media-unbound"><b>Authenticated fixture media not embedded</b><br>Tap-to-inspect remains a production viewer behavior.</div>\`:''}`;
const oldTail = `const q=new URLSearchParams(location.search);const type=q.get('type')||'dexa';const theme=q.get('theme')||'dark';const compare=q.get('compare')==='1';document.getElementById('stage').innerHTML=compare?(dexa('dark')+dexa('light')+photo('dark')+photo('light')):(type==='photo'?photo(theme):dexa(theme));`;
const newTail = `const q=new URLSearchParams(location.search);const type=q.get('type')||'dexa';const theme=q.get('theme')||'dark';const compare=q.get('compare')==='1';const unavailable=q.get('state')==='unavailable';document.getElementById('stage').innerHTML=compare?(dexa('dark')+dexa('light')+photo('dark')+photo('light')):(type==='photo'?photo(theme):dexa(theme));if(unavailable&&type==='photo'){document.querySelectorAll('.photo-media,.photo-well').forEach(node=>node.innerHTML='<div class="media-unavailable-state" data-state="image-unavailable"><b>Photo unavailable</b><span>This image could not be loaded.</span><button type="button">Try Again</button></div>')}`;
const styleAnchor = `@media(max-width:900px)`;
const unavailableStyle = `.media-unavailable-state{height:100%;display:grid;place-content:center;text-align:center;padding:24px;color:var(--muted);background:var(--surface);font-size:11px;line-height:1.5}.media-unavailable-state b{color:var(--text);font-size:14px}.media-unavailable-state button{margin:14px auto 0;min-height:44px;padding:0 18px;border:0;border-radius:12px;background:var(--teal);color:#06131c;font:inherit;font-weight:800}`;
for (const anchor of [oldUnavailable, oldTail, styleAnchor]) if (!html.includes(anchor)) throw new Error(`Event harness anchor missing: ${anchor.slice(0, 80)}`);
html = html.replace(oldUnavailable, '');
html = html.replace(oldTail, newTail);
html = html.replace(styleAnchor, `${unavailableStyle}${styleAnchor}`);
fs.writeFileSync(file, html);


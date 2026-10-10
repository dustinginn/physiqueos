// Build the simulator artifact: node build-sim.mjs
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const r = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const css = r('phone.css') + '\n' + r('components.css');
const js = [r('chrome.js'), r('energy-model.js'), r('guardrail-model.js'), r('personal-history.js'), r('../home/home-render.js'), r('sim.js')].join('\n;\n').replace(/font-family:Jakarta/g, "font-family:'Plus Jakarta Sans'");
const html = `<title>Goal Adaptation Simulator</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&display=swap">
<style>
${css.replace(/font-family: Jakarta,/g, "font-family: 'Plus Jakarta Sans',")}
:root { --pg:#050C14; --pc:#0F1C2A; --pi:#EEF5F8; --pi2:#B6C6CE; --pm:#8399A3; --pl:rgba(157,179,189,.18); --pt:#3BD2CA; --pa:#F4BC48; --pr:#FF697A; color-scheme:dark; }
@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) { --pg:#E3E8E1; --pc:#FBFAF4; --pi:#102431; --pi2:#455D65; --pm:#5D7279; --pl:rgba(25,56,66,.16); --pt:#087E78; --pa:#925500; --pr:#B83D4B; color-scheme:light; } }
:root[data-theme="light"] { --pg:#E3E8E1; --pc:#FBFAF4; --pi:#102431; --pi2:#455D65; --pm:#5D7279; --pl:rgba(25,56,66,.16); --pt:#087E78; --pa:#925500; --pr:#B83D4B; color-scheme:light; }
:root[data-theme="dark"] { color-scheme:dark; }
body { margin:0; background:var(--pg); color:var(--pi); font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif; }
.app { max-width:1180px; margin:0 auto; padding-block:22px 60px; padding-inline:16px; display:grid; grid-template-columns:auto minmax(0,1fr); gap:28px; align-items:start; }
.intro { grid-column:1 / -1; }
.intro h1 { font-size:clamp(26px,3.6vw,36px); margin:4px 0 6px; letter-spacing:-.02em; text-wrap:balance; }
.intro p { color:var(--pi2); margin:0; font-size:14.5px; line-height:1.55; max-width:900px; }
.simwarn { border:1.5px solid var(--pa); background:color-mix(in srgb,var(--pa) 10%,transparent); border-radius:12px; padding:10px 14px; font-size:14px; line-height:1.5; margin:6px 0 10px; max-width:900px; }
.kick { color:var(--pt); font-size:12px; font-weight:800; letter-spacing:.14em; text-transform:uppercase; }
.frame-wrap { position:sticky; top:12px; }
#phone { width:402px; height:874px; min-height:0; padding:0; overflow:hidden; position:relative; }
.pscroll { height:100%; overflow-y:auto; overscroll-behavior:contain; }
.pscroll .tabbar { position:sticky; bottom:12px; margin-top:18px; }
#phone .toast { bottom:100px; }
.crumb { font-size:11px; color:var(--pm); margin-top:8px; text-align:center; font-family:ui-monospace,Menlo,monospace; }
#panel { display:flex; flex-direction:column; gap:12px; min-width:0; }
.pn-sec { background:var(--pc); border:1px solid var(--pl); border-radius:16px; padding:14px 16px; }
.pn-h { font-size:11px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; color:var(--pm); margin-bottom:8px; }
.kvs { display:grid; grid-template-columns:auto minmax(0,1fr); gap:6px 14px; font-size:13.5px; }
.kvs span { color:var(--pi2); } .kvs b { font-variant-numeric:tabular-nums; }
.pn-btns { display:flex; gap:8px; flex-wrap:wrap; }
.pn-btns button { font:inherit; font-size:13px; font-weight:700; padding:9px 12px; border-radius:10px; border:1px solid var(--pl); background:transparent; color:var(--pi); cursor:pointer; }
.pn-btns button.pri, .pn-btns button[aria-pressed="true"] { background:var(--pt); color:#03191e; border-color:var(--pt); }
.pn-btns button.warn { color:var(--pr); border-color:var(--pr); }
.pn-btns button:focus-visible, [data-act]:focus-visible { outline:2px solid var(--pt); outline-offset:2px; }
.pn-note { font-size:12.5px; color:var(--pm); margin:8px 0 0; line-height:1.45; }
.lab-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:10px; }
.lab-f { display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--pi2); min-width:0; }
.lab-f input, .lab-f select { font:inherit; font-size:14px; padding:7px 9px; border-radius:9px; border:1px solid var(--pl); background:transparent; color:var(--pi); min-width:0; }
.lab-f input:focus-visible, .lab-f select:focus-visible { outline:2px solid var(--pt); }
.lab-t { width:100%; border-collapse:collapse; margin-top:12px; font-size:13px; font-variant-numeric:tabular-nums; }
.lab-t td { border-top:1px solid var(--pl); padding:6px 4px; vertical-align:top; } .lab-t td:last-child { text-align:right; } .lab-t small { color:var(--pm); }
.pn-log { margin:0; padding-left:18px; font-size:12.5px; color:var(--pi2); line-height:1.5; max-height:220px; overflow:auto; }
[data-act] { cursor:pointer; }
@media (max-width:820px) { .app { grid-template-columns:1fr; } .frame-wrap { position:static; display:flex; flex-direction:column; align-items:center; } }
</style>
<div class="app">
  <div class="intro"><div class="kick">Goal Adaptation · interactive simulator · scenario A uses an Oct 10 snapshot of your records; B and C are illustrative</div>
    <h1>Try adapting Build Lean Mass</h1>
    <div class="simwarn"><b>Functional UX simulation, not the Native visual spec.</b> Screens approximate production visuals so the flow feels real. The released Build 95 Home and app components remain the visual source of truth.</div>
    <p>Start on Home, open the DEXA briefing, review Option B, set up a temporary leaning phase, adjust energy and your plan, approve, then advance simulated weeks to see Home, Goals and briefings respond. Every number is simulated; nothing connects to PhysiqueOS.</p></div>
  <div class="frame-wrap"><div id="phone" class="phone"></div><div class="crumb" id="crumb"></div></div>
  <aside id="panel" aria-label="Simulation controls"></aside>
</div>
<script>
${js}
function fitPhone() { const w = Math.min(402, document.documentElement.clientWidth - 32); const z = w / 402; const p = document.getElementById('phone'); if (p) p.style.zoom = z < 1 ? z : ''; }
window.addEventListener('resize', fitPhone); document.addEventListener('DOMContentLoaded', fitPhone);
</script>`;
fs.writeFileSync(path.join(dir, '..', 'goal-adaptation-simulator.html'), html);
console.log('ok', (html.length / 1024).toFixed(0) + ' KB');

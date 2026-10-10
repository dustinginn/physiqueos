import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const js = ['home-render.js', 'review.js'].map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n;\n');
const html = `<title>Home Content Review</title>
<style>
:root { --bg:#061019; --card:#0F1C2A; --ink:#EEF5F8; --ink2:#B6C6CE; --muted:#8399A3; --line:rgba(157,179,189,.18); --teal:#3BD2CA; --amber:#F4BC48; color-scheme:dark; }
@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) { --bg:#E3E8E1; --card:#FBFAF4; --ink:#102431; --ink2:#455D65; --muted:#5D7279; --line:rgba(25,56,66,.16); --teal:#087E78; --amber:#925500; color-scheme:light; } }
:root[data-theme="light"] { --bg:#E3E8E1; --card:#FBFAF4; --ink:#102431; --ink2:#455D65; --muted:#5D7279; --line:rgba(25,56,66,.16); --teal:#087E78; --amber:#925500; color-scheme:light; }
:root[data-theme="dark"] { color-scheme:dark; }
body { margin:0; background:var(--bg); color:var(--ink); font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif; }
.wrap { max-width:1900px; margin:0 auto; padding-block:28px 80px; padding-inline:clamp(16px,3vw,36px); }
h1 { font-size:clamp(28px,4vw,40px); letter-spacing:-.02em; margin:6px 0 8px; text-wrap:balance; }
h2 { font-size:22px; margin:34px 0 8px; }
.kick { color:var(--teal); font-size:12px; font-weight:800; letter-spacing:.14em; text-transform:uppercase; }
.lead, .note { color:var(--ink2); font-size:15px; line-height:1.6; max-width:1100px; }
.bar { display:flex; gap:8px; flex-wrap:wrap; margin:16px 0; }
.bar button { font:inherit; font-size:13px; font-weight:700; padding:8px 12px; border-radius:10px; border:1px solid var(--line); background:var(--card); color:var(--ink2); cursor:pointer; }
.bar button[aria-pressed="true"] { background:var(--teal); color:#03191e; border-color:var(--teal); }
.bar button:focus-visible, .ph:focus-visible { outline:2px solid var(--teal); outline-offset:2px; }
.row-scroll { display:flex; gap:22px; overflow-x:auto; padding-bottom:12px; }
.col { margin:0; flex:none; display:flex; flex-direction:column; gap:14px; }
.col figcaption { display:flex; flex-direction:column; gap:2px; font-size:13px; max-width:336px; }
.col figcaption span { color:var(--muted); font-size:12px; }
.ph { width:336px; border-radius:36px; overflow:hidden; cursor:zoom-in; box-shadow:0 20px 50px rgba(0,0,0,.35),0 0 0 1px var(--line); }
.ph > .hp { zoom:.8358; }
.grid3 { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:14px; }
.panel { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:16px 18px; font-size:14px; line-height:1.55; color:var(--ink2); }
.panel b { color:var(--ink); }
.warnbox { border:1.5px solid var(--amber); background:color-mix(in srgb,var(--amber) 10%,transparent); border-radius:14px; padding:12px 16px; font-size:14.5px; line-height:1.55; max-width:1100px; margin:6px 0 12px; }
.pt td.ok { color:var(--teal); font-weight:700; } .pt td.bad { color:#E5484D; font-weight:700; }
.panel ul { margin:6px 0 0; padding-left:18px; }
.tw { overflow-x:auto; border:1px solid var(--line); border-radius:14px; background:var(--card); }
table.pt { border-collapse:collapse; font-size:12.5px; min-width:1100px; width:100%; }
.pt th, .pt td { text-align:left; padding:8px 10px; border-top:1px solid var(--line); vertical-align:top; line-height:1.4; }
.pt th { color:var(--muted); font-size:11px; letter-spacing:.06em; text-transform:uppercase; border-top:0; }
.pt td.chg { color:var(--ink); background:color-mix(in srgb,var(--amber) 10%,transparent); }
.pt .sm { color:var(--muted); }
#lb { position:fixed; inset:0; background:rgba(2,6,10,.86); display:flex; align-items:center; justify-content:center; gap:20px; z-index:9; overflow:auto; padding:20px; flex-wrap:wrap; }
#lb[hidden] { display:none; }
#lb .stage { border-radius:44px; overflow:hidden; }
#lb .side { color:#e7eff3; max-width:280px; }
#lb .close { font:inherit; margin-top:10px; padding:8px 12px; border-radius:10px; border:1px solid rgba(255,255,255,.3); background:transparent; color:#e7eff3; cursor:pointer; }
@media (max-width:720px) { .ph { width:300px; } .ph > .hp { zoom:.746; } }
</style>
<div class="wrap">
  <div class="kick">Goal Adaptation · Home content review · illustrative content only</div>
  <h1>Home: content changes only</h1>
  <div class="warnbox"><b>Not a visual specification.</b> These are browser recreations of the production Home, used only to review wording and phase states. The released Build 95 SwiftUI Home stays the source of truth for every pixel. Native pixel parity will be proven with snapshot tests against production when this is implemented.</div>
  <p class="lead">Only the server-provided goal and phase text changes. Layout, the confidence ring, the connected phase timeline, typography, colours, card sizes and everything below the goal card stay exactly as released. Where new text would not fit, the wording is shortened.</p>
  <div class="bar" role="group" aria-label="Themes"><button data-show="both" aria-pressed="true">Dark + Mineral Light</button><button data-show="dark" aria-pressed="false">Dark</button><button data-show="light" aria-pressed="false">Mineral Light</button></div>
  <div id="compare"></div>
  <h2>Content-slot matrix</h2>
  <p class="note">Every slot already exists in <code>HomeJourneyFieldView.swift</code>. Highlighted cells differ from production. The last column says what would have to change to show the content; none of it is visual.</p>
  <div id="parity"></div>
  <h2>Fit check</h2>
  <p class="note">Measured in this recreation against the production line counts for each slot. Web fonts differ slightly from SF Pro, so the native check comes later.</p>
  <div id="fit"></div>
  <h2>Diff boundary</h2>
  <div id="regions"></div>
  <h2>Data notes</h2>
  <div class="grid3">
    <div class="panel"><b>No invented measurements</b><ul><li>Body fat 9.7% is the Oct 9 DEXA value.</li><li>Progress stays at the last measured 7.1 of 10 lb (71%) until a new scan.</li><li>Leaning dates and the resumed goal date are example commitments, not measurements.</li></ul></div>
    <div class="panel"><b>Phase lineage</b><ul><li>Phase 2 Lean Mass Build is paused, not replaced.</li><li>Leaning is Phase 3 (temporary).</li><li>Resumed building is shown as Phase 4 Lean Mass Build, linked to Phase 2. Reopening Phase 2 instead is an open question.</li></ul></div>
    <div class="panel"><b>Corrected since the last review</b><ul><li>Confidence ring arc now centred with its label in the 110pt frame (the recreation had drawn the arc off-centre).</li><li>Removed the invented 8.7% and 6.9 lb values.</li></ul></div>
  </div>
</div>
<div id="lb" hidden role="dialog" aria-label="Enlarged Home"><div class="stage"></div><div class="side"><div class="cap"></div><button class="close">Close (Esc)</button></div></div>
<script>
${js}
</script>`;
fs.writeFileSync(path.join(dir, '..', 'home-parity-review.html'), html);
console.log('ok', (html.length / 1024).toFixed(0) + ' KB');

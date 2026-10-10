import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const js = ['home-render.js', 'review.js'].map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n;\n');
const html = `<title>Home Parity Review</title>
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
  <div class="kick">Goal Adaptation · Home parity correction · for Founder review</div>
  <h1>Home, matched to production</h1>
  <p class="lead">The corrected Home states reuse the production Home exactly: header, goal field, 110pt confidence ring labelled CONFIDENCE, four fixed metrics, the connected left phase timeline, the 304pt guardrail box, the 104pt action and briefing strip, Today’s Priorities and the tab bar. Only the server-provided phase text changes. Values are simulated.</p>
  <div class="bar" role="group" aria-label="Themes"><button data-show="both" aria-pressed="true">Dark + Mineral Light</button><button data-show="dark" aria-pressed="false">Dark</button><button data-show="light" aria-pressed="false">Mineral Light</button></div>
  <div id="compare"></div>
  <h2>What was corrected from the V3 mockups</h2>
  <div class="grid3">
    <div class="panel"><b>Restored to production</b><ul><li>Connected left phase timeline (line and dots)</li><li>Ring label “CONFIDENCE”, 82pt ring in its 110pt frame</li><li>Metric labels Target date · Remaining · Progress · Destination, in their positions</li><li>“GUARDRAIL” box, same width and style</li><li>Greeting, briefing tile and priorities placement</li></ul></div>
    <div class="panel"><b>Only phase text changes</b><ul><li>Two phase rows, as today, so the card doesn’t grow</li><li>Leaning shows as the active phase; Lean Mass Build shows as paused with progress kept</li><li>PROGRESS stays the goal’s progress during leaning; the phase target sits in the active row</li></ul></div>
    <div class="panel"><b>Phase complete, simplified</b><ul><li>Three short lines: “Leaning complete”, “Back in range”, “Choose when to resume building.”</li><li>No result tables or long sentences on Home</li><li>The choice lives in one Today’s Priorities item; details are in Goals</li></ul></div>
  </div>
  <h2>Slot parity</h2>
  <p class="note">Every slot exists today in <code>HomeJourneyFieldView.swift</code>. Highlighted cells are the only values that differ from the baseline. The production label format “PHASE2 · ACTIVE” (no space) is kept as it is today.</p>
  <div id="parity"></div>
  <p class="note">Needs server support (not built): a paused status rendered for the build phase, goal progress used for PROGRESS during a temporary phase, and the phase-decision priority item. The production values here are reconstructed from source with simulated numbers; your screenshots remain the visual authority.</p>
</div>
<div id="lb" hidden role="dialog" aria-label="Enlarged Home"><div class="stage"></div><div class="side"><div class="cap"></div><button class="close">Close (Esc)</button></div></div>
<script>
${js}
</script>`;
fs.writeFileSync(path.join(dir, '..', 'home-parity-review.html'), html);
console.log('ok', (html.length / 1024).toFixed(0) + ' KB');

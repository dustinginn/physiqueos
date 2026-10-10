// Assemble the single-file review board (published as the Claude artifact and
// committed as ../energy-quick-calibration-board.html). Usage: node build-board.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const css = ['phone.css', 'components.css', 'board.css'].map(read).join('\n').replace(/font-family: Jakarta,/g, "font-family: 'Plus Jakarta Sans',");
const js = ['chrome.js', 'energy.js', 'qc.js', 'screens-a.js', 'screens-b.js', 'screens-c.js', 'screens-d.js', 'screens-e.js', 'registry.js', 'board.js'].map(read).join('\n;\n').replace(/font-family:Jakarta/g, "font-family:'Plus Jakarta Sans'");
const html = `<title>Energy and Quick Calibration</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap">
<style>
${css}
</style>
<div class="topbar"><div class="topbar-in">
  <div class="brand">PhysiqueOS <span>· Energy 1:1 + Quick Calibration</span></div>
  <div class="tog" role="group" aria-label="Phone themes"><button data-show-btn="both" aria-pressed="true">Dark + Mineral</button><button data-show-btn="dark" aria-pressed="false">Dark</button><button data-show-btn="light" aria-pressed="false">Mineral Light</button></div>
  <div class="tog" role="group" aria-label="Board theme"><button data-board-btn="auto" aria-pressed="true">Board: auto</button><button data-board-btn="dark" aria-pressed="false">Dark</button><button data-board-btn="light" aria-pressed="false">Light</button></div>
  <div class="spacer"></div>
  <input class="search" id="q" type="search" placeholder="Filter screens (e.g. energy, validation, concept)" aria-label="Filter screens">
</div></div>
<div class="layout"><nav class="side" id="side" aria-label="Board sections"></nav><main class="main" id="main"></main></div>
<div class="lb" id="lb" role="dialog" aria-modal="true" aria-label="Enlarged screen">
  <div class="stage" id="lb-stage"></div>
  <div class="info"><div id="lb-info"></div><div class="ctl"><button id="lb-prev">← Previous</button><button id="lb-next">Next →</button><button id="lb-theme">Switch theme (T)</button><button id="lb-close">Close (Esc)</button></div></div>
</div>
<script>
${js}
</script>
`;
const out = path.join(dir, '..', 'energy-quick-calibration-board.html');
fs.writeFileSync(out, html);
console.log(out, (html.length / 1024).toFixed(0) + ' KB');

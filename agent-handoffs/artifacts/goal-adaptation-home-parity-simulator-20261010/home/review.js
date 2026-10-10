// Corrected Home review page (Stage 1).
const SLOTS = [
  ['Headline (TRAJECTORY)', (s) => s.headline],
  ['Timeline line (green)', (s) => s.timeline],
  ['Support line', (s) => s.support],
  ['Confidence ring', (s) => `${s.confidence}% · CONFIDENCE`],
  ['TARGET DATE', (s) => s.metrics.targetDate],
  ['REMAINING', (s) => s.metrics.remaining],
  ['PROGRESS', (s) => s.metrics.progress],
  ['DESTINATION', (s) => s.metrics.destination],
  ['Goal date range', (s) => s.range],
  ['Phase row 1', (s) => `PHASE${s.rows[0].order} · ${s.rows[0].status.toUpperCase()} — ${s.rows[0].name} — ${s.rows[0].detail || ''}`],
  ['Phase row 2', (s) => `PHASE${s.rows[1].order} · ${s.rows[1].status.toUpperCase()} — ${s.rows[1].name} — ${s.rows[1].detail || ''}${s.rows[1].label ? ' — ' + s.rows[1].label : ''}`],
  ['Guardrail', (s) => `${s.guardrail.title} · ${s.guardrail.detail}`],
  ['Action tile', (s) => s.action],
  ['Briefing tile', (s) => `${s.briefing.title} · ${s.briefing.date}`],
  ['Priorities', (s) => s.priorities.map((p) => p.title).join(' · ')],
];
const ORDER = ['h1', 'h2', 'h3', 'h4'];
function parityTable() {
  const b = HOME_STATES.baseline;
  return `<div class="tw"><table class="pt"><tr><th>Slot (fixed in source)</th><th>Production baseline</th>${ORDER.map((k) => `<th>${HOME_STATES[k].label}</th>`).join('')}</tr>
  ${SLOTS.map(([n, f]) => `<tr><td><b>${n}</b></td><td>${esc(f(b))}</td>${ORDER.map((k) => { const v = f(HOME_STATES[k]); return `<td class="${v === f(b) ? 'same' : 'chg'}">${v === f(b) ? '<span class="sm">same</span>' : esc(v)}</td>`; }).join('')}</tr>`).join('')}</table></div>`;
}
function render() {
  const show = document.body.dataset.show || 'both';
  const themes = show === 'both' ? ['dark', 'light'] : [show];
  const col = (k) => `<figure class="col"><figcaption><b>${k === 'baseline' ? 'Production baseline' : HOME_STATES[k].label}</b>${k === 'baseline' ? '<span>Reconstructed from Build 94 source, illustrative values</span>' : '<span>Corrected · only dynamic phase text changed</span>'}</figcaption>${themes.map((th) => `<div class="ph" data-open="${k}|${th}">${homeParity(HOME_STATES[k], th)}</div>`).join('')}</figure>`;
  document.getElementById('compare').innerHTML = `<div class="row-scroll">${['baseline', ...ORDER].map(col).join('')}</div>`;
}
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('parity').innerHTML = parityTable();
  render();
  document.querySelectorAll('[data-show]').forEach((b) => b.addEventListener('click', () => { document.body.dataset.show = b.dataset.show; document.querySelectorAll('[data-show]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); render(); }));
  document.addEventListener('click', (e) => { const o = e.target.closest('[data-open]'); if (!o) return; const [k, th] = o.dataset.open.split('|'); const lb = document.getElementById('lb'); lb.querySelector('.stage').innerHTML = homeParity(HOME_STATES[k], th); lb.querySelector('.cap').textContent = `${k === 'baseline' ? 'Production baseline' : HOME_STATES[k].label} · ${th === 'light' ? 'Mineral Light' : 'Dark'} · 100%`; lb.hidden = false; });
  document.getElementById('lb').addEventListener('click', (e) => { if (e.target.id === 'lb' || e.target.closest('.close')) document.getElementById('lb').hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.getElementById('lb').hidden = true; });
});

// Home content review (illustrative content only; not a visual specification).
const ORDER = ['h1', 'h2', 'h3', 'h4'];
// [slot, source in production, getter, line budget, mapping needed]
const SLOTS = [
  ['Headline', 'hero.headline ← active phase name', (s) => s.headline, 1, 'Server data only'],
  ['Timeline line', 'hero.primaryTimeline ← phase friendlyTimeline', (s) => s.timeline, 1, 'Server data only'],
  ['Support line', 'hero.supportLine ← phase purpose', (s) => s.support, 2, 'Server data only'],
  ['Confidence ring', 'hero.confidence (goal)', (s) => `${s.confidence}% · CONFIDENCE`, 1, 'Unchanged'],
  ['TARGET DATE', 'trajectory.overallTargetDate (date)', (s) => s.metrics.targetDate, 1, 'Native content mapping (allow “Paused” / “—”)'],
  ['REMAINING', 'active phase friendlyTimeline (compacted)', (s) => s.metrics.remaining, 1, 'Server data only'],
  ['PROGRESS', 'active phase clampedProgressPercentage', (s) => s.metrics.progress, 1, 'Native content mapping (use goal progress during a temporary phase)'],
  ['DESTINATION', 'goal.target + unit', (s) => s.metrics.destination, 1, 'Unchanged'],
  ['Goal date range', 'earliest phase start – overallTargetDate', (s) => s.range, 1, 'Native content mapping (text when date is pending)'],
  ['Phase rows (count)', 'trajectory.phases', (s) => `${s.rows.length} rows`, 0, 'Server sends the two relevant rows'],
  ['Row 1', 'phase status / name / presentationLabel', (s) => `PHASE${s.rows[0].order} · ${s.rows[0].status === 'completed' ? 'COMPLETE' : s.rows[0].status.toUpperCase()} — ${s.rows[0].name} — ${s.rows[0].detail}`, 0, 'Server data only (raw status string)'],
  ['Row 2', 'phase status / name / dates / presentationLabel', (s) => `PHASE${s.rows[1].order} · ${s.rows[1].status === 'completed' ? 'COMPLETE' : s.rows[1].status.toUpperCase()} — ${s.rows[1].name} — ${s.rows[1].detail}${s.rows[1].label && s.rows[1].status === 'active' ? ' — ' + s.rows[1].label : ''}`, 0, 'Server data only'],
  ['Guardrail', 'trajectory.guardrail (“title · detail”)', (s) => `${s.guardrail.title} · ${s.guardrail.detail}`, 1, 'Server data only'],
  ['Action tile', 'nextBestAction', (s) => s.action, 0, 'Unchanged'],
  ['Briefing tile', 'briefingCards[0]', (s) => `${s.briefing.title} · ${s.briefing.date}`, 0, 'Unchanged mechanism'],
  ['Today’s Priorities', 'todaysFocus', (s) => s.priorities.map((p) => p.title).join(' · '), 0, 'H3 adds one priority occurrence (Server)'],
];
const REGIONS = [
  ['Status bar, safe areas, scroll behaviour', 'Unchanged'], ['Header (greeting + name)', 'Unchanged'], ['Goal field background, gradient, decorative circle, padding', 'Unchanged'],
  ['“TRAJECTORY” eyebrow', 'Unchanged'], ['Headline / timeline / support text', 'Content only'], ['Confidence ring geometry, arc, label “CONFIDENCE”, position', 'Unchanged'],
  ['Metric labels and positions', 'Unchanged'], ['Metric values', 'Content only'], ['“PRIMARY GOAL” chip', 'Unchanged'], ['Goal date range text', 'Content only'],
  ['Phase timeline connector, dots, row spacing, label format', 'Unchanged'], ['Phase row text and status', 'Content only'], ['Guardrail box (size, bar, label)', 'Unchanged'], ['Guardrail text', 'Content only'],
  ['Action + briefing strip (104pt)', 'Unchanged'], ['Today’s Priorities card', 'Unchanged layout; H3 adds one standard item'], ['Older briefings, notices, tab bar', 'Unchanged'],
];
function fitAudit() {
  const host = document.createElement('div'); host.style.cssText = 'position:absolute;left:-9999px;top:0'; document.body.appendChild(host);
  const measure = (k) => { host.innerHTML = homeParity(HOME_STATES[k], 'dark', { tabbar: false }); const hp = host.firstElementChild; const lines = {}; hp.querySelectorAll('[data-slot]').forEach((el) => { const lh = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.2; const n = Math.round(el.getBoundingClientRect().height / lh); const key = el.dataset.slot; lines[key] = Math.max(lines[key] || 0, n); }); const field = hp.querySelector('[data-act="openGoals"]'); return { lines, field: Math.round(field.getBoundingClientRect().height) }; };
  const base = measure('baseline');
  const out = ORDER.map((k) => { const m = measure(k); const over = Object.entries(m.lines).filter(([slot, n]) => n > (base.lines[slot] ?? n)); return { k, field: m.field, baseField: base.field, over }; });
  host.remove();
  window.__fit = out;
  return `<div class="tw"><table class="pt"><tr><th>State</th><th>Goal card height</th><th>Text slots wrapping beyond production line count</th></tr>${out.map((o) => `<tr><td><b>${HOME_STATES[o.k].label}</b></td><td class="${o.field <= o.baseField ? 'ok' : 'bad'}">${o.field}pt ${o.field === o.baseField ? '(= baseline)' : o.field < o.baseField ? `(${o.baseField - o.field}pt shorter)` : `(+${o.field - o.baseField}pt)`}</td><td class="${o.over.length ? 'bad' : 'ok'}">${o.over.length ? o.over.map(([s, n]) => `${s}: ${n} lines`).join(', ') : 'None'}</td></tr>`).join('')}</table></div>`;
}
function slotMatrix() {
  const b = HOME_STATES.baseline;
  return `<div class="tw"><table class="pt"><tr><th>Slot</th><th>Production source</th><th>Baseline</th>${ORDER.slice(1).map((k) => `<th>${HOME_STATES[k].label}</th>`).join('')}<th>Change needed to show it</th></tr>
  ${SLOTS.map(([n, src, f, , map]) => `<tr><td><b>${n}</b></td><td><code>${src}</code></td><td>${esc(f(b))}</td>${ORDER.slice(1).map((k) => { const v = f(HOME_STATES[k]); return `<td class="${v === f(b) ? 'same' : 'chg'}">${v === f(b) ? '<span class="sm">same</span>' : esc(v)}</td>`; }).join('')}<td>${map}</td></tr>`).join('')}</table></div>`;
}
function regionAudit() {
  return `<div class="tw"><table class="pt" style="min-width:640px"><tr><th>Home region</th><th>Change</th></tr>${REGIONS.map(([r, c]) => `<tr><td>${r}</td><td class="${c === 'Unchanged' ? 'ok' : 'chg'}">${c}</td></tr>`).join('')}</table></div>`;
}
function render() {
  const show = document.body.dataset.show || 'both';
  const themes = show === 'both' ? ['dark', 'light'] : [show];
  const col = (k) => `<figure class="col"><figcaption><b>${k === 'baseline' ? 'Production (reconstructed)' : HOME_STATES[k].label}</b><span>${k === 'baseline' ? 'Build 94/95 source · simulated values' : 'Illustrative content only'}</span></figcaption>${themes.map((th) => `<div class="ph" data-open="${k}|${th}" role="button" tabindex="0">${homeParity(HOME_STATES[k], th)}</div>`).join('')}</figure>`;
  document.getElementById('compare').innerHTML = `<div class="row-scroll">${['baseline', ...ORDER.slice(1)].map(col).join('')}</div>`;
}
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('parity').innerHTML = slotMatrix();
  document.getElementById('fit').innerHTML = fitAudit();
  document.getElementById('regions').innerHTML = regionAudit();
  render();
  document.querySelectorAll('[data-show]').forEach((b) => b.addEventListener('click', () => { document.body.dataset.show = b.dataset.show; document.querySelectorAll('[data-show]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); render(); }));
  document.addEventListener('click', (e) => { const o = e.target.closest('[data-open]'); if (!o) return; e.preventDefault(); const [k, th] = o.dataset.open.split('|'); const lb = document.getElementById('lb'); lb.querySelector('.stage').innerHTML = homeParity(HOME_STATES[k], th); lb.querySelector('.cap').textContent = `${k === 'baseline' ? 'Production (reconstructed)' : HOME_STATES[k].label} · ${th === 'light' ? 'Mineral Light' : 'Dark'} · 100% · illustrative content only`; lb.hidden = false; });
  document.getElementById('lb').addEventListener('click', (e) => { if (e.target.id === 'lb' || e.target.closest('.close')) document.getElementById('lb').hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.getElementById('lb').hidden = true; });
});

// ---------------------------------------------------------------------------
// Quick Calibration model (interactive "Choose another amount" sheet).
// Primary Founder scenario (illustrative): leaning phase since Oct 9 at
// 1,767 kcal eaten + 100 added activity (Watch goal 900), target −450/day.
// After 4 weeks with logging and activity on plan, weight trend ≈ −0.2 lb/week
// instead of the expected 0.7–1.3. Outcome-based recalibration moves estimated
// maintenance 2,117 → ≈ 1,967 (1,860–2,060), so −150 restores −450/day.
// Step bounds (±300) and the floor are PROVISIONAL design proposals.
// ---------------------------------------------------------------------------
const QC = {
  current: 1767, added: 100, usual: 800, recommended: -150,
  maintenance: 1967, targetNet: -450, maxStep: 300, observeWeeks: 3,
};
const qcFloor = () => Math.ceil((QC.maintenance * (1 - 0.25)) / 25) * 25; // 25% below recalibrated maintenance, rounded up

function qcRefresh(root) {
  const input = root.querySelector('[data-q="delta"]');
  const num = root.querySelector('[data-q="deltaNum"]');
  let delta = Number(input?.value ?? QC.recommended);
  const intake = QC.current + delta;
  const net = intake - QC.maintenance - QC.added;
  const set = (k, v) => root.querySelectorAll(`[data-qe="${k}"]`).forEach((el) => { el.innerHTML = v; });
  set('delta', delta === 0 ? 'No change' : `${sgn(delta)} kcal/day`);
  set('intake', fmt(intake));
  set('week', fmt(intake * 7));
  set('weekDelta', sgn(delta * 7));
  set('net', sgn(net));
  if (num && document.activeElement !== num) num.value = intake;
  const msgs = [];
  let ok = true, label = `Apply ${fmt(intake)} kcal`;
  if (delta === 0) { label = 'Keep current plan'; msgs.push(['info', 'No change. Your plan stays at 1,767 and we keep observing.']); }
  if (Math.abs(delta) > QC.maxStep) { ok = false; label = 'Open full plan review'; msgs.push(['amber', `Changes over ${QC.maxStep} kcal at once need a full plan review, so the rest of your plan can be checked too.`]); }
  if (intake < qcFloor()) { ok = false; label = 'Below the floor'; msgs.push(['red', `Eating can’t go below ${fmt(qcFloor())} kcal (provisional floor, 25% under your updated maintenance).`]); }
  if (delta > 0) msgs.push(['amber', 'This moves you away from your −450 target. You can still choose it.']);
  if (delta === QC.recommended) msgs.unshift(['ok', 'Recommended amount. Restores your −450 target with the updated maintenance estimate.']);
  const w = root.querySelector('[data-qe="msgs"]');
  if (w) w.innerHTML = msgs.map(([t, m]) => `<div class="ewarn ${t}">${t === 'ok' ? I.check : t === 'info' ? I.info : I.warn}<span>${m}</span></div>`).join('');
  const btn = root.querySelector('[data-qe="apply"]');
  if (btn) { btn.textContent = label; btn.className = `btn ${ok ? 'primary' : Math.abs(delta) > QC.maxStep && intake >= qcFloor() ? 'secondary' : 'disabled'}`; btn.setAttribute('aria-disabled', String(!ok && !(Math.abs(delta) > QC.maxStep && intake >= qcFloor()))); }
}
document.addEventListener('input', (ev) => {
  const root = ev.target.closest('[data-qc]');
  if (!root) return;
  if (ev.target.dataset.q === 'deltaNum' && ev.target.value !== '') { const d = root.querySelector('[data-q="delta"]'); if (d) d.value = Math.round(Number(ev.target.value)) - QC.current; }
  qcRefresh(root);
});
document.addEventListener('change', (ev) => { const root = ev.target.closest('[data-qc]'); if (root) { ev.target.blur?.(); qcRefresh(root); } });
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-qstep],[data-qset]');
  if (!b) return;
  const root = b.closest('[data-qc]');
  if (!root) return;
  const d = root.querySelector('[data-q="delta"]');
  if (b.dataset.qstep) d.value = Number(d.value) + Number(b.dataset.qstep);
  if (b.dataset.qset) d.value = Number(b.dataset.qset);
  qcRefresh(root);
});

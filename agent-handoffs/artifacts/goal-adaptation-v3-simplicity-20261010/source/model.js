// ---------------------------------------------------------------------------
// v3 interactive models. 1:1 accounting everywhere:
//   eat target        = estimated maintenance + planned balance + added activity
//   activity goal     = usual active energy + added activity
// Founder numbers: maintenance ≈ 2,117 (1,977–2,258) at usual ≈ 800 active kcal
// (Phase B dormant candidate 99f11ae6). Plan: −450/day, eat 1,767, goal 900.
// Quick Calibration scenario (illustrative): after 4 weeks with good evidence the
// planned −450 behaved like ≈ −250; the maintenance estimate is refined
// 2,117 → ≈ 1,917, and the briefing proposes deepening the balance by 200.
// Floor (25% below maintenance, rounded up to 25), +500 added cap and step
// sizes are PROVISIONAL.
// ---------------------------------------------------------------------------
const EM = { maintenance: 2117, low: 1977, high: 2258, usual: 800, maxAdded: 500, plan: { eat: 1767, goal: 900, balance: -450, added: 100 } };
const fmt = (v) => Math.round(v).toLocaleString('en-US');
const sgn = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v));
const floorFor = (m) => Math.ceil((m * (1 - 0.25)) / 25) * 25;
const SPLITS = {
  suggested: { label: 'Suggested', added: (b) => 100 },
  eat: { label: 'Eat less', added: () => 0 },
  move: { label: 'Move more', added: (b) => Math.min(EM.maxAdded, Math.max(0, -b)) },
  blend: { label: 'Blend', added: (b) => Math.min(EM.maxAdded, Math.max(0, Math.round(-b / 2))) },
};

function energyState(root) {
  const balance = Number(root.querySelector('[data-in="balance"]').value);
  const split = root.dataset.split || 'suggested';
  let added = split === 'custom' ? Number(root.querySelector('[data-in="added"]').value || 0) : SPLITS[split].added(balance);
  added = Math.max(0, Math.min(EM.maxAdded, Math.round(added)));
  const floor = floorFor(EM.maintenance);
  let eat = EM.maintenance + balance + added;
  const notes = [];
  let limited = false;
  if (eat < floor) { eat = floor; limited = true; notes.push(['red', `Eating is held at ${fmt(floor)} (provisional floor, 25% below maintenance). Add activity or choose a smaller deficit.`]); }
  const eff = eat - EM.maintenance - added;
  if (eat >= EM.maintenance && added > 0) notes.push(['amber', `You’d eat at or above maintenance and rely on +${fmt(added)} of extra activity every day for the whole deficit.`]);
  const lo = eat - EM.high - added, hi = eat - EM.low - added;
  const dens = eff < 0 ? 3300 : 2500;
  const r1 = Math.abs(lo * 7 / dens), r2 = Math.abs(hi * 7 / dens);
  let rate;
  if (Math.abs(eff) < 60) rate = 'About steady';
  else if (eff > 0) rate = `≈ ${(Math.min(r1, r2) * 4.33).toFixed(1)}–${(Math.max(r1, r2) * 4.33).toFixed(1)} lb/month gain`;
  else rate = `≈ ${Math.min(r1, r2).toFixed(1)}–${Math.max(r1, r2).toFixed(1)} lb/week loss`;
  return { balance, eff, added, eat, goal: EM.usual + added, limited, notes, rate, lo, hi };
}
function energyRefresh(root) {
  const s = energyState(root);
  const set = (k, v) => root.querySelectorAll(`[data-e="${k}"]`).forEach((el) => { el.innerHTML = v; });
  set('balance', s.limited ? `${sgn(s.eff)} <span style="font-size:.5em;color:var(--red)">limited</span>` : sgn(s.balance));
  set('rate', s.rate);
  set('range', `${sgn(s.lo)} to ${sgn(s.hi)}`);
  set('eat', fmt(s.eat));
  set('goal', fmt(s.goal));
  set('added', `+${fmt(s.added)}`);
  set('formula', `${fmt(EM.maintenance)} ${s.eff < 0 ? '−' : '+'} ${fmt(Math.abs(s.eff))} + ${fmt(s.added)} = <b>${fmt(s.eat)}</b>`);
  set('example', s.added ? `For example, ≈ ${fmt(Math.round(s.added * 22 / 100) * 100)} more steps a day. Any activity counts.` : 'No extra activity planned.');
  set('notes', s.notes.map(([t, m]) => `<div class="ewarn ${t}">${I.warn}<span>${m}</span></div>`).join(''));
  root.querySelectorAll('[data-split]').forEach((b) => { const on = b.dataset.split === (root.dataset.split || 'suggested'); b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
  const custom = root.querySelector('[data-e="custom"]'); if (custom) custom.hidden = (root.dataset.split || 'suggested') !== 'custom';
  const a = root.querySelector('[data-in="added"]'); if (a && document.activeElement !== a) a.value = s.added;
  const e = root.querySelector('[data-in="eatNum"]'); if (e && document.activeElement !== e) e.value = s.eat;
}

// ---------------- Quick Calibration v3 -----------------
// Proposal: deepen the planned balance by 200. The user picks how.
const QC = { eat: 1767, goal: 900, balance: -450, step: -200, refined: 1917 };
const QCOPT = {
  eat: { label: 'Eat less', eat: -200, move: 0 },
  move: { label: 'Move more', eat: 0, move: 200 },
  blend: { label: 'Blend', eat: -100, move: 100 },
};
function qcState(root) {
  const opt = root.dataset.qopt || '';
  let eat = 0, move = 0;
  if (QCOPT[opt]) ({ eat, move } = QCOPT[opt]);
  if (opt === 'custom') { eat = -Number(root.querySelector('[data-q="eatLess"]').value || 0); move = Number(root.querySelector('[data-q="moveMore"]').value || 0); }
  const change = eat - move; // 1:1: each kcal eaten less or moved more deepens the balance by 1
  const newEat = QC.eat + eat, newGoal = QC.goal + move;
  return { opt, eat, move, change, newEat, newGoal, newBalance: QC.balance + change, floor: floorFor(QC.refined) };
}
function qcRefresh(root) {
  const s = qcState(root);
  const set = (k, v) => root.querySelectorAll(`[data-qe="${k}"]`).forEach((el) => { el.innerHTML = v; });
  root.querySelectorAll('[data-qopt]').forEach((b) => { const on = b.dataset.qopt === s.opt; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
  set('eat', fmt(s.newEat)); set('goal', fmt(s.newGoal)); set('balance', sgn(s.opt ? s.newBalance : QC.balance + QC.step)); set('change', sgn(s.change));
  set('eatDelta', s.eat ? sgn(s.eat) : 'same'); set('goalDelta', s.move ? sgn(s.move) : 'same');
  const custom = root.querySelector('[data-qe="custom"]'); if (custom) custom.hidden = s.opt !== 'custom';
  const btn = root.querySelector('[data-qe="accept"]');
  const msgs = [];
  if (s.newEat < s.floor) msgs.push(['red', `Eating can’t go below ${fmt(s.floor)} (provisional floor).`]);
  if (s.opt === 'custom' && s.change > 0) msgs.push(['amber', 'This makes your deficit smaller, the opposite of the suggestion. You can still choose it.']);
  if (s.opt === 'custom' && s.change < -300) msgs.push(['amber', 'Changes over 300 a day go to a full plan review.']);
  set('msgs', msgs.map(([t, m]) => `<div class="ewarn ${t}">${I.warn}<span>${m}</span></div>`).join(''));
  if (btn) {
    const ok = s.opt && s.newEat >= s.floor && !(s.opt === 'custom' && (s.change === 0 || s.change < -300));
    btn.className = `btn ${ok ? 'primary' : 'disabled'} grow`;
    btn.textContent = !s.opt ? 'Choose how to add 200' : ok ? `Accept: eat ${fmt(s.newEat)} · goal ${fmt(s.newGoal)}` : s.change < -300 ? 'Review in your plan' : 'Adjust the amount';
  }
}

// ---------------- event wiring (works inside the lightbox copy too) -----------------
document.addEventListener('input', (ev) => {
  const er = ev.target.closest('[data-energy]');
  if (er) {
    if (ev.target.dataset.in === 'eatNum' && ev.target.value !== '') { er.dataset.split = 'custom'; const a = er.querySelector('[data-in="added"]'); a.value = Math.max(0, Math.min(EM.maxAdded, Number(ev.target.value) - EM.maintenance - Number(er.querySelector('[data-in="balance"]').value))); }
    if (ev.target.dataset.in === 'added') er.dataset.split = 'custom';
    energyRefresh(er);
  }
  const qr = ev.target.closest('[data-qcv3]');
  if (qr) qcRefresh(qr);
});
document.addEventListener('click', (ev) => {
  const t = ev.target.closest('[data-split],[data-qopt],[data-step],[data-qstep]');
  if (!t) return;
  const er = t.closest('[data-energy]');
  if (er) {
    if (t.dataset.split) er.dataset.split = t.dataset.split;
    if (t.dataset.step) { const [k, d] = t.dataset.step.split(':'); const el = er.querySelector(`[data-in="${k}"]`); el.value = Math.max(Number(el.min), Math.min(Number(el.max), Number(el.value) + Number(d))); if (k === 'added') er.dataset.split = 'custom'; }
    energyRefresh(er);
  }
  const qr = t.closest('[data-qcv3]');
  if (qr) {
    if (t.dataset.qopt) qr.dataset.qopt = t.dataset.qopt;
    if (t.dataset.qstep) { const [k, d] = t.dataset.qstep.split(':'); const el = qr.querySelector(`[data-q="${k}"]`); el.value = Math.max(0, Math.min(400, Number(el.value) + Number(d))); }
    qcRefresh(qr);
  }
});

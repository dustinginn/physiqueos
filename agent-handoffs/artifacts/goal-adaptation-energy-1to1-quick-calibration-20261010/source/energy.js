// ---------------------------------------------------------------------------
// Energy balance model used by the interactive prototype screens.
// 1:1 ACCOUNTING (Founder correction 2026-10-10): every added activity kcal
// counts in full. There is no discount factor anywhere.
//   intake target   = estimated maintenance + selected balance + added activity
//   Watch goal      = usual active energy + added activity
// Usual activity is already inside calibrated maintenance and is never added
// again. Measurement error is handled by calibration ranges and outcome-based
// recalibration (Quick Calibration), not by discounting activity.
// Founder Oct 9 numbers come from the Phase B dormant candidate (99f11ae6):
// maintenance ≈ 2,117 logged kcal/day (1,977–2,258) at ~800 kcal usual activity.
// Floor, added-activity cap and presets are PROVISIONAL design proposals.
// ---------------------------------------------------------------------------
const EM = {
  maintenance: 2117, low: 1977, high: 2258,      // logged kcal/day, usual activity included
  usual: 800,                                     // usual Apple Watch active energy (already inside maintenance)
  densityLoss: 3300, densityGain: 2500,           // kcal per lb of mixed weight change (provisional policy)
  fatToLose: 2.6, fatShare: [0.8, 0.95],          // Phase B lean-out projection
  floorBelow: 0.25, floorRound: 25,               // provisional: intake floor 25% below maintenance, rounded up
  maxAdded: 500,                                  // provisional cap on added activity per day
  plan: { intake: 2500, activity: 800 },
};
const fmt = (v) => Math.round(v).toLocaleString('en-US');
const sgn = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v));
const floorFor = (m) => Math.ceil((m * (1 - EM.floorBelow)) / EM.floorRound) * EM.floorRound;

function energyCalc(net, added, m = EM.maintenance) {
  const floor = floorFor(m);
  let intake = Math.round(m + net + added);
  const warnings = [];
  let clamped = false;
  if (intake < floor) { intake = floor; clamped = true; warnings.push(['red', `Eating can’t go below ${fmt(floor)} kcal (provisional floor, 25% under your maintenance). Add activity or choose a smaller deficit.`]); }
  const effNet = intake - m - added;
  // uncertainty comes from the calibrated maintenance range only
  const netLo = intake - EM.high - added;
  const netHi = intake - EM.low - added;
  const density = effNet < 0 ? EM.densityLoss : EM.densityGain;
  const rate = (n) => (n * 7) / density;
  const rLo = rate(netLo), rHi = rate(netHi);
  let weeks = null;
  if (effNet < -60) {
    const lossLo = EM.fatToLose / EM.fatShare[1], lossHi = EM.fatToLose / EM.fatShare[0];
    const fast = Math.abs(Math.min(rLo, rHi)), slow = Math.max(0.15, Math.abs(Math.max(rLo, rHi)));
    weeks = [Math.max(1, Math.round(lossLo / fast)), Math.max(2, Math.round(lossHi / slow))];
    const pct = (Math.abs(effNet) * 7 / EM.densityLoss) / 179 * 100;
    if (pct > 0.85) warnings.push(['amber', `About ${pct.toFixed(1)}% of body weight a week is faster than the 0.4–0.7% that best protects lean mass.`]);
  }
  if (intake > m && added > 0) warnings.push(['amber', `You’d eat above your maintenance and rely on +${fmt(added)} kcal of extra activity every day for the whole deficit. If activity falls short, so does the deficit.`]);
  else if (added > 300) warnings.push(['amber', `+${fmt(added)} kcal a day is a big jump from your usual ${fmt(EM.usual)}. Make sure it’s sustainable.`]);
  if (added > 0 && added <= 300 && !clamped) warnings.push(['info', `Added activity counts 1:1. If your Watch reads high or low, your weigh-in trend shows it and we recalibrate.`]);
  return { intake, added, net: Math.round(effNet), netLo: Math.round(netLo), netHi: Math.round(netHi), rLo, rHi, weeks, warnings, clamped, floor, activityGoal: EM.usual + added };
}

const PRESETS = {
  suggested: { label: 'Suggested', net: -450, added: 100 },
  balanced: { label: 'Balanced', net: -450, added: 225 },
  intake: { label: 'Intake-focused', net: -450, added: 0 },
  activity: { label: 'Activity-focused', net: -450, added: 350 },
};

function rateText(c) {
  const a = Math.abs(c.rLo), b = Math.abs(c.rHi);
  const lo = Math.min(a, b), hi = Math.max(a, b);
  if (c.net > -60 && c.net < 60) return 'About steady weight';
  if (c.net > 0) return `≈ ${(lo * 4.33).toFixed(1)}–${(hi * 4.33).toFixed(1)} lb/month gain`;
  return `≈ ${lo.toFixed(1)}–${hi.toFixed(1)} lb/week loss`;
}

const presetOf = (root, key) => (key === 'suggested' ? { net: Number(root.dataset.sugNet ?? -450), added: Number(root.dataset.sugAdded ?? 100) } : PRESETS[key]);

function energyRefresh(root) {
  const net = Number(root.querySelector('[data-in="net"]')?.value ?? root.dataset.net ?? -450);
  const added = Number(root.querySelector('[data-in="added"]')?.value ?? root.dataset.added ?? 100);
  const c = energyCalc(net, added);
  const set = (k, v) => root.querySelectorAll(`[data-e="${k}"]`).forEach((el) => { el.innerHTML = v; });
  set('net', c.clamped ? `${sgn(c.net)} kcal/day <span style="font-size:.6em;color:var(--red)">limited</span>` : `${sgn(net)} kcal/day`);
  set('netShort', sgn(c.clamped ? c.net : net));
  set('netrange', `${sgn(c.netLo)} to ${sgn(c.netHi)}`);
  set('rate', rateText({ ...c, net }));
  set('weeks', c.weeks ? `${c.weeks[0]}–${c.weeks[1]} weeks` : net > 60 ? 'Building continues' : 'No fixed length');
  set('intake', fmt(c.intake));
  set('intakeDelta', `${sgn(c.intake - EM.plan.intake)} vs today’s plan`);
  set('added', `+${fmt(added)}`);
  set('activityGoal', fmt(c.activityGoal));
  set('weekIntake', fmt(c.intake * 7));
  set('weekAdded', fmt(added * 7));
  set('weekNet', sgn((c.clamped ? c.net : net) * 7));
  set('formula', `${fmt(EM.maintenance)} ${net < 0 ? '−' : '+'} ${fmt(Math.abs(c.clamped ? c.net : net))} + ${fmt(added)} = <b>${fmt(c.intake)}</b>`);
  set('steps', added ? `≈ ${fmt(Math.round(added * 22 / 100) * 100)} extra steps a day, or ${Math.max(1, Math.round(added * 7 / 233))} brisk 45-min walks a week` : 'No added activity');
  const zone = net < -650 ? 'Aggressive' : net < -250 ? 'Moderate deficit' : net < -60 ? 'Gentle deficit' : net <= 60 ? 'Maintenance' : net <= 250 ? 'Lean surplus' : 'Surplus';
  set('zone', zone);
  root.querySelectorAll('[data-e="zone"]').forEach((el) => { el.className = `pill ${net < -650 ? 'red' : net < -60 ? 'amber' : net <= 60 ? 'line' : 'teal'}`; });
  const sync = (sel, v) => { const el = root.querySelector(sel); if (el && document.activeElement !== el) el.value = v; };
  sync('[data-in="intake"]', c.intake);
  sync('[data-in="intakeNum"]', c.intake);
  sync('[data-in="addedNum"]', added);
  const w = root.querySelector('[data-e="warnings"]');
  if (w) w.innerHTML = c.warnings.map(([tone, t]) => `<div class="ewarn ${tone}">${tone === 'info' ? I.info : I.warn}<span>${t}</span></div>`).join('');
  root.querySelectorAll('[data-preset]').forEach((b) => { const p = presetOf(root, b.dataset.preset); b.classList.toggle('on', p.net === net && p.added === added); b.setAttribute('aria-checked', String(p.net === net && p.added === added)); });
  const fill = root.querySelector('[data-e="netfill"]');
  if (fill) { const pct = ((net + 750) / 1250) * 100; fill.style.left = `${Math.min(pct, 60)}%`; fill.style.width = `${Math.abs(pct - 60)}%`; }
}
// dragging or typing intake keeps the selected balance: added activity moves 1:1
function setIntake(root, wantIntake) {
  const net = Number(root.querySelector('[data-in="net"]')?.value ?? root.dataset.net);
  const added = Math.max(0, Math.min(EM.maxAdded, Math.round(wantIntake - EM.maintenance - net)));
  const a = root.querySelector('[data-in="added"]'); if (a) a.value = added;
}
document.addEventListener('input', (ev) => {
  const root = ev.target.closest('[data-energy]');
  if (!root) return;
  const k = ev.target.dataset.in;
  if (k === 'intake') setIntake(root, Number(ev.target.value));
  if (k === 'intakeNum' && ev.target.value !== '') setIntake(root, Number(ev.target.value));
  if (k === 'addedNum' && ev.target.value !== '') { const a = root.querySelector('[data-in="added"]'); if (a) a.value = Math.max(0, Math.min(EM.maxAdded, Math.round(Number(ev.target.value)))); }
  energyRefresh(root);
});
document.addEventListener('change', (ev) => {
  const root = ev.target.closest('[data-energy]');
  if (root && /Num$/.test(ev.target.dataset.in || '')) { ev.target.blur?.(); energyRefresh(root); }
});
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-preset],[data-step]');
  if (!b) return;
  const root = b.closest('[data-energy]');
  if (!root) return;
  const netEl = root.querySelector('[data-in="net"]'), addEl = root.querySelector('[data-in="added"]');
  if (b.dataset.preset) { const p = presetOf(root, b.dataset.preset); if (netEl) netEl.value = p.net; if (addEl) addEl.value = p.added; }
  if (b.dataset.step) {
    const [k, d] = b.dataset.step.split(':');
    const el = root.querySelector(`[data-in="${k}"]`);
    if (el) el.value = Math.max(Number(el.min || -Infinity), Math.min(Number(el.max || Infinity), Number(el.value) + Number(d)));
  }
  energyRefresh(root);
});

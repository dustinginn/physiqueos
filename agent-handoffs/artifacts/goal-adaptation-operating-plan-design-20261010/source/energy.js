// ---------------------------------------------------------------------------
// Energy balance model used by the interactive prototype screens.
// Founder Oct 9 numbers come from the Phase B dormant candidate (99f11ae6):
// maintenance ≈ 2,117 logged kcal/day (1,977–2,258) at ~800 kcal usual activity.
// Everything else here (credit factor, caps, presets) is a PROVISIONAL design
// proposal for Founder review, not engine policy.
// ---------------------------------------------------------------------------
const EM = {
  maintenance: 2117, low: 1977, high: 2258,      // logged kcal/day at usual activity
  baseline: 800,                                  // usual Apple Watch active energy (already inside maintenance)
  credit: 0.75,                                   // share of ADDED activity counted toward the balance
  densityLoss: 3300, densityGain: 2500,           // kcal per lb of mixed weight change
  fatToLose: 2.6, fatShare: [0.8, 0.95],          // Phase B lean-out projection
  leanToGain: 2.9,                                // remaining lean mass to the +10 lb goal
  floorFraction: 0.75, maxAdded: 500, maxSurplus: 500, round: 25,
  plan: { intake: 2500, activity: 800 },
};
const r25 = (v) => Math.round(v / EM.round) * EM.round;
const fmt = (v) => Math.round(v).toLocaleString('en-US');
const sgn = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v));

function energyCalc(net, added) {
  const floor = Math.ceil((EM.maintenance * EM.floorFraction) / EM.round) * EM.round;
  let intake = r25(EM.maintenance + net + EM.credit * added);
  const warnings = [];
  let clamped = false;
  if (intake < floor) { intake = floor; clamped = true; warnings.push(['red', `Intake can’t go below ${fmt(floor)} kcal (25% under your maintenance). Add activity or choose a smaller deficit.`]); }
  if (intake > EM.maintenance + EM.maxSurplus) { intake = r25(EM.maintenance + EM.maxSurplus); clamped = true; warnings.push(['amber', 'Surplus capped at +500 kcal over maintenance.']); }
  const effNet = intake - EM.maintenance - EM.credit * added;
  // uncertainty from the maintenance range plus the uncounted share of added activity
  const netLo = intake - EM.high - EM.credit * added - 0.25 * added * 0.5;
  const netHi = intake - EM.low - EM.credit * added + 0.25 * added * 0.5;
  const density = effNet < 0 ? EM.densityLoss : EM.densityGain;
  const rate = (n) => (n * 7) / density; // lb/week, signed
  const rLo = rate(Math.min(netLo, netHi)), rHi = rate(Math.max(netLo, netHi));
  const bw = 179;
  let weeks = null;
  if (effNet < -60) {
    const lossLo = EM.fatToLose / EM.fatShare[1], lossHi = EM.fatToLose / EM.fatShare[0];
    const fast = Math.abs(Math.min(rLo, rHi)), slow = Math.max(0.15, Math.abs(Math.max(rLo, rHi)));
    weeks = [Math.max(1, Math.round(lossLo / fast)), Math.max(2, Math.round(lossHi / slow))];
    const pct = (Math.abs(effNet) * 7 / EM.densityLoss) / bw * 100;
    if (pct > 0.85) warnings.push(['amber', `About ${(pct).toFixed(1)}% of body weight a week is faster than the 0.4–0.7% that best protects lean mass.`]);
  } else if (effNet > 60) {
    weeks = null;
  }
  if (added > 300) warnings.push(['amber', `+${added} kcal a day is a big jump from your usual ${EM.baseline}. Watch estimates for added exercise run high, so only ${Math.round(EM.credit * 100)}% is counted.`]);
  if (added > 0 && added <= 300) warnings.push(['info', `Added activity counted at ${Math.round(EM.credit * 100)}%. Watch estimates for extra exercise tend to run high.`]);
  return { intake, added, net: Math.round(effNet), netLo: Math.round(Math.min(netLo, netHi)), netHi: Math.round(Math.max(netLo, netHi)), rLo, rHi, weeks, warnings, clamped, floor, activityGoal: EM.baseline + added };
}

const PRESETS = {
  suggested: { label: 'Suggested', net: -450, added: 100 },
  balanced: { label: 'Balanced', net: -450, added: 300 },
  intake: { label: 'Intake-focused', net: -450, added: 0 },
  activity: { label: 'Activity-focused', net: -450, added: 500 },
};

function rateText(c) {
  const a = Math.abs(c.rLo), b = Math.abs(c.rHi);
  const lo = Math.min(a, b), hi = Math.max(a, b);
  if (c.net > -60 && c.net < 60) return 'About steady weight';
  if (c.net > 0) return `≈ ${(lo * 4.33).toFixed(1)}–${(hi * 4.33).toFixed(1)} lb/month gain`;
  return `≈ ${lo.toFixed(1)}–${hi.toFixed(1)} lb/week loss`;
}

// live wiring for interactive phones (event delegation; works in the lightbox copy too)
function energyRefresh(root) {
  const net = Number(root.querySelector('[data-in="net"]')?.value ?? root.dataset.net ?? -450);
  const added = Number(root.querySelector('[data-in="added"]')?.value ?? root.dataset.added ?? 100);
  const c = energyCalc(net, added);
  const set = (k, v) => root.querySelectorAll(`[data-e="${k}"]`).forEach((el) => { el.innerHTML = v; });
  set('net', c.clamped ? `${sgn(c.net)} kcal/day <span style="font-size:.6em;color:var(--red)">limited</span>` : `${sgn(net)} kcal/day`);
  set('netrange', `${sgn(c.netLo)} to ${sgn(c.netHi)}`);
  set('rate', rateText({ ...c, net }));
  set('weeks', c.weeks ? `${c.weeks[0]}–${c.weeks[1]} weeks` : net > 60 ? 'Building continues' : 'No fixed length');
  set('intake', fmt(c.intake));
  set('intakeDelta', `${sgn(c.intake - EM.plan.intake)} vs today’s plan`);
  set('added', `+${fmt(added)}`);
  set('activityGoal', fmt(c.activityGoal));
  set('weekIntake', fmt(c.intake * 7));
  set('weekAdded', fmt(added * 7));
  set('steps', added ? `≈ ${fmt(Math.round(added * 22 / 100) * 100)} extra steps a day, or ${Math.max(1, Math.round(added * 7 / 350))} brisk 45-min walks a week` : 'No added activity');
  const zone = net < -650 ? 'Aggressive' : net < -250 ? 'Moderate deficit' : net < -60 ? 'Gentle deficit' : net <= 60 ? 'Maintenance' : net <= 250 ? 'Lean surplus' : 'Surplus';
  set('zone', zone);
  root.querySelectorAll('[data-e="zone"]').forEach((el) => { el.className = `pill ${net < -650 ? 'red' : net < -60 ? 'amber' : net <= 60 ? 'line' : 'teal'}`; });
  const intakeSlider = root.querySelector('[data-in="intake"]');
  if (intakeSlider && document.activeElement !== intakeSlider) intakeSlider.value = c.intake;
  const w = root.querySelector('[data-e="warnings"]');
  if (w) w.innerHTML = c.warnings.map(([tone, t]) => `<div class="ewarn ${tone}">${tone === 'info' ? I.info : I.warn}<span>${t}</span></div>`).join('');
  root.querySelectorAll('[data-preset]').forEach((b) => {
    const p = b.dataset.preset === 'suggested' ? { net: Number(root.dataset.sugNet ?? -450), added: Number(root.dataset.sugAdded ?? 100) } : PRESETS[b.dataset.preset];
    b.classList.toggle('on', p.net === net && p.added === added);
  });
  const fill = root.querySelector('[data-e="netfill"]');
  if (fill) { const pct = ((net + 750) / 1250) * 100; fill.style.left = `${Math.min(pct, 60)}%`; fill.style.width = `${Math.abs(pct - 60)}%`; }
}
document.addEventListener('input', (ev) => {
  const root = ev.target.closest('[data-energy]');
  if (!root) return;
  if (ev.target.dataset.in === 'intake') {
    // dragging intake keeps the selected net balance: activity moves the other way
    const net = Number(root.querySelector('[data-in="net"]')?.value ?? root.dataset.net);
    const wantIntake = Number(ev.target.value);
    const added = Math.max(0, Math.min(EM.maxAdded, Math.round(((wantIntake - EM.maintenance - net) / EM.credit) / 25) * 25));
    const a = root.querySelector('[data-in="added"]'); if (a) a.value = added;
  }
  energyRefresh(root);
});
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-preset],[data-step]');
  if (!b) return;
  const root = b.closest('[data-energy]');
  if (!root) return;
  const netEl = root.querySelector('[data-in="net"]'), addEl = root.querySelector('[data-in="added"]');
  if (b.dataset.preset) { const p = b.dataset.preset === 'suggested' ? { net: Number(root.dataset.sugNet ?? -450), added: Number(root.dataset.sugAdded ?? 100) } : PRESETS[b.dataset.preset]; if (netEl) netEl.value = p.net; if (addEl) addEl.value = p.added; }
  if (b.dataset.step) { const [k, d] = b.dataset.step.split(':'); const el = root.querySelector(`[data-in="${k}"]`); if (el) el.value = Number(el.value) + Number(d); }
  energyRefresh(root);
});

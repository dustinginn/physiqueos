// ---------------------------------------------------------------------------
// Energy model for the Goal Adaptation simulator (design simulation only).
// Pure functions; every number is labelled with its source (records snapshot, illustrative, or simulated).
//
// Layers (never merged silently):
//   1. Resting metabolic rate (RMR): measured | DEXA report estimate | equation
//   2. Usual activity: average active energy from a supported source (Apple
//      Health), workouts included. Absent when there is no wearable data.
//   3. Digestion (thermic effect of food): assumed ≈ 10% of intake.
//   4. Bottom-up expenditure = RMR + usual activity + digestion
//      (no wearable: RMR × an activity factor the user picks).
//   5. Outcome-calibrated maintenance: what logged intake plus the weight /
//      body-composition trend imply, in LOGGED calories. Needs enough logging.
//   6. Approved targets: eat and activity goal. They never change unless the
//      user approves a change.
// Planning maintenance = (5) when available, otherwise (4) marked provisional.
// Plan arithmetic (1:1): eat = planning maintenance + planned balance + extra
// activity; activity goal = usual activity + extra activity.
// ---------------------------------------------------------------------------
const RMR_SOURCES = {
  measured: { label: 'Measured (indirect calorimetry)', pct: 0.05 },
  dexa_report: { label: 'DEXA report estimate', pct: 0.10 },
  equation: { label: 'Equation from profile', pct: 0.10 },
};
const ASSUMPTIONS = { wearablePct: 0.25, factorPct: 0.15, calibratedHalfWidth: 150, floorBelow: 0.25, round: 25 };

function mifflinStJeor({ sex, age, heightCm, weightKg }) {
  return Math.round(10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161));
}
const PROFILE_B = { sex: 'male', age: 38, heightCm: 193, weightKg: 81.2 }; // illustrative profile, not stored data

// ---- Evidence calibration (scenario A) -------------------------------------
// Period aggregates between consecutive DEXA scans: mean logged kcal/day over
// the logged days, scan-to-scan lean/fat change in lb. Source: the sanitized
// read-only snapshot already used by the dormant Goal Adaptation tests
// (fixtures/founderLeanMassGolden.js, extracted 2026-10-10 from Server 85a98025).
// A snapshot, not a live read; it matches the Founder's Nutrition Evidence screenshots.
const FOUNDER_PERIODS = [
  { start: 'Jun 20', end: 'Jul 18', days: 28, dLean: 1.3, dFat: -5.6, dTotal: -4.3, intakeDays: 9, intakeMean: 1990, activityDays: 14, activityMean: 1062 },
  { start: 'Jul 18', end: 'Aug 15', days: 28, dLean: 0.8, dFat: 0, dTotal: 0.9, intakeDays: 27, intakeMean: 2349, activityDays: 27, activityMean: 980 },
  { start: 'Aug 15', end: 'Sep 12', days: 28, dLean: 5.0, dFat: 1.4, dTotal: 6.4, intakeDays: 28, intakeMean: 2714, activityDays: 28, activityMean: 880 },
  { start: 'Sep 12', end: 'Oct 9', days: 27, dLean: 1.3, dFat: 3.2, dTotal: 4.3, intakeDays: 27, intakeMean: 2568, activityDays: 27, activityMean: 832 },
];
// Same densities as the dormant Phase B policy (provisional): energy stored per lb of DEXA change.
const DENSITY = { fat: 4250, lean: 830 }; const MIN_INTAKE_COVERAGE = 0.7;
const r10 = (x) => Math.round(x / 10) * 10;
const sum = (xs, f) => xs.reduce((t, x) => t + f(x), 0);
// maintenance (logged kcal/day) = mean logged intake − energy stored per day, over every period with
// ≥ 70% of days logged. Sparse periods are excluded, never imputed. No recency weighting and no
// re-scaling to an activity target: the estimate holds at the activity actually recorded in those
// periods, which becomes "usual activity". The month-to-month spread is the range shown.
function calibrateFromPeriods(periods) {
  const used = periods.filter((p) => p.intakeDays / p.days >= MIN_INTAKE_COVERAGE);
  const excluded = periods.filter((p) => !used.includes(p)).map((p) => ({ ...p, reason: 'intake logged on fewer than 70% of days' }));
  if (!used.length) return { status: 'insufficient', excluded };
  const days = sum(used, (p) => p.days), logged = sum(used, (p) => p.intakeDays);
  const intake = sum(used, (p) => p.intakeMean * p.intakeDays) / logged;
  const dFat = Math.round(sum(used, (p) => p.dFat) * 10) / 10, dLean = Math.round(sum(used, (p) => p.dLean) * 10) / 10;
  const stored = (dFat * DENSITY.fat + dLean * DENSITY.lean) / days;
  const activity = sum(used, (p) => p.activityMean * p.activityDays) / sum(used, (p) => p.activityDays);
  const perPeriod = used.map((p) => ({ start: p.start, end: p.end, intake: p.intakeMean, maintenance: Math.round(p.intakeMean - (p.dFat * DENSITY.fat + p.dLean * DENSITY.lean) / p.days) }));
  const ms = perPeriod.map((p) => p.maintenance);
  return { status: 'calibrated', value: r10(intake - stored), low: r10(Math.min(...ms)), high: r10(Math.max(...ms)), intake: Math.round(intake), stored: Math.round(stored), activity: Math.round(activity), usual: r10(activity), days, logged, dFat, dLean, dTotal: Math.round(sum(used, (p) => p.dTotal) * 10) / 10, from: used[0].start, to: used[used.length - 1].end, perPeriod, excluded };
}
const FOUNDER_CAL = calibrateFromPeriods(FOUNDER_PERIODS);

const ENERGY_SCENARIOS = {
  A: { key: 'A', label: 'A · Founder records (Oct 10 snapshot)', rmr: 1850, rmrSource: 'dexa_report', usual: FOUNDER_CAL.usual, approvedGoal: 800, factor: 1.4, tefPct: 10, logging: 'complete',
    calibrated: { value: FOUNDER_CAL.value, low: FOUNDER_CAL.low, high: FOUNDER_CAL.high, source: 'records', note: `From ${FOUNDER_CAL.days} days of your records (${FOUNDER_CAL.from} – ${FOUNDER_CAL.to}): logged food and DEXA change.` },
    evidence: FOUNDER_CAL, truth: FOUNDER_CAL.value }, // truth: what the weekly simulation plays out (hypothetical)
  B: { key: 'B', label: 'B · No DEXA (equation RMR)', rmr: mifflinStJeor(PROFILE_B), rmrSource: 'equation', usual: 800, factor: 1.4, tefPct: 10, logging: 'complete', calibrated: null, truth: 2350 },
  C: { key: 'C', label: 'C · No wearable, partial logging', rmr: mifflinStJeor(PROFILE_B), rmrSource: 'equation', usual: null, factor: 1.4, tefPct: 10, logging: 'partial', calibrated: null, truth: 2400 },
};
const cloneScenario = (k) => JSON.parse(JSON.stringify(ENERGY_SCENARIOS[k]));

function bottomUp(E) {
  const rp = (RMR_SOURCES[E.rmrSource] || RMR_SOURCES.equation).pct;
  if (E.usual == null) {
    const value = Math.round(E.rmr * E.factor);
    const half = Math.round(value * ASSUMPTIONS.factorPct);
    return { value, low: value - half, high: value + half, method: 'rmr_x_factor' };
  }
  const k = 1 - E.tefPct / 100;
  const value = Math.round((E.rmr + E.usual) / k);
  const half = Math.round((E.rmr * rp + E.usual * ASSUMPTIONS.wearablePct) / k);
  return { value, low: value - half, high: value + half, method: 'rmr_plus_activity_plus_digestion' };
}
function planningMaintenance(E) {
  if (E.calibrated && E.logging === 'complete') return { ...E.calibrated, source: 'calibrated' };
  const b = bottomUp(E);
  return { value: b.value, low: b.low, high: b.high, source: 'provisional', note: E.logging === 'partial' ? 'Too little logged intake to calibrate (needs ≈ 70% of days for 3+ weeks).' : 'Not yet calibrated from results.' };
}
const floorFor = (m) => Math.ceil((m * (1 - ASSUMPTIONS.floorBelow)) / ASSUMPTIONS.round) * ASSUMPTIONS.round;
function targetsFromBalance(E, balance, added) {
  const M = planningMaintenance(E).value;
  const extra = E.usual == null ? 0 : Math.max(0, Math.min(500, Math.round(added)));
  let eat = M + balance + extra;
  const floor = floorFor(M);
  const limited = eat < floor;
  if (limited) eat = floor;
  return { eat, added: extra, goal: E.usual == null ? null : E.usual + extra, balance: eat - M - extra, limited, floor, maintenance: M };
}
function derivedBalance(E, plan) { return plan.eat - planningMaintenance(E).value - (plan.added || 0); }
function naiveDifference(E, plan) { if (plan.goal == null) return null; return E.rmr + plan.goal - plan.eat; } // RMR + activity goal − intake (not a deficit)
function bottomUpDifference(E, plan) {
  const exp = plan.goal == null ? E.rmr * E.factor : E.rmr + plan.goal + (E.tefPct / 100) * plan.eat;
  return Math.round(plan.eat - exp);
}
function reconciliation(E, plan) {
  const pm = planningMaintenance(E);
  const bu = bottomUp(E);
  return { planning: pm, bottomUp: bu, gap: bu.value - pm.value, balance: derivedBalance(E, plan), naive: naiveDifference(E, plan), bottomUpDiff: bottomUpDifference(E, plan), tef: Math.round((E.tefPct / 100) * plan.eat) };
}
if (typeof module !== 'undefined') module.exports = { FOUNDER_PERIODS, DENSITY, calibrateFromPeriods, ENERGY_SCENARIOS, RMR_SOURCES, ASSUMPTIONS, mifflinStJeor, PROFILE_B, cloneScenario, bottomUp, planningMaintenance, floorFor, targetsFromBalance, derivedBalance, naiveDifference, bottomUpDifference, reconciliation };

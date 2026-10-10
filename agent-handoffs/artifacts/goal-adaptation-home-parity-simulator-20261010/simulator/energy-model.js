// ---------------------------------------------------------------------------
// Energy model for the Goal Adaptation simulator (design simulation only).
// Pure functions; every number is illustrative and labelled with its source.
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

const ENERGY_SCENARIOS = {
  A: { key: 'A', label: 'A · Founder illustrative, with DEXA', rmr: 1850, rmrSource: 'dexa_report', usual: 800, factor: 1.4, tefPct: 10, logging: 'complete',
    calibrated: { value: 2117, low: 1977, high: 2258, note: 'Phase B shadow calculation from logged intake and DEXA scans (Jul–Oct). Illustrative; not a validated personal value.' }, truth: 2117 },
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
if (typeof module !== 'undefined') module.exports = { ENERGY_SCENARIOS, RMR_SOURCES, ASSUMPTIONS, mifflinStJeor, PROFILE_B, cloneScenario, bottomUp, planningMaintenance, floorFor, targetsFromBalance, derivedBalance, naiveDifference, bottomUpDifference, reconciliation };

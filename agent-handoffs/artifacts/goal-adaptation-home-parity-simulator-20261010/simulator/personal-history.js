// ---------------------------------------------------------------------------
// Previous-cut history for "Why this plan?" (design simulation only).
// Provenance of every value:
//   record   — held by the production Server (goal record; cut evidence window
//              EVIDENCE_CONTEXT_WINDOWS["visible-abs"])
//   founder  — the Founder's Nutrition Evidence Period Summary, as reported in prompt eb644ed4
//   snapshot — sanitized period aggregates from the Oct 10 read-only extraction
//              (fixtures/founderLeanMassGolden.js on the Phase B branch)
// Nothing is estimated across days that were not logged.
// ---------------------------------------------------------------------------
const CUT_HISTORY = {
  A: {
    goal: { value: 'Visible Abs', prov: 'record' },
    dates: { value: 'May 24 – Jul 18', days: 56, prov: 'record' },
    // Nutrition Evidence → Period Summary for the cut window
    periodSummary: { avg: 2062, loggedDays: 10, days: 56, prov: 'founder' },
    // Last scan-to-scan month of the cut (DEXA Jun 20 → Jul 18)
    finalMonth: { label: 'Jun 20 → Jul 18', days: 28, dFat: -5.6, dLean: 1.3, dTotal: -4.3, intakeDays: 9, prov: 'snapshot' },
  },
  B: null,
  C: null,
};
const cutHistory = (key) => CUT_HISTORY[key] || null;
const MIN_COVERAGE_FOR_CALORIES = 0.7; // same rule the calibration uses
const cutCoverage = (h) => (h ? h.periodSummary.loggedDays / h.periodSummary.days : 0);
// The cut's food logs can set calories only with enough coverage. With 10 of 56 days they can't.
const cutSetsCalories = (h) => !!h && cutCoverage(h) >= MIN_COVERAGE_FOR_CALORIES;
// Measured weight change in the cut's final scan-to-scan month (lb/week, loss positive).
const cutWeeklyLoss = (h) => (h ? (-h.finalMonth.dTotal / h.finalMonth.days) * 7 : null);
// Expected weekly change for a planned daily balance (same 3,300 kcal/lb loss figure the simulator uses).
const weeklyLoss = (balance) => (-balance * 7) / 3300;
// The only comparison with the cut: pace, because both sides are measured (DEXA weight change).
// Calories and activity are not compared: the cut logged food on too few days.
function paceVsLast(balance, h) {
  if (!h) return null; const now = weeklyLoss(balance), then = cutWeeklyLoss(h);
  if (Math.abs(now - then) <= 0.2) return 'about the pace that kept your lean mass in your last cut';
  return now > then ? 'faster than your last cut, so the next DEXA checks lean mass' : 'gentler than your last cut';
}
if (typeof module !== 'undefined') module.exports = { CUT_HISTORY, cutHistory, cutCoverage, cutSetsCalories, cutWeeklyLoss, weeklyLoss, paceVsLast };

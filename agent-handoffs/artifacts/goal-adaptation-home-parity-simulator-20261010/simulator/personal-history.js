// ---------------------------------------------------------------------------
// Personal cut history for "Why this plan?" (design simulation only).
// Each value carries its provenance:
//   record — a fact the production Server already holds (goal record, or its hardcoded
//            cut evidence window EVIDENCE_CONTEXT_WINDOWS["visible-abs"])
//   sim    — illustrative; NOT read from any record. Shown with a SIMULATED tag.
// In the real app these come from the completed goal's own logs (see the report's
// source audit). Nothing here is a validated personal value.
// ---------------------------------------------------------------------------
const CUT_HISTORY = {
  A: {
    goal: { value: 'Visible Abs', prov: 'record' },
    dates: { value: 'May 24 – Jul 18', prov: 'record' }, // Server cut window; goal transition committed Jul 21
    intake: { value: 1700, prov: 'sim', coverage: 0.8 }, // average logged kcal/day; share of days logged
    activity: { value: 850, prov: 'sim' }, // average active kcal/day (cut-era source: activity_day records)
    rate: { value: 0.8, prov: 'sim' }, // lb/week
    lean: { value: 'held', prov: 'sim' }, // DEXA lean mass across the cut
    strength: { value: 'held', prov: 'sim' },
  },
  B: null,
  C: null,
};
const cutHistory = (key) => CUT_HISTORY[key] || null;
// Below the calibration coverage rule (70% of days logged) the food average is shown as rough, never hidden.
const intakeIsRough = (h) => !!h && h.intake.coverage < 0.7;
// Expected weekly change for a planned daily balance (same 3,300 kcal/lb loss figure the simulator uses).
const weeklyLoss = (balance) => (-balance * 7) / 3300;
// Coach comparisons against the previous cut. Thresholds are presentation choices, not physiology.
function paceVsLast(balance, h) {
  if (!h) return null; const now = weeklyLoss(balance), then = h.rate.value;
  if (Math.abs(now - then) <= 0.2) return 'about the pace that held your lean mass last time';
  return now > then ? 'a little faster than last time, so the next DEXA checks lean mass' : 'gentler than last time';
}
function intakeVsLast(eat, h) {
  if (!h) return null; const d = eat - h.intake.value;
  if (Math.abs(d) <= 100) return 'about what you ate last time';
  return d > 0 ? 'more than you ate last time' : 'less than you ate last time';
}
function activityVsLast(goal, h) {
  if (!h || goal == null) return null;
  return goal <= h.activity.value + 100 ? 'close to what you sustained last time' : 'more than you averaged last time';
}
if (typeof module !== 'undefined') module.exports = { CUT_HISTORY, cutHistory, intakeIsRough, weeklyLoss, paceVsLast, intakeVsLast, activityVsLast };

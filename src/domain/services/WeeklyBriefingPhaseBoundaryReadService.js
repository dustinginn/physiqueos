// Read-only overlay that tells the weekly-briefing presentation layer "this week's evidence
// window ended right before a live, authorized phase transition began" — without ever
// mutating the stored historical briefing artifact. Mirrors the read-only-overlay pattern
// PhaseReviewArtifactReadService.js already uses for DEXA-event briefings: the artifact's
// frozen historical snapshot stays untouched, and live canonical state is compared alongside
// it at render time.
export function resolveWeeklyBriefingPhaseBoundary({ artifact, goal } = {}) {
  const context = artifact?.briefing?.weeklyNarrative?.context;
  const windowEnd = context?.evidenceWindow?.endDate ?? artifact?.evidenceWindow?.endDate ?? null;
  const snapshotPhaseId = context?.activePhase?.id ?? null;
  if (!windowEnd || !snapshotPhaseId || !goal?.phases?.length) return null;

  // The phase this artifact's evidence window was generated against must now, live, be
  // completed — otherwise there is no boundary to describe.
  const snapshotPhaseNow = goal.phases.find((item) => item.id === snapshotPhaseId);
  if (!snapshotPhaseNow || snapshotPhaseNow.status !== "completed") return null;

  const nextPhase = goal.phases.find((item) =>
    Number(item.order ?? Number.NaN) === Number(snapshotPhaseNow.order ?? Number.NaN) + 1);
  if (!nextPhase || nextPhase.status !== "active" || !isDate(nextPhase.startDate)) return null;

  // Only the specific week whose evidence window ends at (or within a few days before) the
  // moment the new phase actually began is a genuine boundary week — not every week that
  // ever preceded it.
  const gapDays = daysBetween(windowEnd, nextPhase.startDate);
  if (gapDays === null || gapDays < 0 || gapDays > 7) return null;

  return Object.freeze({
    priorPhaseName: snapshotPhaseNow.name ?? null,
    phaseName: nextPhase.name ?? null,
    effectiveDate: nextPhase.startDate,
    strategicReviewCadence: nextPhase.strategicReviewCadence ?? null,
    strategicReviewAnchor: nextPhase.strategicReviewAnchor ?? null,
  });
}

function isDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? "")); }
function daysBetween(fromDate, toDate) {
  if (!isDate(fromDate) || !isDate(toDate)) return null;
  return Math.round((Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86400000);
}

// Shared V3 evidence universe.
//
// Every V3 publisher (Midweek, Weekly, Monthly, DEXA, Photo) builds its
// evidence from the same canonical universe. Publishers may hand V3 a store of
// a different shape (a whole runtime, or a bounded read model such as the Photo
// Event store), but V3 reads only this explicit, cutoff-bounded, goal-owned
// view. The view is not a broadening: it never adds evidence from another Goal,
// Phase, or after the cutoff. It only makes what V3 can see consistent across
// publishers.
//
// A publisher that must keep its writable collections narrow supplies
// additional read-only evidence under `store.v3ReadOnlyEvidence`; that
// namespace is never a writable collection.

export const V3_EVIDENCE_UNIVERSE_VERSION = "v3_evidence_universe_v1";
export const V3_CARRY_FORWARD_BRIEFING_LIMIT = 3;

export function createV3EvidenceUniverse({
  store = {},
  goal = null,
  phase = null,
  evidenceCutoff,
} = {}) {
  const cutoffMs = Date.parse(evidenceCutoff);
  if (!Number.isFinite(cutoffMs)) throw new Error("V3 evidence universe requires an evidence cutoff.");
  const extra = store?.v3ReadOnlyEvidence ?? {};
  const pool = (name) => dedupe([...(store?.[name] ?? []), ...(extra[name] ?? [])]);

  const briefings = pool("dailyBriefings")
    .filter((artifact) => ownedByGoalPhase(artifact, goal, phase))
    .map((artifact) => ({ artifact, cutoff: artifactCutoff(artifact) }))
    .filter((item) => item.cutoff != null && Date.parse(item.cutoff) <= cutoffMs)
    .sort((left, right) => right.cutoff.localeCompare(left.cutoff))
    // Newest few per cadence, so a run of newer Event briefings can never crowd
    // out the latest Weekly or Midweek that carry-forward reads.
    .filter((item, _index, all) => {
      const family = briefingFamily(item.artifact);
      return all.filter((other) => briefingFamily(other.artifact) === family)
        .indexOf(item) < V3_CARRY_FORWARD_BRIEFING_LIMIT;
    })
    .map((item) => item.artifact);
  const referencedAssessments = new Set(briefings.map((artifact) =>
    artifact?.confidencePublication?.assessmentId ??
    artifact?.briefing?.confidencePublication?.assessmentId).filter(Boolean));
  const phaseStart = String(phase?.startedAt ?? phase?.startDate ?? "").slice(0, 10);
  const training = pool("canonicalEvidenceObjects").filter((candidate) => {
    const payload = candidate?.payload ?? candidate;
    if (payload?.evidence_type !== "training") return false;
    const observed = String(payload?.observed_at ?? payload?.date ?? "").slice(0, 10);
    return observed && (!phaseStart || observed >= phaseStart) &&
      Date.parse(`${observed}T00:00:00.000Z`) <= cutoffMs;
  });
  return Object.freeze({
    universeVersion: V3_EVIDENCE_UNIVERSE_VERSION,
    dexaScans: pool("dexaScans"),
    weightEntries: pool("weightEntries"),
    goalTransitionDrafts: pool("goalTransitionDrafts"),
    phaseStrategies: pool("phaseStrategies"),
    protocols: pool("protocols"),
    protocolVersions: pool("protocolVersions"),
    dailyBriefings: Object.freeze(briefings),
    goalConfidenceHistory: pool("goalConfidenceHistory")
      .filter((item) => referencedAssessments.has(item?.assessmentId)),
    canonicalEvidenceObjects: Object.freeze(training),
    analyses: pool("analyses"),
    photoAnalyses: pool("photoAnalyses"),
    v3EvidenceObservations: store?.v3EvidenceObservations ?? [],
  });
}

function briefingFamily(artifact) {
  return String(artifact?.cadence ?? artifact?.artifactType ?? "unknown");
}

function ownedByGoalPhase(artifact, goal, phase) {
  if (!artifact) return false;
  const goalId = artifact.goalId ?? artifact.sourceRevisions?.goalId ??
    artifact.briefing?.activeGoal?.id ?? artifact.briefing?.weeklyNarrative?.context?.activeGoal?.id ?? null;
  const phaseId = artifact.phaseId ?? artifact.sourceRevisions?.phaseId ??
    artifact.briefing?.activePhase?.id ?? artifact.briefing?.weeklyNarrative?.context?.activePhase?.id ?? null;
  // Artifacts that carry no goal ownership are left to the adapter's own
  // assessment-bound ownership check rather than excluded here.
  if (goal?.id && goalId && goalId !== goal.id) return false;
  if (phase?.id && phaseId && phaseId !== phase.id) return false;
  return true;
}

function artifactCutoff(artifact) {
  const value = artifact?.evidenceCutoff ?? artifact?.evidenceWindow?.cutoff ??
    artifact?.evidenceWindow?.endDate ?? null;
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59.999Z` : value;
  return Number.isFinite(Date.parse(normalized)) ? new Date(normalized).toISOString() : null;
}

function dedupe(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = item?.id ?? item?.assessmentId ?? item?.canonicalId ?? null;
    if (key != null) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    result.push(item);
  }
  return result;
}

import { createHash } from "node:crypto";

export function createPIPhotoConfidenceReasoning({
  session,
  narrative,
  context,
} = {}) {
  const comparison = comparisonIntegrity(session, narrative);
  const role = classifyRole({ narrative, comparison });
  const consumptionKey = createPhotoVisualConsumptionKey({
    sessionId: session?.id,
    baselineSessionIds: comparison.baselineSessionIds,
    comparisonIds: comparison.comparisonIds,
    goalId: context?.activeGoal?.id,
    phaseId: context?.activePhase?.id,
    poseFingerprints: comparison.poseFingerprints,
    role,
    interpretation: {
      summary: narrative?.overallSummary,
      changes: narrative?.keyVisibleChanges,
      limitations: narrative?.conditionLimitations,
    },
  });
  const supportingStatus = /tighter|improv|clearer|leaner/i.test(stable({
    summary: narrative?.overallSummary,
    changes: narrative?.keyVisibleChanges,
  })) ? "improving" : "stable";
  const status = ({
    supporting: supportingStatus,
    conflicting: "softening",
    limiting: "low_quality",
    inconclusive: "inconclusive",
    neutral: "inconclusive",
  })[role];
  const contextualStates = structuredClone(context?.confidenceDomainStates ?? {});
  if (role === "conflicting" && contextualStates.weight?.status === "rising") {
    contextualStates.weight.status = "rising_with_softening";
  }
  return {
    role,
    consumptionKey,
    comparison,
    domainStates: {
      ...contextualStates,
      photos: {
        status,
        semanticKey: `photos:${role}`,
        evidenceCompleteness: comparison.complete ? "complete" : "partial",
        canonicalEvidenceReferences: [{
          id: consumptionKey, type: "photo_visual_authority",
        }],
        sourceObservationIds: context?.pi?.observations?.map(
          (item) => item.id) ?? [],
        reason: roleReason(role),
        corroborated: false,
      },
    },
    evidenceCompleteness: {
      overall: comparison.complete ? "complete" : "partial",
    },
    observations: context?.pi?.observations ?? [],
    claims: [],
    reasoning: {
      visualEvidenceRole: role,
      canonicalPhotoSessionId: session?.id ?? null,
      comparisonIds: comparison.comparisonIds,
      baselineSessionIds: comparison.baselineSessionIds,
      limitations: comparison.limitations,
    },
    piReasoningFingerprint:
      `sha256_${createHash("sha256").update(stable({
        consumptionKey, role,
      })).digest("hex")}`,
    publicationEligible: comparison.eligible,
    semanticChange: comparison.eligible,
    completenessImproved: comparison.complete,
  };
}

export function createPhotoVisualConsumptionKey(input = {}) {
  return `photo_visual|${createHash("sha256").update(stable({
    canonicalPhotoSessionId: input.sessionId ?? null,
    baselineSessionIds: sorted(input.baselineSessionIds),
    comparisonAnalysisIds: sorted(input.comparisonIds),
    goalId: input.goalId ?? null,
    phaseId: input.phaseId ?? null,
    posePairFingerprints: sorted(input.poseFingerprints),
    interpretationFingerprint: createHash("sha256").update(stable({
      role: input.role, interpretation: input.interpretation,
    })).digest("hex"),
    confidenceModelVersion: "pi_goal_confidence_scoring_v1",
  })).digest("hex")}`;
}

function comparisonIntegrity(session, narrative) {
  const views = session?.views ?? [];
  const paired = views.filter((view) =>
    view.comparison?.previousSessionId && view.comparison?.previousCanonicalViewId);
  const visionBacked = paired.filter((view) =>
    !/fallback|deterministic/i.test(view.analysisMode ?? ""));
  const comparisonIds = sorted([
    session?.synthesis?.id,
    ...paired.map((view) => view.comparison?.analysisId ??
      view.comparison?.id ?? view.canonicalViewId),
  ]);
  const limitations = sorted([
    ...(narrative?.conditionLimitations ?? []),
    ...views.flatMap((view) => view.conditionDifferences ?? []),
  ]);
  return {
    eligible: paired.length > 0 && visionBacked.length > 0,
    complete: paired.length > 0 && visionBacked.length === paired.length &&
      limitations.length === 0,
    comparisonIds,
    baselineSessionIds: sorted(paired.map(
      (view) => view.comparison.previousSessionId)),
    poseFingerprints: sorted(paired.map((view) =>
      `${view.poseId}|${view.comparison.previousCanonicalViewId}|${
        view.canonicalViewId}`)),
    pairedViewCount: paired.length,
    limitations,
  };
}
function classifyRole({ narrative, comparison }) {
  if (!comparison.eligible) return "limiting";
  const text = stable({
    summary: narrative?.overallSummary,
    changes: narrative?.keyVisibleChanges,
    stable: narrative?.stableSignals,
  });
  if (/soft|fat gain|wider waist|less definition/i.test(text)) {
    return "conflicting";
  }
  if (/inconclusive|no reliable|harder to judge|uncertain/i.test(text)) {
    return "inconclusive";
  }
  if (/stable|maintain|holding steady|no meaningful/i.test(text)) {
    return "supporting";
  }
  if (/tighter|improv|clearer|leaner/i.test(text)) return "supporting";
  return "neutral";
}
function roleReason(role) {
  return ({
    supporting: "Comparable Photos support a stable body-composition guardrail.",
    conflicting: "Comparable Photos suggest softening that may challenge the guardrail.",
    limiting: "Photo quality or pose pairing limits visual interpretation.",
    inconclusive: "The Photo comparison is visually inconclusive.",
    neutral: "The Photo comparison does not show a meaningful directional change.",
  })[role];
}
function sorted(values = []) {
  return [...new Set(values.filter(Boolean).map(String))].sort();
}
function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value ?? {}).sort().map((key) =>
    `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}

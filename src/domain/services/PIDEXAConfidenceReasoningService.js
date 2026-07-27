import { createHash } from "node:crypto";

export function createPIDEXAConfidenceReasoning({
  scan,
  priorScan,
  narrative,
  context,
} = {}) {
  const role = classifyRole({ scan, priorScan, narrative, context });
  const consumptionKey = createDEXAAuthoritativeConsumptionKey({
    scanId: scan?.id,
    scanDate: dateKey(scan?.measuredAt ?? scan?.date),
    goalId: context?.activeGoal?.id,
    phaseId: context?.activePhase?.id,
    comparisonBaselineId: priorScan?.id ?? null,
    role,
    interpretation: narrative?.interpretation,
  });
  const domainStates = {
    dexa: {
      status: role === "baseline" ? "recent_baseline" :
        role === "inconclusive" ? "recent_baseline" : role,
      semanticKey: `dexa:${role}`,
      authoritative: true,
      evidenceCompleteness: priorScan ? "complete" : "partial",
      canonicalEvidenceReferences: [{ id: consumptionKey, type: "dexa_authority" }],
      sourceObservationIds: context?.pi?.observations?.map((item) => item.id) ?? [],
      reason: reason(role),
    },
  };
  const semantic = {
    consumptionKey,
    role,
    observationIds: domainStates.dexa.sourceObservationIds,
  };
  return {
    role,
    consumptionKey,
    domainStates,
    evidenceCompleteness: { overall: priorScan ? "complete" : "partial" },
    observations: context?.pi?.observations ?? [],
    claims: [],
    reasoning: {
      authoritativeEvidenceRole: role,
      canonicalDEXAId: scan?.id ?? null,
      comparisonBaselineId: priorScan?.id ?? null,
      limitations: context?.uncertainty?.limitations ?? [],
    },
    piDecisionResultId: null,
    piReasoningFingerprint:
      `sha256_${createHash("sha256").update(stable(semantic)).digest("hex")}`,
    publicationEligible: true,
    semanticChange: true,
    completenessImproved: Boolean(priorScan),
  };
}

export function createDEXAAuthoritativeConsumptionKey(input = {}) {
  const semantic = {
    canonicalDEXAId: input.scanId ?? null,
    scanDate: input.scanDate ?? null,
    goalId: input.goalId ?? null,
    phaseId: input.phaseId ?? null,
    comparisonBaselineId: input.comparisonBaselineId ?? null,
    interpretationFingerprint: createHash("sha256")
      .update(stable({ role: input.role, interpretation: input.interpretation }))
      .digest("hex"),
    confidenceModelVersion: "pi_goal_confidence_scoring_v1",
  };
  return `dexa_authority|${createHash("sha256").update(stable(semantic)).digest("hex")}`;
}

function classifyRole({ scan, priorScan, narrative, context }) {
  if (!priorScan) return "baseline";
  if (context?.uncertainty?.state !== "comparison_available") return "inconclusive";
  const lean = metricDelta(narrative, "Lean Tissue");
  const bodyFat = metricDelta(narrative, "Body Fat");
  const guardrail = narrative?.interpretation?.guardrailStatus;
  if (guardrail === "above" || (bodyFat > 1 && lean <= 0.5)) return "contradicting";
  if (lean < -1 || bodyFat < -1.5) return "contradicting";
  if (lean >= 0 && (!guardrail || ["within", "near_boundary"].includes(guardrail))) {
    return "confirming";
  }
  return "inconclusive";
}
function metricDelta(narrative, label) {
  return Number(narrative?.progress?.headline?.find(
    (item) => item.label === label
  )?.delta ?? 0);
}
function reason(role) {
  return ({
    confirming: "The new DEXA authoritatively supports the current calibration direction.",
    contradicting: "The new DEXA authoritatively conflicts with the current calibration direction.",
    baseline: "This DEXA establishes an authoritative baseline without proving progress.",
    inconclusive: "DEXA comparison limitations prevent an authoritative progress conclusion.",
  })[role];
}
function dateKey(value) {
  return String(value ?? "").slice(0, 10);
}
function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value ?? {}).sort().map((key) =>
    `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}

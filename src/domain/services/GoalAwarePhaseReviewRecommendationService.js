import { createHash } from "node:crypto";

export const PHASE_READINESS_CONCLUSIONS = Object.freeze({
  CONCLUSIVELY_SATISFIED: "conclusively_satisfied",
  SUFFICIENTLY_RESOLVED: "sufficiently_resolved_to_proceed",
  UNRESOLVED: "unresolved",
  CONTRADICTED: "contradicted",
});

export function evaluateGoalAwarePhaseReview(input = {}) {
  const hasNextPhase = Boolean(input.nextPhaseId);
  // Goal-outcome pressure is not itself a safety concern. A Goal can be behind
  // pace while beginning the next adjustable phase is still the safer response
  // to the cost of further delay. Only explicit safety evidence may veto that.
  const safetyConcern = input.guardrailDeviationMagnitude === "material" ||
    input.evidenceTrend === "worsening" || input.forecastSafetyRisk === "material" ||
    input.phaseEvidenceConclusion === "contradicted";
  const explicitReady = input.phaseEvidenceConclusion === "conclusively_satisfied" ||
    input.phaseEvidenceConclusion === "sufficiently_resolved_to_proceed";
  const bounded = input.uncertainty === "bounded" || input.uncertainty === "low";
  const stableEvidence = ["stable", "favorable"].includes(input.evidenceTrend);
  const delayCost = classifyDelayCost(input.extensionDays, input.remainingGoalDays);
  const valueOfInformation = safetyConcern || input.evidenceTrend === "unstable" ? "high" :
    explicitReady ? "low" : bounded && stableEvidence ? "moderate" : "high";
  const boundedProceed = hasNextPhase && !safetyConcern && bounded && stableEvidence &&
    input.guardrailDeviationMagnitude !== "material" && delayCost === "high" &&
    input.nextPhaseMonitorable === true && input.nextPhaseAdjustable === true;
  const begin = hasNextPhase && !safetyConcern && (explicitReady || boundedProceed);
  const evidenceConclusion = safetyConcern ? PHASE_READINESS_CONCLUSIONS.CONTRADICTED :
    explicitReady ? input.phaseEvidenceConclusion : boundedProceed ?
      PHASE_READINESS_CONCLUSIONS.SUFFICIENTLY_RESOLVED : PHASE_READINESS_CONCLUSIONS.UNRESOLVED;
  const recommendation = begin ? "begin_next_phase" : "extend_current_phase";
  const explanation = explain({ begin, evidenceConclusion, delayCost, valueOfInformation,
    deviation: input.guardrailDeviationMagnitude, stable: stableEvidence, extensionDays: input.extensionDays });
  const result = {
    schemaVersion: "goal_aware_phase_review_recommendation_v1",
    recommendation,
    presentationRecommendation: begin ? "begin_next_phase" : "continue_current_phase",
    evidenceConclusion,
    evidenceCertaintyPreserved: true,
    valueOfInformation,
    costOfDelay: {
      level: delayCost,
      extensionDays: positiveInteger(input.extensionDays, 14),
      remainingGoalDays: nullableInteger(input.remainingGoalDays),
      remainingWindowConsumedPercent: percentage(input.extensionDays, input.remainingGoalDays),
    },
    guardrail: {
      status: input.guardrailStatus ?? "unknown",
      deviationMagnitude: input.guardrailDeviationMagnitude ?? "unknown",
      exactMembershipPreserved: true,
    },
    monitoringPlan: begin ? ["weight_trend", "nutrition", "activity", "training",
      "recovery", "next_qualifying_body_composition_evidence"] :
      ["weight_trend", "nutrition", "activity", "training", "recovery"],
    explanation,
  };
  result.fingerprint = `sha256_${createHash("sha256").update(stable(result)).digest("hex")}`;
  return deepFreeze(result);
}

export function deriveGoalAwarePhaseReviewInputs({ goal, phase, nextPhase, artifact, canonicalScan = null,
  extensionDays = 14, asOf = new Date().toISOString().slice(0, 10) } = {}) {
  const narrative = artifact?.briefing?.dexaEventNarrative ?? artifact?.briefing?.photoEventNarrative ?? {};
  const text = [narrative.interpretation?.opening, narrative.interpretation?.fatLoss,
    narrative.interpretation?.supportingEvidence, narrative.interpretation?.phaseMeaning,
    narrative.goalConfidence?.primaryReason].filter(Boolean).join(" ").toLowerCase();
  const targetDate = goal?.timeline?.targetDate ?? goal?.target?.targetDate ?? null;
  const remainingGoalDays = targetDate ? daysBetween(asOf, targetDate) : null;
  const bodyFat = canonicalScan?.bodyFatPercentage ?? scanForArtifact(artifact)?.bodyFatPercentage ?? artifact?.comparison?.current?.bodyFatPercentage ?? null;
  const range = bodyFatRange(goal?.guardrails ?? []);
  const deviation = deviationFromRange(bodyFat, range);
  const guardrailStatus = deviation == null ? "unknown" : deviation === 0 ? "inside" :
    Number(bodyFat) < range.min ? "below" : "above";
  const deviationMagnitude = deviation == null ? "unknown" : deviation === 0 ? "none" :
    deviation <= Math.max(0.1, range.max - range.min) ? "slight" : "material";
  const favorable = /lean tissue increased|productive|training stayed productive/.test(text);
  const worsening = /continued (substantial )?(weight|fat) loss|training regression|clear under.fueling/.test(text);
  const unstable = /unstable|insufficient evidence|cannot determine direction/.test(text);
  const uncertainty = /cannot prove|not conclusively|continued observation|calibrat/.test(text) ? "bounded" : "low";
  const conclusivelySatisfied = /conclusively (established|satisfied)|objective satisfied/.test(text);
  return Object.freeze({
    nextPhaseId: nextPhase?.id ?? null,
    phaseEvidenceConclusion: conclusivelySatisfied ? "conclusively_satisfied" : "unresolved",
    forecastStatus: artifact?.briefing?.forecastAssessment?.goalForecastStatus ??
      artifact?.forecastAssessment?.goalForecastStatus ?? null,
    guardrailStatus,
    guardrailDeviationMagnitude: deviationMagnitude,
    evidenceTrend: worsening ? "worsening" : unstable ? "unstable" : favorable ? "favorable" : "stable",
    uncertainty,
    remainingGoalDays,
    extensionDays,
    nextPhaseMonitorable: Boolean(nextPhase),
    nextPhaseAdjustable: Boolean(nextPhase),
    phaseElapsedDays: daysBetween(phase?.startDate ?? phase?.startedAt, asOf),
  });
}

function scanForArtifact(artifact) {
  return artifact?.briefing?.dexaEventNarrative?.canonicalScan ?? artifact?.canonicalScan ?? null;
}
function bodyFatRange(guardrails) {
  for (const item of guardrails) {
    const match = String(item?.text ?? item?.description ?? "").match(/(\d+(?:\.\d+)?)\s*[–—-]\s*(\d+(?:\.\d+)?)\s*%/u);
    if (match) return { min: Number(match[1]), max: Number(match[2]) };
  }
  return null;
}
function deviationFromRange(value, range) {
  if (!Number.isFinite(Number(value)) || !range) return null;
  if (value < range.min) return range.min - value;
  if (value > range.max) return value - range.max;
  return 0;
}
function classifyDelayCost(extensionDays, remainingDays) {
  if (!Number.isFinite(Number(remainingDays)) || remainingDays <= 0) return "unknown";
  const share = positiveInteger(extensionDays, 14) / remainingDays;
  return share >= 0.15 ? "high" : share >= 0.07 ? "moderate" : "low";
}
function explain({ begin, evidenceConclusion, delayCost, valueOfInformation, deviation,
  stable, extensionDays }) {
  if (begin && evidenceConclusion === PHASE_READINESS_CONCLUSIONS.SUFFICIENTLY_RESOLVED) {
    return `The phase objective is not conclusively proven, and the Guardrail remains ${deviation === "slight" ? "slightly outside its exact range" : "under review"}. The remaining uncertainty is bounded enough to act because the evidence is ${stable ? "stable" : "monitorable"}, another ${extensionDays ?? 14} days has meaningful Goal cost, and the next strategy can be adjusted with close monitoring.`;
  }
  if (begin) return "The phase objective is sufficiently supported to begin the next planned phase with continued Guardrail monitoring.";
  if (valueOfInformation === "high") return "The remaining uncertainty is material enough that more evidence is worth the delay before changing strategy.";
  return `Continue the current phase because the evidence is not yet sufficiently resolved; the cost of delay is ${delayCost}.`;
}
function positiveInteger(value, fallback) { const n = Number(value); return Number.isInteger(n) && n > 0 ? n : fallback; }
function nullableInteger(value) { const n = Number(value); return Number.isInteger(n) ? n : null; }
function percentage(days, remaining) { const a = Number(days), b = Number(remaining); return b > 0 ? Math.round((a / b) * 1000) / 10 : null; }
function daysBetween(start, end) { if (!start || !end) return null; const n = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000); return Number.isFinite(n) ? n : null; }
function stable(value) { if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`; return JSON.stringify(value); }
function deepFreeze(value) { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(deepFreeze); return Object.freeze(value); }

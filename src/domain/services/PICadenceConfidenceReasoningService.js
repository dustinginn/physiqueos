import { createHash } from "node:crypto";

export function createPICadenceConfidenceReasoning({
  cadence,
  artifact,
  authoritative = null,
} = {}) {
  const narrative = cadence === "weekly"
    ? artifact?.briefing?.weeklyNarrative
    : artifact?.briefing;
  const domains = cadence === "weekly"
    ? narrative?.cards?.interpretation?.domains ?? []
    : [];
  const energy = domains.find((item) => item.domain === "estimated_energy");
  const trainingText = cadence === "weekly"
    ? domains.find((item) => item.domain === "training")?.insight
    : narrative?.training?.interpretation;
  const weightText = cadence === "weekly"
    ? domains.find((item) => item.domain === "weight")?.insight
    : narrative?.weightContext?.interpretation;
  const photoText = cadence === "weekly"
    ? domains.find((item) => item.domain === "photos")?.insight
    : null;
  const energyCoverage = cadence === "weekly"
    ? narrative?.cards?.progress?.activity?.completedDays ?? 0
    : narrative?.energyBalance?.coverage?.completeDays ??
      narrative?.energyBalance?.chartPoints?.filter((item) => item.complete).length ?? 0;
  const domainStates = {
    energy: {
      status: energyStatus(energy?.insight ?? narrative?.energyBalance?.interpretation),
      evidenceCompleteness: energyCoverage >= (cadence === "weekly" ? 7 : 3)
        ? "complete" : "partial",
    },
    training: { status: trainingStatus(trainingText) },
    weight: { status: weightStatus(weightText) },
    // Photo authority is consumed at the Photo Event boundary. Cadence may
    // narrate the same comparison, but must not award its confidence effect again.
    photos: { status: "missing", contextualStatus:
      photoText ? photoStatus(photoText) : "missing" },
    dexa: { status: "historical_baseline" },
  };
  const evidenceCompleteness = {
    overall: energyCoverage >= (cadence === "weekly" ? 7 : 3)
      ? "complete" : "partial",
  };
  const observations = authoritative?.observations ??
    narrative?.context?.pi?.observations ?? [];
  const claims = authoritative?.claims ?? authoritative?.rankedClaims ??
    narrative?.context?.pi?.claims ?? narrative?.context?.pi?.rankedClaims ?? [];
  const reasoning = {
    observationSemantics: observations.map((item) => item.id).filter(Boolean),
    claimSemantics: claims.map((item) => item.id).filter(Boolean),
    limitations: authoritative?.limitations ??
      narrative?.context?.pi?.limitations ?? [],
    contradictions: [],
    domainInterpretations: Object.entries(domainStates).map(([domain, state]) => ({
      domain, status: state.status,
    })),
  };
  const semantic = {
    cadence, occurrenceId: artifact?.id,
    evidenceWindowId: artifact?.evidenceWindow?.id,
    domainStates, evidenceCompleteness, reasoning,
  };
  return {
    domainStates,
    evidenceCompleteness,
    observations,
    claims,
    reasoning,
    piDecisionResultId: narrative?.context?.pi?.decisionId ?? null,
    piReasoningFingerprint:
      `sha256_${createHash("sha256").update(stable(semantic)).digest("hex")}`,
    publicationEligible: true,
    semanticChange: true,
    completenessImproved: evidenceCompleteness.overall === "complete",
  };
}

function energyStatus(value) {
  const text = String(value ?? "");
  if (/deficit|below maintenance|negative/i.test(text)) return "persistent_deficit";
  if (/surplus|above maintenance|positive/i.test(text)) return "large_surplus";
  if (/near maintenance|roughly at|close to maintenance/i.test(text)) return "near_maintenance";
  return "incomplete";
}
function trainingStatus(value) {
  const text = String(value ?? "");
  if (/regress|declin|breakdown/i.test(text)) return "regressing";
  if (/broad|multiple|across meaningful/i.test(text)) return "broad_constructive";
  if (/improv|constructive|progress|PR/i.test(text)) return "constructive";
  if (/stable|maintain/i.test(text)) return "stable";
  return "stagnating";
}
function weightStatus(value) {
  const text = String(value ?? "");
  if (/fall|lower|down|below/i.test(text)) return "falling";
  if (/volatile|mixed|noise/i.test(text)) return "volatile";
  if (/stable|flat|from where/i.test(text)) return "stable";
  if (/rising|higher|up/i.test(text)) return "rising";
  return "sparse";
}
function photoStatus(value) {
  const text = String(value ?? "");
  if (/soften/i.test(text)) return "softening";
  if (/improv|tighter/i.test(text)) return "improving";
  if (/stable|same|holding|maintain/i.test(text)) return "stable";
  return "inconclusive";
}
function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value ?? {}).sort().map((key) =>
    `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}

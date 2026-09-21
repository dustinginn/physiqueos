import { describeUncertaintyV3 } from "../intelligence/v3/AmbiguityVocabularyV3.js";

// Shared served-V3 projection.
//
// One pattern for every V3-bound briefing family: the stored V3 strategic and
// narrative authority is what is served. A read path never rebuilds a legacy
// narrative for a V3-bound artifact, and legacy V2 prose never overwrites V3
// interpretation. Frozen V2 artifacts (no V3 binding) keep their V2 path.

export const CANONICAL_NARRATIVE_V3_PRESENTATION = "canonical_narrative_v3";
export const BRIEFING_CONFIDENCE_BINDING_V3 = "briefing_confidence_binding_v3";

export function isV3BoundArtifact(artifact) {
  return artifact?.confidencePublication?.schemaVersion === BRIEFING_CONFIDENCE_BINDING_V3;
}

export function requireCanonicalNarrativeV3(artifact, surface = "briefing") {
  const narrative = artifact?.briefing?.narrativeV3;
  const required = [
    narrative?.summary,
    narrative?.sections?.result,
    narrative?.sections?.meaning,
    narrative?.sections?.action,
    narrative?.sections?.watch,
    narrative?.sections?.confidence,
    narrative?.coachTake,
  ];
  if (!narrative || required.some((value) => typeof value !== "string" || !value.trim())) {
    throw new Error(`A V3 ${surface} publication requires complete canonical Narrative V3.`);
  }
  return narrative;
}

// The hero every surface (detail and Home) shows for a V3-bound artifact.
export function projectV3Hero(narrativeV3) {
  return {
    headline: narrativeV3.summary,
    summary: narrativeV3.sections?.meaning ?? narrativeV3.sections?.result ?? narrativeV3.summary,
  };
}

export function projectV3CoachInsight(narrativeV3) {
  const sections = narrativeV3.sections ?? {};
  return {
    biggestWin: sections.result ?? narrativeV3.summary,
    keepBuilding: narrativeV3.coachTake ?? sections.action ?? null,
    watchNextWeek: sections.watch ?? null,
    actionItems: [sections.action, sections.watch].filter(Boolean),
  };
}

// Structured V3 additions stored beside the narrative so every surface serves
// them: Energy Strategy execution, the ambiguity findings with plain-language
// text, and explicit surfacing or suppression for every uncertainty.
export function buildCanonicalNarrativeV3Extensions({ strategicInterpretation, narrativePlan } = {}) {
  const vocabulary = narrativePlan?.vocabularyBindings ?? null;
  const surfacing = new Map((narrativePlan?.uncertaintyTypes ?? [])
    .map((item) => [item.uncertaintyId ?? `${item.type}`, item]));
  const uncertainty = (strategicInterpretation?.uncertaintyProfile ?? []).map((item) => {
    const state = surfacing.get(item.uncertaintyId) ?? {};
    return {
      uncertaintyId: item.uncertaintyId,
      type: item.type,
      domain: item.domain ?? null,
      materiality: item.materiality,
      reasons: [...item.reasons],
      text: describeUncertaintyV3(item, { vocabulary }),
      surfaced: state.surfaced === true,
      surfacedIn: state.surfacedIn ?? null,
      suppressionReason: state.surfaced === true ? null : state.suppressionReason ?? null,
      recommendationEffect: item.recommendationEffect ?? null,
    };
  });
  const execution = strategicInterpretation?.energyExecution ?? null;
  const energyUncertainty = uncertainty.filter((item) => item.domain === "energy");
  const hasEnergyEvidence = execution && (execution.estimate || execution.findings.length || energyUncertainty.length);
  const energy = hasEnergyEvidence ? {
    strategy: execution.energyStrategy,
    estimate: execution.estimate,
    findings: execution.findings.map((item) => ({ ...item })),
    ambiguity: energyUncertainty,
    statement: composeEnergyStatementV3({
      execution,
      ambiguityText: narrativePlan?.composition?.energyAmbiguity ?? null,
    }),
  } : null;
  return { uncertainty, energy };
}

// Factual, strategy-relative Energy statement derived only from the structured
// V3 Energy execution and ambiguity. It states what was observed against the
// current plan and what the estimate can and cannot support.
export function composeEnergyStatementV3({ execution, ambiguityText = null } = {}) {
  if (!execution) return null;
  const parts = [];
  const phrase = (finding, noun) => {
    const gap = Math.abs(Math.round(finding.deviation));
    const relation = finding.state === "on_plan" ? "in line with"
      : finding.state === "below_plan" ? `${gap.toLocaleString("en-US")} kcal/day below`
        : `${gap.toLocaleString("en-US")} kcal/day above`;
    return `${noun} averaged ${Math.round(finding.observedValue).toLocaleString("en-US")} kcal/day, ${relation} the ${finding.targetValue.toLocaleString("en-US")} kcal/day target.`;
  };
  for (const [dimension, noun] of [["intake", "Calorie intake"], ["activity", "Active calories"]]) {
    const finding = execution.findings.find((item) => item.dimension === dimension);
    if (finding) parts.push(phrase(finding, noun));
  }
  const estimate = execution.estimate;
  if (Number.isFinite(estimate?.averageKcalPerDay) && estimate.pairing?.pairedDayCount) {
    const value = Math.round(estimate.averageKcalPerDay);
    parts.push(`The energy estimate averaged ${value > 0 ? "+" : ""}${value.toLocaleString("en-US")} kcal/day across ${estimate.pairing.pairedDayCount} of ${estimate.pairing.eligibleDayCount} paired days.`);
  }
  if (ambiguityText) parts.push(ambiguityText);
  return parts.length ? parts.join(" ") : null;
}

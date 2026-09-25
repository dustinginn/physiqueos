import { describeUncertaintyV3 } from "../intelligence/v3/AmbiguityVocabularyV3.js";
import { describeEnergyVariabilityNudgeV3 } from "../intelligence/v3/EnergyVariabilityV3.js";
import { isSemanticallyEquivalent } from "../intelligence/v3/V3Runtime.js";

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
    variability: execution.variability ?? null,
    statement: composeEnergyStatementV3({
      execution,
      ambiguityText: narrativePlan?.composition?.energyAmbiguity ?? null,
    }),
  } : null;
  return { uncertainty, energy };
}

// Data-first Energy interpretation. `execution.findings` (per-dimension,
// target-relative) and `execution.estimate` (the paired-day balance
// estimate) are served as structured data alongside this statement — every
// surface already renders them as rows/metric tiles/a paired-day badge, not
// prose. This function's only job is to add, at most, one concise sentence
// of INCREMENTAL meaning the structured data cannot say on its own (a
// materially decision-relevant uncertainty/caveat); it must never
// prose-serialize a target-relative deviation or a paired-day average that a
// factual module already displays as data.
export function composeEnergyStatementV3({ execution, ambiguityText = null } = {}) {
  if (!execution) return null;
  const variabilityText = describeEnergyVariabilityNudgeV3(execution.variability);
  // The nudge says one thing once: if the ambiguity sentence already carries
  // the same meaning, the nudge is not repeated.
  const nudge = variabilityText && isSemanticallyEquivalent(ambiguityText, variabilityText)
    ? null : variabilityText;
  return [ambiguityText, nudge].filter(Boolean).join(" ") || null;
}

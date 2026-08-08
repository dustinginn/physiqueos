import { semanticHash, uniqueStrings } from "./interpretationRuntimeUtils";

const MATERIALITY = { critical: 4, high: 3, moderate: 2, low: 1 };
const ROLE = { primary: 4, supporting: 3, monitoring: 2, informational: 1 };

export function createRemainingInterpretationUncertainty({
  goalContract,
  objectiveEvaluation,
  guardrailEvaluation,
  strategyValidation,
  evidenceReconciliation,
  executionState,
  evidenceDescriptors = [],
  compatibility,
} = {}) {
  const items = [];
  for (const conclusion of objectiveEvaluation.conclusions) {
    if (conclusion.elapsedTimeAdequacy !== "adequate") {
      items.push(uncertainty("elapsed_time", conclusion.objectiveId,
        "objective_response_window_not_elapsed", [
          `objective:${conclusion.objectiveId}`,
        ], objectiveMapRefs(goalContract, conclusion.objectiveId), "moderate"));
    } else if (conclusion.status === "uncertain") {
      const semanticsMissing = conclusion.rationale.includes("missing") &&
        !conclusion.rationale.includes("measurement");
      const comparisonMissing = !semanticsMissing && evidenceDescriptors.some((item) =>
        conclusion.evidenceRefs.includes(item.id) &&
        item.quality?.comparisonAdequacy === "missing");
      items.push(uncertainty(
        semanticsMissing ? "goal_semantics_missing" : comparisonMissing
          ? "comparison_missing" : "measurement_pending",
        conclusion.objectiveId,
        conclusion.rationale,
        [`objective:${conclusion.objectiveId}`],
        semanticsMissing ? [] : objectiveMapRefs(goalContract, conclusion.objectiveId),
        "high"
      ));
    }
  }
  for (const conclusion of guardrailEvaluation.conclusions) {
    if (!conclusion.evaluable || ["watch", "pressured"].includes(conclusion.status)) {
      const semanticsMissing = conclusion.rationale.includes("missing") ||
        conclusion.rationale.includes("incomplete");
      items.push(uncertainty(
        semanticsMissing ? "goal_semantics_missing" : "unresolved_guardrail_risk",
        conclusion.guardrailId,
        conclusion.rationale,
        [`guardrail:${conclusion.guardrailId}`],
        semanticsMissing ? [] : guardrailMapRefs(goalContract, conclusion.guardrailId),
        conclusion.status === "pressured" ? "high" : "moderate"
      ));
    }
  }
  if (evidenceReconciliation.agreementStatus === "conflicting") {
    items.push(uncertainty("signal_conflict", "evidence_agreement",
      "material_evidence_conflicts", evidenceReconciliation.contradictions
        .map((item) => item.conclusionRef), evidenceReconciliation.contradictions
        .map((item) => item.evidenceMapRef).filter(Boolean),
      "high"));
  }
  if (["limited", "insufficient"].includes(evidenceReconciliation.quality.status)) {
    items.push(uncertainty("coverage_limited", "evidence_quality",
      `evidence_quality_${evidenceReconciliation.quality.status}`,
      [], evidenceReconciliation.quality.missingEvidenceMapRefs, "moderate"));
  }
  if ((executionState?.adequacy ?? "unknown") === "unknown") {
    items.push(uncertainty("execution_ambiguous", "strategy_execution",
      "execution_adequacy_unknown", [], [], "moderate"));
  }
  if (strategyValidation.status === "directionally_supported" &&
      objectiveEvaluation.conclusions.some((item) =>
        ["ahead", "on_track"].includes(item.status))) {
    items.push(uncertainty("attribution", "strategy_attribution",
      "objective_change_not_yet_attributable", strategyValidation.supportingConclusionRefs,
      hypothesisMapRefs(goalContract, strategyValidation.hypothesisRef), "moderate"));
  }
  for (const field of compatibility?.missingMetadata ?? []) {
    items.push(uncertainty("goal_semantics_missing", field,
      "compatibility_metadata_missing", [], [], "high"));
  }
  const deduped = [...new Map(items.map((item) => [item.id, item])).values()]
    .sort((left, right) =>
      MATERIALITY[right.materiality] - MATERIALITY[left.materiality] ||
      left.id.localeCompare(right.id));
  return {
    status: deduped.some((item) => ["critical", "high"].includes(item.materiality))
      ? "material" : deduped.length ? "bounded" : "none_material",
    items: deduped,
    summary: {
      state: deduped.length ? "uncertainty_remains" : "no_material_uncertainty_identified",
      primaryKind: deduped[0]?.kind ?? null,
      itemIds: deduped.map((item) => item.id),
    },
  };
}

export function selectNextDecisiveEvidence({
  goalContract,
  remainingUncertainty,
} = {}) {
  if (!remainingUncertainty.items.length) {
    return {
      status: "not_required",
      evidenceCapability: null,
      expectedEventType: null,
      expectedWindow: null,
      uncertaintyRefs: [],
      decisionBoundary: null,
      whyDecisive: "no_material_uncertainty",
    };
  }
  const maps = goalContract?.relevantEvidence?.entries ?? [];
  const candidates = remainingUncertainty.items.flatMap((item) =>
    item.candidateEvidenceMapRefs.map((ref) => ({
      uncertainty: item,
      mapping: maps.find((entry) => entry.evidenceMapId === ref),
    })).filter((item) => item.mapping));
  const selected = candidates.sort((left, right) =>
    MATERIALITY[right.uncertainty.materiality] -
      MATERIALITY[left.uncertainty.materiality] ||
    (ROLE[right.mapping.role] ?? 0) - (ROLE[left.mapping.role] ?? 0) ||
    left.mapping.evidenceMapId.localeCompare(right.mapping.evidenceMapId)
  )[0];
  if (!selected) {
    return {
      status: "unavailable",
      evidenceCapability: null,
      expectedEventType: null,
      expectedWindow: null,
      uncertaintyRefs: remainingUncertainty.items.map((item) => item.id),
      decisionBoundary: remainingUncertainty.items[0].question,
      whyDecisive: "no_mapped_decisive_evidence",
    };
  }
  return {
    status: "identified",
    evidenceCapability: selected.mapping.evidenceCapability,
    expectedEventType: selected.mapping.expectedEventType ??
      selected.mapping.expectedCadenceOrWindow?.eventType ?? null,
    expectedWindow: selected.mapping.expectedCadenceOrWindow?.window ??
      selected.mapping.expectedCadenceOrWindow ?? null,
    uncertaintyRefs: [selected.uncertainty.id],
    decisionBoundary: selected.uncertainty.affectedConclusionRefs[0] ??
      selected.uncertainty.question,
    whyDecisive: `resolves_${selected.uncertainty.kind}`,
  };
}

function uncertainty(kind, question, cause, affected, candidateRefs, materiality) {
  const semantic = { kind, question, cause, affected: uniqueStrings(affected) };
  return {
    id: `interpretation_uncertainty|${semanticHash(semantic)}`,
    kind,
    question,
    cause,
    affectedConclusionRefs: semantic.affected,
    reducibility: candidateRefs.length ? "reducible" : "unknown",
    materiality,
    candidateEvidenceMapRefs: uniqueStrings(candidateRefs),
    rationale: cause,
  };
}

function objectiveMapRefs(goal, id) {
  return mapRefs(goal, "objectiveRefs", id);
}
function guardrailMapRefs(goal, id) {
  return mapRefs(goal, "guardrailRefs", id);
}
function hypothesisMapRefs(goal, id) {
  return mapRefs(goal, "hypothesisRefs", id);
}
function mapRefs(goal, field, id) {
  return (goal?.relevantEvidence?.entries ?? [])
    .filter((item) => item.appliesTo?.[field]?.includes(id))
    .map((item) => item.evidenceMapId);
}

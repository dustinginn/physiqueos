import { validateForecastAssessment } from "../forecast/ForecastAssessmentModel";
import {
  adaptForecastAssessmentToNarrativeContext,
  FORECAST_NARRATIVE_ADAPTER_VERSION,
} from "./ForecastNarrativeCompatibilityAdapter";
import { createNarrativeAssessment } from "./NarrativeModel";
import {
  CoachingDirection,
  NarrativeTranslationStatus,
  NARRATIVE_ASSESSMENT_VERSION,
  NARRATIVE_ENGINE_VERSION,
  NARRATIVE_PRODUCTION_ENGINE_VERSION,
} from "./NarrativeRuntimeContract";
import {
  coachingText,
  factorText,
  forecastSummaryText,
  movementText,
  nextEvidenceText,
  uncertaintyText,
} from "./NarrativeTemplates";
import { semanticHash, uniqueStrings } from "./narrativeRuntimeUtils";

const INPUT_KEYS = new Set([
  "goalContract", "forecastAssessment", "numericMovementContext",
]);

export function createNarrativeEngine({
  forecastAdapter = adaptForecastAssessmentToNarrativeContext,
  runtimeMode = "shadow",
} = {}) {
  if (!["shadow", "production"].includes(runtimeMode)) {
    throw new Error("Narrative runtime mode is invalid.");
  }
  const engineVersion = runtimeMode === "production"
    ? NARRATIVE_PRODUCTION_ENGINE_VERSION
    : NARRATIVE_ENGINE_VERSION;
  return Object.freeze({
    explain(input = {}) {
      const normalized = normalizeInput(input, forecastAdapter);
      const context = normalized.forecastContext;
      const supportingFactors = translateFactors(
        context.forecastExplanation.primarySupportingFactors);
      const limitingFactors = translateFactors(
        context.forecastExplanation.primaryLimitingFactors);
      const uncertainty = translateUncertainty(
        context.remainingUncertainty, context.objectiveForecasts,
        context.guardrailForecasts);
      const nextEvidence = translateNextEvidence(context.nextDecisiveEvidence);
      const coachingDirection = selectCoachingDirection({
        forecastContext: context,
        limitingFactors,
      });
      const confidenceExplanation = createConfidenceExplanation({
        forecastContext: context,
        supportingFactors,
        limitingFactors,
      });
      const inputFingerprint = `sha256_${semanticHash({
        goalContext: normalized.goalContext,
        forecastRef: context.forecastRef,
        forecastFingerprint: context.sourceFingerprint,
        numericMovementContext: normalized.numericMovementContext,
        engineVersion,
      })}`;
      return createNarrativeAssessment({
        contractVersion: NARRATIVE_ASSESSMENT_VERSION,
        goalRef: context.goalRef,
        forecastRef: context.forecastRef,
        generatedAt: context.assessmentContext.assessedAt,
        goalContext: normalized.goalContext,
        forecastSummary: {
          goalForecastStatus: context.goalForecastStatus,
          forecastDirection: context.forecastDirection,
          confidenceBand: context.confidenceBand,
          text: createForecastSummaryText(context) ??
            forecastSummaryText(context.goalForecastStatus),
          sourceCode: `goal_${context.goalForecastStatus}`,
        },
        confidenceExplanation,
        primarySupportingFactors: supportingFactors,
        primaryLimitingFactors: limitingFactors,
        remainingUncertaintyExplanation: uncertainty,
        nextDecisiveEvidenceExplanation: nextEvidence,
        recommendedCoachingDirection: coachingDirection,
        provenance: {
          engineVersion,
          adapterVersion: FORECAST_NARRATIVE_ADAPTER_VERSION,
          shadowOnly: runtimeMode === "shadow",
          forecastFingerprint: context.sourceFingerprint ??
            `sha256_${semanticHash(context)}`,
          inputFingerprint,
        },
      });
    },
  });
}

export const NarrativeEngine = createNarrativeEngine();

function normalizeInput(input, forecastAdapter) {
  const unexpected = Object.keys(input).filter((key) => !INPUT_KEYS.has(key));
  if (unexpected.length) {
    throw new Error(`Narrative accepts no input field: ${unexpected.sort()[0]}.`);
  }
  const forecastAssessment = structuredClone(input.forecastAssessment ?? {});
  validateForecastAssessment(forecastAssessment);
  const goalContext = normalizeGoalContract(input.goalContract);
  if (goalContext.goalId !== forecastAssessment.goalRef.goalId ||
      goalContext.goalContractVersion !==
        forecastAssessment.goalRef.goalContractVersion ||
      goalContext.goalContractId !== forecastAssessment.goalRef.goalContractId) {
    throw new Error("Narrative Goal Contract and Forecast identity mismatch.");
  }
  const adapted = forecastAdapter(forecastAssessment);
  const numericMovementContext = normalizeNumericMovementContext(
    input.numericMovementContext);
  const forecastContext = numericMovementContext &&
    numericMovementContext.movement !== adapted.movement.direction
    ? {
      ...adapted,
      movement: {
        ...adapted.movement,
        direction: numericMovementContext.movement,
        rationale: numericMovementContext.rationale,
        reasonCode: numericMovementContext.rationale,
        kind: "bounded_numeric_hold",
      },
    }
    : adapted;
  return {
    goalContext,
    forecastContext,
    numericMovementContext,
  };
}

function normalizeNumericMovementContext(value) {
  if (!value) return null;
  const movement = ["increase", "decrease", "no_meaningful_change"]
    .includes(value.movement) ? value.movement : null;
  if (!movement) return null;
  return {
    movement,
    rationale: value.rationale ?? "numeric_movement_context",
    movementAudit: structuredClone(value.movementAudit ?? {}),
  };
}

function normalizeGoalContract(value = {}) {
  if (!value.contractVersion || !value.goal?.goalId) {
    throw new Error("Narrative requires a versioned Goal Contract.");
  }
  return {
    goalId: value.goal.goalId,
    goalContractVersion: value.contractVersion,
    goalContractId: value.contractId ?? null,
    goalVersion: value.goal.goalVersion ?? null,
    category: value.goal.category ?? "unknown",
    semanticPurpose: value.goal.semanticPurpose ?? null,
  };
}

function translateFactors(codes = []) {
  return uniqueStrings(codes).map((code) => {
    const text = factorText(code);
    return {
      code,
      text,
      translationStatus: text
        ? NarrativeTranslationStatus.TRANSLATED
        : NarrativeTranslationStatus.UNKNOWN,
    };
  });
}

function translateUncertainty(value = {}, objectiveForecasts = [], guardrailForecasts = []) {
  const leanTissueObjective = objectiveForecasts.some((item) =>
    item.observedResult?.metric === "lean_mass_change_lb");
  const fatGainGuardrail = guardrailForecasts.some((item) =>
    item.observedResult?.metric === "fat_mass_change_lb");
  const items = (value.items ?? []).map((item) => {
    const text = item.kind === "unresolved_guardrail_risk" && fatGainGuardrail
      ? "The current body-fat range remains intact, but another month at this fat-gain pace could shorten the uninterrupted muscle-building window."
      : item.kind === "attribution" && leanTissueObjective
      ? "One comparison cannot establish how much measured lean-tissue change is durable muscle rather than hydration, glycogen, food mass, or preparation variation."
      : uncertaintyText(item.kind);
    return {
      sourceUncertaintyId: item.id,
      kind: item.kind,
      materiality: item.materiality,
      reducibility: item.reducibility,
      affectedConclusionRefs: uniqueStrings(item.affectedConclusionRefs),
      text,
      translationStatus: text
        ? NarrativeTranslationStatus.TRANSLATED
        : NarrativeTranslationStatus.UNKNOWN,
    };
  });
  return {
    status: value.status ?? "unknown",
    text: items.length
      ? "Material uncertainty remains and is described below."
      : value.status === "none_material"
        ? "No material uncertainty remains."
        : null,
    items,
    sourceUncertaintyIds: uniqueStrings(items.map((item) =>
      item.sourceUncertaintyId)),
  };
}

function translateNextEvidence(value = {}) {
  return {
    status: value.status ?? "unknown",
    evidenceCapability: value.evidenceCapability ?? null,
    expectedEventType: value.expectedEventType ?? null,
    expectedWindow: structuredClone(value.expectedWindow ?? null),
    decisionBoundary: value.decisionBoundary ?? null,
    uncertaintyRefs: uniqueStrings(value.uncertaintyRefs),
    sourceReasonCode: value.whyDecisive ?? "unknown",
    text: nextEvidenceText(value),
  };
}

function createConfidenceExplanation({ forecastContext, supportingFactors,
  limitingFactors }) {
  const movement = forecastContext.movement;
  const reductionCandidates = movement.direction === "increase"
    ? supportingFactors.filter((item) =>
      item.code === "agreement_strong_convergence" ||
      item.code === "quality_robust" ||
      item.code.startsWith("milestone_supported:"))
    : [];
  const specificText = createDurabilityConfidenceText(forecastContext) ??
    createSpecificConfidenceText(forecastContext) ??
    createEvidenceAwareHeldText({
      forecastContext, supportingFactors, limitingFactors,
    });
  return {
    confidenceBand: forecastContext.confidenceBand,
    movement: movement.direction,
    text: specificText ?? movementText(movement.direction),
    movementRationaleCode: movement.rationale,
    confidenceBandRationaleCode:
      forecastContext.forecastExplanation.confidenceBandRationale,
    uncertaintyReduction: {
      status: reductionCandidates.length
        ? "forecast_identified_reduction_factors"
        : "not_identified_by_forecast",
      factorCodes: reductionCandidates.map((item) => item.code),
    },
    remainingUncertaintyStatus:
      forecastContext.remainingUncertainty.status ?? "unknown",
  };
}

function createDurabilityConfidenceText(context) {
  const movement = context.movement ?? {};
  const capability = capabilityText(movement.triggeringCapabilities?.[0]);
  if (["proxy_support_repeated_increase",
    "proxy_support_sustained_increase"].includes(movement.reasonCode)) {
    return `Confidence increased slightly because ${capability} support persisted across completed evidence periods and the current strategy is more consistently supported. Direct Goal confirmation remains pending.`;
  }
  if (movement.reasonCode === "uncertainty_reduced_increase") {
    return "Confidence increased slightly because a named material uncertainty was reduced while the current strategy remained supported. Direct Goal confirmation remains pending.";
  }
  if (movement.reasonCode === "proxy_support_emerging_hold") {
    return `Confidence remained stable because the ${capability} signal is still preliminary within the current evidence period, while direct Goal confirmation remains unresolved.`;
  }
  if (movement.reasonCode === "material_contradiction_blocks_increase") {
    return "Confidence did not increase because material contradicting evidence outweighs the supporting proxy signal.";
  }
  if (movement.reasonCode === "same_period_revision_no_new_durability") {
    return "Confidence remained stable because the revised evidence strengthens the same period without adding another temporal confirmation.";
  }
  if (movement.reasonCode === "duplicate_evidence_no_change") {
    return "Confidence remained stable because the same semantic evidence was evaluated again without a new evidence period.";
  }
  if (movement.reasonCode === "bounded_target_prevented_increase") {
    return "Confidence remained stable because the supporting semantic transition did not justify movement beyond the current bounded target.";
  }
  return null;
}

function capabilityText(value) {
  return ({
    training_progression: "Training progression",
    progress_photos: "visual trajectory",
    energy_availability: "Energy",
    recovery_capacity: "Recovery",
    body_weight_trend: "body-weight trajectory",
  })[value] ?? "supporting evidence";
}

function createEvidenceAwareHeldText({ forecastContext, supportingFactors,
  limitingFactors }) {
  if (forecastContext.movement?.direction !== "no_meaningful_change") return null;
  const support = supportingFactors.filter((item) =>
    ["strategy_directionally_supported", "quality_adequate"]
      .includes(item.code) && item.text);
  if (!support.length) return null;
  const primaryLimit = limitingFactors.find((item) =>
    item.code === "objective_uncertain" && item.text) ??
    limitingFactors.find((item) => item.text);
  const unresolved = forecastContext.remainingUncertainty?.status === "material"
    ? "Material questions remain unresolved."
    : null;
  return ["Confidence remained stable.", ...support.map((item) => item.text),
    primaryLimit?.text, unresolved].filter(Boolean).join(" ");
}

function createForecastSummaryText(context) {
  const objective = context.objectiveForecasts.find((item) =>
    item.observedResult?.metric === "lean_mass_change_lb");
  const bodyFat = context.guardrailForecasts.find((item) =>
    item.observedResult?.metric === "body_fat_pct");
  const fatGain = context.guardrailForecasts.find((item) =>
    item.observedResult?.metric === "fat_mass_change_lb");
  if (!objective || !bodyFat || !fatGain) return null;
  return `${leanTissueSentence(objective)} ${bodyFatSentence(bodyFat)} ${fatGainSentence(fatGain)}`;
}

function createSpecificConfidenceText(context) {
  const summary = createForecastSummaryText(context);
  if (!summary) return null;
  if (context.movement?.direction === "increase" &&
      context.nextDecisiveEvidence?.expectedEventType === "dexa_scan") {
    return "Confidence improved because this first check shows the plan is moving in the right direction without pushing body fat out of range. The next consistently prepared DEXA will show whether this progress is repeatable and raise confidence further.";
  }
  const movement = context.movement?.direction === "decrease"
    ? "Confidence decreased because the measured result and current constraints weakened the outlook."
    : "Confidence held because the measured result did not justify a material change.";
  return context.remainingUncertainty?.status === "none_material"
    ? movement
    : `${movement} Another decisive comparison is still needed.`;
}

function leanTissueSentence(value) {
  const change = Number(value.observedResult.value);
  const direction = change > 0 ? "increased" : change < 0 ? "decreased" : "held";
  const amount = `${Math.abs(change).toFixed(1)} ${value.observedResult.unit ?? "lb"}`;
  const trajectory = value.interpretationStatus === "ahead"
    ? "ahead of the expected early range"
    : value.interpretationStatus === "on_track"
      ? "within the expected early range" : "outside the expected early range";
  return `Measured lean tissue ${direction} ${amount}, ${trajectory}.`;
}

function bodyFatSentence(value) {
  const measurement = Number(value.observedResult.value).toFixed(1);
  const state = value.interpretationStatus === "clear"
    ? "within the accepted range"
    : "outside the clear range";
  return `Body fat measured ${measurement}%, ${state}.`;
}

function fatGainSentence(value) {
  const change = Number(value.observedResult.value);
  const direction = change > 0 ? "increased" : change < 0 ? "decreased" : "held";
  const monitoring = value.interpretationStatus === "watch"
    ? " so the pace of gain needs closer monitoring" : "";
  return `Fat mass ${direction} ${Math.abs(change).toFixed(1)} ${value.observedResult.unit ?? "lb"}${monitoring ? `,${monitoring}` : ""}.`;
}

function selectCoachingDirection({ forecastContext, limitingFactors }) {
  let state = CoachingDirection.STAY_THE_COURSE;
  if (forecastContext.goalForecastStatus === "forecast_unlikely") {
    state = CoachingDirection.STRATEGY_REVIEW_RECOMMENDED;
  } else if (forecastContext.goalForecastStatus === "forecast_at_risk") {
    state = CoachingDirection.PREPARE_ADJUSTMENT;
  } else if (forecastContext.goalForecastStatus === "forecast_uncertain") {
    state = CoachingDirection.CONTINUE_CALIBRATION;
  } else if (limitingFactors.length || forecastContext.guardrailForecasts
    .some((item) => item.forecastState === "uncertain")) {
    state = CoachingDirection.MONITOR_CLOSELY;
  }
  return {
    state,
    text: coachingText(state),
    rationaleCodes: uniqueStrings([
      `goal_${forecastContext.goalForecastStatus}`,
      ...limitingFactors.map((item) => item.code),
      ...forecastContext.guardrailForecasts.map((item) =>
        `guardrail_forecast_${item.forecastState}`),
    ]),
  };
}

import {
  createCanonicalConfidenceReadService,
} from "../confidence/CanonicalConfidenceReadService";
import { assertCanonicalConfidencePresentation } from "./CanonicalConfidencePresentationInvariant";
import { resolveCommittedPhaseContext } from "./FounderPhaseCorrectionService";
import { buildConfidenceExplanationDetail } from "../presentation/confidenceExplanationPresentation";

export const ACTIVE_GOAL_CONFIDENCE_PRESENTATION_VERSION =
  "active_goal_confidence_presentation_v2";

export function resolveActiveGoalConfidencePresentation({
  activeGoal,
  activePhase = null,
  store,
} = {}) {
  activePhase ??= activeGoal ? resolveCommittedPhaseContext(activeGoal).activePhase : null;
  if (!activeGoal?.id || !activePhase?.id) {
    return unavailable(activeGoal, activePhase, "active_goal_or_phase_unavailable");
  }
  const canonical = createCanonicalConfidenceReadService({ store }).getCurrentUserFacing({
    goalId: activeGoal.id,
    phaseId: activePhase.id,
  });
  if (!canonical.assessment) {
    return unavailable(activeGoal, activePhase, canonical.reason);
  }
  const assessment = canonical.assessment;
  const v1Compatibility = assessment.compatibility?.incomplete === true;
  const operatingState = activeGoal?.openingApproach?.value ??
    activeGoal?.operatingState?.value ?? activeGoal?.operatingState ?? null;
  if (v1Compatibility && (assessment.operatingState !== operatingState ||
      canonical.snapshot?.operatingState !== operatingState)) {
    return unavailable(activeGoal, activePhase, "canonical_boundary_mismatch");
  }
  const presentationMovement = ({ increase: "increased", decrease: "decreased",
    no_meaningful_change: "held" })[assessment.movement] ?? assessment.movement;
  const presentation = {
    status: v1Compatibility ? "canonical" : canonical.status,
    source: v1Compatibility ? "canonical_pi_snapshot" : canonical.source,
    canonicalSeries: true,
    compatibilityIncomplete: v1Compatibility,
    value: assessment.currentPercentage,
    score: assessment.currentPercentage,
    numericValue: assessment.currentPercentage,
    percentageLabel: `${assessment.currentPercentage}%`,
    band: assessment.confidenceBand,
    label: title(assessment.confidenceBand),
    assessmentId: assessment.id,
    snapshotId: canonical.snapshot?.id ?? null,
    goalId: assessment.goalId,
    phaseId: assessment.phaseId,
    // True whenever the displayed Confidence was published in a different phase than the
    // goal's current active phase (i.e., the active phase hasn't had its own briefing yet, so
    // the goal's latest briefing-published value carries forward from a prior phase).
    fromPriorPhase: assessment.phaseId !== activePhase.id,
    operatingState,
    movement: presentationMovement,
    movementDirection: presentationMovement,
    movementMagnitude: assessment.movementMagnitude,
    delta: assessment.priorPercentage == null ? null :
      assessment.currentPercentage - assessment.priorPercentage,
    priorScore: assessment.priorPercentage,
    primaryReason: assessment.narrativeExplanation?.text ?? null,
    explanation: assessment.narrativeExplanation?.text ?? null,
    supportingContributors: [],
    limitingContributors: [],
    unresolvedUncertainty: assessment.remainingUncertainty?.items ?? [],
    explanationDetail: buildConfidenceExplanationDetail({
      qualitativeLevel: title(assessment.confidenceBand),
      narrativeText: assessment.narrativeExplanation?.text ?? "",
      movement: assessment.movement,
      uncertaintyReduction: assessment.narrativeExplanation?.uncertaintyReduction ?? null,
      remainingUncertaintyItems: assessment.remainingUncertainty?.items ?? [],
      nextConfidenceBuildingEvidence: assessment.nextConfidenceBuildingEvidence ?? null,
    }),
    evidenceCutoff: assessment.sourceCutoff,
    assessmentTimestamp: assessment.publicationTimestamp,
    publicationTimestamp: assessment.publicationTimestamp,
    originatingPublisher: assessment.publisherType,
    originatingArtifactId: assessment.briefingArtifactId,
    goalContractId: assessment.goalContract?.id ?? null,
    goalContractVersion: assessment.goalContract?.version ?? null,
    modelVersion: assessment.schemaVersion,
    piVersion: v1Compatibility ? "pi_v1_compatibility" : "confidence_v2",
    fallbackReason: null,
    provenance: assessment.reproducibility ?? assessment.compatibility ?? null,
  };
  assertCanonicalConfidencePresentation(presentation);
  return Object.freeze(presentation);
}

function unavailable(goal, phase, reason) {
  return Object.freeze({
    status: "unavailable", source: "canonical_confidence_unavailable",
    canonicalSeries: false, compatibilityIncomplete: false,
    value: null, score: null, numericValue: null, percentageLabel: null,
    band: null, label: "Unavailable", assessmentId: null, snapshotId: null,
    goalId: goal?.id ?? null, phaseId: phase?.id ?? null, fromPriorPhase: false,
    operatingState: goal?.openingApproach?.value ?? null,
    movement: null, movementDirection: null, movementMagnitude: null,
    delta: null, priorScore: null, primaryReason: null, explanation: null,
    supportingContributors: [], limitingContributors: [],
    unresolvedUncertainty: [], explanationDetail: null, evidenceCutoff: null,
    assessmentTimestamp: null, publicationTimestamp: null,
    originatingPublisher: null, originatingArtifactId: null,
    goalContractId: null, goalContractVersion: null,
    modelVersion: null, piVersion: null, fallbackReason: reason,
    provenance: null,
  });
}
function title(value) {
  return String(value ?? "unknown").replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

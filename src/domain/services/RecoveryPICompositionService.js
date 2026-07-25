import { assessRecoveryEvidence } from "./RecoveryEvidenceAssessmentService";
import { createRecoveryPIObservations } from "./RecoveryPIObservationService";
import { createRecoveryTrainingClaims } from "./RecoveryTrainingClaimService";
import { createRecoveryEnergyClaims } from "./RecoveryEnergyClaimService";
import { applyPIGoalContextToObservations } from "./PIObservationGoalContextService";
import { evaluatePIClaimSetLifecycle } from "./PIClaimLifecycleService";
import {
  createPIClaimNarrativeCandidate,
  createPIRecoveryNarrativeCandidate,
  evaluatePINarrativeCandidateLifecycle,
} from "./PINarrativeCandidateService";
import { assessPISemanticOverlap } from "./PISemanticOverlapService";

export const RECOVERY_PI_COMPOSITION_VERSION = "recovery_pi_composition_v1";

export function createRecoveryPIComposition(input = {}) {
  const before = structuredClone(input);
  const cadence = input.cadence;
  const assessment = assessRecoveryEvidence({
    records: input.records ?? [],
    cadence,
    currentWindow: input.evidenceWindow,
    comparisonWindow: input.comparisonWindow ?? null,
    timezone: input.timezone,
    expectedDates: input.expectedDates,
  });
  const rawRecovery = createRecoveryPIObservations({
    assessment,
    includeInsufficientData: true,
    semanticHorizon: cadence,
  });
  const recoveryObservations = input.goalContext
    ? applyPIGoalContextToObservations(rawRecovery, input.goalContext)
    : rawRecovery;
  const trainingClaims = createRecoveryTrainingClaims({
    recoveryAssessment: assessment,
    recoveryObservations,
    trainingObservations: input.trainingObservations ?? [],
    cadence,
  });
  const energyClaims = createRecoveryEnergyClaims({
    recoveryAssessment: assessment,
    recoveryObservations,
    energyObservations: input.energyObservations ?? [],
    cadence,
  });
  const claims = [...trainingClaims, ...energyClaims].sort((a, b) => a.id.localeCompare(b.id));
  const lifecycleResult = evaluatePIClaimSetLifecycle(
    claims,
    input.priorClaims ?? [],
    {
      evaluationDate: input.evaluationDate,
      evaluationCoverage: assessment.completeness === "complete" ? "complete" : "partial",
    }
  );
  const claimCandidates = lifecycleResult.currentClaims.map((claim) =>
    createPIClaimNarrativeCandidate({ claim })
  );
  const directObservation = recoveryObservations.find(
    (item) => item.kind === "recovery_state" &&
      ["improving", "regressing"].includes(item.status)
  ) ?? recoveryObservations.find(
    (item) => item.kind === "recovery_insufficient_evidence"
  );
  const directCandidate = directObservation
    ? createPIRecoveryNarrativeCandidate({ observation: directObservation })
    : null;
  const priorCandidates = new Map((input.priorCandidates ?? []).map(
    (candidate) => [candidate.id, candidate]
  ));
  const candidates = [...claimCandidates, ...(directCandidate ? [directCandidate] : [])]
    .map((candidate) => evaluatePINarrativeCandidateLifecycle(
      candidate, priorCandidates.get(candidate.id) ?? null,
      { evaluationDate: input.evaluationDate }
    ));
  const competing = input.competingCandidates ?? [];
  const readiness = readinessMatrix({
    assessment, claims: lifecycleResult.currentClaims,
    candidates, competing, cadence,
    renderingCompatible: input.renderingCompatible !== false,
    memoryCompatible: input.memoryCompatible !== false,
  });
  const result = {
    schemaVersion: RECOVERY_PI_COMPOSITION_VERSION,
    cadence,
    assessment,
    observations: recoveryObservations,
    claims,
    lifecycleResult,
    candidates,
    readiness,
    authorityReadyCandidates: candidates.filter((candidate) =>
      readiness.byCandidateId[candidate.id]?.authorityReady
    ),
    diagnostics: candidates.map((candidate) => ({
      candidateId: candidate.id,
      confidence: candidate.confidence.level,
      lifecycle: candidate.lifecycle.state,
      rankEligible: readiness.byCandidateId[candidate.id]?.thresholdReady ?? false,
      overlap: readiness.byCandidateId[candidate.id]?.overlap ?? { state: "none" },
      potentialPosition: readiness.byCandidateId[candidate.id]?.authorityReady
        ? "supporting" : "suppressed",
      suppressionReasons: readiness.byCandidateId[candidate.id]?.reasons ?? [],
      renderingSupport: input.renderingCompatible !== false,
      memoryCompatible: input.memoryCompatible !== false,
    })),
    provenance: {
      producer: "recovery_pi_composition_service",
      producerVersion: RECOVERY_PI_COMPOSITION_VERSION,
      repositoryReads: 0,
      runtimeClockReads: 0,
    },
  };
  if (JSON.stringify(input) !== JSON.stringify(before)) {
    throw new Error("Recovery PI composition input mutation detected.");
  }
  return result;
}

function readinessMatrix({
  assessment, claims, candidates, competing, cadence,
  renderingCompatible, memoryCompatible,
}) {
  const thresholdReady = assessment.status === "assessed" &&
    !["insufficient", "unknown", "mixed"].includes(assessment.compositeState) &&
    assessment.conflictState !== "conflict" &&
    assessment.freshness === "current";
  const byCandidateId = {};
  candidates.forEach((candidate) => {
    const claim = claims.find((item) => item.id === candidate.sourceId);
    const insufficient = claim?.explanationData?.relationshipState?.endsWith("_insufficient") ||
      candidate.status === "insufficient_data";
    const overlaps = competing.map((entry) =>
      assessPISemanticOverlap(entry.candidate ?? entry, candidate)
    );
    const blocking = overlaps.find((entry) =>
      ["redundant", "higher_authority_owned"].includes(entry.state)
    ) ?? null;
    const reasons = [
      ...(!thresholdReady ? ["recovery_threshold_not_ready"] : []),
      ...(insufficient ? ["relationship_evidence_insufficient"] : []),
      ...(!renderingCompatible ? ["rendering_incompatible"] : []),
      ...(!memoryCompatible ? ["memory_incompatible"] : []),
      ...(blocking ? ["semantic_overlap_or_higher_authority"] : []),
    ];
    byCandidateId[candidate.id] = {
      cadence,
      thresholdReady,
      authorityReady: reasons.length === 0,
      overlap: blocking ?? { state: "none", reasons: [] },
      reasons,
    };
  });
  return {
    thresholdReady,
    evidenceCoverage: assessment.completeness,
    conflict: assessment.conflictState,
    byCandidateId,
  };
}

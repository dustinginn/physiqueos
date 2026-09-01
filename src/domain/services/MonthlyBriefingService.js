import {
  createCanonicalBriefingConfidencePublicationService,
  resolveStableConfidenceReplacementPredecessor,
} from "./CanonicalBriefingConfidencePublicationService";
import { createBriefingForecastFinalizer } from "../confidence/BriefingForecastFinalizer";
import { createCanonicalConfidenceReadService } from "../confidence/CanonicalConfidenceReadService";
import { createCadenceEvidenceDurabilityContext } from
  "../confidence/CadenceEvidenceDurabilityContextService";
import {
  adaptBriefingArtifactToEvidenceDescriptors,
  adaptProductionGoalToCanonicalContract,
  assertCanonicalEvidenceDescriptorCoverage,
} from "../confidence/ProductionConfidenceContextAdapter";
import { createBriefingGoalConfidenceBlockFromV2 } from
  "./BriefingGoalConfidencePresentationService";
import { createMonthlyEvidenceWindow } from "./BriefingEvidenceWindowService";
import {
  createMonthlyBriefingPreviewService,
} from "./MonthlyBriefingPreviewService";
import {
  composeMonthlyBriefingPresentation,
} from "./MonthlyBriefingPresentationService";
import { resolveCommittedPhaseContext } from "./FounderPhaseCorrectionService";
import { attachBriefingDependencyManifest } from
  "./BriefingDependencyManifestService";
import { createCadencePIEvidenceEnvelope } from
  "./CadencePIEvidenceEnvelopeService";

export const MONTHLY_BRIEFING_VERSION = "monthly_briefing_v1";
export const MONTHLY_ARTIFACT_ID_VERSION = "monthly_artifact_id_v1";

export function getMonthlyArtifactId({ userId, window }) {
  const owner = String(userId).replace(/[^a-z0-9_-]/gi, "_");
  const month = String(window?.briefingMonth ?? window?.startDate ?? "")
    .slice(0, 7)
    .replace("-", "");
  return `monthly_briefing_${owner}_${month}`;
}

export function createFounderMonthlyBriefingService({
  repositories,
  now = () => new Date(),
  publicationService = createCanonicalBriefingConfidencePublicationService({ now }),
} = {}) {
  return createMonthlyBriefingService({ repositories, now, publicationService });
}

export function createMonthlyBriefingService({
  repositories,
  now = () => new Date(),
  publicationService,
  occurrencePreparer = prepareMonthlyOccurrence,
  occurrencePublisher = publishMonthlyOccurrence,
} = {}) {
  if (!repositories) throw new Error("Monthly repositories are required.");
  if (!publicationService) throw new Error("Monthly publication service is required.");

  const service = {
    async generateForCurrentWindow({ userId = null, asOf = now() } = {}) {
      const user = userId
        ? await repositories.users.getUserById(userId)
        : await repositories.users.getCurrentUser();
      const resolvedUserId = user?.id ?? userId ?? null;
      if (!resolvedUserId) {
        return { state: "not_eligible", reason: "user_not_found" };
      }
      const timeZone = user?.timeZone ?? "America/Los_Angeles";
      if (!isMonthlyEligible(asOf, timeZone)) {
        return { state: "not_eligible", reason: "before_monthly_eligibility" };
      }
      const window = createMonthlyEvidenceWindow({ now: asOf, timeZone });
      if (!window.closed) {
        return { state: "not_eligible", reason: "monthly_window_not_closed" };
      }
      const existing = await repositories.dailyBriefings
        .getBriefingByEvidenceWindow(resolvedUserId, window.id);
      if (isCompletedMonthly(existing)) {
        return { state: "completed", artifact: existing, idempotent: true };
      }
      const prepared = await occurrencePreparer({
        repositories, publicationService, userId: resolvedUserId, timeZone,
        window, artifactId: getMonthlyArtifactId({ userId: resolvedUserId, window }),
        generatedAt: asOf.toISOString(), existing: null,
      });
      try {
        return await occurrencePublisher({
          prepared, publicationService, now, operation: "create",
          reason: "scheduled_monthly_cadence",
        });
      } catch (error) {
        if (error?.code === "baseline_conflict") {
          const concurrent = await repositories.dailyBriefings
            .getBriefingByEvidenceWindow(resolvedUserId, window.id);
          if (isCompletedMonthly(concurrent)) {
            return { state: "completed", artifact: concurrent, idempotent: true };
          }
        }
        throw error;
      }
    },
    async prepareRegeneration({
      userId, reason, targetArtifactId, reconciliationContext = null,
    } = {}) {
      if (!reason) throw new Error("Monthly regeneration requires an explicit reason.");
      if (!targetArtifactId) {
        throw new Error("Monthly regeneration requires an exact target artifact ID.");
      }
      const user = userId
        ? await repositories.users.getUserById(userId)
        : await repositories.users.getCurrentUser();
      const resolvedUserId = user?.id ?? userId;
      const existing = (await repositories.dailyBriefings
        .listDailyBriefings(resolvedUserId))
        .find((item) => item.id === targetArtifactId);
      if (!isCompletedMonthly(existing)) {
        throw new Error("Monthly regeneration target was not found.");
      }
      const prepared = await occurrencePreparer({
        repositories, publicationService, userId: resolvedUserId,
        timeZone: existing.timeZone ?? user?.timeZone ?? "America/Los_Angeles",
        window: existing.evidenceWindow, artifactId: existing.id,
        generatedAt: now().toISOString(), existing,
      });
      prepared.artifact.publicationReconciliation = {
        ...(prepared.artifact.publicationReconciliation ?? {}),
        state: "current_after_revision",
        replacementReason: reason,
      };
      prepared.artifact.revisionProvenance = {
        schemaVersion: "briefing_revision_provenance_v1",
        priorPublicationId: existing.id,
        priorPublicationVersion: existing.briefing?.version ?? existing.version ?? null,
        replacementTimestamp: prepared.artifact.generatedAt,
        reason,
        triggeringDependencies: structuredClone(
          reconciliationContext?.affectedDependencies ?? []
        ),
        workItemId: reconciliationContext?.workItemId ?? null,
        inputFingerprint: reconciliationContext?.inputFingerprint ?? null,
      };
      return { status: "prepared", prepared, artifact: prepared.artifact,
        existing, reason };
    },
    async executePreparedRegeneration({ prepared } = {}) {
      if (prepared?.status === "matched") {
        return { status: "matched", committed: false, artifact: prepared.artifact };
      }
      const result = await occurrencePublisher({
        prepared: prepared?.prepared ?? prepared,
        publicationService,
        now,
        operation: "regenerate",
        reason: prepared?.reason ?? "manual_regeneration",
      });
      if (result.state === "completed") {
        return {
          status: result.idempotent ? "matched" : "regenerated",
          committed: !result.idempotent,
          artifact: result.artifact,
        };
      }
      return result;
    },
    async prepareConfidenceCorrection({
      userId, reason, targetArtifactId,
    } = {}) {
      const prepared = await service.prepareRegeneration({
        userId, reason, targetArtifactId,
      });
      const confidencePrepared = {
        ...prepared.prepared,
        artifact: structuredClone(prepared.existing),
      };
      const correctionPrepared = {
        ...prepared,
        artifact: confidencePrepared.artifact,
        prepared: confidencePrepared,
      };
      const recomputation = await occurrencePublisher({
        prepared: confidencePrepared,
        publicationService,
        now,
        operation: "regenerate",
        reason,
        dryRun: true,
      });
      return { status: "prepared", prepared: correctionPrepared, recomputation };
    },
    async regenerate({
      userId, reason, targetArtifactId, reconciliationContext = null,
    } = {}) {
      const prepared = await service.prepareRegeneration({
        userId, reason, targetArtifactId, reconciliationContext,
      });
      const result = await service.executePreparedRegeneration({ prepared });
      if (["matched", "regenerated"].includes(result.status)) return result.artifact;
      const error = new Error(result.error?.message ?? "Monthly regeneration failed.");
      error.code = result.status ?? "monthly_regeneration_failed";
      throw error;
    },
  };
  return Object.freeze(service);
}

async function prepareMonthlyOccurrence({
  repositories, publicationService, userId, timeZone, window, artifactId,
  generatedAt, existing,
}) {
  const narrative = await createMonthlyBriefingPreviewService({ repositories })
    .preview({
      userId,
      orchestration: {
        previewWindow: {
          startDate: window.startDate,
          endDate: window.endDate,
          deliveryDate: window.deliveryDate,
          storyWindowStart: window.startDate,
        },
        confidenceCutoff: window.cutoff,
        generatedAt,
        timeZone,
      },
      syntheticContinuation: null,
    });
  assertProductionEvidenceBoundary(narrative);
  if (!narrative.goalConfidence?.assessmentId) {
    const error = new Error(
      "Monthly production requires a canonical confidence assessment at or before the cutoff."
    );
    error.code = "monthly_confidence_unavailable";
    throw error;
  }
  const presentation = toProductionPresentation(
    composeMonthlyBriefingPresentation({
      narrative,
      decision: narrative.editorialDecision,
      fixture: narrative.evidenceFixture,
    }),
    { artifactId, window }
  );
  const artifact = createMonthlyArtifact({
    artifactId, generatedAt, narrative, presentation, userId, window,
  });
  const baseline = publicationService.captureBaseline();
  const goal = narrative.evidenceFixture.goal;
  const activePhase = resolveCommittedPhaseContext(goal, {
    asOf: window.endDate,
  }).activePhase;
  const goalContract = adaptProductionGoalToCanonicalContract(goal, { activePhase,
    canonicalStore: baseline.store, asOf: window.cutoff });
  const confidenceEvidence = narrative.evidenceFixture.confidenceEvidence ?? {};
  const piEnvelope = createCadencePIEvidenceEnvelope({
    cadence: "monthly",
    evidenceWindow: { ...window, ...confidenceEvidence.evidenceWindow },
    comparisonWindow: confidenceEvidence.comparisonWindow ?? null,
    evaluationDate: window.endDate,
    timeZone,
    activeGoal: goal,
    activePhase,
    canonicalTrainingEvidence:
      confidenceEvidence.canonicalTrainingEvidence ?? [],
    weights: narrative.evidenceFixture.weights ?? [],
    energyDays: confidenceEvidence.energyDays ?? [],
    recoveryEvidenceRecords:
      confidenceEvidence.recoveryEvidenceRecords ?? [],
    dexaScans: narrative.evidenceFixture.dexaScans ?? [],
    photoSessions: confidenceEvidence.photoSessions ?? [],
  });
  const current = createCanonicalConfidenceReadService({ store: baseline.store })
    .getCurrent({ goalId: goal.id, phaseId: activePhase?.id });
  if (!current.assessment) {
    const error = new Error("Monthly V2 requires a canonical predecessor.");
    error.code = "canonical_predecessor_required";
    throw error;
  }
  return {
    artifact, activePhase, baseline, current, existing, generatedAt, goal,
    goalContract,
    piEnvelope,
    userId, window,
  };
}

async function publishMonthlyOccurrence({
  prepared, publicationService, now, operation, reason, dryRun = false,
}) {
  const { artifact, activePhase, baseline, current, existing, generatedAt,
    goal, goalContract, piEnvelope, userId, window } = prepared;
  const replacement = operation === "regenerate";
  const replacedAssessmentId = replacement
    ? existing?.confidencePublication?.assessmentId ?? null : null;
  const correctionIdentity = replacement ? monthlyCorrectionIdentity({
    artifact,
    reason,
  }) : null;
  if (replacement &&
      current.assessment.sourceLineage?.correctionIdentity === correctionIdentity &&
      existing?.confidencePublication?.assessmentId === current.assessment.id) {
    return {
      state: "completed",
      artifact: existing,
      idempotent: true,
      publicationStatus: "matched",
    };
  }
  if (replacement && current.assessment.id !== replacedAssessmentId) {
    const error = new Error(
      "Monthly correction target is not the current canonical Confidence publication."
    );
    error.code = "monthly_replacement_target_not_current";
    throw error;
  }
  const confidencePredecessor = replacement
    ? resolveStableConfidenceReplacementPredecessor({
      store: baseline.store,
      assessmentId: replacedAssessmentId,
    })
    : current.assessment;
  if (!confidencePredecessor) {
    const error = new Error(
      "Monthly correction requires the stable canonical Confidence predecessor."
    );
    error.code = "monthly_replacement_predecessor_unavailable";
    throw error;
  }
  const evidenceDescriptors = adaptBriefingArtifactToEvidenceDescriptors({
    artifact,
    piEnvelope,
  });
  assertCanonicalEvidenceDescriptorCoverage({
    artifact,
    evidenceDescriptors,
    goalContract,
  });
  const durabilityContext = createCadenceEvidenceDurabilityContext({
    store: baseline.store,
    artifact,
    cadence: "monthly",
    goalContract,
    previousCanonicalAssessment: confidencePredecessor,
  });
  const finalized = await createBriefingForecastFinalizer({
    publicationService: dryRun ? null : publicationService, now,
  }).finalize({
    publisherType: "monthly_briefing", userId,
    occurrenceId: artifact.id, artifactId: artifact.id,
    cadenceOrEventType: "monthly", goalContract,
    phaseId: activePhase?.id ?? null,
    evidenceWindow: { id: window.id, start: window.startDate,
      cutoff: window.cutoff, closed: window.closed },
    strategyContext: goalContract.strategyHypothesis,
    executionContext: { adequacy: "adequate",
      elapsedTimeAdequacy: "adequate", refs: evidenceRefs(artifact) },
    evidenceDescriptors,
    durabilityContext,
    previousCanonicalAssessment: confidencePredecessor,
    publicationCutoff: window.cutoff, finalizedAt: generatedAt,
    idempotencyKey: replacement
      ? `confidence_v2|monthly|${artifact.id}|correction|${correctionIdentity}`
      : `confidence_v2|monthly|${artifact.id}`,
    expectedPriorAssessmentId: current.assessment.id,
    expectedPriorArtifactId: confidencePredecessor.briefingArtifactId,
    expectedRevision: baseline.revision,
    expectedSemanticDigest: baseline.semanticDigest,
    replacementAuthorized: replacement,
    replacementSemantics: replacement ? "replace-current-assessment" : null,
    replacesArtifactId: replacement ? existing?.id ?? null : null,
    replacesAssessmentId: replacedAssessmentId,
    sourceLineage: { reason, evidenceWindowId: window.id,
      dependencyManifestFingerprint: artifact.dependencyManifest.fingerprint,
      correctionIdentity,
      evidenceNormalization: summarizeEvidenceNormalization({
        artifact, evidenceDescriptors, piEnvelope,
      }) },
    elapsedTimeAdequacy: "adequate",
    phaseReviewContext: {
      activeGoal: goal, activePhase,
      reviewMilestone: activePhase?.reviewMilestone ?? null,
      currentArtifact: { id: artifact.id, evidenceTypes: ["monthly"],
        evidenceIdentities: [window.id] },
      artifactType: "monthly", eventIdentity: artifact.id,
      evidenceIdentity: window.id, artifactTimestamp: window.cutoff,
      publicationTimestamp: generatedAt, currentDate: window.cutoff,
      reviewState: activePhase?.reviewState,
      decisionHistory: baseline.store.phaseReviewDecisions ?? [],
      expectedStoreRevision: baseline.revision,
    },
    composeArtifact: (outputs) => {
      const candidate = structuredClone(artifact);
      const block = createBriefingGoalConfidenceBlockFromV2({
        assessment: outputs.confidenceAssessment,
        projection: outputs.numericConfidenceProjection,
        narrativeAssessment: outputs.narrativeAssessment,
        capturedAt: generatedAt,
      });
      candidate.briefing.monthlyNarrative.confidence = block;
      candidate.briefing.confidenceAssessmentId = block.assessmentId;
      if (candidate.briefing.monthlyPresentation?.hero) {
        candidate.briefing.monthlyPresentation.hero.confidence = block;
      }
      return { artifact: candidate };
    },
  });
  if (dryRun) {
    return {
      state: "prepared",
      artifact: finalized.briefingArtifact,
      evidenceDescriptors,
      finalized,
      idempotent: false,
    };
  }
  const publication = finalized.commitResult;
  if (publication.committed || publication.status === "matched") {
    return {
      state: "completed",
      artifact: publication.artifact,
      idempotent: publication.status === "matched",
      publicationStatus: publication.status,
    };
  }
  const error = new Error(
    publication.error?.message ?? `Monthly publication failed: ${publication.status}`
  );
  error.code = publication.status ?? "monthly_persistence_failure";
  throw error;
}

function monthlyCorrectionIdentity({ artifact, reason }) {
  return [
    "monthly_confidence_correction_v1",
    artifact.id,
    reason,
    artifact.dependencyManifest.fingerprint,
  ].map((value) => encodeURIComponent(String(value))).join("|");
}

function evidenceRefs(artifact) {
  return artifact?.briefing?.provenance?.evidenceRefs ?? [];
}

function summarizeEvidenceNormalization({
  artifact,
  evidenceDescriptors,
  piEnvelope,
}) {
  const descriptors = evidenceDescriptors.map((descriptor) => ({
    capability: descriptor.capability,
    agreement: descriptor.agreement,
    strength: descriptor.strength,
    sourceEvidenceCount: descriptor.sourceEvidenceIds?.length ?? 0,
    sourceObservationCount: descriptor.sourceObservationIds?.length ?? 0,
    limitations: descriptor.limitations ?? descriptor.quality?.limitations ?? [],
  }));
  return {
    schemaVersion: "confidence_evidence_normalization_lineage_v1",
    dependencyCount:
      artifact.dependencyManifest?.canonicalDependencies?.length ?? 0,
    descriptorCount: descriptors.length,
    descriptorCapabilities: [...new Set(descriptors.map((item) => item.capability))]
      .sort(),
    descriptors,
    envelopeVersion: piEnvelope?.schemaVersion ?? null,
    sourceEvidenceCount:
      piEnvelope?.provenance?.sourceEvidenceIds?.length ?? 0,
  };
}

export function createMonthlyArtifact({
  artifactId,
  generatedAt,
  narrative,
  presentation,
  userId,
  window,
}) {
  const selectedStories = narrative.editorialDecision.candidates
    .filter((candidate) => candidate.included)
    .map(({ syntheticInvolvement: _syntheticInvolvement, ...candidate }) =>
      structuredClone(candidate));
  const evidenceRefs = [...new Set(
    selectedStories.flatMap((story) => story.evidenceRefs ?? [])
  )];
  const goal = narrative.evidenceFixture.goal;
  const phase = goal ? resolveCommittedPhaseContext(goal, { asOf: window.endDate }).activePhase : null;
  return attachBriefingDependencyManifest({
    id: artifactId,
    artifactIdVersion: MONTHLY_ARTIFACT_ID_VERSION,
    artifactType: "scheduled",
    cadence: "monthly",
    version: MONTHLY_BRIEFING_VERSION,
    userId,
    briefingMonth: window.briefingMonth,
    deliveryDate: window.deliveryDate,
    timeZone: window.timeZone,
    generatedAt,
    evidenceWindow: structuredClone(window),
    evidenceCutoff: window.cutoff,
    goalContext: {
      goalId: goal?.id ?? null,
      goalType: goal?.type ?? null,
      phaseId: phase?.id ?? null,
      phaseType: phase?.semanticType ?? phase?.name ?? null,
    },
    lifecycle: {
      status: "completed",
      generationStatus: "completed",
      claimedAt: generatedAt,
      generatedAt,
      completedAt: generatedAt,
      failedAt: null,
      failureReason: null,
      openedAt: null,
      consumedAt: null,
    },
    source: { type: "computed", name: "PhysiqueOS", confidence: "high" },
    briefing: {
      version: MONTHLY_BRIEFING_VERSION,
      monthlyNarrative: structuredClone(narrative.monthlyNarrative),
      monthlyPresentation: presentation,
      selectedEditorialStories: selectedStories,
      confidenceAssessmentId: narrative.goalConfidence.assessmentId,
      provenance: {
        version: MONTHLY_BRIEFING_VERSION,
        evidenceWindowId: window.id,
        evidenceCutoff: window.cutoff,
        evidenceRefs,
        selectedStoryIds: narrative.editorialDecision.selectedStoryIds,
        boundedMilestoneIds:
          narrative.editorialDecision.boundedMilestoneCandidateIds,
        evidenceResolution: structuredClone(
          narrative.evidenceFixture.evidenceResolution
        ),
        semanticDiagnostics: structuredClone(
          narrative.editorialDecision.semanticDiagnostics ?? null
        ),
      },
    },
    createdAt: generatedAt,
    updatedAt: generatedAt,
  }, [
    ...(narrative.evidenceFixture.canonicalDependencies ?? []),
    ...(narrative.evidenceFixture.weights ?? []),
    ...(narrative.evidenceFixture.dexaScans ?? []),
    ...(narrative.evidenceFixture.progressPhotos ?? []),
  ]);
}

function toProductionPresentation(presentation, { artifactId, window }) {
  const production = structuredClone(presentation);
  delete production.preview;
  if (production.milestone) production.milestone.href = "/goals";
  production.hero.period = formatMonthlyPeriodLine(window);
  production.source = {
    ...production.source,
    narrativeId: `monthly_narrative_${window.briefingMonth.replace("-", "")}`,
    artifactId,
    evidenceWindowId: window.id,
  };
  return production;
}

function assertProductionEvidenceBoundary(narrative) {
  const synthetic = narrative.editorialDecision?.synthetic;
  const continuation = narrative.evidenceFixture?.syntheticContinuation;
  if (
    synthetic?.active ||
    continuation?.syntheticActive ||
    (continuation?.energyContinuations?.length ?? 0) > 0 ||
    (continuation?.trainingObservations?.length ?? 0) > 0
  ) {
    const error = new Error("Monthly production rejected preview continuation.");
    error.code = "preview_boundary_violation";
    throw error;
  }
}

function isCompletedMonthly(artifact) {
  return Boolean(
    artifact?.cadence === "monthly" &&
    artifact?.briefing?.monthlyPresentation &&
    artifact?.lifecycle?.generationStatus !== "failed" &&
    artifact?.lifecycle?.generationStatus !== "in_progress"
  );
}

function isMonthlyEligible(value, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  const time = `${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`;
  return Number(parts.day) === 1 && time >= "00:00";
}

function formatMonthRange(window) {
  const month = new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${window.startDate}T12:00:00Z`));
  return `${month} ${Number(window.startDate.slice(-2))}\u2013${Number(window.endDate.slice(-2))}`;
}

export function formatMonthlyPeriodLine(window) {
  return `${formatMonthRange(window)} \u00b7 Delivered ${formatMonthDay(window.deliveryDate)}`;
}

function formatMonthDay(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

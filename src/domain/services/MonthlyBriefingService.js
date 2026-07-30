import { createPICadenceBriefingPublicationService } from "./PICadenceBriefingPublicationService";
import { createMonthlyEvidenceWindow } from "./BriefingEvidenceWindowService";
import {
  createMonthlyBriefingPreviewService,
} from "./MonthlyBriefingPreviewService";
import {
  composeMonthlyBriefingPresentation,
} from "./MonthlyBriefingPresentationService";

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
  publicationService = createPICadenceBriefingPublicationService({ now }),
} = {}) {
  return createMonthlyBriefingService({ repositories, now, publicationService });
}

export function createMonthlyBriefingService({
  repositories,
  now = () => new Date(),
  publicationService,
} = {}) {
  if (!repositories) throw new Error("Monthly repositories are required.");
  if (!publicationService) throw new Error("Monthly publication service is required.");

  return Object.freeze({
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

      const generatedAt = asOf.toISOString();
      const artifactId = getMonthlyArtifactId({
        userId: resolvedUserId,
        window,
      });
      const narrative = await createMonthlyBriefingPreviewService({
        repositories,
      }).preview({
        userId: resolvedUserId,
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
        artifactId,
        generatedAt,
        narrative,
        presentation,
        userId: resolvedUserId,
        window,
      });
      const baseline = publicationService.captureBaseline();
      const publication = await publicationService.publish({
        schemaVersion: "pi_cadence_briefing_publication_v1",
        cadence: "monthly",
        operation: "create",
        artifact,
        artifactConfidenceAssessmentId: narrative.goalConfidence.assessmentId,
        confidencePublicationCommand: null,
        expectedRevision: baseline.revision,
        expectedSemanticDigest: baseline.semanticDigest,
        replacementAuthorized: false,
        publicationReason: "scheduled_monthly_cadence",
      });
      if (publication.committed) {
        return {
          state: "completed",
          artifact: publication.artifact,
          idempotent: false,
        };
      }
      if (publication.status === "matched") {
        return {
          state: "completed",
          artifact: publication.artifact,
          idempotent: true,
        };
      }
      if (publication.status === "baseline_conflict") {
        const concurrent = await repositories.dailyBriefings
          .getBriefingByEvidenceWindow(resolvedUserId, window.id);
        if (isCompletedMonthly(concurrent)) {
          return { state: "completed", artifact: concurrent, idempotent: true };
        }
      }
      const error = new Error(
        publication.error?.message ?? `Monthly publication failed: ${publication.status}`
      );
      error.code = publication.status ?? "monthly_persistence_failure";
      throw error;
    },
  });
}

function createMonthlyArtifact({
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
  const phase = goal?.phases?.find((item) => item.status === "active") ?? null;
  return {
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
      },
    },
    createdAt: generatedAt,
    updatedAt: generatedAt,
  };
}

function toProductionPresentation(presentation, { artifactId, window }) {
  const production = structuredClone(presentation);
  delete production.preview;
  if (production.milestone) production.milestone.href = "/goals";
  production.hero.period = `${formatMonthRange(window)} · Delivered ${formatMonthDay(window.deliveryDate)}`;
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
  return `${month} ${Number(window.startDate.slice(-2))}–${Number(window.endDate.slice(-2))}`;
}

function formatMonthDay(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

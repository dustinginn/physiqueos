import { describe, expect, it, vi } from "vitest";
import { createSeedRepositories } from
  "../../data/repositories/createSeedRepositories";
import {
  createProductionPhotoEventNarrativeService,
  createProviderPhotoEventNarrativeService,
} from "./productionPhotoEventNarrativeComposition";
import { createCanonicalConfidenceAssessment } from
  "../../domain/confidence/CanonicalConfidenceAssessmentModel";

vi.mock("./productionApplicationComposition", () => ({
  getProductionPhotoEventReadStore: vi.fn(() => {
    throw new Error("A test provider read store must be injected.");
  }),
}));

vi.mock("../../data/repositories/founderRuntimeStore", () => ({
  getFounderRuntimeStore: vi.fn(() => {
    throw Object.assign(new Error("legacy read forbidden"), {
      code: "PROVIDER_LEGACY_RUNTIME_FORBIDDEN",
    });
  }),
  resolveFounderRuntimeStorePath: vi.fn(() => {
    throw Object.assign(new Error("legacy path forbidden"), {
      code: "PROVIDER_LEGACY_RUNTIME_FORBIDDEN",
    });
  }),
}));

describe("provider Photo Event narrative composition", () => {
  it("publishes an Aug 22 event against historical Confidence without changing the current Weekly", async () => {
    const fixture = providerFixture();
    const service = await fixture.createService();

    const result = await service.getOrCreateResult({
      userId: "user_founder_001",
      sessionId: fixture.sessionId,
    });

    expect(result).toMatchObject({
      status: "completed",
      artifactId: fixture.eventId,
      sessionId: fixture.sessionId,
      created: true,
    });
    expect(result.artifact.briefing.photoEventNarrative.eventDate)
      .toBe("2026-08-22");
    expect(result.artifact.confidencePublication.publisherType)
      .toBe("photo_event_briefing");
    expect(result.artifact.confidencePublication).toMatchObject({
      assessmentId: fixture.historicalAssessmentId,
      confidenceMode: "matched-only",
      authoritativeSnapshotChanged: false,
      matchedAssessmentPublisherType: "weekly_briefing",
    });
    expect(fixture.liveStore.dailyBriefings).toHaveLength(2);
    expect(fixture.liveStore.dailyBriefings.find((item) =>
      item.id === fixture.eventId)).toBeTruthy();
    expect(fixture.liveStore.dailyBriefings.find((item) =>
      item.id === "weekly_briefing_2026-08-23_2026-08-29")?.version).toBe(1);
    expect(fixture.liveStore.goalConfidenceHistory).toHaveLength(
      fixture.initialHistoryCount
    );
    expect(fixture.liveStore.goalConfidenceSnapshots.find((item) =>
      item.goalId === fixture.goalId && item.phaseId === fixture.phaseId
    )).toMatchObject({
      currentAssessmentId: fixture.currentAssessmentId,
      originatingArtifactId: "weekly_briefing_2026-08-23_2026-08-29",
    });
    expect(fixture.boundedCalls).toHaveLength(1);
    expect(fixture.boundedCalls[0]).toMatchObject({
      operation: "briefing-historical-matched-publication",
      allowedCollections: ["dailyBriefings"],
      readCollections: ["dailyBriefings", "goalConfidenceHistory"],
      readApplicationContext: false,
      readImportMetadata: false,
    });

    const replayService = await fixture.createService();
    const replay = await replayService.getOrCreateResult({
      userId: "user_founder_001",
      sessionId: fixture.sessionId,
    });
    expect(replay).toMatchObject({
      status: "completed",
      artifactId: fixture.eventId,
      created: false,
    });
    expect(fixture.liveStore.dailyBriefings).toHaveLength(2);
    expect(fixture.liveStore.goalConfidenceHistory).toHaveLength(
      fixture.initialHistoryCount
    );
    expect(fixture.boundedCalls).toHaveLength(1);
  });

  it("fails closed when the provider mutation binding is absent", () => {
    expect(() => createProviderPhotoEventNarrativeService({
      repositories: {},
      readStore: { loadInputs: vi.fn() },
    })).toThrowError(expect.objectContaining({
      code: "PROVIDER_PHOTO_EVENT_RUNTIME_BINDINGS_REQUIRED",
    }));
  });
});

function providerFixture() {
  const goal = productionGoal();
  const phase = goal.phases.find((item) => item.status === "active");
  const historical = canonicalAssessment({ goalId: goal.id, phaseId: phase.id,
    cutoff: "2026-08-22T23:59:59.999Z",
    artifactId: "weekly_briefing_2026-08-16_2026-08-22", percentage: 62 });
  const current = canonicalAssessment({ goalId: goal.id, phaseId: phase.id,
    cutoff: "2026-08-29T23:59:59.999Z",
    artifactId: "weekly_briefing_2026-08-23_2026-08-29", percentage: 64,
    priorAssessmentId: historical.id });
  const snapshot = {
    id: `goal_confidence_snapshot_v2|${goal.id}|${phase.id}`,
    goalId: goal.id,
    phaseId: phase.id,
    currentAssessmentId: current.id,
    currentScore: current.currentPercentage,
    scoreBand: current.confidenceBand,
    historyRecordId: "current-history",
    originatingArtifactId: current.briefingArtifactId,
  };
  const historicalRecord = {
    id: "historical-history",
    assessmentId: historical.id,
    goalId: goal.id,
    phaseId: phase.id,
    publisherType: historical.publisherType,
    persistedAt: "2026-08-23T07:00:00.000Z",
    assessment: historical,
  };
  const currentRecord = {
    id: "current-history",
    assessmentId: current.id,
    goalId: goal.id,
    phaseId: phase.id,
    publisherType: current.publisherType,
    persistedAt: "2026-08-30T07:00:00.000Z",
    assessment: current,
  };
  const sessionId = "photo_session_user_founder_001_2026-08-22";
  const eventId = `event_briefing_progress_photo_${sessionId}`;
  const photoId = "canonical_photo_user_founder_001_2026-08-22_front_relaxed";
  const photo = {
    id: "aug-29-front-relaxed",
    canonicalPhotoId: photoId,
    active: true,
    orientation: "front",
    contractionState: "relaxed",
    poseVariant: "standard",
    poseId: "front-relaxed",
    label: "Front Relaxed",
    view: "front",
    pose: "relaxed",
    identityStatus: "confirmed",
    userConfirmedIdentity: true,
    sourceOrder: 0,
    order: 0,
    captureDate: "2026-08-22",
    occurrenceTimestamp: "2026-08-22",
    sourceIds: ["aug-29-front-relaxed"],
    storage_path: "private/founder/photos/uploads/2026-08-22-front-relaxed.jpeg",
  };
  const canonicalSession = {
    canonicalId: sessionId,
    createdAt: "2026-08-30T18:00:00.000Z",
    updatedAt: "2026-08-30T18:00:00.000Z",
    evidence_type: "photo_session",
    firstObservedAt: "2026-08-22",
    lastObservedAt: "2026-08-22",
    payload: {
      id: "provisional_session_2026-08-29",
      evidence_type: "photo_session",
      provisional: false,
      observed_at: "2026-08-22",
      captureDate: "2026-08-22",
      sessionId,
      userId: "user_founder_001",
      completionState: "complete",
      sessionConditions: {},
      activePhotoIdsByPose: { "front-relaxed": photoId },
      photos: [photo],
    },
    provenance: {
      source_artifact_refs: [photo.storage_path],
    },
    quality: { status: "active" },
    userId: "user_founder_001",
  };
  const liveStore = {
    revision: 200,
    updatedAt: "2026-08-30T17:30:00.000Z",
    lastCommitId: "prior-provider-commit",
    user: { id: "user_founder_001", timeZone: "America/Los_Angeles" },
    goals: [structuredClone(goal)],
    executionItems: [],
    dexaScans: [],
    weightEntries: [],
    progressPhotos: [],
    analyses: [{
      id: "analysis_aug_22_front_relaxed",
      evidenceIds: [photoId],
      summary: "Waist appears modestly tighter.",
      source: { type: "vision" },
      metadata: {
        structuredObservations: [{
          change: "Waist appears modestly tighter.",
          region: "waist",
          direction: "improved",
          magnitude: "small",
          confidence: "high",
        }],
      },
    }],
    canonicalEvidenceObjects: [canonicalSession],
    dailyBriefings: [{
      id: "weekly_briefing_2026-08-23_2026-08-29",
      version: 1,
      userId: "user_founder_001",
      artifactType: "weekly",
      generatedAt: "2026-08-30T17:29:58.135Z",
    }],
    goalConfidenceSnapshots: [structuredClone(snapshot)],
    goalConfidenceHistory: [structuredClone(historicalRecord),
      structuredClone(currentRecord)],
    goalConfidenceContinuitySeeds: [],
    confidenceInitializationArtifacts: [],
    phaseReviewDecisions: [],
  };
  const initialHistoryCount = liveStore.goalConfidenceHistory.length;
  const boundedCalls = [];
  const mutateCanonicalRuntime = async (input) => {
    boundedCalls.push(input);
    const candidate = Object.fromEntries(input.readCollections.map((name) => [
      name,
      structuredClone(liveStore[name] ?? []),
    ]));
    const commandId = `photo-event-provider-commit-${boundedCalls.length}`;
    const result = await input.mutate(candidate, { commandId });
    for (const name of input.allowedCollections) {
      liveStore[name] = structuredClone(candidate[name] ?? []);
    }
    liveStore.revision += 1;
    liveStore.updatedAt = "2026-08-30T18:00:00.000Z";
    liveStore.lastCommitId = commandId;
    return {
      committed: true,
      commitId: commandId,
      revision: liveStore.revision,
      result,
      changedCollections: [...input.allowedCollections],
      memoryProfile: {
        runtimeLoadCount: 1,
        runtimeCloneCount: 0,
        fullRuntimeSerializationCount: 0,
        runtimeCollectionLoadCount: input.readCollections.length,
      },
    };
  };
  return {
    liveStore,
    boundedCalls,
    eventId,
    goalId: goal.id,
    phaseId: phase.id,
    sessionId,
    historicalAssessmentId: historical.id,
    currentAssessmentId: current.id,
    initialHistoryCount,
    async createService() {
      const runtime = structuredClone(liveStore);
      const repositories = createSeedRepositories(runtime, {
        onChange() {
          throw new Error("Photo Event provider composition cannot write snapshot repositories.");
        },
      });
      return createProductionPhotoEventNarrativeService({
        repositories,
        env: { PHYSIQUEOS_PROVIDER_FULL_RUNTIME: "1" },
        readStore: {
          loadInputs: async () => ({
            canonicalObjects: structuredClone(runtime.canonicalEvidenceObjects),
            legacyPhotos: structuredClone(runtime.progressPhotos),
            weights: structuredClone(runtime.weightEntries),
            analyses: structuredClone(runtime.analyses),
            goal: structuredClone(runtime.goals.find((item) => item.status === "active")),
            goals: structuredClone(runtime.goals),
            executionItems: structuredClone(runtime.executionItems),
            dexaScans: structuredClone(runtime.dexaScans),
            artifacts: structuredClone(runtime.dailyBriefings),
            publicationStore: runtime,
          }),
        },
        loadCanonicalCommitBindings: async () => ({
          mutateCanonicalRuntime,
        }),
        now: () => new Date("2026-08-30T18:00:00.000Z"),
      });
    },
  };
}

function productionGoal() {
  const id = "goal_build_lean_mass";
  return {
    id,
    userId: "user_founder_001",
    title: "Build Lean Mass",
    type: "build_lean_mass",
    status: "active",
    primary: true,
    purpose: "Build lean mass while protecting body composition.",
    startDate: "2026-08-15",
    updatedAt: "2026-08-15T00:00:00.000Z",
    target: {
      type: "numeric_change",
      metric: "lean_mass",
      direction: "increase",
      amount: 10,
      unit: "lb",
      description: "Build 10 lb of lean mass",
      targetDate: "2026-10-31",
    },
    timeline: {
      startDate: "2026-08-15",
      targetDate: "2026-10-31",
    },
    openingApproach: {
      value: "lean_mass_build",
      label: "Lean Mass Build",
      recommendationReason: "Support gradual muscle gain.",
    },
    progressMeasurement: {
      outcomeMeasures: [{
        id: "lean-mass-outcome",
        evidenceType: "dexa_scan",
        role: "outcome",
        explanation: "DEXA measures lean-mass change.",
      }],
      predictiveSignals: [],
      explanatorySignals: [],
    },
    guardrails: [],
    currentPhaseId: "phase_lean_mass_build",
    phases: [{
      id: "phase_lean_mass_build",
      goalId: id,
      name: "Lean Mass Build",
      purpose: "Build lean mass from a stable maintenance baseline.",
      status: "active",
      order: 0,
      startDate: "2026-08-15",
      targetDate: "2026-10-31",
      reviewState: "not_required",
      completionDecisionRequired: true,
      successCriteria: [],
      guardrails: [],
      revision: 1,
    }],
  };
}

function canonicalAssessment({ goalId, phaseId, cutoff, artifactId, percentage,
  priorAssessmentId = null }) {
  const suffix = artifactId.split("_").slice(-3).join("-");
  return createCanonicalConfidenceAssessment({
    goalId, phaseId, goalContractId: goalId, goalContractVersion: "goal-v1",
    publisherType: "weekly_briefing", originatingBriefingId: artifactId,
    briefingArtifactId: artifactId, evidenceWindowId: `${artifactId}|window`,
    priorAssessmentId, publicationTimestamp: new Date(Date.parse(cutoff) +
      7 * 60 * 60 * 1000).toISOString(), sourceCutoff: cutoff,
    idempotencyKey: `${artifactId}|confidence`,
    projection: { id: `projection-${suffix}`, schemaVersion: "projection-v1",
      priorPercentage: priorAssessmentId ? percentage - 2 : percentage,
      currentPercentage: percentage, movement: priorAssessmentId
        ? "increase" : "no_meaningful_change", movementMagnitude: "small" },
    forecastAssessment: { id: `forecast-${suffix}`, confidenceBand: "moderate",
      goalForecastStatus: "on_track", forecastDirection: "improving",
      forecastExplanation: ["Canonical weekly evidence."], remainingUncertainty: [],
      nextDecisiveEvidence: ["Next weekly window."], forecastMetadata: {
        interpretationSemanticFingerprint: `semantic-${suffix}`,
        goalContractFingerprint: `goal-${suffix}`,
        inputFingerprint: `forecast-input-${suffix}`, engineVersion: "test-v1",
      } },
    narrativeAssessment: { id: `narrative-${suffix}`,
      confidenceExplanation: ["Canonical weekly Confidence."], provenance: {
        inputFingerprint: `narrative-input-${suffix}`, engineVersion: "test-v1",
      } },
    structuredInterpretation: { id: `interpretation-${suffix}`, provenance: {
      inputFingerprint: `interpretation-input-${suffix}`, engineVersion: "test-v1",
    } },
    sourceLineage: { artifactId },
  });
}

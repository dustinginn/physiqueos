import { describe, expect, it, vi } from "vitest";
import { createSeedRepositories } from
  "../../data/repositories/createSeedRepositories";
import {
  createProductionPhotoEventNarrativeService,
  createProviderPhotoEventNarrativeService,
} from "./productionPhotoEventNarrativeComposition";

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
  it("publishes an Aug 22 event and Confidence without changing the current Weekly", async () => {
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
    expect(fixture.liveStore.dailyBriefings).toHaveLength(2);
    expect(fixture.liveStore.dailyBriefings.find((item) =>
      item.id === fixture.eventId)).toBeTruthy();
    expect(fixture.liveStore.dailyBriefings.find((item) =>
      item.id === "weekly_briefing_2026-08-23_2026-08-29")?.version).toBe(1);
    expect(fixture.liveStore.goalConfidenceHistory).toHaveLength(
      fixture.initialHistoryCount + 1
    );
    expect(fixture.liveStore.goalConfidenceSnapshots.find((item) =>
      item.goalId === fixture.goalId && item.phaseId === fixture.phaseId
    )?.originatingArtifactId).toBe(fixture.eventId);
    expect(fixture.boundedCalls).toHaveLength(1);
    expect(fixture.boundedCalls[0]).toMatchObject({
      operation: "briefing-confidence-publication",
      allowedCollections: [
        "dailyBriefings",
        "goalConfidenceSnapshots",
        "goalConfidenceHistory",
        "confidenceInitializationArtifacts",
      ],
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
      fixture.initialHistoryCount + 1
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
  const prior = priorAssessment(goal.id, phase.id);
  const snapshot = {
    id: `goal_confidence_snapshot_v2|${goal.id}|${phase.id}`,
    goalId: goal.id,
    phaseId: phase.id,
    currentAssessmentId: prior.id,
    currentScore: prior.score.current,
    scoreBand: prior.score.band,
    historyRecordId: "prior-history",
    originatingArtifactId: prior.briefingArtifactId,
  };
  const history = {
    id: "prior-history",
    assessmentId: prior.id,
    goalId: goal.id,
    phaseId: phase.id,
    publisherType: prior.publisherType,
    persistedAt: prior.provenance.generatedAt,
    assessment: prior,
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
    goalConfidenceHistory: [structuredClone(history)],
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

function priorAssessment(goalId, phaseId) {
  return {
    schemaVersion: "pi_goal_confidence_assessment_v1",
    id: "prior-assessment",
    goalId,
    phaseId,
    operatingState: "lean_mass_build",
    evidenceCutoff: "2026-08-22T23:59:59.999Z",
    sourceCutoff: "2026-08-22T23:59:59.999Z",
    publisherType: "weekly_briefing",
    briefingArtifactId: "weekly_briefing_2026-08-16_2026-08-22",
    score: {
      current: 62,
      prior: 62,
      band: "moderate",
      movement: { direction: "held", magnitude: "none" },
    },
    contributors: [],
    unresolvedUncertainty: [],
    primaryReason: "Prior canonical Weekly context.",
    provenance: { generatedAt: "2026-08-23T07:00:00.000Z" },
  };
}

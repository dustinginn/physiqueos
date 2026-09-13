import { describe, expect, it, vi } from "vitest";
import { createCanonicalConfidenceAssessment } from
  "../../domain/confidence/CanonicalConfidenceAssessmentModel";
import {
  createProductionDEXAEventNarrativeService,
  createProviderDEXAEventNarrativeService,
} from "./productionDEXAEventNarrativeComposition";
import {
  getFounderRuntimeStore,
  resolveFounderRuntimeStorePath,
} from "../../data/repositories/providerRuntimeStoreForbidden";

const legacyRuntime = vi.hoisted(() => ({
  read: vi.fn(() => {
    throw Object.assign(new Error("legacy read forbidden"), {
      code: "PROVIDER_LEGACY_RUNTIME_FORBIDDEN",
    });
  }),
  path: vi.fn(() => {
    throw Object.assign(new Error("legacy path forbidden"), {
      code: "PROVIDER_LEGACY_RUNTIME_FORBIDDEN",
    });
  }),
}));

vi.mock("../../data/repositories/founderRuntimeStore", () => ({
  getFounderRuntimeStore: legacyRuntime.read,
  resolveFounderRuntimeStorePath: legacyRuntime.path,
}));

describe("provider DEXA Event narrative composition", () => {
  it("publishes the canonical scan once without resolving legacy Founder JSON", async () => {
    const fixture = providerFixture();
    const firstService = await fixture.createService();

    const first = await firstService.generate({
      userId: fixture.owner,
      scanId: fixture.scanId,
    });

    expect(first).toMatchObject({
      id: fixture.eventId,
      userId: fixture.owner,
      trigger: {
        evidenceType: "dexa",
        evidenceId: fixture.scanId,
      },
    });
    expect(first.briefing.dexaEventNarrative).toMatchObject({
      artifactId: fixture.eventId,
      scanId: fixture.scanId,
      evidenceBinding: {
        current: { scanId: fixture.scanId, measuredAt: "2026-09-12" },
      },
    });
    expect(fixture.liveStore.dailyBriefings.filter((item) =>
      item.id === fixture.eventId)).toHaveLength(1);
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
    expect(legacyRuntime.read).not.toHaveBeenCalled();
    expect(legacyRuntime.path).not.toHaveBeenCalled();

    const replayService = await fixture.createService();
    const replay = await replayService.generate({
      userId: fixture.owner,
      scanId: fixture.scanId,
    });

    expect(replay.id).toBe(fixture.eventId);
    expect(fixture.liveStore.dailyBriefings.filter((item) =>
      item.id === fixture.eventId)).toHaveLength(1);
    expect(fixture.boundedCalls).toHaveLength(1);
  });

  it("fails closed without the provider mutation binding", () => {
    expect(() => createProviderDEXAEventNarrativeService({
      canonicalRuntime: {},
    })).toThrowError(expect.objectContaining({
      code: "PROVIDER_DEXA_EVENT_RUNTIME_BINDINGS_REQUIRED",
    }));
  });

  it("keeps the provider-full legacy Founder runtime guard active", () => {
    expect(resolveFounderRuntimeStorePath).toThrowError(expect.objectContaining({
      code: "PROVIDER_LEGACY_RUNTIME_FORBIDDEN",
    }));
    expect(getFounderRuntimeStore).toThrowError(expect.objectContaining({
      code: "PROVIDER_LEGACY_RUNTIME_FORBIDDEN",
    }));
  });
});

function providerFixture() {
  const owner = "user_provider_dexa_regression";
  const goal = productionGoal(owner);
  const phase = goal.phases[0];
  const scanId = `dexa_scan|${owner}|2026-09-12`;
  const eventId = `dexa_event_${scanId}`;
  const scan = {
    id: scanId,
    canonicalId: scanId,
    userId: owner,
    measuredAt: "2026-09-12",
    provider: "Regression Fixture Provider",
    totalMass: { value: 190, unit: "lb" },
    bodyFatPercentage: 18,
    fatMass: { value: 34.2, unit: "lb" },
    leanMass: { value: 148.6, unit: "lb" },
    boneMineralContent: { value: 7.2, unit: "lb" },
    restingMetabolicRate: { value: 1800, unit: "cal/day" },
    sourceFileId: "media://provider-dexa-regression.pdf",
    rawReportPath: "media://provider-dexa-regression.pdf",
    canonicalLifecycleStatus: "current",
    goalId: goal.id,
    phaseId: phase.id,
    relatedGoalIds: [goal.id],
    goalPhaseAttribution: { goalId: goal.id, phaseId: phase.id },
    dexaRevision: { revision: 1, supersedes: null },
    createdAt: "2026-09-12T18:00:00.000Z",
    updatedAt: "2026-09-12T18:00:00.000Z",
  };
  const currentAssessment = canonicalAssessment({
    goalId: goal.id,
    phaseId: phase.id,
    cutoff: "2026-09-05T23:59:59.999Z",
    artifactId: "weekly_briefing_2026-08-30_2026-09-05",
    percentage: 64,
  });
  const liveStore = {
    revision: 300,
    updatedAt: "2026-09-12T17:55:00.000Z",
    lastCommitId: "prior-provider-commit",
    user: { id: owner, timeZone: "America/Los_Angeles" },
    goals: [structuredClone(goal)],
    protocols: [],
    executionItems: [],
    dexaScans: [structuredClone(scan)],
    weightEntries: [],
    progressPhotos: [],
    analyses: [],
    canonicalEvidenceObjects: [{
      canonicalId: scanId,
      userId: owner,
      evidence_type: "dexa",
      firstObservedAt: "2026-09-12",
      lastObservedAt: "2026-09-12",
      payload: structuredClone(scan),
      quality: { status: "active" },
    }],
    dailyBriefings: [{
      id: currentAssessment.briefingArtifactId,
      userId: owner,
      artifactType: "weekly",
      cadence: "weekly",
      generatedAt: "2026-09-06T07:00:00.000Z",
    }],
    goalConfidenceSnapshots: [{
      id: `goal_confidence_snapshot_v2|${goal.id}|${phase.id}`,
      goalId: goal.id,
      phaseId: phase.id,
      currentAssessmentId: currentAssessment.id,
      currentScore: currentAssessment.currentPercentage,
      scoreBand: currentAssessment.confidenceBand,
      historyRecordId: "current-history",
      originatingArtifactId: currentAssessment.briefingArtifactId,
    }],
    goalConfidenceHistory: [{
      id: "current-history",
      assessmentId: currentAssessment.id,
      goalId: goal.id,
      phaseId: phase.id,
      publisherType: currentAssessment.publisherType,
      persistedAt: "2026-09-06T07:00:00.000Z",
      assessment: structuredClone(currentAssessment),
    }],
    confidenceInitializationArtifacts: [],
    goalConfidenceContinuitySeeds: [],
    phaseReviewDecisions: [],
  };
  const boundedCalls = [];
  const mutateCanonicalRuntime = async (input) => {
    boundedCalls.push(input);
    const candidate = Object.fromEntries(input.readCollections.map((name) => [
      name,
      structuredClone(liveStore[name] ?? []),
    ]));
    const commandId = `dexa-event-provider-commit-${boundedCalls.length}`;
    const result = await input.mutate(candidate, { commandId });
    for (const name of input.allowedCollections) {
      liveStore[name] = structuredClone(candidate[name] ?? []);
    }
    liveStore.revision += 1;
    liveStore.updatedAt = "2026-09-12T19:00:00.000Z";
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
    owner,
    scanId,
    eventId,
    liveStore,
    boundedCalls,
    async createService() {
      return createProductionDEXAEventNarrativeService({
        repositories: {},
        env: { PHYSIQUEOS_PROVIDER_FULL_RUNTIME: "1" },
        loadCanonicalRuntime: async () => structuredClone(liveStore),
        loadCanonicalCommitBindings: async () => ({ mutateCanonicalRuntime }),
        now: () => new Date("2026-09-12T19:00:00.000Z"),
      });
    },
  };
}

function productionGoal(userId) {
  const id = "goal_build_lean_mass";
  return {
    id,
    userId,
    title: "Build Lean Mass",
    type: "build_lean_mass",
    status: "active",
    primary: true,
    purpose: "Build lean mass while protecting body composition.",
    startDate: "2026-08-15",
    target: {
      type: "numeric_change",
      metric: "lean_mass",
      direction: "increase",
      amount: 10,
      unit: "lb",
      description: "Build 10 lb of lean mass",
      targetDate: "2026-10-31",
    },
    timeline: { startDate: "2026-08-15", targetDate: "2026-10-31" },
    openingApproach: { value: "lean_mass_build", label: "Lean Mass Build" },
    progressMeasurement: {
      outcomeMeasures: [{
        id: "lean-mass-outcome",
        evidenceType: "dexa_scan",
        role: "outcome",
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

function canonicalAssessment({ goalId, phaseId, cutoff, artifactId,
  percentage }) {
  return createCanonicalConfidenceAssessment({
    goalId,
    phaseId,
    goalContractId: goalId,
    goalContractVersion: "goal-v1",
    publisherType: "weekly_briefing",
    originatingBriefingId: artifactId,
    briefingArtifactId: artifactId,
    evidenceWindowId: `${artifactId}|window`,
    priorAssessmentId: null,
    publicationTimestamp: "2026-09-06T07:00:00.000Z",
    sourceCutoff: cutoff,
    idempotencyKey: `${artifactId}|confidence`,
    projection: {
      id: "projection-current",
      schemaVersion: "projection-v1",
      priorPercentage: percentage,
      currentPercentage: percentage,
      movement: "no_meaningful_change",
      movementMagnitude: "small",
    },
    forecastAssessment: {
      id: "forecast-current",
      confidenceBand: "moderate",
      goalForecastStatus: "on_track",
      forecastDirection: "stable",
      forecastExplanation: ["Canonical weekly evidence."],
      remainingUncertainty: [],
      nextDecisiveEvidence: ["Next DEXA."],
      forecastMetadata: {
        interpretationSemanticFingerprint: "semantic-current",
        goalContractFingerprint: "goal-current",
        inputFingerprint: "forecast-input-current",
        engineVersion: "test-v1",
      },
    },
    narrativeAssessment: {
      id: "narrative-current",
      confidenceExplanation: ["Canonical weekly Confidence."],
      provenance: {
        inputFingerprint: "narrative-input-current",
        engineVersion: "test-v1",
      },
    },
    structuredInterpretation: {
      id: "interpretation-current",
      provenance: {
        inputFingerprint: "interpretation-input-current",
        engineVersion: "test-v1",
      },
    },
    sourceLineage: { artifactId },
  });
}

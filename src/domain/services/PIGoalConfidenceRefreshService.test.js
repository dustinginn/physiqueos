import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFounderStoreUnitOfWork } from "../../data/repositories/FounderStoreUnitOfWork";
import { createPIGoalConfidencePersistenceService } from "./PIGoalConfidencePersistenceService";
import { createPIGoalConfidenceReadService } from "./PIGoalConfidenceReadService";
import {
  createPIGoalConfidenceRefreshReceipt,
  createPIGoalConfidenceRefreshService,
  PIGoalConfidenceTriggerType,
} from "./PIGoalConfidenceRefreshService";

const dirs = [];
afterEach(() => dirs.splice(0).forEach((dir) =>
  fs.rmSync(dir, { recursive: true, force: true })));

const goalContext = {
  goalId: "goal_build_lean_mass", semanticGoalType: "build_lean_mass",
};
const phaseContext = {
  phaseId: "phase_establish_maintenance",
  semanticPhaseType: "establish_maintenance",
};
const prepared = {
  publicationEligible: true,
  semanticChange: true,
  completenessImproved: true,
  piReasoningFingerprint: `sha256_${"a".repeat(64)}`,
  domainStates: {
    energy: { status: "near_maintenance", sourceObservationIds: ["energy_1"] },
    training: { status: "stable", sourceObservationIds: ["training_1"] },
    photos: { status: "stable", sourceObservationIds: ["photo_1"] },
  },
  evidenceCompleteness: { overall: "complete" },
  reasoning: {},
};

function request(overrides = {}) {
  return {
    triggerType: PIGoalConfidenceTriggerType.WEEKLY_ASSESSMENT,
    triggerId: "weekly_2026_07_25",
    publicationReason: "Closed Weekly evidence window.",
    goalContext, phaseContext, operatingState: "calibration",
    assessmentContext: {
      cadence: "weekly", evidenceWindowId: "week_2026_07_19_25",
    },
    evidenceWindow: { id: "week_2026_07_19_25" },
    evidenceCutoff: "2026-07-26T06:59:59.999Z",
    generatedAt: "2026-07-26T17:00:00.000Z",
    piVersion: "pi_v3",
    confidenceModelVersion: "pi_goal_confidence_scoring_v1",
    expectedRevision: 7,
    expectedSemanticDigest: "digest",
    preparedPIReasoning: prepared,
    ...overrides,
  };
}

function mocks({ series = emptySeries(), publication = { status: "published",
  revision: 8, commitId: "commit-1", snapshotId: "snapshot-1",
  historyRecordId: "history-1" } } = {}) {
  const readService = { getGoalConfidenceSeries: vi.fn(() => series) };
  const persistenceService = { publish: vi.fn(async () => publication) };
  return {
    readService, persistenceService,
    service: createPIGoalConfidenceRefreshService({ readService, persistenceService }),
  };
}

describe("PIGoalConfidenceRefreshService", () => {
  it("accepts prepared PI reasoning and publishes an initial assessment", async () => {
    const fixture = mocks();
    const result = await fixture.service.refresh(request());
    expect(result).toMatchObject({
      status: "published_initial", triggerId: "weekly_2026_07_25",
      publication: { revision: 8, commitId: "commit-1" },
    });
    expect(fixture.persistenceService.publish).toHaveBeenCalledOnce();
    expect(result.assessment.context.type).toBe("weekly_closed_window");
  });

  it("supports a preparation callback without querying raw evidence", async () => {
    const prepare = vi.fn(async () => prepared);
    const fixture = mocks();
    await fixture.service.refresh(request({
      preparedPIReasoning: undefined, preparePIReasoning: prepare,
    }));
    expect(prepare).toHaveBeenCalledWith({
      triggerType: "weekly_assessment", triggerId: "weekly_2026_07_25",
      evidenceCutoff: "2026-07-26T06:59:59.999Z",
    });
  });

  it("does not persist after preparation, mapper, or scorer failure", async () => {
    for (const setup of [
      { preparedPIReasoning: undefined, preparePIReasoning: () => { throw new Error("prepare"); } },
      { mapper: () => { throw new Error("map"); } },
      { scoringService: { score: () => { throw new Error("score"); } } },
    ]) {
      const fixture = mocks();
      const service = createPIGoalConfidenceRefreshService({
        readService: fixture.readService,
        persistenceService: fixture.persistenceService,
        mapper: setup.mapper,
        scoringService: setup.scoringService,
      });
      await service.refresh(request(setup));
      expect(fixture.persistenceService.publish).not.toHaveBeenCalled();
    }
  });

  it("returns not eligible when PI reports no semantic change", async () => {
    const fixture = mocks();
    expect(await fixture.service.refresh(request({
      preparedPIReasoning: { ...prepared, semanticChange: false },
    }))).toMatchObject({ status: "not_eligible" });
    expect(fixture.persistenceService.publish).not.toHaveBeenCalled();
  });

  it("maps all canonical trigger types to typed assessment contexts", async () => {
    const expected = {
      evidence_confirmation: "current_active_goal",
      training_performance_update: "current_active_goal",
      midweek_assessment: "midweek_partial_window",
      weekly_assessment: "weekly_closed_window",
      photo_event: "photo_event",
      dexa_event: "dexa_event",
      phase_transition: "phase_transition",
      controlled_reconciliation: "controlled_reconciliation",
    };
    for (const [triggerType, type] of Object.entries(expected)) {
      const fixture = mocks();
      const result = await fixture.service.refresh(request({
        triggerType, triggerId: `${triggerType}_1`,
        assessmentContext: {
          cadence: triggerType.includes("week") ? "weekly" : null,
          evidenceWindowId: ["midweek_assessment", "weekly_assessment"].includes(triggerType)
            ? "window_1" : null,
        },
      }));
      expect(result.assessment.context.type).toBe(type);
    }
  });

  it("passes current canonical assessment as successor provenance", async () => {
    const initial = await mocks().service.refresh(request());
    const snapshot = {
      id: "snapshot", currentAssessmentId: initial.assessment.id,
      currentScore: initial.score.current, evidenceCutoff: initial.assessment.evidenceCutoff,
      assessmentContext: initial.assessment.context,
    };
    const fixture = mocks({ series: {
      ...emptySeries(), canonicalSeriesExists: true, currentSnapshot: snapshot,
      latestCanonicalAssessment: initial.assessment,
      history: [{ assessmentId: initial.assessment.id, assessment: initial.assessment }],
    } });
    const result = await fixture.service.refresh(request({
      triggerId: "weekly_2", evidenceCutoff: "2026-08-02T06:59:59.999Z",
    }));
    expect(result.status).toBe("published_successor");
    expect(result.assessment.score.priorScoreProvenance.assessmentId)
      .toBe(initial.assessment.id);
  });

  it("blocks stale and lower-information replacement", async () => {
    const snapshot = {
      evidenceCutoff: "2026-08-02T06:59:59.999Z",
      assessmentContext: { type: "weekly_closed_window" },
    };
    const fixture = mocks({ series: { ...emptySeries(), currentSnapshot: snapshot } });
    expect(await fixture.service.refresh(request())).toMatchObject({ status: "stale_trigger" });

    const sameCutoff = mocks({ series: {
      ...emptySeries(), currentSnapshot: {
        ...snapshot, evidenceCutoff: "2026-07-26T06:59:59.999Z",
      },
    } });
    expect(await sameCutoff.service.refresh(request({
      triggerType: "photo_event", triggerId: "photo_1",
      assessmentContext: {}, preparedPIReasoning: {
        ...prepared, semanticChange: false,
      },
    }))).toMatchObject({ status: "not_eligible" });
  });

  it("creates deterministic refresh receipts and detects changed semantics", () => {
    const first = createPIGoalConfidenceRefreshReceipt({
      ...request(), assessmentContext: {
        type: "weekly_closed_window", cadence: "weekly",
        evidenceWindowId: "week_2026_07_19_25", eventId: null,
      },
      piReasoningFingerprint: prepared.piReasoningFingerprint,
    });
    const repeated = createPIGoalConfidenceRefreshReceipt({
      ...request(), assessmentContext: first.assessmentContext,
      piReasoningFingerprint: prepared.piReasoningFingerprint,
    });
    expect(first.id).toBe(repeated.id);
    expect(createPIGoalConfidenceRefreshReceipt({
      ...request(), assessmentContext: first.assessmentContext,
      piReasoningFingerprint: `sha256_${"b".repeat(64)}`,
    }).id).not.toBe(first.id);
  });

  it("rejects reuse of a trigger ID with changed semantic PI input", async () => {
    const receipt = createPIGoalConfidenceRefreshReceipt({
      ...request(), assessmentContext: {
        type: "weekly_closed_window", cadence: "weekly",
        evidenceWindowId: "week_2026_07_19_25", eventId: null,
      },
      piReasoningFingerprint: `sha256_${"b".repeat(64)}`,
    });
    const fixture = mocks({ series: {
      ...emptySeries(),
      history: [{
        publicationReason:
          `Earlier [trigger:weekly_assessment:weekly_2026_07_25] [${receipt.id}]`,
      }],
    } });
    expect(await fixture.service.refresh(request())).toMatchObject({
      status: "semantic_conflict",
    });
    expect(fixture.persistenceService.publish).not.toHaveBeenCalled();
  });

  it("maps persistence conflicts and committed publication failures truthfully", async () => {
    for (const [publication, status] of [
      [{ status: "runtime_digest_conflict" }, "baseline_conflict"],
      [{ status: "snapshot_state_conflict" }, "snapshot_conflict"],
      [{ status: "semantic_conflict" }, "semantic_conflict"],
      [{ status: "committed_publication_failure", committed: true },
        "committed_publication_failure"],
    ]) {
      expect(await mocks({ publication }).service.refresh(request()))
        .toMatchObject({ status });
    }
  });

  it("publishes controlled legacy reconciliation atomically in an isolated store", async () => {
    const fixture = isolated();
    const baseline = fixture.persistence.captureBaseline();
    const service = createPIGoalConfidenceRefreshService({
      readService: createPIGoalConfidenceReadService({ store: fixture.live }),
      persistenceService: fixture.persistence,
    });
    const result = await service.refresh(request({
      triggerType: "controlled_reconciliation",
      triggerId: "controlled_founder_fixture",
      publicationReason: "Authorized isolated continuity reconciliation.",
      assessmentContext: {},
      expectedRevision: baseline.revision,
      expectedSemanticDigest: baseline.semanticDigest,
      legacyContinuitySeedAuthorization: true,
      legacyContinuityScore: 44,
      legacySourceTimestamp: "2026-07-25T21:13:27.000Z",
      legacySourceFingerprint: "legacy_home_44_fixture",
      preparedPIReasoning: {
        ...prepared,
        domainStates: {
          training: { status: "broad_constructive" },
          energy: { status: "incomplete" },
          weight: { status: "volatile" },
          photos: { status: "stable" },
          recovery: { status: "unknown" },
          dexa: { status: "missing" },
        },
        evidenceCompleteness: { overall: "partial" },
      },
    }));
    const saved = JSON.parse(fs.readFileSync(fixture.file, "utf8"));
    expect(result).toMatchObject({
      status: "published_reconciliation",
      score: { current: 58, prior: 44, delta: 14 },
    });
    expect(saved).toMatchObject({ revision: 8 });
    expect(saved.goalConfidenceContinuitySeeds).toHaveLength(1);
    expect(saved.goalConfidenceSnapshots).toHaveLength(1);
    expect(saved.goalConfidenceHistory).toHaveLength(1);
    expect(saved.goalConfidenceContinuitySeeds[0].piDerived).toBe(false);
  });
});

function emptySeries() {
  return {
    currentSnapshot: null, history: [], continuitySeed: null,
    latestCanonicalAssessment: null, priorCanonicalAssessment: null,
    canonicalSeriesExists: false, legacySeedOnly: false,
  };
}
function isolated() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-refresh-"));
  dirs.push(dir);
  const file = path.join(dir, "runtime.json");
  const live = {
    version: "test", revision: 7, lastCommitId: "before",
    updatedAt: "2026-07-26T16:00:00.000Z", user: { id: "user" },
    goals: [{
      id: goalContext.goalId, status: "active", type: "build_lean_mass",
      openingApproach: { value: "calibration" },
      phases: [{ id: phaseContext.phaseId, goalId: goalContext.goalId, status: "active" }],
    }],
    goalConfidenceSnapshots: [], goalConfidenceHistory: [],
    goalConfidenceContinuitySeeds: [],
  };
  fs.writeFileSync(file, JSON.stringify(live));
  let commit = 0;
  const persistence = createPIGoalConfidencePersistenceService({
    filePath: file, liveStore: live,
    now: () => new Date("2026-07-26T17:00:00.000Z"),
    createUnitOfWork: (options) => createFounderStoreUnitOfWork({
      ...options, createCommitId: () => `commit-${++commit}`,
      createTransactionId: () => `tx-${commit}`,
    }),
  });
  return { file, live, persistence };
}

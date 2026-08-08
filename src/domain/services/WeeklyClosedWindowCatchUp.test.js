import { describe, expect, it, vi } from "vitest";
import { createWeeklyNarrativeService } from "./WeeklyNarrativeService";

const contract = {
  cadence: "weekly", startDate: "2026-07-19", endDate: "2026-07-25",
  briefingDate: "2026-07-26", timeZone: "America/Los_Angeles",
  expectedArtifactId: "weekly_briefing_2026-07-19_2026-07-25",
  reason: "test_catch_up",
};
const goal = {
  id: "build", title: "Build Lean Mass", type: "build_lean_mass", status: "active", primary: true,
  openingApproach: { value: "calibration" },
  phases: [{ id: "phase", name: "Establish Maintenance", status: "active", startDate: "2026-07-20" }],
};

function setup({ now = "2026-07-27T18:00:00Z", createError = null } = {}) {
  const records = [];
  const create = vi.fn(async (artifact) => {
    if (createError) throw createError;
    const index = records.findIndex((item) => item.id === artifact.id || item.evidenceWindow?.id === artifact.evidenceWindow?.id);
    if (index >= 0) records[index] = artifact; else records.push(artifact);
    return artifact;
  });
  const repositories = {
    users: { getCurrentUser: async () => ({ id: "u", timeZone: "America/Los_Angeles" }) },
    canonicalEvidence: { listCanonicalEvidenceObjects: async () => [] },
    weights: { listWeightEntries: async () => [] },
    dexaScans: { listDEXAScans: async () => [{ id: "jul18", userId: "u", measuredAt: "2026-07-18" }] },
    progressPhotos: { listPhotos: async () => [] },
    analyses: { listAnalyses: async () => [] },
    goals: { getActiveGoal: async () => goal, listGoals: async () => [goal] },
    protocols: { listActiveProtocols: async () => [] },
    executionItems: { listExecutionItems: async () => [{ id: "aug15", type: "dexa_appointment", active: true, status: "scheduled", linkedGoalIds: ["build"], preferredSchedule: { date: "2026-08-15" } }] },
    dailyBriefings: {
      listCompletedBriefingsInWindow: async () => [],
      getLatestWeeklyBriefing: async () => records.at(-1) ?? null,
      getBriefingByEvidenceWindow: async (userId, id) => records.find((item) => item.userId === userId && item.evidenceWindow?.id === id) ?? null,
      createDailyBriefing: create,
    },
  };
  const weeklyPersistence = {
    captureBaseline: () => ({ revision: 1, semanticDigest: "test", fileHash: "test" }),
    commit: vi.fn(async (prepared) => {
      const existing = records.find((item) => item.id === prepared.artifact.id || item.evidenceWindow?.id === prepared.artifact.evidenceWindow?.id);
      if (existing) return { status: "matched", artifact: existing, committed: false };
      try {
        const artifact = await create(prepared.artifact);
        return { status: "created", artifact, revision: 2, commitId: "commit-test", updatedAt: "2026-07-27T18:00:00Z" };
      } catch (error) {
        return { status: "persistence_failure", error: { code: error.code, message: error.message } };
      }
    }),
  };
  const confidenceStoreResolver = () => confidenceStore();
  return { records, create, repositories, weeklyPersistence, service: createWeeklyNarrativeService({ repositories, weeklyPersistence, confidenceStoreResolver, now: () => new Date(now) }) };
}

describe("explicit Weekly closed-window catch-up", () => {
  it.each(["2026-07-27T18:00:00Z", "2026-07-28T18:00:00Z"])("preserves the exact July 19-25 window on later invocation dates", async (now) => {
    const { service } = setup({ now });
    const result = await service.prepareClosedWindow({ userId: "u", windowContract: contract });
    expect(result).toMatchObject({ status: "prepared", artifact: { id: contract.expectedArtifactId, evidenceWindow: { startDate: contract.startDate, endDate: contract.endDate } } });
  });
  it("creates once, then replays as matched without duplicating PI memory or writes", async () => {
    const { service, records, create } = setup();
    const first = await service.catchUpClosedWindow({ userId: "u", windowContract: contract });
    const memory = structuredClone(first.artifact.piMemory);
    const second = await service.catchUpClosedWindow({ userId: "u", windowContract: contract });
    expect(first.status).toBe("created");
    expect(second.status).toBe("matched");
    expect(records).toHaveLength(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(records[0].piMemory).toEqual(memory);
  });
  it("keeps one deterministic artifact under concurrent invocation", async () => {
    const { service, records } = setup();
    const results = await Promise.all([
      service.catchUpClosedWindow({ userId: "u", windowContract: contract }),
      service.catchUpClosedWindow({ userId: "u", windowContract: contract }),
    ]);
    expect(results.map((item) => item.status).every((status) => ["created", "matched"].includes(status))).toBe(true);
    expect(records.filter((item) => item.id === contract.expectedArtifactId)).toHaveLength(1);
  });
  it("returns an identity conflict without overwriting", async () => {
    const { service, records, create } = setup();
    records.push({ id: "conflict", userId: "u", cadence: "weekly", artifactType: "scheduled", evidenceWindow: { id: "weekly:2026-07-19:2026-07-25:America/Los_Angeles", startDate: "2026-07-19", endDate: "2026-07-25", briefingDate: "2026-07-26" } });
    expect(await service.catchUpClosedWindow({ userId: "u", windowContract: contract })).toMatchObject({ status: "artifact_identity_mismatch" });
    expect(create).not.toHaveBeenCalled();
  });
  it("returns typed persistence failure and leaves the isolated store unchanged", async () => {
    const { service, records } = setup({ createError: Object.assign(new Error("disk failed"), { code: "PERSISTENCE_FAILED" }) });
    expect(await service.catchUpClosedWindow({ userId: "u", windowContract: contract })).toMatchObject({ status: "persistence_failure", error: { code: "PERSISTENCE_FAILED" } });
    expect(records).toEqual([]);
  });
  it("rejects invalid windows without reading or writing evidence", async () => {
    const { service, create } = setup();
    expect(await service.catchUpClosedWindow({ userId: "u", windowContract: { ...contract, startDate: "2026-07-20" } })).toMatchObject({ status: "invalid_window" });
    expect(create).not.toHaveBeenCalled();
  });
  it("returns typed generation failure", async () => {
    const fixture = setup();
    fixture.repositories.canonicalEvidence.listCanonicalEvidenceObjects = async () => {
      throw Object.assign(new Error("evidence failed"), { code: "EVIDENCE_FAILED" });
    };
    fixture.service = createWeeklyNarrativeService({
      repositories: fixture.repositories,
      weeklyPersistence: fixture.weeklyPersistence,
      confidenceStoreResolver: () => confidenceStore(),
      now: () => new Date("2026-07-27T18:00:00Z"),
    });
    expect(await fixture.service.catchUpClosedWindow({ userId: "u", windowContract: contract })).toMatchObject({
      status: "generation_failure", error: { code: "EVIDENCE_FAILED" },
    });
  });
  it("keeps the convenience catch-up on the normal Sunday-derived window", async () => {
    const { service } = setup({ now: "2026-07-26T18:00:00Z" });
    const result = await service.catchUpLatestClosedWindow({ userId: "u" });
    expect(result).toMatchObject({
      status: "created",
      contract: { startDate: "2026-07-19", endDate: "2026-07-25", briefingDate: "2026-07-26" },
      artifact: { id: contract.expectedArtifactId },
    });
  });
  it("prepares v5.2 Build Lean Mass calibration semantics without writing", async () => {
    const { service, records, create } = setup();
    const result = await service.prepareClosedWindow({ userId: "u", windowContract: contract });
    expect(result).toMatchObject({
      status: "prepared",
      preparation: {
        productionStatus: "missing", narrativeVersion: "weekly_narrative_v5_2",
        goal: { title: "Build Lean Mass" }, phase: { name: "Establish Maintenance" },
        operatingState: { value: "calibration" }, milestone: { date: "2026-08-15" },
        semanticValidation: { currentGoalAware: true, staleCutLanguageAbsent: true, unsupportedLeanMassClaimAbsent: true },
        expectedCommitScope: ["dailyBriefings"],
      },
    });
    expect(records).toEqual([]);
    expect(create).not.toHaveBeenCalled();
  });
});

function confidenceStore() {
  const assessment = {
    schemaVersion: "pi_goal_confidence_assessment_v1", id: "assessment-prior",
    goalId: "build", phaseId: "phase", operatingState: "calibration",
    evidenceCutoff: "2026-07-18T23:59:59.999Z",
    score: { current: 58, prior: 58, band: "moderate",
      movement: { direction: "held", magnitude: "none" } },
    contributors: [], unresolvedUncertainty: [],
    primaryReason: "Persisted canonical context.",
    provenance: { generatedAt: "2026-07-19T12:00:00.000Z" },
  };
  return { goalConfidenceSnapshots: [{ id: "snapshot-prior", goalId: "build",
    phaseId: "phase", operatingState: "calibration",
    currentAssessmentId: assessment.id, currentScore: 58, scoreBand: "moderate" }],
  goalConfidenceHistory: [{ id: "history-prior", assessmentId: assessment.id,
    goalId: "build", phaseId: "phase", persistedAt:
      "2026-07-19T12:00:00.000Z", assessment }] };
}

import { describe, expect, it, vi } from "vitest";
import { createWeeklyNarrativeService } from "./WeeklyNarrativeService";

const TZ = "America/Los_Angeles";

function setup() {
  const canonicalObjects = [{ canonicalId: "activity_day|2026-07-08", evidence_type: "activity_day", payload: {
    evidence_type: "activity_day", observed_at: "2026-07-08", daily_activity: { move_calories: 700 } } }];
  const weightEntries = [];
  const briefings = new Map();
  const repositories = {
    users: { getCurrentUser: async () => ({ id: "user", timeZone: TZ }), getUserById: async () => ({ id: "user", timeZone: TZ }) },
    canonicalEvidence: { listCanonicalEvidenceObjects: vi.fn(async () => canonicalObjects) },
    weights: { listWeightEntries: async () => weightEntries },
    dailyBriefings: {
      listCompletedBriefingsInWindow: async () => [],
      getLatestWeeklyBriefing: async () => [...briefings.values()].at(-1) ?? null,
      listDailyBriefings: async () => [...briefings.values()],
      getBriefingById: async (id) => briefings.get(id) ?? null,
    },
    goals: { getActiveGoal: async () => null, listGoals: async () => [] },
  };
  const publish = vi.fn(async ({ artifact }) => {
    briefings.set(artifact.id, artifact);
    return { committed: true, status: "created", artifact, revision: 2, commitId: "c" };
  });
  const service = createWeeklyNarrativeService({
    repositories,
    weeklyPersistence: { captureBaseline: () => ({ revision: 1, semanticDigest: "t", fileHash: "t" }), commit: vi.fn() },
    cadenceLifecycle: { publish },
    now: () => new Date("2026-07-12T18:00:00Z"),
  });
  return { service, repositories, publish, canonicalObjects, weightEntries };
}

describe("Weekly hands its already-read canonical evidence to the shared Briefing Intelligence layer", () => {
  it("generate(): the same objects it read reach publication, with no second repository read", async () => {
    const { service, repositories, publish, canonicalObjects } = setup();
    await service.generate({ userId: "user", reason: "scheduled_weekly_cadence" });
    expect(repositories.canonicalEvidence.listCanonicalEvidenceObjects).toHaveBeenCalledTimes(1);
    const { periodEvidence, artifact } = publish.mock.calls[0][0];
    expect(periodEvidence.canonicalObjects).toBe(canonicalObjects);
    expect(periodEvidence.window).toEqual({ startDate: artifact.evidenceWindow.startDate, endDate: artifact.evidenceWindow.endDate });
    expect(periodEvidence.timeZone).toBe(TZ);
  });

  it("prepareRegeneration() + executePreparedRegeneration(): regeneration publishes with its own evidence and does not throw", async () => {
    const { service, repositories, publish, canonicalObjects } = setup();
    const created = await service.generate({ userId: "user", reason: "scheduled_weekly_cadence" });
    repositories.canonicalEvidence.listCanonicalEvidenceObjects.mockClear();
    const prepared = await service.prepareRegeneration({ userId: "user", reason: "late_evidence", targetArtifactId: created.id });
    expect(prepared.periodEvidence.canonicalObjects).toBe(canonicalObjects);
    const result = await service.executePreparedRegeneration({ prepared });
    expect(result.status).toBe("regenerated");
    expect(repositories.canonicalEvidence.listCanonicalEvidenceObjects).toHaveBeenCalledTimes(1);
    const last = publish.mock.calls.at(-1)[0];
    expect(last.operation).toBe("regenerate");
    expect(last.periodEvidence.canonicalObjects).toBe(canonicalObjects);
  });

  it("two concurrent generations each publish with their own evidence (no shared state)", async () => {
    const first = setup();
    const second = setup();
    await Promise.all([
      first.service.generate({ userId: "user", reason: "scheduled_weekly_cadence" }),
      second.service.generate({ userId: "user", reason: "scheduled_weekly_cadence" }),
    ]);
    expect(first.publish.mock.calls[0][0].periodEvidence.canonicalObjects).toBe(first.canonicalObjects);
    expect(second.publish.mock.calls[0][0].periodEvidence.canonicalObjects).toBe(second.canonicalObjects);
  });
});

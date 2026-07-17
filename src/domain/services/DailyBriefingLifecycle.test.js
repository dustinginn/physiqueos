import { describe, expect, it, vi } from "vitest";
import { createDailyBriefingRepository } from "../../data/repositories/DailyBriefingRepository";
import { createDailyBriefingService } from "./DailyBriefingService";
import { resolveScheduledBriefingExpectation } from "./BriefingEvidenceWindowService";
import { getDailyBriefingFreshness } from "./DailyBriefingFreshnessService";

const JUL_14 = new Date("2026-07-14T14:00:00.000Z");
const user = { id: "founder", timeZone: "America/Los_Angeles" };

function harness({ composer = vi.fn(async () => ({ version: "test", hero: { title: "Current belief" } })) } = {}) {
  const records = [];
  const onChange = vi.fn();
  const dailyBriefings = createDailyBriefingRepository(records, { onChange });
  const repositories = {
    users: { getCurrentUser: vi.fn(async () => user), getUserById: vi.fn(async () => user) },
    dailyBriefings,
  };
  const timestamps = ["2026-07-14T14:00:00.000Z", "2026-07-14T14:00:01.000Z"];
  let index = 0;
  const service = createDailyBriefingService({
    repositories,
    now: () => new Date(timestamps[Math.min(index++, timestamps.length - 1)]),
    scheduledComposer: composer,
  });
  return { composer, dailyBriefings, onChange, records, service };
}

describe("scheduled Daily lifecycle", () => {
  it("resolves Jul 14 PDT to the closed Jul 13 Daily identity", () => {
    expect(resolveScheduledBriefingExpectation({ now: JUL_14, timeZone: user.timeZone })).toMatchObject({
      localDate: "2026-07-14",
      briefingDate: "2026-07-14",
      evidenceThroughDate: "2026-07-13",
      windowId: "daily:2026-07-13:America/Los_Angeles",
      artifactId: "daily_briefing_20260713",
      cadence: "daily",
      closed: true,
    });
  });

  it("creates the stable artifact once and returns it unchanged on retry", async () => {
    const { composer, records, service } = harness();
    const first = await service.generateScheduledDailyBriefingForClosedWindow({ asOf: JUL_14 });
    const generatedAt = first.artifact.generatedAt;
    const second = await service.generateScheduledDailyBriefingForClosedWindow({ asOf: JUL_14 });
    expect(first.state).toBe("created");
    expect(second.state).toBe("already_exists");
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      id: "daily_briefing_20260713",
      cadence: "daily",
      evidenceWindow: { id: "daily:2026-07-13:America/Los_Angeles", date: "2026-07-13" },
      lifecycle: { generationStatus: "complete" },
    });
    expect(records[0].generatedAt).toBe(generatedAt);
    expect(records[0].replacedBriefingHistory).toBeUndefined();
    expect(composer).toHaveBeenCalledTimes(1);
  });

  it("admits one persisted claim when two requests arrive together", async () => {
    let release;
    const blocked = new Promise((resolve) => { release = resolve; });
    const composer = vi.fn(async () => { await blocked; return { version: "test", hero: { title: "One" } }; });
    const { records, service } = harness({ composer });
    const firstPromise = service.generateScheduledDailyBriefingForClosedWindow({ asOf: JUL_14 });
    await Promise.resolve();
    await Promise.resolve();
    const second = await service.generateScheduledDailyBriefingForClosedWindow({ asOf: JUL_14 });
    release();
    const first = await firstPromise;
    expect([first.state, second.state].sort()).toEqual(["created", "in_progress"]);
    expect(records).toHaveLength(1);
    expect(composer).toHaveBeenCalledTimes(1);
  });

  it("blocks Daily generation when Sunday Weekly owns cadence", async () => {
    const { composer, records, service } = harness();
    const result = await service.generateScheduledDailyBriefingForClosedWindow({ asOf: new Date("2026-07-12T18:00:00Z") });
    expect(result.state).toBe("blocked_by_precedence");
    expect(records).toHaveLength(0);
    expect(composer).not.toHaveBeenCalled();
  });
});

describe("cadence-aware Daily freshness", () => {
  const expectedWindow = resolveScheduledBriefingExpectation({ now: JUL_14, timeZone: user.timeZone }).evidenceWindow;
  const artifact = {
    id: "daily_briefing_20260713",
    generatedAt: "2026-07-14T13:00:00Z",
    evidenceWindow: expectedWindow,
    briefing: { evidenceReconciliation: { date: "2026-07-13" } },
  };

  it("does not stale the Jul 13 window with a routine Jul 14 weigh-in", () => {
    const result = getDailyBriefingFreshness({
      dailyBriefing: artifact,
      expectedWindow,
      weightEntries: [{ id: "w14", measuredAt: "2026-07-14", updatedAt: "2026-07-14T13:58:42Z" }],
    });
    expect(result.status).toBe("current");
  });

  it("stales the briefing for a later correction inside the Jul 13 window", () => {
    const result = getDailyBriefingFreshness({
      dailyBriefing: artifact,
      expectedWindow,
      weightEntries: [{ id: "w13", measuredAt: "2026-07-13", updatedAt: "2026-07-14T13:58:42Z" }],
    });
    expect(result.status).toBe("stale");
  });
});

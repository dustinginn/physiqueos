import { describe, expect, it } from "vitest";
import {
  briefingArtifactIntersectsWindow,
  createDailyBriefingRepository,
} from "./DailyBriefingRepository";

const window = {
  id: "weekly:2026-07-19:2026-07-25",
  startDate: "2026-07-19",
  endDate: "2026-07-25",
};

describe("bounded Weekly artifact discovery", () => {
  it("uses inclusive date and evidence-window intersection semantics", () => {
    expect(briefingArtifactIntersectsWindow(event("sun", "2026-07-19"), window)).toBe(true);
    expect(briefingArtifactIntersectsWindow(event("sat", "2026-07-25"), window)).toBe(true);
    expect(briefingArtifactIntersectsWindow(event("before", "2026-07-18"), window)).toBe(false);
    expect(briefingArtifactIntersectsWindow(event("after", "2026-07-26"), window)).toBe(false);
    expect(briefingArtifactIntersectsWindow({
      ...scheduled("overlap", "daily", "2026-07-18"),
      evidenceWindow: { startDate: "2026-07-18", endDate: "2026-07-19" },
    }, window)).toBe(true);
  });

  it("filters by user and completion state and applies a hard result bound", async () => {
    const records = [
      event("photo", "2026-07-20", { trigger: { evidenceType: "photo_session" } }),
      event("dexa", "2026-07-21", { trigger: { evidenceType: "dexa_scan" } }),
      event("other-user", "2026-07-22", { userId: "other" }),
      event("failed", "2026-07-22", { lifecycle: { generationStatus: "failed" } }),
      event("pending", "2026-07-22", { lifecycle: { generationStatus: "in_progress" } }),
      ...Array.from({ length: 20 }, (_, index) =>
        scheduled(`daily-${index}`, "daily", `2026-07-${19 + index % 7}`)
      ),
    ];
    const repository = createDailyBriefingRepository(records);
    const result = await repository.listCompletedBriefingsInWindow("founder", window, { limit: 14 });
    expect(result).toHaveLength(14);
    expect(result.slice(0, 2).map((item) => item.id)).toEqual(["dexa", "photo"]);
    expect(result.every((item) => item.userId === "founder" && item.briefing)).toBe(true);
    expect(result.some((item) => ["failed", "pending"].includes(item.id))).toBe(false);
  });

  it("prioritizes authoritative events and the current Weekly occurrence on overflow", async () => {
    const records = [
      scheduled("weekly", "weekly", "2026-07-25", { evidenceWindow: window }),
      ...Array.from({ length: 18 }, (_, index) =>
        scheduled(`daily-${index}`, "daily", `2026-07-${19 + index % 7}`)
      ),
      event("milestone", "2026-07-20", { trigger: { eventType: "milestone" } }),
    ];
    const result = await createDailyBriefingRepository(records)
      .listCompletedBriefingsInWindow("founder", window, { limit: 14 });
    expect(result[0].id).toBe("milestone");
    expect(result[1].id).toBe("weekly");
  });
});

function event(id, date, overrides = {}) {
  return {
    id,
    userId: "founder",
    artifactType: "event",
    cadence: "event",
    generatedAt: `${date}T18:00:00.000Z`,
    lifecycle: { generationStatus: "completed" },
    trigger: { eventDate: date },
    briefing: { event: { id } },
    ...overrides,
  };
}

function scheduled(id, cadence, date, overrides = {}) {
  return {
    id,
    userId: "founder",
    artifactType: "scheduled",
    cadence,
    generatedAt: `${date}T18:00:00.000Z`,
    lifecycle: { generationStatus: "completed" },
    evidenceWindow: {
      id: `${cadence}:${date}`,
      cadence,
      startDate: date,
      endDate: date,
    },
    briefing: { id },
    ...overrides,
  };
}

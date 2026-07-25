import { describe, expect, it, vi } from "vitest";
import {
  createCadenceContinuityInput,
  loadLatestCadenceBriefingContinuity,
} from "./CadenceBriefingContinuityService";
import { createPIBriefingMemory } from "./PIBriefingMemoryService";

describe("CadenceBriefingContinuityService", () => {
  it.each([
    ["midweek", "getLatestMidweekBriefing", "getLatestWeeklyBriefing"],
    ["weekly", "getLatestWeeklyBriefing", "getLatestMidweekBriefing"],
  ])("performs exactly one bounded %s read", async (cadence, expected, other) => {
    const repository = {
      [expected]: vi.fn(async () => ({
        id: `${cadence}-1`,
        cadence,
        briefing: {
          piMemory: createPIBriefingMemory({
            cadence,
            briefingDate: "2026-07-22",
            communicatedClaimIds: ["claim-1"],
            claimHistory: [{ claimId: "claim-1" }],
          }),
        },
      })),
      [other]: vi.fn(),
      listDailyBriefings: vi.fn(),
    };
    const result = await loadLatestCadenceBriefingContinuity({
      repository,
      userId: "u",
      cadence,
      excludeArtifactId: "current",
    });
    expect(repository[expected]).toHaveBeenCalledTimes(1);
    expect(repository[expected]).toHaveBeenCalledWith("u", {
      excludeArtifactId: "current",
    });
    expect(repository[other]).not.toHaveBeenCalled();
    expect(repository.listDailyBriefings).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "available",
      communicatedClaimIds: ["claim-1"],
      provenance: { readLimit: 1, proseParsed: false },
    });
  });

  it("does not reconstruct continuity from narrative prose", () => {
    expect(createCadenceContinuityInput({
      id: "m",
      cadence: "midweek",
      evidenceWindow: { endDate: "2026-07-21" },
      briefing: { hero: { summary: "claim-1 was communicated" } },
    }, "midweek")).toMatchObject({
      status: "unavailable",
      communicatedClaimIds: [],
      limitations: ["structured_pi_memory_unavailable"],
    });
  });

  it.each([
    [null, "same_cadence_history_empty"],
    [new Error("read failed"), "same_cadence_history_read_failed"],
  ])("isolates empty and failed history reads", async (value, reason) => {
    const repository = {
      getLatestMidweekBriefing: vi.fn(async () => {
        if (value instanceof Error) throw value;
        return value;
      }),
    };
    const result = await loadLatestCadenceBriefingContinuity({
      repository,
      userId: "u",
      cadence: "midweek",
    });
    expect(result.status).toBe("unavailable");
    expect(result.limitations).toEqual([reason]);
  });

  it("bounds structured memory deterministically", () => {
    const result = createCadenceContinuityInput({
      id: "m",
      cadence: "midweek",
      briefing: {
        piMemory: createPIBriefingMemory({
          cadence: "midweek",
          briefingDate: "2026-07-22",
          communicatedClaimIds: Array.from({ length: 30 }, (_, index) => `c${index}`),
          claimHistory: Array.from({ length: 60 }, (_, index) => ({
            claimId: `h${index}`,
            prose: "must not survive",
          })),
          trainingPRClaimIds: ["pr-1", "pr-1"],
        }),
      },
    }, "midweek");
    expect(result.communicatedClaimIds).toHaveLength(24);
    expect(result.claimHistory).toHaveLength(48);
    expect(result.claimHistory[0]).not.toHaveProperty("prose");
    expect(result.trainingPRIds).toEqual(["pr-1"]);
  });
});

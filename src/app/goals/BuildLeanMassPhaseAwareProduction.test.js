import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getPhaseAwareActiveGoalPreview } from "../../domain/services/PhaseAwareActiveGoalPreviewService";

const storePath = path.resolve(process.cwd(), "private/founder/runtime-store.json");

describe("Build Lean Mass phase-aware production", () => {
  it("projects the approved production hierarchy without writing runtime data", async () => {
    const before = fs.readFileSync(storePath, "utf8");
    // Keep the production contract stable as wall-clock time advances toward review day.
    const result = await getPhaseAwareActiveGoalPreview({
      currentDate: new Date("2026-08-16T12:00:00.000Z"),
    });
    const after = fs.readFileSync(storePath, "utf8");

    expect(after).toBe(before);
    expect(result.hero).toMatchObject({
      title: "Build Lean Mass",
      status: "Active Goal",
      destination: "Build 10 lb of lean mass by October 31, 2026",
      // Phase 2's Starting Forecast (goal_initialization) is internal-only and must not
      // supersede Home's user-facing Confidence; the latest briefing-published value (the
      // Phase 1 weekly briefing) carries forward until Phase 2 has its own briefing.
      confidence: "60% confidence",
      confidenceBand: "Moderate",
      editHref: expect.stringMatching(/^\/goals\/.+\/edit$/),
    });
    expect(result.journey).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Establish Maintenance",
          status: "Completed",
          // Pre-existing staleness unrelated to this patch: completed phases render "gold",
          // matching PhaseAwareActiveGoalPreviewService.test.js's own assertion.
          color: "gold",
          progress: "Completed",
        }),
        expect.objectContaining({
          name: "Lean Mass Build",
          status: "Active",
          color: "green",
          progress: "0.8 of 10 lb gained",
          support: "11 weeks to goal target",
        }),
      ])
    );
    expect(result.guardrail).toMatchObject({
      scope: "Applies across every phase",
    });
    // Pre-existing staleness unrelated to this patch: the evidence shape split into
    // goalBaseline/phaseStart before this session; `dexa` was never a real key.
    expect(result.evidence.goalBaseline).toMatchObject({
      date: "2026-07-18",
      bodyFat: "7.7%",
      leanMass: "147.5 lb",
      fatMass: "12.8 lb",
      weight: "167.4 lb",
    });
    expect(result.trainingProgress).toBeNull();
    expect(result.turningPoints).not.toContainEqual(
      expect.objectContaining({ title: "Four-week training review" })
    );
    expect(result.actions).toEqual({
      strategyHref: "/profile/operating-plan",
      protocolsHref: "/profile/operating-plan",
    });
  });
});

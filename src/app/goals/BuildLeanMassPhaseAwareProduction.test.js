import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getPhaseAwareActiveGoalPreview } from "../../domain/services/PhaseAwareActiveGoalPreviewService";

const storePath = path.resolve(process.cwd(), "private/founder/runtime-store.json");

describe("Build Lean Mass phase-aware production", () => {
  it("projects the approved production hierarchy without writing runtime data", async () => {
    const before = fs.readFileSync(storePath, "utf8");
    const result = await getPhaseAwareActiveGoalPreview();
    const after = fs.readFileSync(storePath, "utf8");

    expect(after).toBe(before);
    expect(result.hero).toMatchObject({
      title: "Build Lean Mass",
      status: "Active Goal",
      destination: "Build 10 lb of lean mass by October 31, 2026",
      confidence: "44% confidence",
      confidenceBand: "Moderate",
      editHref: expect.stringMatching(/^\/goals\/.+\/edit$/),
    });
    expect(result.journey).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Establish Maintenance",
          status: "Active",
          color: "orange",
          progress: "Week 1 of 4",
        }),
        expect.objectContaining({
          name: "Lean Mass Build",
          status: "Upcoming",
          color: "green",
          progress: "0 of 10 lb measured",
          support: "Awaiting next DEXA",
        }),
      ])
    );
    expect(result.guardrail).toMatchObject({
      scope: "Applies across every phase",
    });
    expect(result.evidence.dexa).toMatchObject({
      date: "2026-07-18",
      bodyFat: "7.7%",
      leanMass: "147.5 lb",
      fatMass: "12.8 lb",
      weight: "167.4 lb",
    });
    expect(result.trainingProgress).toMatchObject({
      periodStart: "2026-07-20",
      periodEnd: "2026-08-16",
      reviewDate: "2026-08-17",
      readinessState: "waiting_for_evidence",
      checkpointEligibility: false,
    });
    expect(result.turningPoints).not.toContainEqual(
      expect.objectContaining({ title: "Four-week training review" })
    );
    expect(result.actions).toEqual({
      strategyHref: "/profile/operating-plan",
      protocolsHref: "/profile/operating-plan",
    });
  });
});

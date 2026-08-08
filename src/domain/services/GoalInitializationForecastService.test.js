import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createGoalInitializationForecastService } from
  "./GoalInitializationForecastService";
import { createCanonicalBriefingConfidencePublicationService } from
  "./CanonicalBriefingConfidencePublicationService";

const directories = [];
afterEach(() => directories.splice(0).forEach((directory) =>
  fs.rmSync(directory, { recursive: true, force: true })));

describe("Goal initialization Starting Forecast", () => {
  it("atomically establishes a contextual first assessment and initialization artifact", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "goal-init-v2-"));
    directories.push(directory);
    const filePath = path.join(directory, "store.json");
    const store = { revision: 2, updatedAt: "2026-08-01T00:00:00.000Z",
      lastCommitId: "prior", dailyBriefings: [],
      confidenceInitializationArtifacts: [], goalConfidenceHistory: [],
      goalConfidenceSnapshots: [], goalConfidenceContinuitySeeds: [] };
    fs.writeFileSync(filePath, `${JSON.stringify(store)}\n`);
    const now = () => new Date("2026-08-01T12:00:00.000Z");
    const publicationService = createCanonicalBriefingConfidencePublicationService({
      filePath, liveStore: structuredClone(store), now,
    });
    const service = createGoalInitializationForecastService({
      publicationService, now,
    });
    const result = await service.initialize({
      userId: "user-one", activeGoal: goal(), activePhase: goal().phases[0],
      occurrenceId: "transition-one",
      startingForecastContext: {
        experience: "experienced_user", goalAmbition: "high",
        timelineFeasibility: "reasonable", baselineQuality: "known",
        priorGoalHistory: "strong", historicalExecution: "strong",
        strategyQuality: "strong", priorGoalRefs: ["prior-goal"],
      },
      sourceLineage: { transitionId: "transition-one" },
    });
    expect(result.commitResult).toMatchObject({
      status: "published_initial", committed: true,
    });
    expect(result.confidenceAssessment.currentPercentage).not.toBe(50);
    const persisted = JSON.parse(fs.readFileSync(filePath, "utf8"));
    expect(persisted.confidenceInitializationArtifacts).toHaveLength(1);
    expect(persisted.goalConfidenceHistory).toHaveLength(1);
    expect(persisted.goalConfidenceSnapshots[0].currentAssessmentId)
      .toBe(result.confidenceAssessment.id);
    expect(persisted.confidenceInitializationArtifacts[0]
      .confidencePublication.assessmentId).toBe(result.confidenceAssessment.id);

    const replay = await service.initialize({
      userId: "user-one", activeGoal: goal(), activePhase: goal().phases[0],
      occurrenceId: "transition-one", startingForecastContext: {},
    });
    expect(replay).toMatchObject({
      status: "goal_confidence_series_already_initialized",
      commitResult: { committed: false },
    });
  });
});

function goal() {
  return {
    id: "goal-one", type: "body_composition",
    updatedAt: "2026-08-01T12:00:00.000Z",
    activatedAt: "2026-08-01T12:00:00.000Z",
    purpose: "Build lean mass while controlling body fat",
    target: { type: "numeric_change", metric: "lean_mass",
      direction: "increase", amount: 10, unit: "lb",
      description: "Build 10 lb lean mass", targetDate: "2026-12-31" },
    timeline: { startDate: "2026-08-01", targetDate: "2026-12-31" },
    openingApproach: { value: "calibration", known: [], unknown: [] },
    phases: [{ id: "phase-one", status: "active", name: "Calibration",
      purpose: "Establish maintenance", successCriteria: [] }],
    guardrails: [{ id: "body-fat", accepted: true,
      text: "Maintain approximately 8-9% body fat." }],
    progressMeasurement: { outcomeMeasures: [{ id: "dexa", accepted: true,
      evidenceType: "dexa_lean_mass", role: "outcome" }],
    predictiveSignals: [{ id: "training", accepted: true,
      evidenceType: "training_trend", role: "predictive" }],
    explanatorySignals: [] },
  };
}

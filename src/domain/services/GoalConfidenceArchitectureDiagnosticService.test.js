import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { ConfidencePublisherRegistry } from
  "../confidence/ConfidencePublisherRegistry";
import {
  diagnoseGoalConfidenceArchitecture,
} from "./GoalConfidenceArchitectureDiagnosticService";
import { HomeBriefingService } from "./HomeBriefingService";
import { createDailyBriefingService } from "./DailyBriefingService";
import { FounderRepositories } from "../../data/repositories/founderRepositories";

const file = "private/founder/runtime-store.json";
const read = () => JSON.parse(fs.readFileSync(file, "utf8"));

describe("goal confidence architecture diagnostic", () => {
  it("reports the persisted canonical owner and unchanged publisher registry", () => {
    const result = diagnoseGoalConfidenceArchitecture(read());
    expect(result.storage).toMatchObject({
      persisted: true,
      historyCount: 3,
      currentAssessmentId: expect.stringMatching(/^confidence_assessment_v2/),
    });
    expect(result.ownership).toMatchObject({
      readOwner: "ActiveGoalConfidencePresentationReadService",
      calculationOwner: "BriefingForecastFinalizer",
      legacyFallback: false,
    });
    expect(result.publishers.authorized).toEqual(
      ConfidencePublisherRegistry.listAuthorizedPublishers()
    );
    expect(result.publishers.nonPublishers).toEqual(expect.arrayContaining([
      "daily", "energy", "training", "nutrition", "activity", "weight",
      "recovery", "raw_evidence_upload",
    ]));
  });

  it("verifies Daily and Home resolve the same canonical assessment", async () => {
    const before = fs.readFileSync(file, "utf8");
    const [home, daily] = await Promise.all([
      HomeBriefingService.getHomeBriefing(),
      createDailyBriefingService({ repositories: FounderRepositories })
        .getLatestPersistedDailyBriefing(),
    ]);
    const result = diagnoseGoalConfidenceArchitecture(read(), {
      dailyBriefing: daily,
      homeConfidence: {
        assessmentId: home.hero.confidenceAssessmentId,
        value: home.hero.confidence,
        movement: home.hero.confidenceDetail.movement,
      },
    });
    expect(result.ownership.daily).toMatchObject({
      readOwner: "ActiveGoalConfidencePresentationReadService",
      publisher: false,
      localGoalEvaluationDisplay: false,
      overallGoalConfidenceFallback: false,
      sameAssessmentAsCanonical: true,
      sameAssessmentAsHome: true,
      sameMovementAsHome: true,
    });
    expect(daily.goalConfidence.assessmentId)
      .toBe(home.hero.confidenceAssessmentId);
    expect(daily.hero.confidence).toBe(home.hero.confidence);
    expect(fs.readFileSync(file, "utf8")).toBe(before);
  });

  it("contains no obsolete Daily display or legacy fallback ownership", () => {
    const daily = fs.readFileSync(
      "src/domain/services/DailyBriefingService.js", "utf8"
    );
    const diagnostic = fs.readFileSync(
      "src/domain/services/GoalConfidenceArchitectureDiagnosticService.js",
      "utf8"
    );
    const readBoundary = daily.slice(
      daily.indexOf("async getPersistedDailyBriefing"),
      daily.indexOf("async generateScheduledDailyBriefingForClosedWindow")
    );
    expect(readBoundary).toContain("resolveDailyCanonicalConfidence");
    expect(readBoundary).not.toContain("primaryEvaluation?.confidence");
    expect(diagnostic).not.toContain("OverallGoalConfidenceReadService");
    expect(diagnostic).not.toContain("resolveOverallGoalConfidenceReadModel");
  });
});

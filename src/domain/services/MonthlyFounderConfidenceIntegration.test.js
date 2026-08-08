import { describe, expect, it } from "vitest";
import { FounderRepositories } from "../../data/repositories/founderRepositories";
import { monthlyPreviewFixtures } from "../../fixtures/monthlyBriefingPreview";
import { createMonthlyBriefingPreviewService } from "./MonthlyBriefingPreviewService";
import { composeMonthlyBriefingPresentation } from "./MonthlyBriefingPresentationService";

describe("Monthly Founder repository integration", () => {
  it("reads frozen canonical confidence repositories through the runtime refresh facade", async () => {
    const user = await FounderRepositories.users.getCurrentUser();
    const fixture = monthlyPreviewFixtures.julyContinuation;
    const narrative = await createMonthlyBriefingPreviewService({
      repositories: FounderRepositories,
    }).preview({
      userId: user.id,
      orchestration: {
        ...fixture,
        generatedAt: "2026-07-30T20:00:00.000Z",
      },
    });
    const presentation = composeMonthlyBriefingPresentation({
      narrative,
      decision: narrative.editorialDecision,
      fixture: narrative.evidenceFixture,
    });
    if (!narrative.goalConfidence || !presentation.hero.confidence) {
      throw new Error("Expected canonical Founder confidence in the Monthly Hero.");
    }
    if (presentation.hero.confidence.limitingReasons.join(" ").match(/\bcalibration\b/i)) {
      throw new Error("Expected a natural canonical confidence reason.");
    }
    expect(presentation.hero.confidence.primaryReason).toMatch(/stronger support/i);
    expect(presentation.hero.confidence.primaryReason).not.toMatch(
      /photos|contributors|guardrails|partial evidence|confidence engine|cadence/i
    );
  });
});

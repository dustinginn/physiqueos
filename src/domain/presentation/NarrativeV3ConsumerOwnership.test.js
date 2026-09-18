import { describe, expect, it } from "vitest";
import {
  NARRATIVE_V3_CONSUMER_OWNERSHIP,
  summarizePreviouslyIntendedV3Ownership,
} from "./NarrativeV3ConsumerOwnership.js";

describe("Narrative V3 consumer ownership", () => {
  it("reclassifies the prior seventeen candidates by actual product behavior", () => {
    expect(summarizePreviouslyIntendedV3Ownership()).toEqual({
      previousCount: 17,
      correctedDynamicNotYetWired: 3,
      staticGoalPhasePurpose: 9,
      otherReclassified: 5,
    });
  });

  it("keeps every Operating Plan domain non-reactive to evidence", () => {
    const domains = NARRATIVE_V3_CONSUMER_OWNERSHIP.filter((item) =>
      item.id.startsWith("operating_plan_"));
    expect(domains.map((item) => item.id)).toEqual([
      "operating_plan_overview", "operating_plan_energy",
      "operating_plan_nutrition", "operating_plan_training",
      "operating_plan_recovery", "operating_plan_peptides",
      "operating_plan_supplements", "operating_plan_tracking",
      "operating_plan_coaching_updates",
    ]);
    for (const item of domains) {
      expect(item.dynamicEvidenceReactive).toBe(false);
      expect(["STATIC_PURPOSE_ONLY", "NO_DYNAMIC_V3_NEEDED"])
        .toContain(item.v3Action);
    }
  });

  it("preserves dynamic Goal decisions while factual evidence pages stay factual", () => {
    for (const id of ["active_goal_synthesis", "goal_transition_review",
      "phase_review_recommendation"]) {
      const item = NARRATIVE_V3_CONSUMER_OWNERSHIP.find((row) => row.id === id);
      expect(item).toMatchObject({ dynamicEvidenceReactive: true,
        v3Action: "WIRE_LATER" });
    }
    for (const id of ["goal_relative_training", "goal_relative_nutrition",
      "goal_relative_activity", "goal_relative_weight", "dexa_detail"]) {
      const item = NARRATIVE_V3_CONSUMER_OWNERSHIP.find((row) => row.id === id);
      expect(item).toMatchObject({ classification: "FACTUAL_DOMAIN_PRESENTATION",
        dynamicEvidenceReactive: false, v3Action: "NO_DYNAMIC_V3_NEEDED" });
    }
  });

  it("retains Photo V3 publication while deferring visual detail quality", () => {
    expect(NARRATIVE_V3_CONSUMER_OWNERSHIP.find((item) =>
      item.id === "photo_event_briefing")).toMatchObject({
        classification: "DYNAMIC_V3_NARRATIVE", v3Action: "ALREADY_WIRED" });
    expect(NARRATIVE_V3_CONSUMER_OWNERSHIP.find((item) =>
      item.id === "progress_photos_detail")).toMatchObject({
        classification: "SPECIALIZED_FUTURE_WORK",
        v3Action: "DEFER_SPECIAL_PROJECT" });
  });
});

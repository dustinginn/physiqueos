import { describe, expect, it } from "vitest";
import { createEvidenceExperiencePresentation } from "./EvidenceExperiencePresentationService";

const now = new Date("2026-07-25T18:00:00.000Z");
const review = (evidence_type, observed_at = "2026-07-25") => ({
  interpretedEvidence: { observed_at, evidence_objects: [{ evidence_type, observed_at }] },
});

describe("EvidenceExperiencePresentationService", () => {
  it.each([
    ["training", "WORKOUT FOUND", "Saving your workout\u2026", "Workout Saved"],
    ["nutrition", "NUTRITION FOUND", "Saving your nutrition\u2026", "Nutrition Saved"],
    ["activity_day", "ACTIVITY FOUND", "Saving your activity\u2026", "Activity Saved"],
    ["weight", "UPLOAD FOUND", "Saving your evidence\u2026", "Evidence Saved"],
  ])("uses bounded quiet copy for %s", (type, eyebrow, savingLabel, savedTitle) => {
    expect(createEvidenceExperiencePresentation(review(type), { now })).toMatchObject({
      eyebrow, friendlyDate: null, savingLabel, savedTitle,
    });
  });

  it("shows one friendly historical date sourced from the review package", () => {
    expect(createEvidenceExperiencePresentation(review("nutrition", "2026-07-04"), { now }).friendlyDate)
      .toBe("Saturday, July 4, 2026");
  });

  it("does not introduce recognition claims", () => {
    expect(JSON.stringify(createEvidenceExperiencePresentation(review("training"), { now })))
      .not.toMatch(/personal best|volume record|protein target|recommendation|confidence|streak|xp/i);
  });
});

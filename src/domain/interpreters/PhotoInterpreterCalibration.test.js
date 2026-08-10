import { describe, expect, it } from "vitest";
import { getSystemPrompt, getUserPrompt, photoInterpretationJsonSchema } from "./PhotoInterpreterService";

describe("Photo Interpreter V2 calibration contract", () => {
  it("requires comparability and magnitude before direction", () => {
    const prompt = getSystemPrompt();
    expect(prompt).toMatch(/comparability, visible-difference magnitude, direction only if magnitude exists, then certainty/i);
    expect(prompt).toMatch(/No meaningful visible change is a valid and useful result/i);
    expect(photoInterpretationJsonSchema.properties.structured_observations.items.properties.magnitude.enum).toContain("none");
  });

  it("provides a genuine side-profile lens and hard body-composition boundaries", () => {
    const prompt = getUserPrompt({
      captureDate: "2026-08-08",
      comparisonMetadata: { match_status: "exact_match" },
      goalContext: "Build Lean Mass",
      photoSetId: "photo",
      photos: [],
      previousPhotoSet: null,
    });
    expect(prompt).toMatch(/abdominal projection or flatness.*chest profile.*posture/i);
    expect(getSystemPrompt()).toMatch(/must never emit body-fat percentage, lean-mass amount, fat-mass amount/i);
    expect(getSystemPrompt()).toMatch(/Visible fullness does not establish new muscle tissue/i);
  });
});

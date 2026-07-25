import { describe, expect, it } from "vitest";
import { getProgressPhotoDisplayLabel } from "./progressPhotoPoseVocabulary";

describe("progress photo display labels", () => {
  it("treats explicit normalized pose identity as authoritative over nested pose data", () => {
    const frontFlexed = {
      poseId: "front-flexed",
      pose: { id: "front-flexed", view: "front", pose: "flexed" },
      orientation: "front",
    };
    expect(getProgressPhotoDisplayLabel(frontFlexed)).toBe("Front flexed");
    expect(getProgressPhotoDisplayLabel({ ...frontFlexed, poseId: "front-relaxed" })).toBe("Front relaxed");
    expect(getProgressPhotoDisplayLabel({ ...frontFlexed, poseId: "back-flexed" })).toBe("Rear flexed — double biceps");
  });
});

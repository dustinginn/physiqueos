import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { createCanonicalPhotoSession } from "../models/photoSession";
import { createPhotoSessionReadModels } from "./CanonicalPhotoSessionReadService";

const intent = {
  goalId: "goal_visible_abs_at_rest",
  confirmationPurpose: "visible_abs_completion",
  numericalThresholdComplete: true,
  visualCriterionComplete: "uncertain",
  criterion: "lower_abs_visible_at_rest",
  requiredPose: "front-relaxed",
  userConfirmationRequired: true,
};

describe("Visible Abs completion intent propagation", () => {
  it("is represented through upload, package, and review canonicalization code", () => {
    const page = fs.readFileSync(new URL("../../app/evidence/photos/page.js", import.meta.url), "utf8");
    const upload = fs.readFileSync(new URL("../../app/evidence/photos/actions.js", import.meta.url), "utf8");
    const review = fs.readFileSync(new URL("../../app/evidence/review/[reviewId]/actions.js", import.meta.url), "utf8");
    for (const field of ["goalId", "confirmationPurpose", "numericalThresholdComplete", "visualCriterionComplete", "criterion", "requiredPose", "userConfirmationRequired"]) {
      expect(page).toContain(field);
      expect(upload).toContain(field);
    }
    expect(upload).toContain("review_metadata");
    expect(upload).toContain("confirmationIntent");
    expect(review).toContain("evidencePackage.review_metadata?.confirmationIntent");
    expect(review).toContain("whether lower abs are visibly present at rest");
    expect(review).toContain("Rear views cannot confirm completion");
  });

  it("survives the canonical PhotoSession and read model", () => {
    const photo = { id: "photo", canonicalPhotoId: "canonical_photo", view: "front", pose: "relaxed", storage_path: "private/final.jpg", sourceIds: ["source"], status: "active" };
    const session = createCanonicalPhotoSession({ confirmationIntent: intent, captureDate: "2026-07-20", sessionId: "photo_session_final", userId: "user", photos: [photo] });
    const read = createPhotoSessionReadModels({
      canonicalObjects: [{ canonicalId: session.sessionId, evidence_type: "photo_session", firstObservedAt: "2026-07-20", lastObservedAt: "2026-07-20", payload: session, quality: { status: "active" }, provenance: {} }],
      legacyPhotos: [],
      weights: [],
      analyses: [],
    });
    expect(read[0].confirmationIntent).toEqual(intent);
  });

  it("leaves ordinary photo sessions generic", () => {
    const session = createCanonicalPhotoSession({ captureDate: "2026-07-20", sessionId: "ordinary", userId: "user", photos: [] });
    expect(session.confirmationIntent).toBeUndefined();
  });
});

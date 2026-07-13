import { describe, expect, it } from "vitest";
import { createProvisionalPhotoSession } from "./ProvisionalPhotoSessionService";
import { evaluateScheduledCompletion } from "./ScheduledCompletionService";
import { createCanonicalPhotoSession } from "../models/photoSession";

const photos = [
  { id: "front", view: "front", pose: "relaxed", active: true },
  { id: "rear", view: "back", pose: "relaxed", active: true },
  { id: "flexed", view: "back", pose: "rear double biceps", active: true },
];

describe("photo confirmation foundation", () => {
  it("creates one complete provisional session and normalizes rear double biceps", () => {
    const session = createProvisionalPhotoSession({ reviewId: "review_1", captureDate: "2026-07-12", photos });
    expect(session.id).toBe("provisional_session_review_1");
    expect(session.photos[2].pose).toBe("flexed");
    expect(session.completion_state).toBe("complete");
  });

  it("surfaces duplicate and missing poses", () => {
    const session = createProvisionalPhotoSession({ captureDate: "2026-07-12", photos: [photos[0], { ...photos[0], id: "retry" }] });
    expect(session.duplicate_pose_ids).toEqual(["front-relaxed"]);
    expect(session.missing_required_pose_ids).toEqual(["back-relaxed", "back-flexed"]);
  });

  it("does not complete from provisional evidence and completes from canonical 3/3 truth", () => {
    const evidencePackage = { evidence_objects: [{ evidence_type: "photo_session", observed_at: "2026-07-12" }] };
    expect(evaluateScheduledCompletion({ canonicalObjects: [], evidencePackage })[0].satisfied).toBe(false);
    const session = createCanonicalPhotoSession({ sessionId: "session_1", photos: photos.map((photo) => ({ ...photo, canonicalPhotoId: `canonical_${photo.id}`, status: "active" })) });
    const canonicalObjects = [{ canonicalId: "session_1", evidence_type: "photo_session", lastObservedAt: "2026-07-12", payload: session, quality: { status: "active" } }];
    expect(evaluateScheduledCompletion({ canonicalObjects, evidencePackage })[0].satisfied).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { assertEvidenceCanonicalCommitReady, assertPhotoSessionsCommitReady } from "./EvidenceCanonicalCommitReadinessService.js";
import { createRealBuild45PendingReview } from "./RealBuild45PhotoReviewFixture.js";

const CANONICAL = [
  ["front", "relaxed", "standard"], ["rear", "relaxed", "standard"], ["rear", "flexed", "double_biceps"],
  ["right_side", "relaxed", "standard"], ["front", "flexed", "standard"],
];
function session({ identities = CANONICAL, goal = "resolved", capture = "reviewed", extra = {} } = {}) {
  return {
    evidence_objects: [{
      id: "photo_session_1", evidence_type: "photo_session",
      photos: identities.map(([orientation, contractionState, poseVariant], index) => ({ id: `p${index + 1}`, orientation, contractionState, poseVariant, identityStatus: "confirmed", userConfirmedIdentity: true })),
      captureMetadata: { status: capture }, goalRelationship: { status: goal }, ...extra,
    }],
  };
}
const code = (fn) => { try { fn(); return null; } catch (error) { return error.code; } };

describe("photo session confirmation readiness", () => {
  it("passes with five canonical identities, a decided capture time, and a decided Goal relationship", () => {
    expect(assertPhotoSessionsCommitReady(session())).toBe(true);
    expect(assertEvidenceCanonicalCommitReady(session())).toBe(true);
  });

  it("rejects unresolved identities with a specific code and a count in the message", () => {
    const error = (() => { try { assertPhotoSessionsCommitReady(session({ identities: [...CANONICAL.slice(0, 2), ["rear", "relaxed", "double_biceps"], ...CANONICAL.slice(3)] })); } catch (e) { return e; } })();
    expect(error).toMatchObject({ code: "PHOTO_POSE_UNRESOLVED", message: "Choose a pose for the remaining photo before saving." });
    expect(code(() => assertPhotoSessionsCommitReady(session({ identities: [["front", "flexed", "double_biceps"], ["rear", "flexed", "standard"]] })))).toBe("PHOTO_POSE_UNRESOLVED");
    expect(code(() => assertPhotoSessionsCommitReady(session({ identities: [["front", "relaxed", "lat_spread"], ["front", "relaxed", "other"]] })))).toBe("PHOTO_POSE_UNRESOLVED");
  });

  it("rejects a session whose capture time or Goal relationship still needs review", () => {
    expect(code(() => assertPhotoSessionsCommitReady(session({ goal: "needs_review" })))).toBe("PHOTO_SESSION_DETAILS_UNRESOLVED");
    expect(code(() => assertPhotoSessionsCommitReady(session({ capture: "needs_review" })))).toBe("PHOTO_SESSION_DETAILS_UNRESOLVED");
    expect(code(() => assertPhotoSessionsCommitReady(session({ goal: "unrelated" })))).toBeNull();
  });

  it("reports the pose problem before the session-details problem, as the Web action always did", () => {
    expect(code(() => assertPhotoSessionsCommitReady(session({ identities: [["rear", "relaxed", "double_biceps"]], goal: "needs_review" })))).toBe("PHOTO_POSE_UNRESOLVED");
  });

  it("does not hold removed or excluded sessions, or inactive photos, to the gate", () => {
    const bad = session({ identities: [["rear", "relaxed", "double_biceps"]], goal: "needs_review" });
    expect(assertPhotoSessionsCommitReady({ evidence_objects: [{ ...bad.evidence_objects[0], removed: true }] })).toBe(true);
    expect(assertPhotoSessionsCommitReady(bad, { itemDecisions: { photo_session_1: { included: false } } })).toBe(true);
    const inactive = session(); inactive.evidence_objects[0].photos.push({ id: "extra", orientation: "rear", contractionState: "relaxed", poseVariant: "double_biceps", active: false });
    expect(assertPhotoSessionsCommitReady(inactive)).toBe(true);
  });

  it("ignores evidence that is not a photo session, and tolerates an empty package", () => {
    expect(assertPhotoSessionsCommitReady({ evidence_objects: [{ evidence_type: "training" }] })).toBe(true);
    expect(assertPhotoSessionsCommitReady(undefined)).toBe(true);
  });

  it("refuses the exact real review as it stands, and the gate is the same one the Web action applies", () => {
    expect(code(() => assertEvidenceCanonicalCommitReady(createRealBuild45PendingReview().interpretedEvidence))).toBe("PHOTO_POSE_UNRESOLVED");
  });
});

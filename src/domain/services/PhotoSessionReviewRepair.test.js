import { describe, expect, it } from "vitest";
import { PhotoSessionReviewRepairError, diffPaths, planPhotoSessionReviewRepair } from "./PhotoSessionReviewRepair.js";
import { createEvidenceReviewPresentation } from "./EvidenceReviewPresentationService.js";
import { assertEvidenceCanonicalCommitReady } from "./EvidenceCanonicalCommitReadinessService.js";
import { formatPhotoPoseSummary } from "./EvidenceReviewPresentationService.js";
import {
  LEAN_MASS_GOAL_ID, OBJECT_ID, VISIBLE_ABS_GOAL_ID,
  createRealBuild45ExecutionItems, createRealBuild45Goals, createRealBuild45PendingReview,
} from "./RealBuild45PhotoReviewFixture.js";
import { BUILD45_PROGRESS_PHOTOS_REVIEW_REPAIR_AUTHORIZATION as AUTHORIZATION } from "../../platform/operations/build45ProgressPhotosReviewRepairAuthorization.js";

const NOW = () => new Date("2026-09-20T15:00:00.000Z");
const plan = (overrides = {}) => planPhotoSessionReviewRepair({
  review: createRealBuild45PendingReview(), authorization: AUTHORIZATION,
  goals: createRealBuild45Goals(), executionItems: createRealBuild45ExecutionItems(), now: NOW, ...overrides,
});
const refuses = (overrides, code) => expect(() => plan(overrides)).toThrowError(expect.objectContaining({ name: "PhotoSessionReviewRepairError", code }));
const metricsOf = (review) => Object.fromEntries(createEvidenceReviewPresentation({ evidencePackage: review.interpretedEvidence, itemDecisions: review.itemDecisions }).items[0].metrics.map((item) => [item.label, item.value]));
const photoOf = (review, ordinal) => review.interpretedEvidence.evidence_objects[0].photos[ordinal - 1];

describe("the real Build 45 review, before repair", () => {
  it("shows exactly the defect the Founder saw, with corrected source labeling", () => {
    const before = createRealBuild45PendingReview();
    expect(metricsOf(before)).toEqual({
      Poses: "5 photos · 1 pose still to choose",
      "Time of day": "Afternoon",
      "Goal relationship": "Needs session review",
      Source: "Progress photos",
    });
    expect(photoOf(before, 3)).toMatchObject({ orientation: "rear", contractionState: "relaxed", poseVariant: "double_biceps", poseId: "rear-relaxed-double_biceps" });
  });

  it("cannot be confirmed: both the pose and the Goal relationship fail the readiness gate", () => {
    const before = createRealBuild45PendingReview();
    expect(() => assertEvidenceCanonicalCommitReady(before.interpretedEvidence)).toThrowError(expect.objectContaining({ code: "PHOTO_POSE_UNRESOLVED" }));
    const poseFixed = plan().updatedReview;
    poseFixed.interpretedEvidence.evidence_objects[0].goalRelationship = createRealBuild45PendingReview().interpretedEvidence.evidence_objects[0].goalRelationship;
    expect(() => assertEvidenceCanonicalCommitReady(poseFixed.interpretedEvidence)).toThrowError(expect.objectContaining({ code: "PHOTO_SESSION_DETAILS_UNRESOLVED" }));
  });
});

describe("bounded one-time repair", () => {
  it("changes only ordinal 3's contraction identity, the session Goal relationship, its own copy, the audit entry, and the update time", () => {
    const result = plan();
    expect(result.outcome).toBe("planned");
    expect([...result.changedPaths].sort()).toEqual([
      "interpretedEvidence.evidence_objects[0].goalRelationship.goalIds[0]",
      "interpretedEvidence.evidence_objects[0].goalRelationship.goalLabel",
      "interpretedEvidence.evidence_objects[0].goalRelationship.limitations[0]",
      "interpretedEvidence.evidence_objects[0].goalRelationship.options[2].id",
      "interpretedEvidence.evidence_objects[0].goalRelationship.options[2].title",
      "interpretedEvidence.evidence_objects[0].goalRelationship.options[3]",
      "interpretedEvidence.evidence_objects[0].goalRelationship.source",
      "interpretedEvidence.evidence_objects[0].goalRelationship.status",
      "interpretedEvidence.evidence_objects[0].photos[2].contractionState",
      "interpretedEvidence.evidence_objects[0].photos[2].label",
      "interpretedEvidence.evidence_objects[0].photos[2].pose",
      "interpretedEvidence.evidence_objects[0].photos[2].poseId",
      "interpretedEvidence.review_metadata.corrections",
      "interpretedEvidence.review_metadata.recoveryContext.photoIdentities[2].contractionState",
      "interpretedEvidence.review_metadata.recoveryContext.photoIdentities[2].label",
      "interpretedEvidence.review_metadata.recoveryContext.photoIdentities[2].poseId",
      "updatedAt",
    ]);
  });

  it("leaves everything else deep-equal: the other four poses, time of day, dates, identities, provenance, media, and review state", () => {
    const before = createRealBuild45PendingReview();
    const after = plan().updatedReview;
    // Undo exactly the authorized edits on a copy of the repaired review; the result must equal the original.
    const restored = structuredClone(after);
    const object = restored.interpretedEvidence.evidence_objects[0];
    Object.assign(object.photos[2], { contractionState: "relaxed", pose: "relaxed", poseId: "rear-relaxed-double_biceps", label: "Rear Relaxed Double Biceps" });
    object.goalRelationship = before.interpretedEvidence.evidence_objects[0].goalRelationship;
    Object.assign(restored.interpretedEvidence.review_metadata.recoveryContext.photoIdentities[2], { contractionState: "relaxed", poseId: "rear-relaxed-double_biceps", label: "Rear Relaxed Double Biceps" });
    delete restored.interpretedEvidence.review_metadata.corrections;
    restored.updatedAt = before.updatedAt;
    expect(restored).toEqual(before);
    for (const ordinal of [1, 2, 4, 5]) expect(photoOf(after, ordinal)).toEqual(photoOf(before, ordinal));
    for (const ordinal of [1, 2, 3, 4, 5]) {
      for (const field of ["storage_path", "analysis_storage_path", "source_hash", "file_name", "mime_type", "source_artifact_ref", "orientation", "poseVariant", "order", "sourceOrder", "identityStatus", "userConfirmedIdentity", "goalValidationRole"]) {
        expect(photoOf(after, ordinal)[field]).toEqual(photoOf(before, ordinal)[field]);
      }
    }
    expect(after.interpretedEvidence.provenance).toEqual(before.interpretedEvidence.provenance);
    expect(after.interpretedEvidence.evidence_objects[0].captureMetadata).toEqual(before.interpretedEvidence.evidence_objects[0].captureMetadata);
    expect(after.interpretedEvidence.evidence_objects[0].conditions).toEqual(before.interpretedEvidence.evidence_objects[0].conditions);
    expect(after.interpretedEvidence.evidence_objects[0].observed_at).toBe("2026-09-19");
    expect(after).toMatchObject({ status: "pending", confirmation: null, version: 1, intakeReceiptId: before.intakeReceiptId, itemDecisions: {}, commitProgress: {} });
  });

  it("corrects ordinal 3 to rear + flexed + double biceps and resolves the session to Build Lean Mass", () => {
    const after = plan().updatedReview;
    expect(photoOf(after, 3)).toMatchObject({ orientation: "rear", contractionState: "flexed", poseVariant: "double_biceps", pose: "flexed", poseId: "back-flexed", label: "Rear Flexed — Double Biceps" });
    expect(after.interpretedEvidence.evidence_objects[0].goalRelationship).toMatchObject({ status: "resolved", goalIds: [LEAN_MASS_GOAL_ID], goalLabel: "Build Lean Mass", source: "scheduled_occurrence_current_goal" });
    expect(after.interpretedEvidence.evidence_objects[0].goalRelationship.options.map((item) => item.id)).not.toContain(VISIBLE_ABS_GOAL_ID);
    expect(after.interpretedEvidence.review_metadata.corrections).toEqual([expect.objectContaining({
      id: AUTHORIZATION.repairId, kind: "progress_photo_session_repair", authorizedBy: "founder", appliedAt: "2026-09-20T15:00:00.000Z", reviewVersionBefore: 1,
      photo: { ordinal: 3, from: AUTHORIZATION.poseCorrection.from, to: AUTHORIZATION.poseCorrection.to },
    })]);
  });

  it("makes the review confirmable: 5/5 canonical poses, Goal resolved, afternoon kept, and photo provenance instead of Screenshot", () => {
    const after = plan().updatedReview;
    expect(formatPhotoPoseSummary(after.interpretedEvidence.evidence_objects[0].photos)).toBe("5 photos · Front Flexed, Rear Relaxed, Rear Flexed — Double Biceps, Right Side Relaxed, Front Relaxed");
    expect(metricsOf(after)).toEqual({
      Poses: "5 photos · Front Flexed, Rear Relaxed, Rear Flexed — Double Biceps, Right Side Relaxed, Front Relaxed",
      "Time of day": "Afternoon",
      "Goal relationship": "Build Lean Mass",
      Source: "Progress photos",
    });
    expect(assertEvidenceCanonicalCommitReady(after.interpretedEvidence, { itemDecisions: after.itemDecisions })).toBe(true);
    expect(after.status).toBe("pending");
  });

  it("is idempotent: a repaired review replays as already_applied, and a review that only claims the repair is refused", () => {
    const repaired = plan().updatedReview;
    const replay = plan({ review: repaired });
    expect(replay).toMatchObject({ outcome: "already_applied", changedPaths: [] });
    expect(replay.updatedReview).toBe(repaired);
    const claimsOnly = createRealBuild45PendingReview();
    claimsOnly.interpretedEvidence.review_metadata.corrections = [{ id: AUTHORIZATION.repairId }];
    refuses({ review: claimsOnly }, "REPAIR_STATE_INCONSISTENT");
  });

  it("refuses anything but the exact review, version, state, and identity it was authorized for", () => {
    const mutate = (change) => { const review = createRealBuild45PendingReview(); change(review); return { review }; };
    refuses(mutate((r) => { r.id = "evidence_review_OTHER"; }), "REPAIR_REVIEW_MISMATCH");
    refuses(mutate((r) => { r.intakeReceiptId = "evidence_intake_OTHER"; }), "REPAIR_INTAKE_MISMATCH");
    refuses(mutate((r) => { r.interpretedEvidence.package_id = "evidence_submission_OTHER"; }), "REPAIR_PACKAGE_MISMATCH");
    refuses(mutate((r) => { r.interpretedEvidence.evidence_objects[0].id = "other_object"; }), "REPAIR_OBJECT_MISMATCH");
    refuses(mutate((r) => { r.status = "confirmed"; }), "REPAIR_REVIEW_NOT_PENDING");
    refuses(mutate((r) => { r.status = "discarded"; }), "REPAIR_REVIEW_NOT_PENDING");
    refuses(mutate((r) => { r.version = 2; }), "REPAIR_VERSION_MISMATCH");
    refuses(mutate((r) => { r.confirmation = { confirmedAt: "2026-09-20T14:00:00Z" }; }), "REPAIR_REVIEW_TOUCHED");
    refuses(mutate((r) => { r.itemDecisions = { [OBJECT_ID]: { included: false } }; }), "REPAIR_REVIEW_TOUCHED");
    refuses(mutate((r) => { r.commitClaim = { status: "in_progress" }; }), "REPAIR_REVIEW_TOUCHED");
    refuses(mutate((r) => { r.interpretedEvidence.evidence_objects[0].photos[2].contractionState = "flexed"; }), "REPAIR_POSE_PRECONDITION");
    refuses(mutate((r) => { r.interpretedEvidence.evidence_objects[0].photos[2].orientation = "front"; }), "REPAIR_POSE_PRECONDITION");
    refuses(mutate((r) => { r.interpretedEvidence.evidence_objects[0].photos[2].id = "wrong_photo_3"; }), "REPAIR_PHOTO_MISMATCH");
    refuses(mutate((r) => { r.interpretedEvidence.review_metadata.recoveryContext.photoIdentities[2].contractionState = "flexed"; }), "REPAIR_RECOVERY_CONTEXT_MISMATCH");
    refuses(mutate((r) => { r.interpretedEvidence.evidence_objects[0].goalRelationship.status = "unrelated"; }), "REPAIR_GOAL_PRECONDITION");
  });

  it("never repairs a pose it was not authorized to repair", () => {
    const review = createRealBuild45PendingReview();
    review.interpretedEvidence.evidence_objects[0].photos[0].poseVariant = "lat_spread";
    review.interpretedEvidence.evidence_objects[0].photos[0].poseId = "front-flexed-lat_spread";
    refuses({ review }, "REPAIR_OTHER_PHOTO_UNRESOLVED");
  });

  it("refuses when the corrected resolver does not deterministically select the authorized Goal", () => {
    const rivalOwner = createRealBuild45Goals().concat({ id: "goal_rival", title: "Rival", status: "active", primary: true });
    const items = createRealBuild45ExecutionItems();
    items[0].currentGoalIds = [LEAN_MASS_GOAL_ID, "goal_rival"];
    refuses({ goals: rivalOwner, executionItems: items }, "REPAIR_GOAL_NOT_DETERMINISTIC");
    refuses({ goals: [] }, "REPAIR_GOAL_NOT_DETERMINISTIC");
    const other = createRealBuild45ExecutionItems();
    other[0].currentGoalIds = ["goal_maintain_8_9_body_fat"];
    refuses({ executionItems: other }, "REPAIR_GOAL_NOT_DETERMINISTIC");
  });

  it("refuses an authorization that is incomplete or broader than one photo's contraction", () => {
    refuses({ authorization: { ...AUTHORIZATION, reviewId: "" } }, "REPAIR_AUTHORIZATION_INCOMPLETE");
    refuses({ authorization: { ...AUTHORIZATION, poseCorrection: { ...AUTHORIZATION.poseCorrection, to: { orientation: "front", contractionState: "flexed", poseVariant: "double_biceps" } } } }, "REPAIR_AUTHORIZATION_TOO_BROAD");
    refuses({ authorization: { ...AUTHORIZATION, poseCorrection: { ...AUTHORIZATION.poseCorrection, to: { orientation: "rear", contractionState: "flexed", poseVariant: "standard" } } } }, "REPAIR_AUTHORIZATION_TOO_BROAD");
    refuses({ authorization: { ...AUTHORIZATION, poseCorrection: { ...AUTHORIZATION.poseCorrection, to: { orientation: "rear", contractionState: "relaxed", poseVariant: "double_biceps" } } } }, "REPAIR_TARGET_NOT_CANONICAL");
  });

  it("reports structural differences at leaf paths", () => {
    expect(diffPaths({ a: 1, b: { c: [1, 2] } }, { a: 1, b: { c: [1, 3] }, d: true })).toEqual(["b.c[1]", "d"]);
    expect(new PhotoSessionReviewRepairError("X", "y").code).toBe("X");
  });
});

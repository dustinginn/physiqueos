import { describe, expect, it, vi } from "vitest";
import { createEvidenceReviewRepository } from "../../data/repositories/EvidenceReviewRepository";
import { createEvidencePackageRepository } from "../../data/repositories/EvidencePackageRepository";
import { parseStrengthTrainingText } from "../models/trainingSessionEvidence";
import { JUL_14_STRENGTH_NOTE } from "../../fixtures/jul14StrengthEvidenceFixture";
import { createPendingEvidenceReviewReprocessingService } from "./PendingEvidenceReviewReprocessingService";

const REVIEW_ID = "evidence_review_20260715011556399";
const PACKAGE_ID = "evidence_submission_20260715011517048_images";

function fixture({ status = "pending", sources, canonical = [] } = {}) {
  const sourceArtifacts = sources ?? [
    { id: "typed_evidence_0", kind: "typed_evidence", text: JUL_14_STRENGTH_NOTE, uploaded_at: "2026-07-15T01:15:17.048Z" },
    { id: "artifact_1", kind: "screenshot", storage_path: "private/founder/evidence/uploads/strength.png", uploaded_at: "2026-07-15T01:15:17.048Z" },
  ];
  const evidencePackage = {
    package_id: PACKAGE_ID, captured_at: "2026-07-14", observed_date: "2026-07-14", userId: "founder",
    provenance: { submission_id: PACKAGE_ID, evidence_date: "2026-07-14", source_artifacts: sourceArtifacts },
    evidence_objects: [],
  };
  const malformed = { ...trainingObject([{ id: "leg_press_feet_middle", name: "Leg Press (Feet Middle)", sets: Array.from({ length: 10 }, (_, index) => ({ set_number: index + 1, reps: 10, weight: 35, weight_unit: "lb", provenance_ref: "typed_evidence_0" })), provenance_ref: "typed_evidence_0" }]), captured_at: "2026-07-14T18:01:00-07:00" };
  const review = {
    id: REVIEW_ID, userId: "founder", source: "universal_intake", status,
    createdAt: "2026-07-15T01:15:56.399Z", updatedAt: "2026-07-15T01:15:56.399Z",
    interpretedEvidence: { ...structuredClone(evidencePackage), evidence_objects: [malformed] },
    evidenceTypes: ["training"], confirmation: null, commitProgress: {}, itemDecisions: {},
  };
  const changes = [];
  const repositories = {
    evidenceReviews: createEvidenceReviewRepository([review], { onChange: (name) => changes.push(name) }),
    evidencePackages: createEvidencePackageRepository([evidencePackage], { onChange: vi.fn() }),
    canonicalEvidence: { listCanonicalEvidenceObjects: vi.fn(async () => canonical) },
  };
  return { changes, evidencePackage, repositories, review };
}

function trainingObject(exercises = parseStrengthTrainingText(JUL_14_STRENGTH_NOTE)) {
  return {
    id: "training_2026-07-14_traditional-strength-training_1702-1801", evidence_type: "training", observed_at: "2026-07-14",
    metadata: { activity_type: "Traditional Strength Training", start_time: "17:02", end_time: "18:01", duration_seconds: 3547, active_calories: 494, total_calories: 591, average_heart_rate: 121 },
    source: { source_artifact_refs: ["strength.png", "typed_evidence_0"] }, provenance: { source_artifact_refs: ["strength.png", "typed_evidence_0"] }, exercises,
  };
}

function correctedPackage(base) {
  return { ...structuredClone(base), package_id: "temporary_reinterpretation_id", evidence_objects: [trainingObject()], diagnostics: { stages: [{ label: "Final canonical evidence" }] }, quality: { status: "complete" } };
}

describe("reprocessPendingReviewInPlace", () => {
  it("replaces only the pending candidate and remains idempotent", async () => {
    const state = fixture();
    const originalPackage = structuredClone(state.evidencePackage);
    const originalCreatedAt = state.review.createdAt;
    const reinterpret = vi.fn(async () => correctedPackage(state.evidencePackage));
    const service = createPendingEvidenceReviewReprocessingService({ repositories: state.repositories, reinterpret, now: clock() });

    const first = await service.reprocessPendingReviewInPlace(REVIEW_ID);
    const updated = await state.repositories.evidenceReviews.getReviewById(REVIEW_ID);
    const exercises = updated.interpretedEvidence.evidence_objects[0].exercises;
    expect(first).toMatchObject({ changed: true, idempotent: false });
    expect(updated).toMatchObject({ id: REVIEW_ID, status: "pending", createdAt: originalCreatedAt, confirmation: null });
    expect(updated.interpretedEvidence.package_id).toBe(PACKAGE_ID);
    expect(updated.interpretedEvidence.observed_date).toBe("2026-07-14");
    expect(updated.interpretedEvidence.evidence_objects[0].captured_at).toBe("2026-07-14T18:01:00-07:00");
    expect(exercises.map((item) => item.id)).toEqual(["bulgarian_split_squat_smith_machine", "pendulum_squat_machine", "leg_extension", "leg_press_feet_middle"]);
    expect(exercises.flatMap((item) => item.sets)).toHaveLength(13);
    expect(exercises[0].sets.every((set) => set.load_type === "bodyweight")).toBe(true);
    expect(updated.interpretedEvidence.evidence_objects[0].metadata).toMatchObject({ duration_seconds: 3547, active_calories: 494, total_calories: 591, average_heart_rate: 121 });
    expect(updated.reprocessing).toMatchObject({ operation: "reprocessPendingReviewInPlace", status: "complete", sourcePackageId: PACKAGE_ID });
    expect(await state.repositories.evidencePackages.getEvidencePackageById(PACKAGE_ID)).toEqual(originalPackage);
    expect(state.changes).toEqual(["evidenceReviews", "evidenceReviews"]);

    const updatedAt = updated.updatedAt;
    const second = await service.reprocessPendingReviewInPlace(REVIEW_ID);
    expect(second).toMatchObject({ changed: false, idempotent: true });
    expect(reinterpret).toHaveBeenCalledTimes(1);
    expect((await state.repositories.evidenceReviews.getReviewById(REVIEW_ID)).updatedAt).toBe(updatedAt);
    expect(state.changes).toHaveLength(2);
  });

  it("preserves the prior candidate on failure and permits retry", async () => {
    const state = fixture();
    const before = structuredClone(state.review.interpretedEvidence);
    const reinterpret = vi.fn().mockRejectedValueOnce(Object.assign(new Error("provider unavailable"), { code: "PROVIDER_UNAVAILABLE" })).mockResolvedValueOnce(correctedPackage(state.evidencePackage));
    const service = createPendingEvidenceReviewReprocessingService({ repositories: state.repositories, reinterpret, now: clock() });
    await expect(service.reprocessPendingReviewInPlace(REVIEW_ID)).rejects.toThrow("provider unavailable");
    let review = await state.repositories.evidenceReviews.getReviewById(REVIEW_ID);
    expect(review.interpretedEvidence).toEqual(before);
    expect(review.reprocessing).toMatchObject({ status: "failed", error: { code: "PROVIDER_UNAVAILABLE" } });
    await service.reprocessPendingReviewInPlace(REVIEW_ID);
    review = await state.repositories.evidenceReviews.getReviewById(REVIEW_ID);
    expect(review.status).toBe("pending");
    expect(review.reprocessing.status).toBe("complete");
    expect(review.interpretedEvidence.evidence_objects[0].exercises).toHaveLength(4);
  });

  it.each([
    ["confirmed review", { status: "confirmed" }, "REVIEW_NOT_PENDING"],
    ["missing sources", { sources: [] }, "SOURCE_ARTIFACTS_MISSING"],
    ["canonical linkage", { canonical: [{ provenance: { source_package_id: PACKAGE_ID } }] }, "CANONICAL_LINK_EXISTS"],
  ])("rejects %s", async (_name, overrides, code) => {
    const state = fixture(overrides);
    const service = createPendingEvidenceReviewReprocessingService({ repositories: state.repositories, reinterpret: vi.fn() });
    await expect(service.reprocessPendingReviewInPlace(REVIEW_ID)).rejects.toMatchObject({ code });
    expect(state.changes).toHaveLength(0);
  });

  it("rejects a pending review whose execution already wrote a commit step", async () => {
    const state = fixture();
    state.review.commitProgress = { canonical_commit: { status: "completed" } };
    await expect(createPendingEvidenceReviewReprocessingService({ repositories: state.repositories }).reprocessPendingReviewInPlace(REVIEW_ID)).rejects.toMatchObject({ code: "REVIEW_ALREADY_APPLIED" });
    expect(state.changes).toHaveLength(0);
  });

  it("rejects missing packages and active claims", async () => {
    const missing = fixture();
    missing.repositories.evidencePackages = createEvidencePackageRepository([]);
    await expect(createPendingEvidenceReviewReprocessingService({ repositories: missing.repositories }).reprocessPendingReviewInPlace(REVIEW_ID)).rejects.toMatchObject({ code: "PACKAGE_NOT_FOUND" });
    const active = fixture();
    active.review.reprocessing = { status: "in_progress" };
    await expect(createPendingEvidenceReviewReprocessingService({ repositories: active.repositories }).reprocessPendingReviewInPlace(REVIEW_ID)).rejects.toMatchObject({ code: "REPROCESS_IN_PROGRESS" });
  });
});

function clock() {
  let tick = 0;
  return () => new Date(Date.parse("2026-07-15T02:00:00.000Z") + tick++ * 1000);
}

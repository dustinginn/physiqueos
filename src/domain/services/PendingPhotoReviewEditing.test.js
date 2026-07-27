import { describe, expect, it, vi } from "vitest";
import { createEvidenceReviewRepository } from "../../data/repositories/EvidenceReviewRepository";
import {
  getCanonicalProgressPhotoCategory,
  getProgressPhotoCategoryId,
} from "../models/progressPhotoPoseVocabulary";
import {
  createEvidenceReviewPresentation,
  formatPhotoPoseSummary,
} from "./EvidenceReviewPresentationService";
import { createEvidenceReviewService } from "./EvidenceReviewService";

const updatedAt = "2026-07-26T03:08:58.363Z";
const photo = (index) => ({
  id: `photo-${index}`,
  source_artifact_ref: `artifact-${index}`,
  file_name: `IMG_${index}.jpeg`,
  storage_path: `private/founder/evidence/uploads/photo-${index}.jpeg`,
  view: "unknown",
  pose: "relaxed",
});
const reviewFixture = () => ({
  id: "review-1",
  userId: "founder",
  status: "pending",
  createdAt: updatedAt,
  updatedAt,
  itemDecisions: { session: { included: true } },
  interpretedEvidence: {
    package_id: "package-1",
    evidence_objects: [{
      id: "session",
      evidence_type: "photo_session",
      observed_at: "2026-07-25",
      photos: [1, 2, 3, 4, 5].map(photo),
    }],
  },
});

function setup() {
  const reviews = [reviewFixture()];
  const onChange = vi.fn();
  const repository = createEvidenceReviewRepository(reviews, { onChange });
  const service = createEvidenceReviewService({
    repositories: { evidenceReviews: repository },
    now: () => new Date("2026-07-26T04:00:00Z"),
  });
  return { onChange, repository, service };
}

describe("pending Progress Photo pose editing", () => {
  it("updates only the intended artifact with the canonical pose and preserves ordering and inclusion", async () => {
    const { repository, service } = setup();
    await service.setPhotoPose("review-1", {
      expectedUpdatedAt: updatedAt,
      photoId: "photo-3",
      poseId: "back-flexed",
      sourceArtifactRef: "artifact-3",
      updatedBy: "founder",
    });
    const saved = await repository.getReviewById("review-1");
    const photos = saved.interpretedEvidence.evidence_objects[0].photos;
    expect(photos.map((item) => item.source_artifact_ref)).toEqual([
      "artifact-1", "artifact-2", "artifact-3", "artifact-4", "artifact-5",
    ]);
    expect(getProgressPhotoCategoryId(photos[2])).toBe("back-flexed");
    expect(photos[2]).toEqual(expect.objectContaining({
      identityStatus: "confirmed",
      userConfirmedIdentity: true,
      view: "back",
      pose: "flexed",
    }));
    expect(photos.filter((item) => getCanonicalProgressPhotoCategory(item))).toHaveLength(1);
    expect(saved.itemDecisions.session.included).toBe(true);
    expect(saved.status).toBe("pending");
  });

  it("persists multiple independent selections through authoritative reloads", async () => {
    const { repository, service } = setup();
    const first = await service.setPhotoPose("review-1", {
      expectedUpdatedAt: updatedAt,
      photoId: "photo-1",
      poseId: "front-relaxed",
      sourceArtifactRef: "artifact-1",
      updatedBy: "founder",
    });
    await service.setPhotoPose("review-1", {
      expectedUpdatedAt: first.updatedAt,
      photoId: "photo-2",
      poseId: "front-flexed",
      sourceArtifactRef: "artifact-2",
      updatedBy: "founder",
    });
    const reloaded = await repository.getReviewById("review-1");
    expect(reloaded.interpretedEvidence.evidence_objects[0].photos.map((item) => getCanonicalProgressPhotoCategory(item)?.id ?? "unknown")).toEqual([
      "front-relaxed", "front-flexed", "unknown", "unknown", "unknown",
    ]);
  });

  it("rejects stale, invalid, and mismatched edits without writing", async () => {
    const { onChange, repository, service } = setup();
    await expect(service.setPhotoPose("review-1", {
      expectedUpdatedAt: "stale",
      photoId: "photo-1",
      poseId: "front-relaxed",
      sourceArtifactRef: "artifact-1",
    })).rejects.toMatchObject({ code: "REVIEW_STALE" });
    await expect(service.setPhotoPose("review-1", {
      expectedUpdatedAt: updatedAt,
      photoId: "photo-1",
      poseId: "invented",
      sourceArtifactRef: "artifact-1",
    })).rejects.toMatchObject({ code: "PHOTO_POSE_INVALID" });
    await expect(service.setPhotoPose("review-1", {
      expectedUpdatedAt: updatedAt,
      photoId: "photo-1",
      poseId: "front-relaxed",
      sourceArtifactRef: "wrong-artifact",
    })).rejects.toMatchObject({ code: "PHOTO_ARTIFACT_UNAVAILABLE" });
    expect(onChange).not.toHaveBeenCalled();
    expect(await repository.getReviewById("review-1")).toEqual(reviewFixture());
  });

  it("uses a compact unresolved summary, then canonical selected labels", async () => {
    const { repository, service } = setup();
    const initial = createEvidenceReviewPresentation({
      evidencePackage: (await repository.getReviewById("review-1")).interpretedEvidence,
    }).items[0];
    expect(initial.photoPoseSummary).toBe("5 photos · 5 poses still to choose");
    expect(initial.metrics[0].value).not.toContain("Unknown Relaxed");

    let currentUpdatedAt = updatedAt;
    for (const [index, poseId] of ["front-relaxed", "front-flexed", "back-relaxed", "back-flexed", "side-relaxed"].entries()) {
      const saved = await service.setPhotoPose("review-1", {
        expectedUpdatedAt: currentUpdatedAt,
        photoId: `photo-${index + 1}`,
        poseId,
        sourceArtifactRef: `artifact-${index + 1}`,
        updatedBy: "founder",
      });
      currentUpdatedAt = saved.updatedAt;
    }
    const completed = createEvidenceReviewPresentation({
      evidencePackage: (await repository.getReviewById("review-1")).interpretedEvidence,
    }).items[0];
    expect(completed.photoPoseSummary).toBe(
      "5 photos · Front Relaxed, Front Flexed, Rear Relaxed, Rear Flexed — Double Biceps, Side Relaxed"
    );
    expect(completed.photoPoseSummary).not.toMatch(/Ã‚Â·|Ãƒ|Ã¢|�/);
    expect(completed.photoPoseSummary).toContain("Rear Flexed — Double Biceps");
  });

  it("uses singular and plural photo grammar without changing unresolved readiness copy", () => {
    expect(formatPhotoPoseSummary([{ ...photo(1), view: "front", pose: "relaxed" }]))
      .toBe("1 photo · Front Relaxed");
    expect(formatPhotoPoseSummary([photo(1)]))
      .toBe("1 photo · 1 pose still to choose");
    expect(formatPhotoPoseSummary([photo(1), photo(2)]))
      .toBe("2 photos · 2 poses still to choose");
  });
});

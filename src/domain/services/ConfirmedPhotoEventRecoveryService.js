import { createEvidenceReviewService } from "./EvidenceReviewService";
import { createPhotoEventNarrativeService } from "./PhotoEventNarrativeService";

const REQUIRED_COMPLETED_STEPS = [
  "canonical_commit",
  "compatibility_writes",
  "scheduled_completion",
  "analysis",
  "goal_evaluation",
  "event_eligibility",
];

export function createConfirmedPhotoEventRecoveryService({ repositories, now = () => new Date() }) {
  return {
    async inspect({ reviewId, userId }) {
      const review = await repositories.evidenceReviews.getReviewById(reviewId);
      if (!review || review.userId !== userId) return blocked("review_unavailable", "The evidence review is unavailable.");
      if (!["partially_committed", "confirmed"].includes(review.status)) {
        return blocked("review_not_recoverable", `Review status ${review.status} is not recoverable.`);
      }
      const incompletePrerequisite = REQUIRED_COMPLETED_STEPS.find((step) => review.commitProgress?.[step]?.status !== "completed");
      if (incompletePrerequisite) {
        return blocked("prerequisite_incomplete", `Post-confirmation step ${incompletePrerequisite} is incomplete.`);
      }
      const photoObject = (review.interpretedEvidence?.evidence_objects ?? []).find((item) => item.evidence_type === "photo_session" && item.removed !== true);
      if (!photoObject) return blocked("photo_session_unavailable", "The confirmed review has no PhotoSession.");
      const date = String(photoObject.observed_at).slice(0, 10);
      const sessionId = `photo_session_${userId}_${date}`;
      const artifactId = `event_briefing_progress_photo_${sessionId}`;
      const artifacts = await repositories.dailyBriefings.listDailyBriefings(userId);
      const existing = artifacts.find((item) => item.id === artifactId) ?? null;
      return {
        status: "ready",
        review,
        sessionId,
        artifactId,
        existingArtifact: existing,
        firstIncompleteStep: review.commitProgress?.briefing?.status !== "completed"
          ? "briefing"
          : review.commitProgress?.home_refresh?.status !== "completed"
            ? "home_refresh"
            : null,
      };
    },
    async recover({ reviewId, userId, confirmedBy = userId, refreshArtifact = false }) {
      const inspection = await this.inspect({ reviewId, userId });
      if (inspection.status !== "ready") return inspection;
      const reviewService = createEvidenceReviewService({ repositories, now });
      if (!inspection.firstIncompleteStep && inspection.review.status === "confirmed" && !refreshArtifact) {
        return {
          status: "completed",
          reviewId,
          sessionId: inspection.sessionId,
          artifactId: inspection.existingArtifact?.id ?? inspection.artifactId,
          created: false,
          resumedFrom: null,
        };
      }
      let artifact = inspection.existingArtifact;
      let created = false;
      if (inspection.review.commitProgress?.briefing?.status !== "completed" || refreshArtifact) {
        const result = await createPhotoEventNarrativeService({ repositories, now }).getOrCreateResult({
          userId,
          sessionId: inspection.sessionId,
        });
        if (result.status !== "completed" || !result.artifactId) {
          return blocked(result.code ?? "briefing_recovery_failed", result.message ?? "Photo Event briefing recovery failed.");
        }
        if (refreshArtifact && !result.created && !inspection.firstIncompleteStep && inspection.review.status === "confirmed") {
          return {
            status: "completed",
            reviewId,
            sessionId: result.sessionId,
            artifactId: result.artifactId,
            created: false,
            resumedFrom: null,
          };
        }
        artifact = result.artifact;
        created = result.created;
        await reviewService.recordCommitProgress(reviewId, "briefing", {
          status: "completed",
          attempts: (inspection.review.commitProgress?.briefing?.attempts ?? 0) + 1,
          completedAt: now().toISOString(),
          result: {
            status: "completed",
            artifactIds: [result.artifactId],
            photoSessionIds: [result.sessionId],
            freshness: created ? (refreshArtifact ? "event_corrected_in_place" : "event_generated") : "event_reused",
          },
        });
      }
      const current = await repositories.evidenceReviews.getReviewById(reviewId);
      if (current.commitProgress?.home_refresh?.status !== "completed") {
        await reviewService.recordCommitProgress(reviewId, "home_refresh", {
          status: "completed",
          attempts: (current.commitProgress?.home_refresh?.attempts ?? 0) + 1,
          completedAt: now().toISOString(),
          result: {
            status: "completed",
            invalidatedPaths: ["/", "/briefing/daily"],
            refreshKey: `home_${current.interpretedEvidence?.package_id}`,
            artifactIds: [artifact.id],
          },
        });
      }
      const finalized = await repositories.evidenceReviews.getReviewById(reviewId);
      if (finalized.status !== "confirmed") {
        await reviewService.confirm(reviewId, {
          evidencePackage: finalized.interpretedEvidence,
          confirmedBy,
        });
      }
      return {
        status: "completed",
        reviewId,
        sessionId: inspection.sessionId,
        artifactId: artifact.id,
        created,
        resumedFrom: refreshArtifact ? "briefing_correction" : inspection.firstIncompleteStep,
      };
    },
  };
}

function blocked(code, message) {
  return { status: "blocked", code, message };
}

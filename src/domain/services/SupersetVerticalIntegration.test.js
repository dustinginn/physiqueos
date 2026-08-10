import { describe, expect, it, vi } from "vitest";
import { createCanonicalEvidenceRepository } from "../../data/repositories/CanonicalEvidenceRepository";
import { createTrainingSessionEvidenceFromText } from "../models/trainingSessionEvidence";
import { createEvidenceReviewPresentation } from "./EvidenceReviewPresentationService";
import { createEvidenceReviewService } from "./EvidenceReviewService";
import { getResistanceBreakdown } from "./ProgressReportingService";
import { createTrainingPerformanceIntelligenceReport } from "./TrainingPerformanceIntelligenceService";
import { getTrainingSessionExerciseRenderItems } from "../../screens/TrainingKnowledgeScreen";

describe("Superset V1 vertical proving case", () => {
  it("carries one Superset and one standalone occurrence from typed review through canonical reads", async () => {
    const workout = createTrainingSessionEvidenceFromText({
      capturedAt: "2026-08-10T18:30:00.000Z",
      id: "training_superset_proving_case",
      observedAt: "2026-08-10",
      text: [
        "Superset:",
        "Chest Press Machine",
        "8r 100p",
        "Chest Fly Machine",
        "10r 70p",
        "End Superset",
        "Spider Curls",
        "12r 35p",
      ].join("\n"),
    });
    const evidencePackage = {
      package_id: "superset_proving_case",
      userId: "founder",
      evidence_objects: [workout],
    };

    const presentation = createEvidenceReviewPresentation({ evidencePackage });
    expect(presentation.items[0].exerciseRelationshipGroups).toHaveLength(1);
    expect(presentation.items[0].exerciseRelationshipGroups[0].members.map((item) => item.name))
      .toEqual(["Chest Press Machine", "Chest Fly Machine"]);
    expect(presentation.items[0].standaloneExercises.map((item) => item.name))
      .toEqual(["Spider Curls"]);

    const reviewState = {
      review: {
        id: "review_superset_proving_case",
        userId: "founder",
        status: "pending",
        interpretedEvidence: evidencePackage,
      },
    };
    const reviewService = createEvidenceReviewService({
      repositories: {
        evidenceReviews: {
          getReviewById: async () => structuredClone(reviewState.review),
          updateReview: async (_id, patch) => {
            reviewState.review = { ...reviewState.review, ...structuredClone(patch) };
            return structuredClone(reviewState.review);
          },
        },
      },
    });
    await expect(reviewService.beginCommit(reviewState.review.id))
      .resolves.toMatchObject({ status: "committing" });

    const canonicalRepository = createCanonicalEvidenceRepository([], {
      onChange: vi.fn(),
    });
    await canonicalRepository.reconcileConfirmedEvidencePackage(
      evidencePackage,
      "founder"
    );
    const [canonical] = await canonicalRepository.listCanonicalEvidenceObjects("founder");
    const canonicalWorkout = canonical.payload;
    expect(canonicalWorkout.exerciseRelationshipGroups[0].memberExerciseIds)
      .toEqual(canonicalWorkout.exercises.slice(0, 2).map((item) => item.id));
    expect(getTrainingSessionExerciseRenderItems(canonicalWorkout).map((item) => item.type))
      .toEqual(["relationship", "exercise"]);

    const resistance = getResistanceBreakdown([canonicalWorkout]);
    const occurrences = resistance.flatMap((region) =>
      region.movementFamilies.flatMap((family) => family.exercises)
    );
    expect(occurrences.find((item) => item.label === "Chest Press Machine")
      .occurrences[0].relationshipContext).toMatchObject({
      relationshipType: "superset",
      orderedPartners: [expect.objectContaining({ name: "Chest Fly Machine" })],
    });
    expect(occurrences.find((item) => item.label === "Spider Curls")
      .occurrences[0].relationshipContext).toBeNull();

    const performance = createTrainingPerformanceIntelligenceReport({
      now: "2026-08-10T20:00:00.000Z",
      trainingSessions: [canonicalWorkout],
    });
    const press = performance.exerciseObservations.find(
      (item) => item.exercise.key === "chest_press_machine"
    );
    expect(press.id).toBe("performance|exercise|chest_press_machine");
    expect(press.explanation_data.last_session.relationship_context)
      .toMatchObject({ relationship_type: "superset" });
  });
});

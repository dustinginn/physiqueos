import { describe, expect, it } from "vitest";
import { resolveConfirmedCanonicalTrainingSession } from "./ConfirmedCanonicalTrainingSessionResolver";

describe("resolveConfirmedCanonicalTrainingSession", () => {
  it("resolves a committed canonical training session from persisted commit mapping", () => {
    const reviewItem = {
      id: "training_2026-07-27_07-09_StrengthTraining",
      evidence_type: "training",
      source: { source_artifact_refs: ["IMG_1688.png", "typed_evidence_0"] },
      provenance: { source_artifact_refs: ["IMG_1688.png", "typed_evidence_0"] },
    };
    const canonicalEvidenceObjects = [
      {
        canonicalId: "training|authoritative|IMG_1688.png|typed_evidence_0",
        evidence_type: "training",
        quality: { status: "active" },
        provenance: { source_artifact_refs: ["unrelated_ref"] },
        source: { source_artifact_refs: ["training_2026-07-17_0639_traditional_strength_training"] },
        payload: { id: "training_2026-07-17_0639_traditional_strength_training" },
      },
    ];
    const canonicalCommitResults = [
      {
        canonicalEntityType: "training",
        canonicalEntityId: "training|authoritative|IMG_1688.png|typed_evidence_0",
        reviewItemId: "training_2026-07-27_07-09_StrengthTraining",
        sourceEvidenceId: "IMG_1688.png",
        originalNormalizedId: "training_2026-07-27_07-09_StrengthTraining",
        canonicalSourceReferences: ["IMG_1688.png", "typed_evidence_0"],
      },
    ];

    const result = resolveConfirmedCanonicalTrainingSession({
      reviewItem,
      canonicalEvidenceObjects,
      canonicalCommitResults,
    });

    expect(result.status).toBe("resolved");
    expect(result.canonicalSession?.canonicalId).toBe(
      "training|authoritative|IMG_1688.png|typed_evidence_0"
    );
    expect(result.resolutionPath).toBe("persisted_commit_mapping");
  });

  it("resolves a committed canonical training session from source references when available", () => {
    const reviewItem = {
      id: "training_2026-07-27_07-09_StrengthTraining",
      evidence_type: "training",
      source: { source_artifact_refs: ["IMG_1688.png", "typed_evidence_0"] },
      provenance: { source_artifact_refs: ["IMG_1688.png", "typed_evidence_0"] },
    };
    const canonicalEvidenceObjects = [
      {
        canonicalId: "training|authoritative|IMG_1688.png|typed_evidence_0",
        evidence_type: "training",
        quality: { status: "active" },
        provenance: {
          source_artifact_refs: ["IMG_1688.png", "typed_evidence_0"],
          contributing_evidence_object_ids: ["training_2026-07-27_07-09_StrengthTraining"],
        },
        source: { source_artifact_refs: ["IMG_1688.png", "typed_evidence_0"] },
        payload: { id: "training_2026-07-17_0639_traditional_strength_training" },
      },
    ];

    const result = resolveConfirmedCanonicalTrainingSession({
      reviewItem,
      canonicalEvidenceObjects,
    });

    expect(result.status).toBe("resolved");
    expect(result.canonicalSession?.canonicalId).toBe(
      "training|authoritative|IMG_1688.png|typed_evidence_0"
    );
    expect(result.resolutionPath).toBe("source_reference");
  });
});

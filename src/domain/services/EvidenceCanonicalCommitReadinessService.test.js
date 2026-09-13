import { describe, expect, it } from "vitest";
import {
  assertEvidenceCanonicalCommitReady,
  EvidenceCanonicalCommitReadinessCode,
} from "./EvidenceCanonicalCommitReadinessService";

describe("Evidence canonical commit readiness", () => {
  it("rejects the production-shaped Nutrition totals conflict without selecting an authority", () => {
    const evidencePackage = {
      package_id: "evidence_submission_3A00D7AB78024EA2B704CAD9F79E16A5_images",
      evidence_objects: [{
        id: "nutrition_2026-09-12",
        evidence_type: "nutrition",
        observed_at: "2026-09-12",
        metadata: {
          daily_totals_scope: "unknown",
          daily_totals_reconciliation: {
            status: "needs_review",
            authoritative_source: "canonical_meal_sums",
            conflicting_fields: ["calories", "protein_g", "carbs_g", "fat_g"],
            source_daily_totals: { calories: 2450, protein_g: 74, carbs_g: 202, fat_g: 148 },
            canonical_meal_sums: { calories: 4190, protein_g: 192, carbs_g: 313, fat_g: 239 },
          },
        },
      }],
    };

    expect(() => assertEvidenceCanonicalCommitReady(evidencePackage)).toThrow(
      expect.objectContaining({
        code: EvidenceCanonicalCommitReadinessCode.NUTRITION_DAILY_TOTALS_CONFLICT,
        fields: ["calories", "protein_g", "carbs_g", "fat_g"],
      })
    );
  });

  it("accepts matched Nutrition and unrelated evidence without changing either", () => {
    const evidencePackage = {
      evidence_objects: [
        { id: "nutrition", evidence_type: "nutrition", metadata: { daily_totals_reconciliation: { status: "matched" } } },
        { id: "activity", evidence_type: "activity_day" },
      ],
    };
    const before = structuredClone(evidencePackage);
    expect(assertEvidenceCanonicalCommitReady(evidencePackage)).toBe(true);
    expect(evidencePackage).toEqual(before);
  });

  it("ignores an explicitly removed conflicting Nutrition item", () => {
    expect(assertEvidenceCanonicalCommitReady({
      evidence_objects: [{
        id: "removed", evidence_type: "nutrition", removed: true,
        metadata: { daily_totals_reconciliation: { status: "needs_review" } },
      }],
    })).toBe(true);
  });
});

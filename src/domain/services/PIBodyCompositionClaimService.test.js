import { describe, expect, it } from "vitest";
import { createPIObservation } from "./PIObservationService";
import { createBodyCompositionClaims, PI_EVIDENCE_AUTHORITY } from "./PIBodyCompositionClaimService";

describe("PI body-composition claims", () => {
  it("places DEXA above Photo and lower-authority routine evidence", () => {
    expect(PI_EVIDENCE_AUTHORITY.dexa).toBeGreaterThan(PI_EVIDENCE_AUTHORITY.repeated_comparable_photos);
    expect(PI_EVIDENCE_AUTHORITY.comparable_photo).toBeGreaterThan(PI_EVIDENCE_AUTHORITY.weight);
    expect(PI_EVIDENCE_AUTHORITY.weight).toBeGreaterThan(PI_EVIDENCE_AUTHORITY.energy);
  });

  it("corroborates matching DEXA and Photo body-fat direction", () => {
    const claims = createBodyCompositionClaims([
      observation("dexa", "dexa_body_fat_percentage_change", "body_fat_percentage", "falling", "high"),
      observation("photos", "photo_leanness_change", "leanness", "rising", "moderate"),
    ]);
    const claim = claims.find((item) => item.kind === "photo_dexa_body_fat_corroboration");
    expect(claim.explanationData).toMatchObject({
      corroborationState: "corroborated",
      authoritativeObservationId: expect.stringContaining("dexa"),
      causalInference: false,
      goalConclusion: null,
    });
  });

  it("retains contradiction and keeps DEXA authoritative", () => {
    const claims = createBodyCompositionClaims([
      observation("dexa", "dexa_body_fat_percentage_change", "body_fat_percentage", "rising", "high"),
      observation("photos", "photo_leanness_change", "leanness", "rising", "moderate"),
    ]);
    const claim = claims.find((item) => item.kind === "photo_dexa_body_fat_corroboration");
    expect(claim.explanationData.corroborationState).toBe("contradicted");
    expect(claim.limitations).toContain("photo_direction_disagrees_with_dexa_measurement");
    expect(claim.explanationData.authority[0].domain).toBe("dexa");
  });

  it("builds conservative DEXA–Weight, DEXA–Training, and Photo–Weight relationships", () => {
    const claims = createBodyCompositionClaims([
      observation("dexa", "dexa_lean_mass_change", "lean_mass", "rising", "high"),
      observation("dexa", "dexa_body_fat_percentage_change", "body_fat_percentage", "stable", "high"),
      observation("training", "training_progressive_overload", "training_scope", "rising", "moderate"),
      observation("weight", "weight_short_window_change", "body_weight", "rising", "moderate"),
      observation("photos", "photo_leanness_change", "leanness", "stable", "moderate"),
    ]);
    expect(claims.map((item) => item.kind)).toEqual(expect.arrayContaining([
      "dexa_lean_mass_training_relationship",
      "dexa_body_fat_weight_relationship",
      "photo_leanness_weight_relationship",
    ]));
    expect(JSON.stringify(claims)).not.toMatch(/caused|protocol worked|goal succeeded|goal failed/i);
  });

  it("is deterministic and input-immutable", () => {
    const input = [
      observation("dexa", "dexa_body_fat_percentage_change", "body_fat_percentage", "falling", "high"),
      observation("weight", "weight_short_window_change", "body_weight", "falling", "moderate"),
    ];
    const before = structuredClone(input);
    expect(createBodyCompositionClaims(input)).toEqual(createBodyCompositionClaims(input));
    expect(input).toEqual(before);
  });
});

function observation(domain, kind, subject, direction, level) {
  return createPIObservation({
    domain,
    kind,
    semanticScope: "weekly",
    subject: { type: "whole_body_metric", id: subject, label: subject },
    status: direction === "stable" ? "stable" : "observed",
    direction,
    evidenceWindow: { startDate: "2026-07-19", endDate: "2026-07-25" },
    supportingEvidenceIds: [`${domain}-evidence`],
    confidence: { level, method: "fixture" },
    explanationData: {},
    provenance: { producer: `${domain}_fixture`, producerVersion: "v1", calculationMethod: "fixture", sourceEvidenceIds: [`${domain}-evidence`] },
  });
}

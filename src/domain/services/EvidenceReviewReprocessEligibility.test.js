import { describe, expect, it } from "vitest";
import { resolveEvidenceReviewReprocessEligibility } from "./EvidenceReviewReprocessEligibility";

const packageId = "evidence_submission_20260830185556626_images";

function fixture(overrides = {}) {
  const evidencePackage = {
    package_id: packageId,
    provenance: {
      source_artifacts: [
        { id: "IMG_1978.png", storage_path: "media://one" },
        { id: "IMG_1977.png", storage_path: "media://two" },
        { id: "typed_evidence_0", kind: "typed_evidence", text: "exercise notes" },
      ],
    },
  };
  const review = {
    id: "evidence_review_20260830185644505",
    userId: "founder",
    source: "historical_universal_intake",
    status: "pending",
    commitProgress: {},
    confirmation: null,
    interpretedEvidence: evidencePackage,
    ...overrides,
  };
  return { review, evidencePackage };
}

describe("Evidence Review reread eligibility", () => {
  it("allows an intact uncommitted historical universal intake review", () => {
    const state = fixture();
    expect(resolveEvidenceReviewReprocessEligibility(state)).toEqual({
      eligible: true,
      code: "ELIGIBLE",
      reason: null,
    });
  });

  it("does not infer immutability from the source name", () => {
    const state = fixture({ source: "historical_immutable_named_but_editable" });
    expect(resolveEvidenceReviewReprocessEligibility(state).eligible).toBe(true);
  });

  it.each([
    [{ immutable: true }, "REVIEW_IMMUTABLE"],
    [{ commitProgress: { canonical_commit: { state: "started" } } }, "REVIEW_ALREADY_APPLIED"],
    [{ commitClaim: { status: "in_progress", leaseExpiresAt: "2099-01-01T00:00:00.000Z" } }, "ACTIVE_COMMIT_CLAIM"],
  ])("blocks genuine mutation protection state", (overrides, code) => {
    const state = fixture(overrides);
    expect(resolveEvidenceReviewReprocessEligibility(state)).toMatchObject({
      eligible: false,
      code,
    });
  });

  it("blocks exact package provenance already linked to canonical evidence", () => {
    const state = fixture();
    expect(resolveEvidenceReviewReprocessEligibility({
      ...state,
      canonicalObjects: [{ provenance: { packageId } }],
    })).toMatchObject({ eligible: false, code: "CANONICAL_LINK_EXISTS" });
  });
});

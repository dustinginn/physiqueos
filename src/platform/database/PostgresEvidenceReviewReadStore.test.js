import { describe, expect, it, vi } from "vitest";
import { createEvidenceReviewReadService } from "../../application/evidence/EvidenceReviewReadService.js";
import {
  createPostgresEvidenceReviewReadStore,
  createRepositoryEvidenceReviewReadStore,
} from "./PostgresEvidenceReviewReadStore.js";

describe("provider-native Evidence Review reads", () => {
  it("loads only the review, its package, and relevant canonical evidence", async () => {
    const diagnostics = [];
    const query = vi.fn(async (sql, values) => {
      const text = String(sql).replace(/\s+/g, " ");
      if (text.includes("collection_name='evidenceReviews'")) {
        return { rows: [{ version: 2, payload: review() }] };
      }
      if (text.includes("collection_name='evidencePackages'")) {
        return { rows: [{ version: 1, payload: evidencePackage() }] };
      }
      if (text.includes("collection_name='canonicalEvidenceObjects'")) {
        expect(values).toEqual(["founder", "package-photo", []]);
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${text}`);
    });
    const store = createPostgresEvidenceReviewReadStore({
      pool: { query, totalCount: 1, idleCount: 1, waitingCount: 0 },
      ownerUserId: "founder",
      onComplete: (event) => diagnostics.push(event),
    });
    const result = await createEvidenceReviewReadService({ store }).getReview("review-photo");

    expect(result).toEqual({
      review: expect.objectContaining({ id: "review-photo", version: 2 }),
      evidencePackage: expect.objectContaining({ package_id: "package-photo", version: 1 }),
      canonicalObjects: [],
    });
    expect(query).toHaveBeenCalledTimes(3);
    expect(diagnostics).toEqual([expect.objectContaining({
      readModel: "evidence.review.detail",
      queryCount: 3,
      rowCount: 2,
      compatibilityRuntimeLoadCount: 0,
    })]);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("phase4_import_runs"))).toBe(false);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("canonical_application_context"))).toBe(false);
  });

  it("preserves repository-mode review semantics", async () => {
    const canonical = [{ canonicalId: "photo-source", provenance: { package_id: "package-photo" } }];
    const repositories = {
      evidenceReviews: { getReviewById: async () => review(), listReviews: async () => [review()] },
      evidencePackages: { getEvidencePackageById: async () => evidencePackage() },
      canonicalEvidence: { listCanonicalEvidenceObjects: async () => canonical },
    };
    const result = await createEvidenceReviewReadService({
      store: createRepositoryEvidenceReviewReadStore({ repositories }),
    }).getReview("review-photo");
    expect(result).toEqual({ review: review(), evidencePackage: evidencePackage(), canonicalObjects: canonical });
  });
});

function review() {
  return {
    id: "review-photo",
    userId: "founder",
    status: "pending",
    interpretedEvidence: { package_id: "package-photo", evidence_objects: [{ evidence_type: "photo_session" }] },
  };
}

function evidencePackage() {
  return { package_id: "package-photo", provenance: { source_artifacts: [{ id: "artifact-one" }] } };
}

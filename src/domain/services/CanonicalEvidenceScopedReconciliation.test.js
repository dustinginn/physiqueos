import { describe, expect, it, vi } from "vitest";
import { createCanonicalEvidenceRepository } from "../../data/repositories/CanonicalEvidenceRepository";
import {
  buildCanonicalReconciliationScope,
  reconcileConfirmedEvidencePackage,
} from "./CanonicalEvidenceService";

const userId = "founder";
const nutrition = (overrides = {}) => ({
  id: "nutritionday_2026-07-12_1",
  evidence_type: "nutrition",
  observed_at: "2026-07-12",
  daily_totals: { calories: 1920, protein_g: 189 },
  provenance: { source_artifact_refs: ["nutrition.png"] },
  ...overrides,
});
const evidencePackage = (objects = [nutrition()]) => ({
  package_id: "package-nutrition",
  userId,
  evidence_objects: objects,
});
const canonical = (canonicalId, payload, overrides = {}) => ({
  canonicalId,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
  evidence_type: payload.evidence_type,
  firstObservedAt: payload.observed_at,
  lastObservedAt: payload.observed_at,
  payload,
  provenance: { evidence_package_ids: ["historical-package"] },
  quality: { status: "active" },
  userId,
  ...overrides,
});
const historical = () => [
  canonical("photo-1", { id: "photo-1", evidence_type: "photo_session", observed_at: "2026-07-06", photos: [{ pose: "relaxed", view: "unknown" }] }),
  canonical("photo-2", { id: "photo-2", evidence_type: "photo_session", observed_at: "2026-07-06", photos: [{ pose: "relaxed", view: "unknown" }] }),
  canonical("photo-3", { id: "photo-3", evidence_type: "photo_session", observed_at: "2026-07-06", photos: [{ pose: "relaxed", view: "unknown" }] }),
  canonical("activity_day|2026-07-06", { id: "activity-6", evidence_type: "activity_day", observed_at: "2026-07-06", references: { training_session_ids: ["z", "a"] } }),
  canonical("activity_day|2026-07-09", { id: "activity-9", evidence_type: "activity_day", observed_at: "2026-07-09", references: { training_session_ids: ["b", "a"] } }),
  canonical("training-unrelated", { id: "training-unrelated", evidence_type: "training", observed_at: "2026-07-06", metadata: { activity_type: "Walk" } }),
];

describe("scoped canonical confirmation reconciliation", () => {
  it("adds one NutritionDay while preserving incident-style history byte-for-byte", async () => {
    const records = historical();
    const before = JSON.stringify(records);
    const onChange = vi.fn();
    const repository = createCanonicalEvidenceRepository(records, { onChange });

    const result = await repository.reconcileConfirmedEvidencePackage(evidencePackage(), userId);

    expect(result.report.addedCanonicalIds).toEqual(["nutrition|2026-07-12|nutritionday_2026-07-12_1"]);
    expect(JSON.stringify(records.slice(0, 6))).toBe(before);
    expect(records).toHaveLength(7);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("constructs a deterministic package scope excluding same-user unrelated history", () => {
    const first = buildCanonicalReconciliationScope({ evidencePackage: evidencePackage(), existingCanonicalObjects: historical() });
    const second = buildCanonicalReconciliationScope({ evidencePackage: evidencePackage(), existingCanonicalObjects: historical() });

    expect(second).toEqual(first);
    expect(first.incomingCanonicalIdentities).toEqual(["nutrition|2026-07-12|nutritionday_2026-07-12_1"]);
    expect(first.directlyRelatedCanonicalIdentities).toEqual([]);
  });

  it("updates only an existing same-identity NutritionDay", () => {
    const identity = "nutrition|2026-07-12|nutritionday_2026-07-12_1";
    const unrelated = historical();
    const existing = canonical(identity, nutrition({ daily_totals: { calories: 1800, protein_g: 170 } }));
    const result = reconcileConfirmedEvidencePackage({ evidencePackage: evidencePackage(), existingCanonicalObjects: [...unrelated, existing], userId });

    expect(result.report.updatedCanonicalIds).toEqual([identity]);
    expect(result.changedObjects).toHaveLength(1);
    expect(JSON.stringify(unrelated)).toBe(JSON.stringify(historical()));
  });

  it("is idempotent and avoids timestamp churn for the same package", async () => {
    const records = historical();
    const onChange = vi.fn();
    const repository = createCanonicalEvidenceRepository(records, { onChange });
    await repository.reconcileConfirmedEvidencePackage(evidencePackage(), userId);
    const afterFirst = JSON.stringify(records);
    onChange.mockClear();

    const second = await repository.reconcileConfirmedEvidencePackage(evidencePackage(), userId);

    expect(second.changedObjects).toEqual([]);
    expect(JSON.stringify(records)).toBe(afterFirst);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("includes only selected items from a multi-item package", () => {
    const excluded = nutrition({ id: "excluded", observed_at: "2026-07-11", removed: true });
    const second = nutrition({ id: "nutritionday_2026-07-13_1", observed_at: "2026-07-13" });
    const result = reconcileConfirmedEvidencePackage({ evidencePackage: evidencePackage([nutrition(), second, excluded]), existingCanonicalObjects: historical(), userId });

    expect(result.report.addedCanonicalIds).toEqual([
      "nutrition|2026-07-12|nutritionday_2026-07-12_1",
      "nutrition|2026-07-13|nutritionday_2026-07-13_1",
    ]);
  });

  it("keeps broad history reconciliation behind an explicit command", async () => {
    const records = historical();
    const repository = createCanonicalEvidenceRepository(records, {
      evidencePackages: [evidencePackage()],
      onChange: vi.fn(),
    });
    const broad = vi.spyOn(repository, "reconcileCanonicalHistory");

    await repository.reconcileConfirmedEvidencePackage(evidencePackage(), userId);

    expect(broad).not.toHaveBeenCalled();
  });

  it("exposes broad reconciliation only as an explicit maintenance command with a report", async () => {
    const records = historical();
    const repository = createCanonicalEvidenceRepository(records, {
      evidencePackages: [evidencePackage()],
      onChange: vi.fn(),
    });

    const result = await repository.reconcileCanonicalHistory(userId);

    expect(result.report.mutationReason).toBe("explicit_canonical_history_maintenance");
    expect(result.report.addedCanonicalIds).toContain("nutrition|2026-07-12|nutritionday_2026-07-12_1");
  });

  it("limits explicit merge scope to the declared linked record", () => {
    const linked = canonical("nutrition-prior", nutrition({ id: "nutrition-prior", observed_at: "2026-07-10" }));
    const incoming = nutrition({ reconciliation: { merge_canonical_ids: [linked.canonicalId] } });
    const scope = buildCanonicalReconciliationScope({ evidencePackage: evidencePackage([incoming]), existingCanonicalObjects: [...historical(), linked] });

    expect(scope.directlyRelatedCanonicalIdentities).toEqual([linked.canonicalId]);
    expect(scope.directlyRelatedCanonicalIdentities).not.toContain("activity_day|2026-07-06");
  });

  it("changes only incoming and explicitly superseded canonical records", () => {
    const prior = canonical("nutrition-prior", nutrition({ id: "nutrition-prior", observed_at: "2026-07-10" }));
    const incoming = nutrition({ supersedes_canonical_id: prior.canonicalId });
    const unrelated = historical();
    const result = reconcileConfirmedEvidencePackage({ evidencePackage: evidencePackage([incoming]), existingCanonicalObjects: [...unrelated, prior], userId });

    expect(result.report.changedCanonicalIds).toEqual(expect.arrayContaining([
      "nutrition|2026-07-12|nutritionday_2026-07-12_1",
      prior.canonicalId,
    ]));
    expect(result.scope.supersededCanonicalIdentities).toEqual([prior.canonicalId]);
    expect(result.changedObjects.find((item) => item.canonicalId === prior.canonicalId)?.quality).toEqual(expect.objectContaining({ status: "superseded", supersededBy: "nutrition|2026-07-12|nutritionday_2026-07-12_1" }));
    expect(JSON.stringify(unrelated)).toBe(JSON.stringify(historical()));
  });
});

import { describe, expect, it } from "vitest";
import {
  ActivityCanonicalSourceClass,
  createCanonicalActivityDayRecord,
  getActivityDayLogicalKey,
  getStableActivityDayCanonicalId,
  prepareActivityEvidencePackageForReview,
  selectActiveCanonicalActivityDays,
} from "./CanonicalActivityDayService";

const owner = "user_founder_001";

describe("canonical Activity Day integrity", () => {
  it("uses the intended owner-local calendar date for stable same-day identity", () => {
    const evidence = activity({
      observed_at: "2026-08-27T01:30:00.000Z",
      metadata: { time_zone: "America/Los_Angeles" },
    });

    expect(getActivityDayLogicalKey(evidence)).toBe("activity_day|2026-08-26");
    expect(getStableActivityDayCanonicalId(evidence)).toBe("activity_day|2026-08-26");
  });

  it("preserves the established source precedence and source provenance", () => {
    const manual = createCanonicalActivityDayRecord({
      canonicalId: "activity_day|2026-08-26",
      canonicalProvenance: provenance("package-manual", "manual-1"),
      evidenceObject: activity({ id: "manual-1", daily_activity: { move_calories: 600 } }),
      evidencePackage: evidencePackage("package-manual"),
      now: "2026-08-27T01:00:00.000Z",
      userId: owner,
    });
    const imported = createCanonicalActivityDayRecord({
      canonicalId: manual.canonicalId,
      canonicalProvenance: provenance("package-health", "health-1", manual.provenance),
      evidenceObject: activity({
        id: "health-1",
        daily_activity: { move_calories: 725 },
        source: { application: "Apple Health", integration: "HealthKit", modality: "direct" },
      }),
      evidencePackage: evidencePackage("package-health"),
      existingObject: manual,
      now: "2026-08-27T02:00:00.000Z",
      userId: owner,
    });

    expect(imported.payload.daily_activity.move_calories).toBe(725);
    expect(imported.activityRevision).toMatchObject({
      revision: 2,
      sourceClass: ActivityCanonicalSourceClass.HEALTH_PROVIDER,
      semanticChanged: true,
    });
    expect(imported.activityRevisionHistory).toHaveLength(1);
    expect(imported.provenance.evidence_package_ids).toEqual([
      "package-manual",
      "package-health",
    ]);
  });

  it("retains new same-value provenance without advancing the semantic revision", () => {
    const first = createCanonicalActivityDayRecord({
      canonicalId: "activity_day|2026-08-26",
      canonicalProvenance: provenance("package-a", "activity-a"),
      evidenceObject: activity({ id: "activity-a" }),
      evidencePackage: evidencePackage("package-a"),
      now: "2026-08-27T01:00:00.000Z",
      userId: owner,
    });
    const second = createCanonicalActivityDayRecord({
      canonicalId: first.canonicalId,
      canonicalProvenance: provenance("package-b", "activity-b", first.provenance),
      evidenceObject: activity({ id: "activity-b" }),
      evidencePackage: evidencePackage("package-b"),
      existingObject: first,
      now: "2026-08-27T02:00:00.000Z",
      userId: owner,
    });

    expect(second.activityRevision.revision).toBe(1);
    expect(second.activityRevision.semanticChanged).toBe(false);
    expect(second.updatedAt).toBe(first.updatedAt);
    expect(second.activityRevisionHistory).toEqual([]);
    expect(second.provenance.evidence_package_ids).toEqual(["package-a", "package-b"]);
  });

  it("returns the prior record unchanged for an exact accepted-source replay", () => {
    const packageValue = evidencePackage("package-a");
    const first = createCanonicalActivityDayRecord({
      canonicalId: "activity_day|2026-08-26",
      canonicalProvenance: provenance("package-a", "activity-a"),
      evidenceObject: activity({ id: "activity-a" }),
      evidencePackage: packageValue,
      now: "2026-08-27T01:00:00.000Z",
      userId: owner,
    });
    const replay = createCanonicalActivityDayRecord({
      canonicalId: first.canonicalId,
      canonicalProvenance: first.provenance,
      evidenceObject: activity({ id: "activity-a" }),
      evidencePackage: packageValue,
      existingObject: first,
      now: "2026-08-27T03:00:00.000Z",
      userId: owner,
    });

    expect(replay).toBe(first);
  });

  it("rejects a stale Activity review before a correction can overwrite a newer revision", () => {
    const first = createCanonicalActivityDayRecord({
      canonicalId: "activity_day|2026-08-26",
      canonicalProvenance: provenance("package-a", "activity-a"),
      evidenceObject: activity({ id: "activity-a" }),
      evidencePackage: evidencePackage("package-a"),
      now: "2026-08-27T01:00:00.000Z",
      userId: owner,
    });
    const stalePackage = prepareActivityEvidencePackageForReview({
      canonicalObjects: [first],
      evidencePackage: {
        ...evidencePackage("package-stale"),
        evidence_objects: [activity({
          id: "activity-stale",
          daily_activity: { move_calories: 710 },
          source: { modality: "correction" },
        })],
      },
      reviewId: "review-stale",
    });
    const advanced = createCanonicalActivityDayRecord({
      canonicalId: first.canonicalId,
      canonicalProvenance: provenance("package-current", "activity-current", first.provenance),
      evidenceObject: activity({
        id: "activity-current",
        daily_activity: { move_calories: 725 },
        source: { modality: "correction" },
      }),
      evidencePackage: evidencePackage("package-current"),
      existingObject: first,
      now: "2026-08-27T02:00:00.000Z",
      userId: owner,
    });

    expect(() => createCanonicalActivityDayRecord({
      canonicalId: first.canonicalId,
      canonicalProvenance: provenance("package-stale", "activity-stale", advanced.provenance),
      evidenceObject: stalePackage.evidence_objects[0],
      evidencePackage: stalePackage,
      existingObject: advanced,
      now: "2026-08-27T03:00:00.000Z",
      requireExpectedPriorFingerprint: true,
      userId: owner,
    })).toThrow(expect.objectContaining({ code: "ACTIVITY_REVISION_STALE" }));
  });

  it("records one revision snapshot for a real same-source correction", () => {
    const first = createCanonicalActivityDayRecord({
      canonicalId: "activity_day|2026-08-26",
      canonicalProvenance: provenance("package-a", "activity-a"),
      evidenceObject: activity({ id: "activity-a" }),
      evidencePackage: evidencePackage("package-a"),
      now: "2026-08-27T01:00:00.000Z",
      userId: owner,
    });
    const corrected = createCanonicalActivityDayRecord({
      canonicalId: first.canonicalId,
      canonicalProvenance: provenance("package-correction", "activity-correction", first.provenance),
      evidenceObject: activity({
        id: "activity-correction",
        daily_activity: { move_calories: 710 },
        source: { modality: "correction" },
      }),
      evidencePackage: evidencePackage("package-correction"),
      existingObject: first,
      now: "2026-08-27T02:00:00.000Z",
      userId: owner,
    });

    expect(corrected.activityRevision.revision).toBe(2);
    expect(corrected.activityRevisionHistory).toEqual([
      expect.objectContaining({ revision: 1, payload: first.payload }),
    ]);
  });

  it("does not let a lower-authority manual correction replace HealthKit totals", () => {
    const health = createCanonicalActivityDayRecord({
      canonicalId: "activity_day|2026-08-26",
      canonicalProvenance: provenance("package-health", "health-1"),
      evidenceObject: activity({
        id: "health-1",
        daily_activity: { move_calories: 725 },
        source: { application: "Apple Health", integration: "HealthKit", modality: "direct" },
      }),
      evidencePackage: evidencePackage("package-health"),
      now: "2026-08-27T01:00:00.000Z",
      userId: owner,
    });
    const manual = createCanonicalActivityDayRecord({
      canonicalId: health.canonicalId,
      canonicalProvenance: provenance("package-manual", "manual-correction", health.provenance),
      evidenceObject: activity({
        id: "manual-correction",
        daily_activity: { move_calories: 800 },
        source: { modality: "correction" },
      }),
      evidencePackage: evidencePackage("package-manual"),
      existingObject: health,
      now: "2026-08-27T02:00:00.000Z",
      userId: owner,
    });

    expect(manual.payload.daily_activity.move_calories).toBe(725);
    expect(manual.activityRevision.revision).toBe(1);
    expect(manual.activityRevision.sourceClass).toBe(
      ActivityCanonicalSourceClass.HEALTH_PROVIDER
    );
  });

  it("selects one deterministic active revision and reports legacy duplicates", () => {
    const records = [
      canonical("legacy-a", 1, "2026-08-27T01:00:00.000Z"),
      canonical("activity_day|2026-08-26", 2, "2026-08-27T02:00:00.000Z"),
      canonical("other-owner", 9, "2026-08-27T03:00:00.000Z", "other"),
    ];

    const selection = selectActiveCanonicalActivityDays(records, { userId: owner });

    expect(selection.records.map((record) => record.canonicalId)).toEqual([
      "activity_day|2026-08-26",
    ]);
    expect(selection.diagnostics).toEqual([
      expect.objectContaining({ code: "ACTIVITY_ACTIVE_DAY_DUPLICATE" }),
    ]);
  });
});

function activity(overrides = {}) {
  return {
    id: "activity-a",
    evidence_type: "activity_day",
    observed_at: "2026-08-26",
    daily_activity: { move_calories: 700, exercise_minutes: 45 },
    source: { modality: "manual" },
    provenance: { source_artifact_refs: ["activity.png"] },
    ...overrides,
  };
}

function evidencePackage(packageId) {
  return { package_id: packageId, review_metadata: { sourceReviewId: `review-${packageId}` } };
}

function provenance(packageId, objectId, existing = {}) {
  return {
    evidence_package_ids: [...(existing.evidence_package_ids ?? []), packageId],
    contributing_evidence_object_ids: [
      ...(existing.contributing_evidence_object_ids ?? []),
      objectId,
    ],
    source_artifact_refs: ["activity.png"],
    evidence_review_ids: [`review-${packageId}`],
  };
}

function canonical(canonicalId, revision, updatedAt, userId = owner) {
  return {
    canonicalId,
    evidence_type: "activity_day",
    payload: activity(),
    quality: { status: "active" },
    activityRevision: { revision },
    updatedAt,
    userId,
  };
}

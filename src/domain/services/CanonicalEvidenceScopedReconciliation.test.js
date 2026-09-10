import { describe, expect, it, vi } from "vitest";
import { createCanonicalEvidenceRepository } from "../../data/repositories/CanonicalEvidenceRepository";
import {
  buildCanonicalReconciliationScope,
  reconcileConfirmedEvidencePackage,
} from "./CanonicalEvidenceService";
import { prepareNutritionEvidencePackageForReview } from "./CanonicalNutritionDayService";
import { prepareActivityEvidencePackageForReview } from "./CanonicalActivityDayService";

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

    expect(result.report.addedCanonicalIds).toEqual(["nutrition|2026-07-12|nutrition-day"]);
    expect(JSON.stringify(records.slice(0, 6))).toBe(before);
    expect(records).toHaveLength(7);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("constructs a deterministic package scope excluding same-user unrelated history", () => {
    const first = buildCanonicalReconciliationScope({ evidencePackage: evidencePackage(), existingCanonicalObjects: historical() });
    const second = buildCanonicalReconciliationScope({ evidencePackage: evidencePackage(), existingCanonicalObjects: historical() });

    expect(second).toEqual(first);
    expect(first.incomingCanonicalIdentities).toEqual(["nutrition|2026-07-12|nutrition-day"]);
    expect(first.directlyRelatedCanonicalIdentities).toEqual([]);
  });

  it("updates only an existing same-identity NutritionDay", () => {
    const identity = "nutrition|2026-07-12|nutritionday_2026-07-12_1";
    const unrelated = historical();
    const existing = canonical(identity, nutrition({ daily_totals: { calories: 1800, protein_g: 170 } }));
    const prepared = prepareNutritionEvidencePackageForReview({
      canonicalObjects: [existing],
      evidencePackage: evidencePackage(),
      reviewId: "review-update",
    });
    prepared.evidence_objects[0].reconciliation.nutrition.disposition = "replace";
    const result = reconcileConfirmedEvidencePackage({ evidencePackage: prepared, existingCanonicalObjects: [...unrelated, existing], userId });

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
      "nutrition|2026-07-12|nutrition-day",
      "nutrition|2026-07-13|nutrition-day",
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

  it("blocks raw persistence of a second active same-date NutritionDay", async () => {
    const first = canonical("legacy-nutrition-a", nutrition());
    const repository = createCanonicalEvidenceRepository([first]);
    const second = canonical("legacy-nutrition-b", nutrition({ id: "other" }));

    await expect(repository.upsertCanonicalEvidenceObjects([second]))
      .rejects.toThrow(/second active canonical NutritionDay/i);
  });

  it("blocks raw persistence of a second active same-date ActivityDay", async () => {
    const activityPayload = {
      id: "activity-a",
      evidence_type: "activity_day",
      observed_at: "2026-07-12",
      daily_activity: { move_calories: 700 },
    };
    const first = canonical("legacy-activity-a", activityPayload);
    const repository = createCanonicalEvidenceRepository([first]);
    const second = canonical("legacy-activity-b", {
      ...activityPayload,
      id: "activity-b",
    });

    await expect(repository.upsertCanonicalEvidenceObjects([second]))
      .rejects.toThrow(/second active canonical ActivityDay/i);
  });

  it("blocks raw persistence of a second active same-date DEXA scan", async () => {
    const payload = validDexa();
    const repository = createCanonicalEvidenceRepository([
      canonical("legacy-dexa-a", payload),
    ]);
    await expect(repository.upsertCanonicalEvidenceObjects([
      canonical("legacy-dexa-b", { ...payload, id: "other-dexa" }),
    ])).rejects.toThrow(/second active canonical DEXA scan/i);
  });

  it("blocks raw persistence of a second active same-date Photo Session", async () => {
    const payload = {
      id: "photo-source-a",
      evidence_type: "photo_session",
      observed_at: "2026-07-12",
      captureDate: "2026-07-12",
      photos: [],
    };
    const repository = createCanonicalEvidenceRepository([
      canonical("legacy-photo-session-a", payload),
    ]);
    await expect(repository.upsertCanonicalEvidenceObjects([
      canonical("legacy-photo-session-b", {
        ...payload,
        id: "photo-source-b",
      }),
    ])).rejects.toThrow(/second active canonical Photo Session/i);
  });

  it("preserves an existing Photo Session lineage for a same-day retry", () => {
    const existing = canonical("opaque-persisted-session", {
      id: "prior-source",
      evidence_type: "photo_session",
      observed_at: "2026-07-12",
      captureDate: "2026-07-12",
      photos: [{ id: "front", view: "front", pose: "relaxed" }],
    });
    const result = reconcileConfirmedEvidencePackage({
      evidencePackage: evidencePackage([{
        id: "retry-source",
        evidence_type: "photo_session",
        observed_at: "2026-07-12",
        photos: [{ id: "front", view: "front", pose: "relaxed" }],
      }]),
      existingCanonicalObjects: [existing],
      userId,
    });
    expect(result.changedObjects).toEqual([
      expect.objectContaining({ canonicalId: "opaque-persisted-session" }),
    ]);
    expect(result.report.addedCanonicalIds).toEqual([]);
  });

  it("attaches Package 3 Goal/Phase attribution to DEXA and Photo evidence", () => {
    const goal = {
      id: "goal-build",
      userId,
      primary: true,
      status: "active",
      phases: [{
        id: "phase-build",
        goalId: "goal-build",
        name: "Build",
        purpose: "Build",
        order: 0,
        status: "active",
        startDate: "2026-07-01",
        startedAt: "2026-07-01",
        plannedReviewAt: "2026-08-01",
        reviewState: "scheduled",
        completionDecisionRequired: true,
        revision: 1,
      }],
    };
    const result = reconcileConfirmedEvidencePackage({
      evidencePackage: evidencePackage([
        validDexa(),
        {
          id: "photo-session-source",
          evidence_type: "photo_session",
          observed_at: "2026-07-12",
          photos: [{ id: "front", view: "front", pose: "relaxed" }],
          provenance: { source_artifact_refs: ["front.jpg"] },
        },
      ]),
      existingCanonicalObjects: [],
      goals: [goal],
      userId,
    });
    expect(result.changedObjects).toHaveLength(2);
    expect(result.changedObjects).toEqual(expect.arrayContaining([
      expect.objectContaining({
        evidence_type: "dexa_scan",
        goalId: "goal-build",
        phaseId: "phase-build",
      }),
      expect.objectContaining({
        evidence_type: "photo_session",
        goalId: "goal-build",
        phaseId: "phase-build",
      }),
    ]));
  });

  it("treats a DEXA reparse as provenance-only and a measurement correction as one semantic revision", () => {
    const first = reconcileConfirmedEvidencePackage({
      evidencePackage: { ...evidencePackage([validDexa()]), package_id: "dexa-package-1" },
      existingCanonicalObjects: [],
      userId,
    });
    const replay = reconcileConfirmedEvidencePackage({
      evidencePackage: {
        ...evidencePackage([validDexa({ id: "reparse", sourceFileId: "reparse.pdf" })]),
        package_id: "dexa-package-2",
      },
      existingCanonicalObjects: first.changedObjects,
      userId,
    });
    expect(replay.changedObjects).toHaveLength(1);
    expect(replay.semanticChangedObjects).toEqual([]);
    expect(replay.changedObjects[0].dexaRevision.revision).toBe(1);

    const correction = reconcileConfirmedEvidencePackage({
      evidencePackage: {
        ...evidencePackage([validDexa({
          totalMass: { value: 171, unit: "lb" },
          bodyFatPercentage: 10.5263157895,
          fatMass: { value: 18, unit: "lb" },
        })]),
        package_id: "dexa-package-3",
      },
      existingCanonicalObjects: replay.changedObjects,
      userId,
    });
    expect(correction.semanticChangedObjects).toHaveLength(1);
    expect(correction.changedObjects[0].dexaRevision.revision).toBe(2);
    expect(correction.changedObjects[0].dexaRevisionHistory).toHaveLength(1);
  });

  it("attaches Package 3 Goal/Phase chronology once and freezes it on correction", () => {
    const goal = {
      id: "goal-build",
      userId,
      primary: true,
      status: "active",
      phases: [{
        id: "phase-build",
        goalId: "goal-build",
        name: "Build",
        purpose: "Build",
        order: 0,
        status: "active",
        startDate: "2026-07-01",
        startedAt: "2026-07-01",
        plannedReviewAt: "2026-08-01",
        reviewState: "scheduled",
        completionDecisionRequired: true,
        revision: 1,
      }],
    };
    const packageValue = evidencePackage([nutrition(), {
      id: "activity-12",
      evidence_type: "activity_day",
      observed_at: "2026-07-12",
      daily_activity: { move_calories: 700 },
      provenance: { source_artifact_refs: ["activity.png"] },
    }]);
    const first = reconcileConfirmedEvidencePackage({
      evidencePackage: packageValue,
      existingCanonicalObjects: [],
      goals: [goal],
      userId,
    });

    expect(first.changedObjects).toHaveLength(2);
    expect(first.changedObjects).toEqual([
      expect.objectContaining({
        goalId: "goal-build",
        phaseId: "phase-build",
      }),
      expect.objectContaining({
        goalId: "goal-build",
        phaseId: "phase-build",
      }),
    ]);

    const activityRecord = first.changedObjects.find(
      (item) => item.evidence_type === "activity_day"
    );
    const correctionPackage = evidencePackage([{
        ...activityRecord.payload,
        id: "activity-correction",
        source: { modality: "correction" },
        daily_activity: { move_calories: 725 },
      }]);
    const correction = reconcileConfirmedEvidencePackage({
      evidencePackage: prepareActivityEvidencePackageForReview({
        canonicalObjects: first.changedObjects,
        evidencePackage: correctionPackage,
        reviewId: "activity-correction-review",
      }),
      existingCanonicalObjects: first.changedObjects,
      goals: [{ ...goal, id: "goal-new", phases: [] }],
      userId,
    });
    expect(correction.changedObjects[0]).toMatchObject({
      goalId: "goal-build",
      phaseId: "phase-build",
      goalPhaseAttribution: { source: "legacy_effective_date_fallback" },
    });
  });

  it("exposes broad reconciliation only as an explicit maintenance command with a report", async () => {
    const records = historical();
    const repository = createCanonicalEvidenceRepository(records, {
      evidencePackages: [evidencePackage()],
      onChange: vi.fn(),
    });

    const result = await repository.reconcileCanonicalHistory(userId);

    expect(result.report.mutationReason).toBe("explicit_canonical_history_maintenance");
    expect(result.report.addedCanonicalIds).toContain("nutrition|2026-07-12|nutrition-day");
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
      "nutrition|2026-07-12|nutrition-day",
      prior.canonicalId,
    ]));
    expect(result.scope.supersededCanonicalIdentities).toEqual([prior.canonicalId]);
    expect(result.changedObjects.find((item) => item.canonicalId === prior.canonicalId)?.quality).toEqual(expect.objectContaining({ status: "superseded", supersededBy: "nutrition|2026-07-12|nutrition-day" }));
    expect(JSON.stringify(unrelated)).toBe(JSON.stringify(historical()));
  });
});

function validDexa(overrides = {}) {
  return {
    id: "dexa-source",
    userId,
    evidence_type: "dexa_scan",
    measuredAt: "2026-07-12",
    observed_at: "2026-07-12",
    totalMass: { value: 170, unit: "lb" },
    bodyFatPercentage: 10,
    fatMass: { value: 17, unit: "lb" },
    leanMass: { value: 146, unit: "lb" },
    boneMineralContent: { value: 7, unit: "lb" },
    restingMetabolicRate: { value: 1800, unit: "kcal/day" },
    sourceFileId: "scan.pdf",
    provenance: {
      extraction_engine: "pdfjs-dist",
      fixture: false,
      source_artifact_refs: ["scan.pdf"],
    },
    ...overrides,
  };
}

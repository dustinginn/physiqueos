import { describe, expect, it, vi } from "vitest";
import {
  attachBriefingDependencyManifest,
  compareBriefingDependencyManifests,
  createBriefingDependencyManifest,
  createCanonicalEvidenceSemanticDescriptor,
} from "./BriefingDependencyManifestService";
import {
  isWithinFollowingDayLatenessPolicy,
  planAffectedBriefingPublications,
} from "./BriefingAffectedPublicationPlannerService";
import {
  BriefingReconciliationState,
  enqueueBriefingReconciliationWorkItems,
} from "./BriefingReconciliationWorkItemService";
import { createBriefingRevisionExecutionService } from
  "./BriefingRevisionExecutionService";
import { createMonthlyBriefingService } from "./MonthlyBriefingService";
import { createDailyBriefingRepository } from
  "../../data/repositories/DailyBriefingRepository";

const zone = "America/Los_Angeles";
const publishedAt = "2026-08-09T16:37:09.852Z";
const confirmedAt = "2026-08-09T22:08:15.055Z";

describe("late-evidence briefing revision engine", () => {
  it("detects same-ID Nutrition semantic revision inside Aug 2-8 Weekly", () => {
    const oldNutrition = nutrition("fingerprint-a", 1, "2026-08-09T02:44:53Z");
    const publication = attachBriefingDependencyManifest(
      cadencePublication("weekly", "2026-08-02", "2026-08-08"),
      [oldNutrition]
    );
    const changed = nutrition("fingerprint-b", 2, confirmedAt);
    const [plan] = planAffectedBriefingPublications({
      publications: [publication], evidenceChanges: [changed], confirmedAt,
    });

    expect(plan).toMatchObject({
      publicationRootId: "weekly_briefing_2026-08-02_2026-08-08",
      cadence: "weekly",
      reason: "late_evidence_reconciliation",
      driftReason: "semantic_dependency_drift",
      eligible: true,
    });
    expect(plan.affectedDependencies[0]).toMatchObject({
      canonicalObjectId: "nutrition-day",
      logicalIdentity: "nutrition|2026-08-08",
      semanticRevision: 2,
      semanticDigest: "fingerprint-b",
    });
  });

  it("makes manifest order deterministic and ignores unrelated metadata", () => {
    const nutritionA = nutrition("fingerprint-a", 1, "2026-08-09T02:44:53Z");
    const training = trainingEvidence("training-1", "2026-08-08", confirmedAt);
    const publication = cadencePublication("weekly", "2026-08-02", "2026-08-08");
    const first = createBriefingDependencyManifest({
      publication, evidenceInputs: [nutritionA, training],
    });
    const second = createBriefingDependencyManifest({
      publication,
      evidenceInputs: [{ ...training, metadata: { unrelated: "changed" } },
        { ...nutritionA, operationalNote: "ignored by revision fingerprint" }],
    });

    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.canonicalDependencies).toEqual(second.canonicalDependencies);
    const changed = createBriefingDependencyManifest({
      publication, evidenceInputs: [nutrition("fingerprint-b", 2, confirmedAt), training],
    });
    expect(compareBriefingDependencyManifests(first, changed)).toMatchObject({
      stale: true,
      reason: "semantic_dependency_drift",
    });
  });

  it("includes a Training occurrence Variant in the semantic dependency digest", () => {
    const publication = cadencePublication("weekly", "2026-08-02", "2026-08-08");
    const variantTraining = trainingEvidence("training-1", "2026-08-08", confirmedAt);
    const ordinaryTraining = structuredClone(variantTraining);
    delete ordinaryTraining.payload.exercises[0].executionVariant;

    const variantManifest = createBriefingDependencyManifest({
      publication,
      evidenceInputs: [variantTraining],
    });
    const ordinaryManifest = createBriefingDependencyManifest({
      publication,
      evidenceInputs: [ordinaryTraining],
    });

    expect(variantManifest.fingerprint).not.toBe(ordinaryManifest.fingerprint);
  });

  it("treats newly present Nutrition as drift for a publication created without it", () => {
    const publication = attachBriefingDependencyManifest(
      cadencePublication("weekly", "2026-08-02", "2026-08-08"),
      []
    );
    expect(planAffectedBriefingPublications({
      publications: [publication],
      evidenceChanges: [nutrition("fingerprint-a", 1, confirmedAt)],
      confirmedAt,
    })).toHaveLength(1);
  });

  it.each([
    ["training", trainingEvidence("training-1", "2026-08-08", confirmedAt)],
    ["activity", activityEvidence("activity-1", "2026-08-08", confirmedAt)],
  ])("plans following-day %s evidence inside the Weekly window", (_type, evidence) => {
    const publication = attachBriefingDependencyManifest(
      cadencePublication("weekly", "2026-08-02", "2026-08-08"), []);
    expect(planAffectedBriefingPublications({
      publications: [publication], evidenceChanges: [evidence], confirmedAt,
    })).toHaveLength(1);
  });

  it("coalesces Nutrition, Training, and Activity into one occurrence work item", () => {
    const publication = attachBriefingDependencyManifest(
      cadencePublication("weekly", "2026-08-02", "2026-08-08"), []);
    const changes = [
      nutrition("fingerprint-b", 2, confirmedAt),
      trainingEvidence("training-1", "2026-08-08", confirmedAt),
      activityEvidence("activity-1", "2026-08-08", confirmedAt),
    ];
    const plans = changes.flatMap((change) => planAffectedBriefingPublications({
      publications: [publication], evidenceChanges: [change], confirmedAt,
    }));
    const items = enqueueBriefingReconciliationWorkItems({ plans, enqueuedAt: confirmedAt });

    expect(items).toHaveLength(1);
    expect(items[0].status).toBe(BriefingReconciliationState.REVISION_PENDING);
    expect(items[0].affectedDependencies).toHaveLength(3);
  });

  it("rejects out-of-window and outside-grace automatic changes", () => {
    const publication = attachBriefingDependencyManifest(
      cadencePublication("weekly", "2026-08-02", "2026-08-08"), []);
    expect(planAffectedBriefingPublications({
      publications: [publication],
      evidenceChanges: [trainingEvidence("before", "2026-08-01", confirmedAt)],
      confirmedAt,
    })).toEqual([]);
    expect(planAffectedBriefingPublications({
      publications: [publication],
      evidenceChanges: [nutrition("late", 2, "2026-08-10T22:00:00Z")],
      confirmedAt: "2026-08-10T22:00:00Z",
    })).toEqual([]);
    expect(planAffectedBriefingPublications({
      publications: [publication],
      evidenceChanges: [nutrition("late", 2, "2026-08-10T22:00:00Z")],
      confirmedAt: "2026-08-10T22:00:00Z",
      automatic: false,
    })).toHaveLength(1);
    expect(isWithinFollowingDayLatenessPolicy({
      evidenceDate: "2026-08-08", confirmedAt, timeZone: zone,
    })).toBe(true);
  });

  it.each([
    ["midweek", "2026-08-02", "2026-08-04", "2026-08-04",
      "2026-08-05T18:00:00Z"],
    ["monthly", "2026-07-01", "2026-07-31", "2026-07-31",
      "2026-08-01T18:00:00Z"],
  ])("plans %s from its actual closed evidence window", (
    cadence, start, end, evidenceDate, changedAt
  ) => {
    const publication = attachBriefingDependencyManifest(
      cadencePublication(cadence, start, end, {
        generatedAt: new Date(Date.parse(changedAt) - 60_000).toISOString(),
      }), []);
    const evidence = trainingEvidence(`${cadence}-training`, evidenceDate, changedAt);
    expect(planAffectedBriefingPublications({
      publications: [publication], evidenceChanges: [evidence], confirmedAt: changedAt,
    })).toEqual([expect.objectContaining({ cadence, eligible: true })]);
  });

  it("keeps event eligibility narrow to correction of the primary trigger", () => {
    const photo = eventPublication("photo_session", "photo-1");
    const dexa = eventPublication("dexa", "dexa-1");
    const nutritionChange = nutrition("b", 2, confirmedAt);
    expect(planAffectedBriefingPublications({
      publications: [photo, dexa], evidenceChanges: [nutritionChange], confirmedAt,
    })).toEqual([]);
    const photoCorrection = photoEvidence("photo-1", "2026-08-08", confirmedAt);
    expect(planAffectedBriefingPublications({
      publications: [photo, dexa], evidenceChanges: [photoCorrection], confirmedAt,
    })).toEqual([expect.objectContaining({
      publicationRootId: photo.id,
      reason: "primary_event_semantic_revision",
    })]);
    const dexaCorrection = dexaEvidence("dexa-1", "2026-08-08", confirmedAt);
    expect(planAffectedBriefingPublications({
      publications: [photo, dexa], evidenceChanges: [dexaCorrection], confirmedAt,
    })).toEqual([expect.objectContaining({ publicationRootId: dexa.id })]);
  });

  it("transitions a legacy publication once without requiring historical backfill", () => {
    const legacy = cadencePublication("weekly", "2026-08-02", "2026-08-08");
    const [plan] = planAffectedBriefingPublications({
      publications: [legacy],
      evidenceChanges: [nutrition("fingerprint-b", 2, confirmedAt)],
      confirmedAt,
    });
    expect(plan.driftReason).toBe("legacy_manifest_missing");
  });

  it("keeps one stable publication root and records the explicit replacement reason", async () => {
    const first = cadencePublication("weekly", "2026-08-02", "2026-08-08");
    const second = { ...structuredClone(first), generatedAt: confirmedAt,
      briefing: { version: "fixture-v2" } };
    const records = [first];
    await createDailyBriefingRepository(records).createDailyBriefing(second, {
      replacementReason: "late_evidence_reconciliation",
    });

    expect(records).toHaveLength(1);
    expect(records[0].id).toBe(first.id);
    expect(records[0].replacedBriefingHistory).toEqual([
      expect.objectContaining({
        reason: "late_evidence_reconciliation",
        artifact: expect.objectContaining({ id: first.id }),
      }),
    ]);
  });

  it("executes one stable-root revision and preserves prior history through the cadence service", async () => {
    const current = cadencePublication("weekly", "2026-08-02", "2026-08-08");
    const revised = {
      ...attachBriefingDependencyManifest(current, [nutrition("b", 2, confirmedAt)]),
      replacedBriefingHistory: [{ artifact: structuredClone(current) }],
    };
    const service = {
      prepareRegeneration: vi.fn(async () => ({ status: "prepared" })),
      executePreparedRegeneration: vi.fn(async () => ({
        status: "regenerated", committed: true, artifact: revised,
      })),
    };
    const workItem = enqueueBriefingReconciliationWorkItems({
      plans: [eligiblePlan(current)], enqueuedAt: confirmedAt,
    })[0];
    const result = await createBriefingRevisionExecutionService({
      cadenceServices: { weekly: service },
      getCurrentPublication: async () => current,
      validateEligibility: async () => ({ eligible: true }),
      now: sequenceClock(confirmedAt),
    }).execute({ workItem, userId: "u" });

    expect(result.status).toBe("completed");
    expect(result.artifact.id).toBe(current.id);
    expect(result.artifact.replacedBriefingHistory).toHaveLength(1);
    expect(service.prepareRegeneration).toHaveBeenCalledWith(expect.objectContaining({
      reason: "late_evidence_reconciliation",
      targetArtifactId: current.id,
    }));
  });

  it("keeps the current publication intact and leaves failed work retryable", async () => {
    const current = cadencePublication("weekly", "2026-08-02", "2026-08-08");
    const workItem = enqueueBriefingReconciliationWorkItems({
      plans: [eligiblePlan(current)], enqueuedAt: confirmedAt,
    })[0];
    const service = {
      regenerate: vi.fn(async () => { throw new Error("composition failed"); }),
    };
    const result = await createBriefingRevisionExecutionService({
      cadenceServices: { weekly: service },
      getCurrentPublication: async () => current,
      validateEligibility: async () => ({ eligible: true }),
      now: sequenceClock(confirmedAt),
    }).execute({ workItem, userId: "u" });

    expect(result).toMatchObject({ status: "failed", committed: false });
    expect(result.workItem.status).toBe(BriefingReconciliationState.FAILED);
    expect(result.workItem.failure.retryable).toBe(true);
    expect(current.replacedBriefingHistory).toBeUndefined();
  });

  it("gives Monthly an exact-target regeneration entry point with stable root history", async () => {
    const existing = cadencePublication(
      "monthly", "2026-07-01", "2026-07-31",
      { generatedAt: "2026-08-01T07:01:00Z" }
    );
    existing.evidenceWindow = {
      ...existing.evidenceWindow,
      briefingMonth: "2026-07",
      deliveryDate: "2026-08-01",
      cutoff: "2026-08-01T06:59:59.999Z",
    };
    existing.briefing.monthlyPresentation = { hero: {} };
    const rebuilt = attachBriefingDependencyManifest({
      ...structuredClone(existing), generatedAt: "2026-08-01T18:00:00Z",
    }, [trainingEvidence("late-training", "2026-07-31", "2026-08-01T18:00:00Z")]);
    const occurrencePreparer = vi.fn(async () => ({
      artifact: rebuilt,
      existing,
    }));
    const occurrencePublisher = vi.fn(async ({ prepared, reason }) => ({
      state: "completed",
      idempotent: false,
      artifact: {
        ...prepared.artifact,
        replacedBriefingHistory: [{ artifact: structuredClone(existing), reason }],
      },
    }));
    const service = createMonthlyBriefingService({
      repositories: {
        users: { getUserById: async () => ({ id: "u", timeZone: zone }) },
        dailyBriefings: { listDailyBriefings: async () => [existing] },
      },
      publicationService: {},
      occurrencePreparer,
      occurrencePublisher,
      now: () => new Date("2026-08-01T18:00:00Z"),
    });
    const prepared = await service.prepareRegeneration({
      userId: "u",
      reason: "late_evidence_reconciliation",
      targetArtifactId: existing.id,
    });
    const result = await service.executePreparedRegeneration({ prepared });

    expect(result).toMatchObject({
      status: "regenerated",
      committed: true,
      artifact: { id: existing.id },
    });
    expect(result.artifact.replacedBriefingHistory).toHaveLength(1);
    expect(occurrencePreparer).toHaveBeenCalledWith(expect.objectContaining({
      artifactId: existing.id,
      existing,
      window: existing.evidenceWindow,
    }));
    expect(occurrencePublisher).toHaveBeenCalledWith(expect.objectContaining({
      operation: "regenerate",
      reason: "late_evidence_reconciliation",
    }));
  });
});

function nutrition(fingerprint, revision, changedAt) {
  return {
    canonicalId: "nutrition-day",
    evidence_type: "nutrition",
    lastObservedAt: "2026-08-08",
    updatedAt: changedAt,
    nutritionRevision: {
      logicalDayKey: "nutrition|2026-08-08",
      revision,
      semanticFingerprint: fingerprint,
      replacedAt: changedAt,
    },
    payload: {
      id: "nutrition-day",
      evidence_type: "nutrition",
      observed_at: "2026-08-08",
      daily_totals: { calories: revision === 1 ? 2835 : 3135 },
      meals: [],
    },
  };
}

function trainingEvidence(id, date, changedAt) {
  return {
    canonicalId: id, evidence_type: "training", lastObservedAt: date,
    updatedAt: changedAt,
    payload: {
      id, evidence_type: "training", observed_at: date,
      metadata: { activity_type: "resistance", uploadNote: "ignored" },
      exercises: [{ id: "squat", executionVariant: {
        key: "static_hold", label: "Static Hold", rawLabel: "Static Hold",
      },
        sets: [{ reps: 5, weight: 225 }] }],
    },
  };
}

function activityEvidence(id, date, changedAt) {
  return {
    canonicalId: id, evidence_type: "activity_day", lastObservedAt: date,
    updatedAt: changedAt,
    payload: { id, evidence_type: "activity_day", observed_at: date,
      daily_activity: { move_calories: 700 } },
  };
}

function photoEvidence(id, date, changedAt) {
  return {
    canonicalId: id, evidence_type: "photo_session", lastObservedAt: date,
    updatedAt: changedAt,
    payload: { id, evidence_type: "photo_session", observed_at: date,
      photos: [{ id: "front", poseId: "front-relaxed" }] },
  };
}

function dexaEvidence(id, date, changedAt) {
  return {
    canonicalId: id, evidence_type: "dexa_scan", lastObservedAt: date,
    updatedAt: changedAt,
    payload: { id, evidence_type: "dexa_scan", observed_at: date,
      bodyFatPercentage: { value: 8.1 }, leanMass: { value: 140 } },
  };
}

function cadencePublication(cadence, startDate, endDate, overrides = {}) {
  const id = `${cadence}_briefing_${startDate}_${endDate}`;
  return {
    id, userId: "u", artifactType: "scheduled", cadence,
    generatedAt: overrides.generatedAt ?? publishedAt,
    evidenceWindow: {
      id: `${cadence}:${startDate}:${endDate}:${zone}`,
      cadence, startDate, endDate, date: endDate, timeZone: zone, closed: true,
    },
    briefing: { version: "fixture" },
  };
}

function eventPublication(evidenceType, evidenceId) {
  return {
    id: `${evidenceType}_event_${evidenceId}`,
    userId: "u", artifactType: "event", cadence: "event",
    generatedAt: publishedAt,
    trigger: { evidenceType, evidenceId },
    briefing: { version: "fixture" },
  };
}

function eligiblePlan(publication) {
  return {
    eligible: true,
    publicationRootId: publication.id,
    occurrenceIdentity: publication.evidenceWindow.id,
    cadence: publication.cadence,
    reason: "late_evidence_reconciliation",
    affectedDependencies: [
      createCanonicalEvidenceSemanticDescriptor(nutrition("b", 2, confirmedAt)),
    ],
  };
}

function sequenceClock(value) {
  let offset = 0;
  return () => new Date(Date.parse(value) + offset++ * 1000);
}

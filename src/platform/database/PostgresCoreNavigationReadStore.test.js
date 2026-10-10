import { describe, expect, it, vi } from "vitest";
import { createPostgresCoreNavigationReadStore } from "./PostgresCoreNavigationReadStore.js";
import { CORE_NAVIGATION_COLLECTIONS } from "../../application/core/CoreNavigationReadService.js";
import {
  HEALTHKIT_GRADUATION_POLICY_RECORD_ID,
  HEALTHKIT_GRADUATION_POLICY_SCHEMA_VERSION,
} from "../../domain/services/HealthKitGraduation.js";

describe("PostgreSQL core navigation read store", () => {
  it("accepts the actual Logger collection set including persisted My Library membership", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const store = createPostgresCoreNavigationReadStore({ pool: { query }, ownerUserId: "owner-one" });
    const result = await store.run("core.navigation.training-logger", ({ readCollections }) =>
      readCollections(CORE_NAVIGATION_COLLECTIONS.trainingLogger));
    expect(result.myLibraryMemberships).toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain("physiqueos.canonical_training_records");
    expect(query.mock.calls[0][1].flat()).toContain("myLibraryMemberships");
  });
  it("loads a screen's collections in one bounded query with zero compatibility loads", async () => {
    const query = vi.fn(async () => ({
      rows: [
        { collection_name: "goals", source_ordinal: 0, record_id: "goal-1", payload: { id: "goal-1" } },
        { collection_name: "user", source_ordinal: 0, record_id: "owner-one", payload: { id: "owner-one" } },
      ],
    }));
    const complete = vi.fn();
    const store = createPostgresCoreNavigationReadStore({
      pool: { query, totalCount: 1, idleCount: 1, waitingCount: 0 },
      ownerUserId: "owner-one",
      onComplete: complete,
    });

    const result = await store.run("core.navigation.goals", ({ readCollections }) =>
      readCollections(["user", "goals", "analyses"]));

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain("UNION ALL");
    expect(query.mock.calls[0][0]).toContain("ORDER BY collection_name,source_ordinal,record_id");
    expect(query.mock.calls[0][0]).toContain("jsonb_strip_nulls");
    expect(query.mock.calls[0][0]).toContain("jsonb_array_elements");
    expect(query.mock.calls[0][0]).toContain("'supportsGoal',observation->'supportsGoal'");
    expect(query.mock.calls[0][0]).toContain("publication_rank<=2");
    expect(query.mock.calls[0][0]).toContain("collection_name='goalConfidenceSnapshots'");
    expect(query.mock.calls[0][0]).toContain("canonical_confidence_assessment_v3");
    expect(query.mock.calls[0][0]).toContain("'strategicInterpretation','coachingState','confidenceProjection'");
    expect(query.mock.calls[0][0]).toContain("='training'");
    expect(query.mock.calls[0][1][0]).toBe("owner-one");
    expect(query.mock.calls[0][1].flat()).toEqual(expect.arrayContaining([
      "owner-one", "user", "goals", "analyses",
    ]));
    expect(result).toEqual({
      user: [{ id: "owner-one" }],
      goals: [{ id: "goal-1" }],
      analyses: [],
    });
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({
      readModel: "core.navigation.goals",
      queryCount: 1,
      rowCount: 2,
      collections: expect.arrayContaining([
        { collection: "goals", rows: 1, payloadBytes: expect.any(Number) },
        { collection: "user", rows: 1, payloadBytes: expect.any(Number) },
      ]),
      compatibilityRuntimeLoadCount: 0,
      pool: { totalCount: 1, idleCount: 1, waitingCount: 0 },
    }));
  });

  it("bounds Log to actionable processing reviews and user-visible evidence domains", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const store = createPostgresCoreNavigationReadStore({ pool: { query }, ownerUserId: "owner-one" });

    await store.run("core.navigation.log", ({ readCollections }) =>
      readCollections(["user", "evidenceReviews", "canonicalEvidenceObjects"]));

    const sql = query.mock.calls[0][0];
    expect(sql).toContain("ARRAY['nutrition','activity_day','training']");
    expect(sql).toContain("ARRAY['pending','committing','commit_failed','partially_committed']");
    expect(sql).toContain("collection_name<>'evidenceReviews'");
  });

  it.each([
    ["core.navigation.home", ["user", "dailyBriefings", "analyses", "canonicalEvidenceObjects"]],
    ["core.navigation.log", ["user", "evidenceReviews", "canonicalEvidenceObjects"]],
    ["core.navigation.goals", ["user", "goals", "dailyBriefings", "analyses"]],
    ["core.navigation.operating-plan", ["user", "goals", "canonicalEvidenceObjects"]],
    ["core.navigation.training-logger", ["user", "goals", "canonicalEvidenceObjects"]],
    ["core.navigation.morning-check-in", ["user", "weightEntries", "reminders", "dailyCheckIns"]],
    ["core.navigation.profile", ["user", "goals", "protocols", "reminders"]],
    ["core.navigation.tracking", ["user", "executionItems", "protocols", "reminders"]],
  ])("keeps %s to one provider query", async (readModel, collections) => {
    const query = vi.fn(async () => ({ rows: [] }));
    const complete = vi.fn();
    const store = createPostgresCoreNavigationReadStore({
      pool: { query, totalCount: 1, idleCount: 1, waitingCount: 0 },
      ownerUserId: "owner-one",
      onComplete: complete,
    });

    await store.run(readModel, ({ readCollections }) => readCollections(collections));

    expect(query).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({
      readModel,
      queryCount: 1,
      compatibilityRuntimeLoadCount: 0,
    }));
  });

  it("projects owner-scoped HealthKit days into Morning Check-In recovery evidence", async () => {
    const date = "2026-10-08";
    const policy = {
      id: HEALTHKIT_GRADUATION_POLICY_RECORD_ID,
      schemaVersion: HEALTHKIT_GRADUATION_POLICY_SCHEMA_VERSION,
      projection: {
        enabled: true,
        domains: ["activity", "nutrition"],
        startLocalDate: "2026-09-21",
        endLocalDate: null,
      },
      evidenceEligibility: { enabled: false },
      historicalBriefingRegeneration: false,
    };
    const activity = {
      id: `healthkit_canonical_day_activity_${date}`,
      userId: "owner-one",
      domain: "activity",
      localDate: date,
      revision: 3,
      semanticFingerprint: "sha256-activity",
      createdAt: `${date}T07:05:00.000Z`,
      updatedAt: `${date}T07:10:00.000Z`,
      current: {
        coverage: "partial_day",
        sourceRevision: 3,
        deliveryDeviceId: "founder-phone",
        basis: "automatic_background_delivery",
        values: { dailyActivity: { move_calories: 610 } },
      },
      provenance: { sourceObservationIds: ["observation-activity"] },
    };
    const nutrition = {
      ...activity,
      id: `healthkit_canonical_day_nutrition_${date}`,
      domain: "nutrition",
      semanticFingerprint: "sha256-nutrition",
      current: {
        ...activity.current,
        values: {
          dailyTotals: { calories: 2100, protein_g: 190 },
          dailyTotalsScope: "partial_day_summary",
          mealObjects: 0,
        },
      },
    };
    const query = vi.fn(async (_sql, values) => {
      if (values?.[1] === "healthKitCanonicalDays") {
        return { rows: [
          { payload: activity, version: activity.revision },
          { payload: nutrition, version: nutrition.revision },
        ] };
      }
      return { rows: [{
        collection_name: "healthKitConfiguration",
        source_ordinal: 0,
        record_id: policy.id,
        payload: policy,
      }] };
    });
    const store = createPostgresCoreNavigationReadStore({
      pool: { query },
      ownerUserId: "owner-one",
    });

    const result = await store.run(
      "core.navigation.morning-check-in",
      ({ readCollections }) => readCollections(["canonicalEvidenceObjects"])
    );

    expect(result).not.toHaveProperty("healthKitConfiguration");
    expect(result.canonicalEvidenceObjects).toHaveLength(2);
    expect(result.canonicalEvidenceObjects.map((item) => [
      item.userId,
      item.payload.evidence_type,
      item.payload.observed_at,
      item.payload.metadata.coverage,
    ])).toEqual([
      ["owner-one", "activity_day", date, "partial_day"],
      ["owner-one", "nutrition", date, "partial_day"],
    ]);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][1]).toEqual(["owner-one", "healthKitCanonicalDays"]);
  });

  it("rejects unknown collections before querying", async () => {
    const query = vi.fn();
    const store = createPostgresCoreNavigationReadStore({
      pool: { query },
      ownerUserId: "owner-one",
    });
    await expect(store.run("invalid", ({ readCollections }) =>
      readCollections(["not-a-canonical-collection"])))
      .rejects.toThrow("Unsupported core navigation collection");
    expect(query).not.toHaveBeenCalled();
  });

  it("reads Coaching Updates collections and revision from the same statement snapshot", async () => {
    const query = vi.fn(async () => ({ rows: [{
      collection_name: "user", source_ordinal: 0, record_id: "owner-one", payload: { id: "owner-one" },
      runtime_metadata: { revision: 85, lastCommitId: "prior", updatedAt: "2026-09-15T00:00:00Z" },
    }] }));
    const store = createPostgresCoreNavigationReadStore({ pool: { query }, ownerUserId: "owner-one" });
    const metadata = await store.run("core.navigation.coaching-updates-detail", async ({ readCollections, readRuntimeMetadata }) => {
      await readCollections(["user", "protocols", "protocolVersions", "executionItems", "reminders"]);
      return readRuntimeMetadata();
    });
    expect(metadata.revision).toBe(85);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain("canonical_runtime_metadata WHERE owner_user_id=$1");
    expect(query.mock.calls[0][0]).toContain("ORDER BY collection_name,source_ordinal,record_id");
  });
});

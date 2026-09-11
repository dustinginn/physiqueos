import { describe, expect, it, vi } from "vitest";
import { createPostgresActiveGoalReadStore } from "./PostgresActiveGoalReadStore.js";
import { createPostgresPhotoEventReadStore } from "./PostgresPhotoEventReadStore.js";
import { createPostgresProgressEvidenceReadStore } from "./PostgresProgressEvidenceReadStore.js";
import { createPostgresProgressHubReadStore } from "./PostgresProgressHubReadStore.js";
import { createPostgresProgressPhotosReadStore } from "./PostgresProgressPhotosReadStore.js";

describe("optimized Postgres Weight read consistency", () => {
  it("selects the same corrected user-day history in every Weight-consuming read store", async () => {
    const query = queryFixture();
    const pool = { query, totalCount: 1, idleCount: 1, waitingCount: 0 };
    const options = { pool, ownerUserId: "owner" };
    const progressHub = createPostgresProgressHubReadStore(options);
    const progressEvidence = createPostgresProgressEvidenceReadStore(options);
    const progressPhotos = createPostgresProgressPhotosReadStore(options);

    const [hubWeights, evidenceWeights, photoWeights] = await Promise.all([
      progressHub.listWeightEntries(),
      progressEvidence.listWeightEntries(),
      progressPhotos.listWeightEntries(),
    ]);
    const activeGoal = await createPostgresActiveGoalReadStore(options).load();
    const photoEvent = await createPostgresPhotoEventReadStore(options).loadInputs({
      userId: "owner",
      sessionId: "photo_session_2026-08-31",
    });

    for (const weights of [
      hubWeights,
      evidenceWeights,
      photoWeights,
      activeGoal.store.weightEntries,
      photoEvent.weights,
    ]) {
      expect(weights).toEqual([
        expect.objectContaining({ id: "weight_other_day", measuredAt: "2026-08-30" }),
        expect.objectContaining({
          id: "weight_corrected",
          measuredAt: "2026-08-31",
          weight: { value: 169.1, unit: "lb" },
        }),
      ]);
    }
  });
});

function queryFixture() {
  const rows = [
    row(weightEntry("weight_old", "2026-08-31", 168.4, "2026-09-01T14:00:00.000Z")),
    row(weightEntry("weight_corrected", "2026-08-31", 169.1, "2026-09-01T15:00:00.000Z")),
    row(weightEntry("weight_other_day", "2026-08-30", 169.5, "2026-08-31T15:00:00.000Z")),
  ];
  return vi.fn(async (sql, values = []) => {
    if (sql.includes("canonical_evidence_records") && sql.includes("LIMIT 1")) {
      return { rows: [{
        payload: {
          canonicalId: "photo_session_2026-08-31",
          evidence_type: "photo_session",
          lastObservedAt: "2026-08-31",
          payload: { sessionId: "photo_session_2026-08-31", evidence_type: "photo_session", observed_at: "2026-08-31" },
        },
        version: 1,
      }], rowCount: 1 };
    }
    if (sql.includes("canonical_checkin_records") &&
        (values[1] === "weightEntries" || sql.includes("collection_name='weightEntries'"))) {
      return { rows, rowCount: rows.length };
    }
    return { rows: [], rowCount: 0 };
  });
}

function row(payload) {
  return { payload, version: 1 };
}

function weightEntry(id, measuredAt, value, updatedAt) {
  return {
    id,
    userId: "owner",
    measuredAt,
    weight: { value, unit: "lb" },
    createdAt: updatedAt,
    updatedAt,
  };
}

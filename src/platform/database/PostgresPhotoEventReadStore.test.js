import { describe, expect, it, vi } from "vitest";
import { createPostgresPhotoEventReadStore } from "./PostgresPhotoEventReadStore";

describe("PostgresPhotoEventReadStore", () => {
  it("loads a bounded event composition without a compatibility runtime", async () => {
    const diagnostics = vi.fn();
    const pool = fakePool();
    const store = createPostgresPhotoEventReadStore({
      pool,
      ownerUserId: "user_founder_001",
      onComplete: diagnostics,
    });

    const result = await store.loadInputs({
      userId: "user_founder_001",
      sessionId: "photo_session_user_founder_001_2026-08-22",
    });

    expect(pool.query).toHaveBeenCalledTimes(7);
    expect(result.canonicalObjects.map((item) => item.id)).toEqual([
      "photo-session", "training-support",
    ]);
    expect(result.goal?.id).toBe("active-goal");
    expect(result.artifacts).toEqual([]);
    expect(result.publicationStore).toMatchObject({
      revision: 29,
      lastCommitId: "prior-command",
    });
    expect(diagnostics).toHaveBeenCalledWith(expect.objectContaining({
      readModel: "photo-event",
      queryCount: 7,
      compatibilityRuntimeLoadCount: 0,
      pool: { totalCount: 2, idleCount: 2, waitingCount: 0 },
    }));
    const evidenceQuery = pool.query.mock.calls.find(([sql]) =>
      sql.includes("canonical_evidence_records"));
    expect(evidenceQuery[1]).toEqual([
      "user_founder_001", "2026-08-16", "2026-08-22",
    ]);
  });

  it("fails closed before querying for another owner", async () => {
    const pool = fakePool();
    const store = createPostgresPhotoEventReadStore({
      pool, ownerUserId: "user_founder_001",
    });
    await expect(store.loadInputs({
      userId: "another-user",
      sessionId: "photo_session_another-user_2026-08-22",
    })).rejects.toMatchObject({ code: "PHOTO_EVENT_OWNER_MISMATCH" });
    expect(pool.query).not.toHaveBeenCalled();
  });
});

function fakePool() {
  const query = vi.fn(async (sql) => {
    if (sql.includes("canonical_evidence_records")) return { rows: [
      row("canonicalEvidenceObjects", "photo-session", {
        id: "photo-session", evidence_type: "photo_session",
      }),
      row("canonicalEvidenceObjects", "training-support", {
        id: "training-support", evidence_type: "training",
      }),
      row("dexaScans", "dexa", { id: "dexa" }),
    ] };
    if (sql.includes("canonical_checkin_records")) return { rows: [
      { payload: { id: "weight" }, version: 1 },
    ] };
    if (sql.includes("canonical_goal_records")) return { rows: [
      row("goals", "active-goal", {
        id: "active-goal", userId: "user_founder_001", primary: true,
      }),
    ] };
    if (sql.includes("canonical_execution_records")) return { rows: [] };
    if (sql.includes("canonical_confidence_records")) return { rows: [
      row("goalConfidenceSnapshots", "snapshot", { id: "snapshot" }),
      row("goalConfidenceHistory", "history", { id: "history" }),
    ] };
    if (sql.includes("canonical_briefing_records")) return { rows: [] };
    if (sql.includes("canonical_runtime_metadata")) return { rows: [{
      runtime_version: "founder-seed-v2", revision: 29,
      last_command_id: "prior-command",
      updated_at: new Date("2026-08-30T00:00:00.000Z"),
      imported_at: new Date("2026-08-28T00:00:00.000Z"),
    }] };
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  return { query, totalCount: 2, idleCount: 2, waitingCount: 0 };
}

function row(collection_name, record_id, payload) {
  return { collection_name, record_id, payload, version: 1 };
}

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
      sessionId: "opaque-session-id",
    });

    // Ten reads plus the single graduation-policy lookup.
    expect(pool.query).toHaveBeenCalledTimes(11);
    expect(result.canonicalObjects.map((item) => item.id)).toEqual([
      "photo-session", "training-support",
    ]);
    expect(result.goal?.id).toBe("active-goal");
    expect(result.artifacts).toEqual([]);
    expect(result.publicationStore).toMatchObject({
      revision: 29,
      lastCommitId: "prior-command",
    });
    // Additional V3 evidence is read-only and never a writable collection.
    expect(result.publicationStore.v3ReadOnlyEvidence.protocols.map((item) => item.id))
      .toEqual(["energy-protocol"]);
    expect(Array.isArray(result.publicationStore.v3ReadOnlyEvidence.weightEntries)).toBe(true);
    expect(Object.keys(result.publicationStore)).not.toContain("weightEntries");
    expect(Object.keys(result.publicationStore)).not.toContain("protocols");
    expect(diagnostics).toHaveBeenCalledWith(expect.objectContaining({
      readModel: "photo-event",
      queryCount: 11,
      compatibilityRuntimeLoadCount: 0,
      pool: { totalCount: 2, idleCount: 2, waitingCount: 0 },
    }));
    const evidenceQuery = pool.query.mock.calls.find(([sql]) =>
      sql.includes("canonical_evidence_records") && sql.includes("occurrence_date BETWEEN"));
    expect(evidenceQuery[1]).toEqual([
      "user_founder_001", "2026-08-16", "2026-08-22",
    ]);
  });

  it("hands the Goal Contract V3 adapter the Goal's stored shape, never the record's numeric storage version", async () => {
    // Real production regression: the active Goal payload has no `version` and no
    // `goalContractVersion`. The adapter derives contractVersion from
    // `goal.goalContractVersion ?? goal.version ?? "canonical_v1"`; a numeric 1 injected
    // from the row version made contractVersion the number 1 and the Photo Event
    // failed with "contractVersion is required."
    const store = createPostgresPhotoEventReadStore({ pool: fakePool(), ownerUserId: "user_founder_001" });
    const { goal, goals } = await store.loadInputs({ userId: "user_founder_001", sessionId: "opaque-session-id" });
    expect(goal.id).toBe("active-goal");
    expect(goal.version).toBeUndefined();
    expect(goals.every((item) => typeof item.version !== "number")).toBe(true);
    expect(goal.goalContractVersion ?? goal.version ?? "canonical_v1").toBe("canonical_v1");
  });

  it("preserves a version the Goal payload itself carries", async () => {
    const pool = fakePool();
    const original = pool.query.getMockImplementation();
    pool.query.mockImplementation(async (sql, values) => {
      if (sql.includes("canonical_goal_records")) return { rows: [
        row("goals", "active-goal", { id: "active-goal", userId: "user_founder_001", primary: true, status: "active", goalContractVersion: "goal_contract_v2" }),
      ] };
      return original(sql, values);
    });
    const store = createPostgresPhotoEventReadStore({ pool, ownerUserId: "user_founder_001" });
    const { goal } = await store.loadInputs({ userId: "user_founder_001", sessionId: "opaque-session-id" });
    expect(goal.goalContractVersion).toBe("goal_contract_v2");
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
    if (sql.includes("payload#>>'{payload,sessionId}'")) return { rows: [{
      record_id: "opaque-session-id",
      payload: {
        canonicalId: "opaque-session-id",
        goalId: "active-goal",
        phaseId: "phase-at-capture",
        payload: {
          evidence_type: "photo_session",
          sessionId: "opaque-session-id",
          captureDate: "2026-08-22",
        },
      },
      version: 2,
    }] };
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
        id: "active-goal", userId: "user_founder_001", primary: true, status: "active",
      }),
    ] };
    if (sql.includes("canonical_execution_records")) return { rows: [] };
    if (sql.includes("canonical_confidence_records")) return { rows: [
      row("goalConfidenceSnapshots", "snapshot", { id: "snapshot" }),
      row("goalConfidenceHistory", "history", { id: "history" }),
    ] };
    if (sql.includes("canonical_protocol_records")) return { rows: [
      row("protocols", "energy-protocol", { id: "energy-protocol", category: "energy", status: "active" }),
      row("protocolVersions", "energy-protocol-v2", { id: "energy-protocol-v2", protocolId: "energy-protocol" }),
    ] };
    if (sql.includes("canonical_briefing_records")) return { rows: [] };
    if (sql.includes("canonical_training_records") && sql.includes("record_id=$3")) return { rows: [] };
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

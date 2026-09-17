import { describe, expect, it } from "vitest";
import {
  createPostgresHistoricalTrainingReconciler,
  HISTORICAL_TRAINING_EXECUTION_AUTHORIZATION,
  previewExplicitTrainingSupportReconciliation,
  previewHistoricalTrainingReconciliation,
} from "./HistoricalTrainingReconciliationService.js";
import { createPayloadHash } from "../../contracts/v1/canonicalJson.js";

const OWNER = "synthetic-owner";
const DATE = "2026-10-01";
const attribution = { goalId: "goal", phaseId: "phase", frozen: true };
function record(id, payload, extra = {}) {
  return { recordId: id, ownerUserId: OWNER, collectionName: "canonicalEvidenceObjects", databaseStatus: null,
    sourceIdentity: null, version: 2, payload: { canonicalId: id, version: 2, userId: OWNER, goalId: "goal", phaseId: "phase",
    goalPhaseAttribution: attribution, quality: { status: "active" }, provenance: { evidence_package_ids: [id], source_artifact_refs: [id] },
    payload: { id, observed_at: DATE, ...payload }, ...extra } };
}
function legacyFixture({ staleActivity = false } = {}) {
  const records = fixture().map((row, index) => ({ ...row, recordId: `@index:${101 + index}` }));
  if (staleActivity) {
    records[1].payload.payload.metadata.start_time = "07:45";
    records[1].payload.payload.metadata.end_time = "08:44";
    records[4].payload.payload.daily_activity.move_calories = 948;
    records[4].payload.payload.derived_metrics = { workout_active_calories: 0, non_workout_active_calories: 948, training_sessions_referenced: 0 };
    records[4].payload.payload.references = { training_session_ids: [] };
    records[4].payload.activityRevision = { revision: 1, semanticFingerprint: "synthetic-frozen-observation" };
  }
  return records;
}
function fixture() {
  const exercises = ["exercise-a", "exercise-b", "exercise-c", "exercise-d"].map((id) => ({ id, canonicalExerciseId: id, name: id,
    sets: Array.from({ length: 4 }, (_, i) => ({ id: `${id}-set-${i}`, reps: 12, weight: 100, weight_unit: "lb" })) }));
  return [
    record("structured", { evidence_type: "training", metadata: { activity_type: "Traditional Strength Training" }, exercises,
      exerciseRelationshipGroups: [{ id: "pair", relationshipType: "superset", memberExerciseIds: ["exercise-a", "exercise-b"] }],
      source: { application: "Training Logger", modality: "manual" }, provenance: { source_artifact_refs: ["logger"] } }),
    record("telemetry", { evidence_type: "training", exercises: [], source: { application: "Apple Fitness" },
      provenance: { source_artifact_refs: ["apple"] }, metadata: { activity_type: "Traditional Strength Training",
        start_time: `${DATE}T07:45:00`, end_time: `${DATE}T08:44:00`, duration_seconds: 3518, active_calories: 438, average_heart_rate: 121 },
      reconciliation: { target_canonical_id: "structured" } }),
    ...[84, 105].map((cal, i) => record(`walk-${i}`, { evidence_type: "training", exercises: [], source: { application: "Apple Fitness" },
      metadata: { activity_type: "Outdoor Walk", start_time: `${DATE}T09:${i}0:00`, active_calories: cal } })),
    record("activity", { evidence_type: "activity_day", daily_activity: { move_calories: 800 },
      derived_metrics: { workout_active_calories: 627, non_workout_active_calories: 173, training_sessions_referenced: 4 },
      references: { training_session_ids: ["structured", "telemetry", "walk-0", "walk-1"] } }),
    record("retired-history", { evidence_type: "training", exercises: [] }, { quality: { status: "superseded", supersededBy: "structured" } }),
  ];
}
function database(initial = fixture(), { failWrite = -1, readOnly = "on" } = {}) {
  let durable = structuredClone(initial), revision = 40, connects = 0;
  const statements = [];
  const pool = { async connect() {
    connects += 1;
    let staged, stagedRevision, writes = 0;
    return { release() {}, async query(sql, values = []) {
      statements.push(sql);
      if (sql.startsWith("BEGIN")) { staged = structuredClone(durable); stagedRevision = revision; }
      if (sql.startsWith("SHOW")) return { rows: [{ transaction_read_only: readOnly }] };
      if (sql.startsWith("SELECT record_id")) return { rows: staged.map(row => ({ record_id: row.recordId, version: row.version,
        owner_user_id: row.ownerUserId, collection_name: row.collectionName, status: row.databaseStatus,
        source_identity: row.sourceIdentity, payload: structuredClone(row.payload) })) };
      if (sql.startsWith("UPDATE physiqueos.canonical_evidence_records")) {
        writes += 1;
        if (writes === failWrite) throw new Error("Injected second-write failure");
        const row = staged.find(row => row.ownerUserId === values[0] && row.recordId === values[1] && row.version === values[2] && row.payload.canonicalId === values[5]);
        if (!row) return { rows: [] };
        row.payload = JSON.parse(values[3]); row.version += 1; row.databaseStatus = values[4];
        return { rows: [{ record_id: row.recordId }] };
      }
      if (sql.startsWith("UPDATE physiqueos.canonical_runtime_metadata")) return { rows: [{ revision: ++stagedRevision }] };
      if (sql === "COMMIT") { durable = staged; revision = stagedRevision; }
      return { rows: [] };
    } };
  } };
  return { service: createPostgresHistoricalTrainingReconciler({ pool, ownerUserId: OWNER }), statements,
    snapshot: () => structuredClone(durable), revision: () => revision, connects: () => connects,
    mutateRow(change, index = 0) { change(durable[index]); },
    changeVersion() { durable[0].version += 1; },
    changePayload() { durable[0].payload.payload.exercises[0].sets[0].reps += 1; } };
}

describe("historical Training owner-fenced preview and authorized transition", () => {
  it("seals a Founder-reviewed explicit Logger/support repair without date-based discovery", async () => {
    const records = fixture();
    delete records[1].payload.payload.reconciliation;
    expect(previewHistoricalTrainingReconciliation({ ownerUserId: OWNER, records }).candidateCount).toBe(0);

    const preview = previewExplicitTrainingSupportReconciliation({
      ownerUserId: OWNER, records,
      structuredCanonicalId: "structured", telemetryCanonicalId: "telemetry",
    });
    expect(preview).toMatchObject({
      schema: "explicit-training-support-preview-v1", candidateCount: 1,
      explicitSelection: { structuredCanonicalId: "structured", telemetryCanonicalId: "telemetry" },
      pairs: [{
        survivorId: "structured", retiredId: "telemetry", setCount: 16,
        selectionBasis: "founder_reviewed_explicit_logger_support_intent",
        survivorRecord: { recordId: "structured", version: 2 },
        retiredRecord: { recordId: "telemetry", version: 2 },
      }],
    });
    const db = database(records);
    const result = await db.service.execute({
      approvedPreview: preview,
      authorization: HISTORICAL_TRAINING_EXECUTION_AUTHORIZATION,
    });
    expect(result).toMatchObject({ outcome: "committed", changedCanonicalIds: ["structured", "telemetry", "activity"] });
    expect(db.snapshot()[0].payload.payload.metadata).toMatchObject({ active_calories: 438, average_heart_rate: 121 });
    expect(db.snapshot()[1].payload.quality).toMatchObject({ status: "superseded", supersededBy: "structured" });
    expect(db.snapshot().slice(2, 4)).toEqual(records.slice(2, 4));
  });

  it("seals independent persisted and canonical identities; legacy keys never migrate", async () => {
    const db = database(legacyFixture()), before = db.snapshot(), preview = await db.service.preview();
    expect(preview.schema).toBe("historical-training-preview-v2");
    expect(preview.pairs[0]).toMatchObject({ survivorId: "structured", retiredId: "telemetry",
      survivorRecord: { recordId: "@index:101", canonicalId: "structured", version: 2, ownerUserId: OWNER },
      retiredRecord: { recordId: "@index:102", canonicalId: "telemetry", version: 2, ownerUserId: OWNER } });
    const result = await db.service.execute({ approvedPreview: preview, authorization: HISTORICAL_TRAINING_EXECUTION_AUTHORIZATION });
    expect(result.changedIds).toEqual(["@index:101", "@index:102", "@index:105"]);
    expect(result.changedCanonicalIds).toEqual(["structured", "telemetry", "activity"]);
    expect(db.snapshot().map(row => row.recordId)).toEqual(before.map(row => row.recordId));
    expect(db.snapshot()[0]).toMatchObject({ version: 3, payload: { version: 3, canonicalId: "structured" } });
    expect(db.statements.filter(sql => sql.startsWith("UPDATE physiqueos.canonical_evidence_records")).every(sql => sql.includes("payload->>'canonicalId'=$6"))).toBe(true);
    const after = db.snapshot();
    expect((await db.service.execute({ approvedPreview: preview, authorization: HISTORICAL_TRAINING_EXECUTION_AUTHORIZATION })).outcome).toBe("replayed");
    expect(db.snapshot()).toEqual(after); expect(db.revision()).toBe(41);
  });
  it("previews stale zero-derived Activity becoming current canonical projections without adding calories", async () => {
    const records = legacyFixture({ staleActivity: true }), db = database(records), preview = await db.service.preview();
    expect(preview.activityChanges).toHaveLength(1);
    expect(preview.activityChanges[0]).toMatchObject({ identity: { recordId: "@index:105", canonicalId: "activity" },
      before: { dailyActivity: { move_calories: 948 }, derivedMetrics: { workout_active_calories: 0, non_workout_active_calories: 948, training_sessions_referenced: 0 }, references: { training_session_ids: [] } },
      after: { dailyActivity: { move_calories: 948 }, derivedMetrics: { workout_active_calories: 627, non_workout_active_calories: 321, training_sessions_referenced: 3 }, references: { training_session_ids: ["structured", "walk-0", "walk-1"] } } });
    expect(preview.activityChanges[0].before.semanticFingerprint).toBe(preview.activityChanges[0].after.semanticFingerprint);
    expect(preview.pairs[0]).toMatchObject({ beforeWorkoutActiveCalories: 627, afterWorkoutActiveCalories: 627, telemetry: { start_time: "07:45", end_time: "08:44", duration_seconds: 3518 } });
    await db.service.execute({ approvedPreview: preview, authorization: HISTORICAL_TRAINING_EXECUTION_AUTHORIZATION });
    const after = db.snapshot();
    expect(after[4].payload.payload.derived_metrics).toEqual(preview.activityChanges[0].after.derivedMetrics);
    expect(after[4].payload.activityRevision).toEqual(records[4].payload.activityRevision);
    expect(after.slice(2, 4)).toEqual(records.slice(2, 4));
    expect(after[0].payload.payload.exercises).toEqual(records[0].payload.payload.exercises);
    expect(after[0].payload.payload.exerciseRelationshipGroups).toEqual(records[0].payload.payload.exerciseRelationshipGroups);
    expect(after[0].payload.provenance.evidence_package_ids).toEqual(["structured", "telemetry"]);
  });
  it.each([
    ["storage key", row => { row.recordId = "@index:999"; }],
    ["canonical ID", row => { row.payload.canonicalId = "replacement-canonical"; }],
    ["database version", row => { row.version += 1; }],
    ["payload digest", row => { row.payload.payload.exercises[0].sets[0].reps += 1; }],
    ["database owner", row => { row.ownerUserId = "other-owner"; }],
    ["payload owner", row => { row.payload.userId = "other-owner"; }],
    ["database status", row => { row.databaseStatus = "superseded"; }],
    ["canonical status", row => { row.payload.quality.status = "superseded"; }],
    ["record type", row => { row.payload.payload.evidence_type = "activity_day"; }],
    ["source identity", row => { row.sourceIdentity = "replacement-source"; }],
  ])("rejects a changed %s before any update", async (_name, change) => {
    const db = database(legacyFixture()), preview = await db.service.preview(); db.mutateRow(change);
    await expect(db.service.execute({ approvedPreview: preview, authorization: HISTORICAL_TRAINING_EXECUTION_AUTHORIZATION })).rejects.toThrow(/stale|owner-scoped/);
    expect(db.statements.some(sql => sql.startsWith("UPDATE"))).toBe(false);
  });
  it("rejects duplicate storage/domain identities rather than collapsing records", () => {
    for (const key of ["recordId", "canonicalId"]) {
      const records = legacyFixture();
      if (key === "recordId") records[1].recordId = records[0].recordId;
      else records[1].payload.canonicalId = records[0].payload.canonicalId;
      expect(() => previewHistoricalTrainingReconciliation({ ownerUserId: OWNER, records })).toThrow("owner-scoped");
    }
  });
  it("rejects a changed Activity observation instead of applying an old consequence", async () => {
    const db = database(legacyFixture({ staleActivity: true })), preview = await db.service.preview();
    db.mutateRow(row => { row.payload.payload.daily_activity.move_calories = 1000; }, 4);
    await expect(db.service.execute({ approvedPreview: preview, authorization: HISTORICAL_TRAINING_EXECUTION_AUTHORIZATION })).rejects.toThrow("stale");
    expect(db.statements.some(sql => sql.startsWith("UPDATE"))).toBe(false);
  });
  it("rejects a self-sealed v1 manifest before connecting", async () => {
    const db = database(), preview = await db.service.preview();
    const { digest: _digest, ...body } = { ...preview, schema: "historical-training-preview-v1" };
    const approvedPreview = { ...body, digest: createPayloadHash(body) };
    await expect(db.service.execute({ approvedPreview, authorization: HISTORICAL_TRAINING_EXECUTION_AUTHORIZATION })).rejects.toThrow("authorization");
    expect(db.connects()).toBe(1); // The earlier READ ONLY preview, no execute connection.
  });
  it("does not normalize unrelated Activity dates", async () => {
    const records = legacyFixture({ staleActivity: true });
    records.push({ ...structuredClone(records[4]), recordId: "@index:999", payload: { ...structuredClone(records[4].payload),
      canonicalId: "other-day", payload: { ...structuredClone(records[4].payload.payload), observed_at: "2026-10-02" } } });
    const db = database(records), preview = await db.service.preview();
    expect(preview.activityChanges).toHaveLength(1);
    await db.service.execute({ approvedPreview: preview, authorization: HISTORICAL_TRAINING_EXECUTION_AUTHORIZATION });
    expect(db.snapshot()[6]).toEqual(records[6]);
  });
  it("previews one unique pair without changing records and preserves all 16 sets/identities", () => {
    const records = fixture(), before = JSON.stringify(records);
    const preview = previewHistoricalTrainingReconciliation({ ownerUserId: OWNER, records });
    expect(preview).toMatchObject({ candidateCount: 1, beforeActiveTrainingCount: 4, afterActiveTrainingCount: 3,
      totalTrainingRecordCount: 5,
      pairs: [{ survivorId: "structured", retiredId: "telemetry", setCount: 16, structuredCounterpartCount: 1, telemetryCounterpartCount: 1,
        beforeWorkoutActiveCalories: 627, afterWorkoutActiveCalories: 627 }] });
    expect(JSON.stringify(records)).toBe(before);
  });
  it("enforces PostgreSQL READ ONLY during preview", async () => {
    const db = database(); await db.service.preview();
    expect(db.statements).toContain("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(db.statements).toContain("SHOW transaction_read_only");
    expect(db.statements.some(sql => sql.startsWith("UPDATE"))).toBe(false);
    await expect(database(fixture(), { readOnly: "off" }).service.preview()).rejects.toThrow("READ ONLY");
  });
  it("requires explicit authorization before connecting for execution", async () => {
    const db = database(), approvedPreview = previewHistoricalTrainingReconciliation({ ownerUserId: OWNER, records: fixture() });
    await expect(db.service.execute({ approvedPreview })).rejects.toThrow("authorization");
    expect(db.connects()).toBe(0);
  });
  it("atomically preserves structure, attribution, provenance, cardio and Activity calories; replay is a no-op", async () => {
    const db = database(), before = db.snapshot(), approvedPreview = await db.service.preview();
    const result = await db.service.execute({ approvedPreview, authorization: HISTORICAL_TRAINING_EXECUTION_AUTHORIZATION });
    expect(result).toMatchObject({ outcome: "committed", changedIds: ["structured", "telemetry", "activity"] });
    const after = db.snapshot(), survivor = after[0].payload;
    expect(survivor.canonicalId).toBe("structured");
    expect(survivor.payload.exercises).toEqual(before[0].payload.payload.exercises);
    expect(survivor.payload.exerciseRelationshipGroups).toEqual(before[0].payload.payload.exerciseRelationshipGroups);
    expect(survivor.goalPhaseAttribution).toEqual(attribution);
    expect(survivor.provenance.evidence_package_ids).toEqual(["structured", "telemetry"]);
    expect(survivor.payload.provenance.source_artifact_refs).toEqual(["logger", "apple"]);
    expect(survivor.payload.metadata).toMatchObject({ duration_seconds: 3518, active_calories: 438, average_heart_rate: 121,
      start_time: `${DATE}T07:45:00`, end_time: `${DATE}T08:44:00` });
    expect(after[1].payload.quality).toMatchObject({ status: "superseded", supersededBy: "structured" });
    expect(after.slice(2, 4)).toEqual(before.slice(2, 4));
    expect(after[4].payload.payload.daily_activity).toEqual(before[4].payload.payload.daily_activity);
    expect(after[4].payload.payload.derived_metrics).toEqual({ workout_active_calories: 627, non_workout_active_calories: 173, training_sessions_referenced: 3 });
    expect(after[4].payload.payload.references.training_session_ids).toEqual(["structured", "walk-0", "walk-1"]);
    expect(after[5]).toEqual(before[5]);
    expect(db.revision()).toBe(41);
    expect((await db.service.execute({ approvedPreview, authorization: HISTORICAL_TRAINING_EXECUTION_AUTHORIZATION })).outcome).toBe("replayed");
    expect(db.snapshot()).toEqual(after); expect(db.revision()).toBe(41);
  });
  it("rolls back all writes on a mid-transaction failure", async () => {
    const db = database(fixture(), { failWrite: 2 }), approvedPreview = await db.service.preview(), before = db.snapshot();
    await expect(db.service.execute({ approvedPreview, authorization: HISTORICAL_TRAINING_EXECUTION_AUTHORIZATION })).rejects.toThrow("second-write");
    expect(db.snapshot()).toEqual(before); expect(db.revision()).toBe(40);
  });
  it("rejects changed version/digest instead of silently repairing a different snapshot", async () => {
    const db = database(), approvedPreview = await db.service.preview(); db.changeVersion();
    await expect(db.service.execute({ approvedPreview, authorization: HISTORICAL_TRAINING_EXECUTION_AUTHORIZATION })).rejects.toThrow("stale");
    expect(db.statements.some(sql => sql.startsWith("UPDATE"))).toBe(false);
  });
  it("rejects changed payload digest even without a database version change", async () => {
    const db = database(), approvedPreview = await db.service.preview(); db.changePayload();
    await expect(db.service.execute({ approvedPreview, authorization: HISTORICAL_TRAINING_EXECUTION_AUTHORIZATION })).rejects.toThrow("stale");
    expect(db.statements.some(sql => sql.startsWith("UPDATE"))).toBe(false);
  });
  it("rejects foreign-owner records and an altered approved manifest", async () => {
    const records = fixture(); records[0].payload.userId = "another-owner";
    expect(() => previewHistoricalTrainingReconciliation({ ownerUserId: OWNER, records })).toThrow("owner-scoped");
    const db = database(), approvedPreview = await db.service.preview(); approvedPreview.pairs[0].retiredId = "walk-0";
    await expect(db.service.execute({ approvedPreview, authorization: HISTORICAL_TRAINING_EXECUTION_AUTHORIZATION })).rejects.toThrow("authorization");
    expect(db.statements.some(sql => sql.startsWith("UPDATE"))).toBe(false);
  });
  it("keeps an explicit target deterministic while excluding other open sessions and mismatched attribution", () => {
    const records = fixture(); records.push({ ...structuredClone(records[0]), recordId: "competing", payload: { ...structuredClone(records[0].payload), canonicalId: "competing" } });
    const ambiguous = previewHistoricalTrainingReconciliation({ ownerUserId: OWNER, records });
    expect(ambiguous.candidateCount).toBe(1); expect(ambiguous.excluded).toHaveLength(1);
    const mismatch = fixture(); mismatch[1].payload.phaseId = "another-phase";
    const rejected = previewHistoricalTrainingReconciliation({ ownerUserId: OWNER, records: mismatch });
    expect(rejected.candidateCount).toBe(0); expect(rejected.excluded[0].reason).toBe("attribution-mismatch");
  });
});

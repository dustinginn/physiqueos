import { describe, expect, it } from "vitest";
import {
  createPostgresLoggerSupportingEvidenceRepairService,
  LOGGER_SUPPORT_REPAIR_AUTHORIZATION,
  previewLoggerSupportingEvidenceRepair,
} from "./LoggerSupportingEvidenceRepairService.js";

const OWNER = "founder";
const SESSION = "20A8DDEE-E0E8-42DD-8A27-0CB180743F40";
const TARGET = `training|authoritative|training_logger_draft_${SESSION}`;
const PACKAGE = `training_logger_submission_${SESSION}`;
const REVIEW = "evidence_review_B8D00FF51649430A9E7E7BD2749D8395";

function exercises(count, setCounts) {
  return Array.from({ length: count }, (_, index) => ({
    id: `exercise-${index}`,
    canonicalExerciseId: `exercise-${index}`,
    name: `Exercise ${index}`,
    sets: Array.from({ length: setCounts[index] }, (_value, set) => ({
      id: `set-${index}-${set}`, set_number: set + 1, reps: 10, weight: 50,
    })),
  }));
}

function row(collectionName, recordId, version, payload) {
  return { collectionName, recordId, ownerUserId: OWNER, version, payload,
    databaseStatus: null, sourceIdentity: null };
}

function fixture() {
  const structured = {
    id: `training_logger_session_${SESSION}`,
    evidence_type: "training",
    observed_at: "2026-09-17",
    captured_at: "2026-09-17T12:00:00.000Z",
    metadata: { activity_type: "Traditional Strength Training", logger_origin: "training_logger", start_time: "2026-09-17T14:23:38Z" },
    exercises: exercises(4, [4, 4, 4, 3]),
    provenance: { source_artifact_refs: [`training_logger_draft_${SESSION}`] },
    source: { application: "Training Logger", modality: "manual" },
  };
  const strength = {
    id: "training_2026-09-17_0738_traditional_strength_training",
    evidence_type: "training",
    observed_at: "2026-09-17",
    metadata: { activity_type: "Traditional Strength Training", start_time: "07:38:00", end_time: "08:37:00",
      duration_seconds: 3533, active_calories: 373, total_calories: 469, average_heart_rate: 113 },
    exercises: [],
    provenance: { source_artifact_refs: ["Apple Health Screenshot 2.jpg"] },
    source: { application: "Apple Fitness", modality: "screenshot" },
    reconciliation: { target_canonical_id: TARGET, match_basis: "explicit_native_training_support_binding" },
  };
  const walks = [88, 103].map((calories, index) => ({
    id: `walk-${index + 1}`, evidence_type: "training", observed_at: "2026-09-17",
    metadata: { activity_type: "Outdoor Walk", active_calories: calories }, exercises: [],
    source: { application: "Apple Fitness", modality: "screenshot" },
  }));
  return [
    row("canonicalEvidenceObjects", "@index:527", 1, {
      canonicalId: TARGET, userId: OWNER, evidence_type: "training",
      firstObservedAt: "2026-09-13", lastObservedAt: "2026-09-13",
      quality: { status: "active" }, provenance: { evidence_package_ids: ["contaminated"] },
      payload: {
        id: "training_logger_session_ABB72390-C0D9-46B5-9F3F-939BA2820487",
        evidence_type: "training", observed_at: "2026-09-13",
        metadata: { activity_type: "Traditional Strength Training", start_time: "07:38:00", duration_seconds: 3533, active_calories: 373 },
        exercises: exercises(5, [4, 4, 4, 4, 4]), source: { application: "Apple Fitness" },
      },
    }),
    row("evidencePackages", PACKAGE, 1, {
      id: PACKAGE, package_id: PACKAGE,
      review_metadata: { draftId: SESSION, origin: "training_logger" },
      evidence_objects: [structured],
    }),
    row("evidenceReviews", REVIEW, 40, {
      id: REVIEW, status: "confirmed", updatedAt: "2026-09-17T16:00:30.490Z",
      interpretedEvidence: {
        package_id: "evidence_submission_B8D00FF51649430A9E7E7BD2749D8395_images",
        review_metadata: { targetTrainingSessionCanonicalId: TARGET },
        evidence_objects: [walks[0], strength, walks[1]],
      },
    }),
  ];
}

function preview(records = fixture()) {
  return previewLoggerSupportingEvidenceRepair({
    ownerUserId: OWNER,
    targetCanonicalId: TARGET,
    canonicalRecord: records[0],
    loggerPackageRecord: records[1],
    supportReviewRecord: records[2],
  });
}

function database(initial = fixture()) {
  let durable = structuredClone(initial);
  let revision = 50;
  let connects = 0;
  const statements = [];
  const pool = { async connect() {
    connects += 1;
    let staged = structuredClone(durable);
    return { release() {}, async query(sql, values = []) {
      statements.push(sql);
      if (sql.startsWith("BEGIN")) staged = structuredClone(durable);
      if (sql.startsWith("SHOW")) return { rows: [{ transaction_read_only: "on" }] };
      if (sql.startsWith("SELECT record_id")) return { rows: staged.map((item) => ({
        record_id: item.recordId, collection_name: item.collectionName, owner_user_id: item.ownerUserId,
        version: item.version, payload: structuredClone(item.payload), status: item.databaseStatus,
        source_identity: item.sourceIdentity,
      })) };
      if (sql.startsWith("UPDATE physiqueos.canonical_evidence_records")) {
        const item = staged.find((candidate) => candidate.ownerUserId === values[0] &&
          candidate.recordId === values[1] && candidate.version === values[2] &&
          candidate.payload.canonicalId === values[5]);
        if (!item) return { rows: [] };
        item.payload = JSON.parse(values[3]); item.version += 1;
        return { rows: [{ record_id: item.recordId }] };
      }
      if (sql.startsWith("UPDATE physiqueos.canonical_runtime_metadata")) return { rows: [{ revision: ++revision }] };
      if (sql === "COMMIT") durable = staged;
      return { rows: [] };
    } };
  } };
  return {
    service: createPostgresLoggerSupportingEvidenceRepairService({
      pool, ownerUserId: OWNER, targetCanonicalId: TARGET,
      loggerPackageRecordId: PACKAGE, supportReviewRecordId: REVIEW,
    }),
    connects: () => connects,
    snapshot: () => structuredClone(durable),
    statements,
  };
}

describe("exact Logger supporting-evidence repair", () => {
  it("previews restoration from the persisted structured package and confirmed bound telemetry without touching walks", () => {
    const result = preview();
    expect(result).toMatchObject({
      schema: "logger-support-repair-preview-v1",
      targetCanonicalId: TARGET,
      canonicalRecord: { recordId: "@index:527", version: 1 },
      loggerPackageRecord: { recordId: PACKAGE, version: 1 },
      supportReviewRecord: { recordId: REVIEW, version: 40 },
      summary: {
        currentObservedAt: "2026-09-13", restoredObservedAt: "2026-09-17",
        currentStructure: { exerciseCount: 5, setCount: 20 },
        restoredStructure: { exerciseCount: 4, setCount: 15 },
        telemetry: { durationSeconds: 3533, activeCalories: 373, totalCalories: 469, averageHeartRate: 113 },
        independentTrainingObjectIds: ["walk-1", "walk-2"],
        independentTrainingObjectsMutated: false,
      },
      mutationScope: { canonicalRecordIds: ["@index:527"], evidencePackageRecordIds: [], evidenceReviewRecordIds: [] },
    });
    expect(result.proposedCanonical).toMatchObject({
      canonicalId: TARGET, lastObservedAt: "2026-09-17",
      payload: { id: `training_logger_session_${SESSION}`, observed_at: "2026-09-17", metadata: { start_time: "07:38:00", end_time: "08:37:00" } },
    });
    expect(result.proposedCanonical.payload.exercises).toHaveLength(4);
    expect(result.proposedCanonical.payload.exercises.flatMap((item) => item.sets)).toHaveLength(15);
  });

  it("requires an intact, authorized, version-sealed preview and updates only the exact canonical target", async () => {
    const db = database();
    const approved = await db.service.preview();
    expect(db.statements).toContain("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(db.statements).toContain("SHOW transaction_read_only");
    const before = db.snapshot();
    await expect(db.service.execute({ approvedPreview: approved })).rejects.toThrow("authorization");
    expect(db.connects()).toBe(1);
    const result = await db.service.execute({ approvedPreview: approved, authorization: LOGGER_SUPPORT_REPAIR_AUTHORIZATION });
    expect(result).toMatchObject({ outcome: "committed", targetCanonicalId: TARGET, changedRecordIds: ["@index:527"], independentTrainingObjectsMutated: false });
    const after = db.snapshot();
    expect(after[0].version).toBe(2);
    expect(after[0].payload.payload.observed_at).toBe("2026-09-17");
    expect(after[0].payload.payload.exercises).toHaveLength(4);
    expect(after.slice(1)).toEqual(before.slice(1));
    expect((await db.service.execute({ approvedPreview: approved, authorization: LOGGER_SUPPORT_REPAIR_AUTHORIZATION })).outcome).toBe("replayed");
  });

  it("rejects mismatched target lineage instead of guessing by date", () => {
    const records = fixture();
    records[2].payload.interpretedEvidence.review_metadata.targetTrainingSessionCanonicalId = "another-target";
    expect(() => preview(records)).toThrow("exact Logger target");
  });
});

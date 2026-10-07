import { describe, expect, it } from "vitest";
import { createInMemoryCanonicalRecordStore } from "../database/Phase4CanonicalRecordStore.js";
import {
  legacySeedTrainingExecutionVariantId,
  runTrainingExecutionVariantLegacySeed,
  TRAINING_EXECUTION_VARIANT_LEGACY_SEED,
} from "./TrainingExecutionVariantLegacySeedRunner.js";
import { buildTrainingExecutionVariantSeedPayload } from "../../../scripts/operations/buildTrainingExecutionVariantSeedPayload.mjs";

const OWNER = "user_founder_001";
const authorization = { ownerUserId: OWNER, authorizationReference: "founder-authorized-seed-test" };
const now = () => new Date("2026-10-07T18:00:00.000Z");
const SPIDER_ID = legacySeedTrainingExecutionVariantId({ canonicalExerciseId: "spider_curl", key: "static_hold" });
const PENDULUM_ID = legacySeedTrainingExecutionVariantId({ canonicalExerciseId: "pendulum_squat_machine", key: "static_hold" });

function training(id, exercises, quality = { status: "complete" }) {
  return { canonicalId: id, quality, version: 1, payload: { id, evidence_type: "training", observed_at: "2026-08-20", exercises } };
}

function store(extra = {}) {
  return createInMemoryCanonicalRecordStore({
    canonicalEvidenceObjects: [
      training("spider-1", [{ canonicalExerciseId: "spider_curl", executionVariant: { key: "static_hold", label: "Static Hold", rawLabel: "Static Hold" }, sets: [{ reps: 12, weight: 35 }] }]),
      training("spider-2", [{ canonicalExerciseId: "spider_curl", executionVariant: { key: "static_hold", label: "Static Hold", rawLabel: "static hold" }, sets: [{ reps: 12, weight: 35 }] }]),
      training("spider-retracted", [{ canonicalExerciseId: "spider_curl", executionVariant: { key: "static_hold", label: "Static Hold" }, sets: [] }], { status: "superseded" }),
      training("pendulum-1", [{ canonicalExerciseId: "pendulum_squat_machine", executionVariant: { key: "static_hold", label: "Static Hold" }, sets: [{ reps: 10, weight: 90 }] }]),
      training("leg-day", [
        { canonicalExerciseId: "leg_extension", executionVariant: { key: "super_set", label: "Super Set", rawLabel: "super set" }, sets: [{ reps: 12, weight: 100 }] },
        { canonicalExerciseId: "sissy_squat", executionVariant: { key: "super_set", label: "Super Set", rawLabel: "super set" }, sets: [{ reps: 12, weight: 0 }] },
      ]),
    ],
    canonicalExerciseLibrary: [],
    trainingExecutionVariants: [],
    ...extra,
  });
}

describe("historical Static Hold execution-variant seed (Founder D3, not executed in production)", () => {
  it("is fixed in code to exactly Spider Curls and Pendulum Squat Machine Static Hold", () => {
    expect(TRAINING_EXECUTION_VARIANT_LEGACY_SEED).toEqual([
      { canonicalExerciseId: "spider_curl", displayName: "Static Hold", legacyKeys: ["static_hold"] },
      { canonicalExerciseId: "pendulum_squat_machine", displayName: "Static Hold", legacyKeys: ["static_hold"] },
    ]);
    expect(SPIDER_ID).toMatch(/^tev_[0-9a-f]{32}$/);
    expect(SPIDER_ID).not.toBe(PENDULUM_ID);
  });

  it("dry run predicts two creates, reports the evidence census, and writes nothing", async () => {
    const records = store();
    const before = records.snapshot();
    const result = await runTrainingExecutionVariantLegacySeed({ records, authorization, now });
    expect(result.outcome).toBe("dry_run");
    expect(result.predictedMutations).toEqual([
      { collection: "trainingExecutionVariants", recordId: SPIDER_ID, operation: "create" },
      { collection: "trainingExecutionVariants", recordId: PENDULUM_ID, operation: "create" },
    ]);
    expect(result.facts).toMatchObject({
      definitionCount: 0,
      activeTrainingSessions: 4,
      activeStaticHoldOccurrencesByExercise: { pendulum_squat_machine: 1, spider_curl: 2 },
      legacySuperSetOccurrences: 2,
    });
    expect(result.unchangedByDesign).toMatchObject({ evidenceRewritten: false, superSetSeeded: false });
    expect(records.snapshot()).toEqual(before);
    expect(records.getMutationCount()).toBe(0);
  });

  it("apply needs the dry-run facts, writes only the two definitions, and is idempotent", async () => {
    const records = store();
    const evidenceBefore = records.snapshot().canonicalEvidenceObjects;
    const dryRun = await runTrainingExecutionVariantLegacySeed({ records, authorization, now });
    const applied = await runTrainingExecutionVariantLegacySeed({ records, authorization, now, apply: true, expected: dryRun.facts });
    expect(applied).toMatchObject({ outcome: "applied", writes: 2 });
    const definitions = records.snapshot().trainingExecutionVariants;
    expect(definitions.map((item) => [item.id, item.canonicalExerciseId, item.displayName, item.key, item.legacyKeys, item.status, item.provenance]))
      .toEqual([
        [SPIDER_ID, "spider_curl", "Static Hold", "static_hold", ["static_hold"], "active", "legacy_seed"],
        [PENDULUM_ID, "pendulum_squat_machine", "Static Hold", "static_hold", ["static_hold"], "active", "legacy_seed"],
      ]);
    expect(definitions.some((item) => item.key === "super_set")).toBe(false);
    expect(records.snapshot().canonicalEvidenceObjects).toEqual(evidenceBefore);

    const second = await runTrainingExecutionVariantLegacySeed({ records, authorization, now });
    expect(second.predictedMutations).toEqual([]);
    expect(second.seed.map((item) => item.outcome)).toEqual(["existing", "existing"]);
    const rerun = await runTrainingExecutionVariantLegacySeed({ records, authorization, now, apply: true, expected: second.facts });
    expect(rerun).toMatchObject({ outcome: "applied", writes: 0 });
    expect(records.snapshot().trainingExecutionVariants).toHaveLength(2);
  });

  it("reactivates a compatible retired definition and reuses a user-created same-name identity", async () => {
    const records = store({
      trainingExecutionVariants: [
        { id: "tev_user_spider_static_hold", schemaVersion: "training_execution_variant_v1", canonicalExerciseId: "spider_curl",
          displayName: "Static Hold", key: "static_hold", legacyKeys: [], status: "retired", provenance: "user_created",
          createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-02T00:00:00.000Z", retiredAt: "2026-10-02T00:00:00.000Z", version: 2 },
      ],
    });
    const dryRun = await runTrainingExecutionVariantLegacySeed({ records, authorization, now });
    expect(dryRun.seed.map((item) => [item.canonicalExerciseId, item.outcome, item.variantId])).toEqual([
      ["spider_curl", "reactivated", "tev_user_spider_static_hold"],
      ["pendulum_squat_machine", "created", PENDULUM_ID],
    ]);
    await runTrainingExecutionVariantLegacySeed({ records, authorization, now, apply: true, expected: dryRun.facts });
    const spider = records.snapshot().trainingExecutionVariants.find((item) => item.id === "tev_user_spider_static_hold");
    expect(spider).toMatchObject({ status: "active", retiredAt: null, version: 3 });
    expect(records.snapshot().trainingExecutionVariants).toHaveLength(2);
  });

  it("refuses to apply on drift or without authorization, and refuses unknown exercises", async () => {
    const records = store();
    const dryRun = await runTrainingExecutionVariantLegacySeed({ records, authorization, now });
    await records.put({ collection: "canonicalEvidenceObjects", recordId: "spider-3", payload: training("spider-3", []) });
    const drifted = await runTrainingExecutionVariantLegacySeed({ records, authorization, now, apply: true, expected: dryRun.facts });
    expect(drifted.outcome).toBe("drifted");
    expect(records.snapshot().trainingExecutionVariants).toEqual([]);
    const fresh = await runTrainingExecutionVariantLegacySeed({ records, authorization, now });
    await expect(runTrainingExecutionVariantLegacySeed({
      records, authorization: { ownerUserId: OWNER, authorizationReference: " " }, now, apply: true, expected: fresh.facts,
    })).rejects.toMatchObject({ code: "AUTHORIZATION_REFERENCE_REQUIRED" });
    expect(records.snapshot().trainingExecutionVariants).toEqual([]);
  });

  it("builds a dry-run payload bound to an exact SHA without executing anything", async () => {
    const { code, marker } = await buildTrainingExecutionVariantSeedPayload({ sha: "a".repeat(40), mode: "dry-run" });
    expect(code.startsWith(`// PHYSIQUEOS_AUDIT_SUCCESS_MARKER: ${marker}`)).toBe(true);
    expect(code).toContain("REPEATABLE READ READ ONLY");
    await expect(buildTrainingExecutionVariantSeedPayload({ sha: "a".repeat(40), mode: "apply" }))
      .rejects.toThrow(/authorization-ref and --expected/);
    await expect(buildTrainingExecutionVariantSeedPayload({ sha: "nope" })).rejects.toThrow(/40-hex/);
  });
});

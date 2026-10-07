import { describe, expect, it } from "vitest";
import { createInMemoryCanonicalRecordStore } from "../../platform/database/Phase4CanonicalRecordStore.js";
import { createInMemoryFoundationTransactionStore } from "../../platform/commands/InMemoryFoundationTransactionStore.js";
import { createCanonicalPersistenceCommandPorts } from "./CanonicalPersistenceCommandPorts.js";
import { createPhase3CommandService, Phase3Command } from "./Phase3CommandService.js";

const ownerUserId = "owner-one";
const principal = { userId: ownerUserId, deviceId: "device-one", sessionId: "session-one" };
const now = () => new Date("2026-10-07T16:00:00.000Z");
let commandCounter = 0;

function fixture(extra = {}) {
  return createInMemoryCanonicalRecordStore({
    user: [{ id: ownerUserId, timeZone: "America/Los_Angeles", version: 1 }],
    goals: [{ id: "goal-one", userId: ownerUserId, title: "Goal", primary: true, status: "active", version: 1,
      operatingState: { value: "build_lean_mass" },
      phases: [{ id: "phase-one", goalId: "goal-one", name: "Build", purpose: "Build", order: 0, status: "active",
        startDate: "2026-08-01", startedAt: "2026-08-01", plannedReviewAt: "2026-11-01", reviewState: "scheduled",
        completionDecisionRequired: true, revision: 1 }] }],
    protocols: [], executionItems: [], reminders: [], evidenceReviews: [], trainingPerformanceEvents: [],
    weightEntries: [], dailyCheckIns: [], evidencePackages: [], canonicalEvidenceObjects: [],
    dexaScans: [], protocolVersions: [], progressPhotos: [], dailyBriefings: [], analyses: [],
    briefingReconciliationWorkItems: [], canonicalExerciseLibrary: [], piEnergyConfidenceWorkItems: [],
    piTrainingConfidenceWorkItems: [], trainingExecutionVariants: [],
    ...extra,
  });
}

function uuidV7() {
  commandCounter += 1;
  return `0199b000-0000-7000-8000-${String(commandCounter).padStart(12, "0")}`;
}

function service(records) {
  return createPhase3CommandService({
    transactionRunner: createInMemoryFoundationTransactionStore(),
    ports: createCanonicalPersistenceCommandPorts({ records, now }),
  });
}

function execute(target, commandType, payload, idempotencyKey = `variant-command-${uuidV7()}`) {
  return target.execute({ commandType, principal, metadata: { commandId: uuidV7(), idempotencyKey }, payload });
}

async function expectProblem(promise, status, code) {
  await expect(promise).rejects.toMatchObject({ status, code });
}

function commitContext(exercises, sessionId = `variant-session-${uuidV7()}`) {
  return {
    ownerUserId,
    principal,
    metadata: { commandId: uuidV7(), expectedVersion: null },
    payload: { sessionId, localDate: "2026-10-07", exercises },
  };
}

function committedExercises(records, result) {
  return records.snapshot().canonicalEvidenceObjects
    .find((item) => item.canonicalId === result.result.canonicalId).payload.exercises;
}

describe("Training Execution Variant commands (Build 92 V1)", () => {
  it("creates a Server-owned per-exercise definition and replays idempotently", async () => {
    const records = fixture();
    const commands = service(records);
    const input = { canonicalExerciseId: "spider_curl", displayName: "  static hold " };
    const first = await execute(commands, Phase3Command.CREATE_TRAINING_EXECUTION_VARIANT, input, "create-static-hold-once");
    const replay = await execute(commands, Phase3Command.CREATE_TRAINING_EXECUTION_VARIANT, input, "create-static-hold-once");
    expect(first.outcome).toBe("committed");
    expect(replay.outcome).toBe("replayed");
    expect(first.receipt.result).toMatchObject({
      status: "created",
      variant: { canonicalExerciseId: "spider_curl", key: "static_hold", label: "Static Hold", status: "active", provenance: "user_created" },
      selection: { key: "static_hold", label: "Static Hold", rawLabel: "Static Hold" },
    });
    expect(first.receipt.result.variant.variantId).toMatch(/^tev_[0-9a-f]{32}$/);
    expect(first.receipt.result.selection.variantId).toBe(first.receipt.result.variant.variantId);
    expect(records.snapshot().trainingExecutionVariants).toHaveLength(1);
  });

  it("returns the existing identity for a duplicate and allows the same name on another exercise", async () => {
    const records = fixture();
    const commands = service(records);
    const created = await execute(commands, Phase3Command.CREATE_TRAINING_EXECUTION_VARIANT, { canonicalExerciseId: "spider_curl", displayName: "Static Hold" });
    const duplicate = await execute(commands, Phase3Command.CREATE_TRAINING_EXECUTION_VARIANT, { canonicalExerciseId: "spider_curl", displayName: "STATIC   hold" });
    const otherExercise = await execute(commands, Phase3Command.CREATE_TRAINING_EXECUTION_VARIANT, { canonicalExerciseId: "pendulum_squat_machine", displayName: "Static Hold" });
    expect(duplicate.receipt.result.status).toBe("already_exists");
    expect(duplicate.receipt.result.variant.variantId).toBe(created.receipt.result.variant.variantId);
    expect(otherExercise.receipt.result.status).toBe("created");
    expect(otherExercise.receipt.result.variant.variantId).not.toBe(created.receipt.result.variant.variantId);
    expect(records.snapshot().trainingExecutionVariants).toHaveLength(2);
  });

  it("renames, retires and reactivates by stable identity; a retired name is reactivated on create", async () => {
    const records = fixture();
    const commands = service(records);
    const created = await execute(commands, Phase3Command.CREATE_TRAINING_EXECUTION_VARIANT, { canonicalExerciseId: "spider_curl", displayName: "Static Hold" });
    const variantId = created.receipt.result.variant.variantId;
    const renamed = await execute(commands, Phase3Command.RENAME_TRAINING_EXECUTION_VARIANT, { variantId, displayName: "Peak Squeeze" });
    expect(renamed.receipt.result).toMatchObject({ status: "renamed", variant: { variantId, key: "peak_squeeze", legacyKeys: ["static_hold"] } });
    const retired = await execute(commands, Phase3Command.RETIRE_TRAINING_EXECUTION_VARIANT, { variantId });
    expect(retired.receipt.result).toMatchObject({ status: "retired", variant: { variantId, status: "retired" } });
    const retiredAgain = await execute(commands, Phase3Command.RETIRE_TRAINING_EXECUTION_VARIANT, { variantId });
    expect(retiredAgain.receipt.result.status).toBe("unchanged");
    // Creating the old name resolves through the legacy alias and reactivates.
    const recreated = await execute(commands, Phase3Command.CREATE_TRAINING_EXECUTION_VARIANT, { canonicalExerciseId: "spider_curl", displayName: "Static Hold" });
    expect(recreated.receipt.result).toMatchObject({ status: "reactivated", variant: { variantId, status: "active", label: "Peak Squeeze" } });
    const reactivated = await execute(commands, Phase3Command.REACTIVATE_TRAINING_EXECUTION_VARIANT, { variantId });
    expect(reactivated.receipt.result.status).toBe("unchanged");
    expect(records.snapshot().trainingExecutionVariants).toHaveLength(1);
  });

  it("refuses unknown exercises, reserved names, malformed ids and unknown identities", async () => {
    const commands = service(fixture());
    await expectProblem(execute(commands, Phase3Command.CREATE_TRAINING_EXECUTION_VARIANT, { canonicalExerciseId: "not_real", displayName: "Static Hold" }), 404, "CANONICAL_EXERCISE_UNAVAILABLE");
    await expectProblem(execute(commands, Phase3Command.CREATE_TRAINING_EXECUTION_VARIANT, { canonicalExerciseId: "spider_curl", displayName: "Ordinary" }), 400, "TRAINING_EXECUTION_VARIANT_NAME_RESERVED");
    await expectProblem(execute(commands, Phase3Command.CREATE_TRAINING_EXECUTION_VARIANT, { canonicalExerciseId: "leg_extension", displayName: "Super Set" }), 400, "TRAINING_EXECUTION_VARIANT_NAME_RESERVED");
    await expectProblem(execute(commands, Phase3Command.RETIRE_TRAINING_EXECUTION_VARIANT, { variantId: "static_hold" }), 400, "CONTRACT_VALIDATION_FAILED");
    await expectProblem(execute(commands, Phase3Command.RETIRE_TRAINING_EXECUTION_VARIANT, { variantId: "tev_does_not_exist" }), 404, "TRAINING_EXECUTION_VARIANT_NOT_FOUND");
    await expectProblem(execute(commands, Phase3Command.CREATE_TRAINING_EXECUTION_VARIANT, { canonicalExerciseId: "spider_curl", displayName: { label: "x" } }), 400, "CONTRACT_VALIDATION_FAILED");
  });
});

describe("Training finalize with canonical execution variants", () => {
  const spiderStaticHold = {
    id: "tev_spider_static_hold_fixture", schemaVersion: "training_execution_variant_v1", canonicalExerciseId: "spider_curl",
    displayName: "Static Hold", key: "static_hold", legacyKeys: ["static_hold"], status: "active", provenance: "legacy_seed",
    createdAt: "2026-10-07T00:00:00.000Z", updatedAt: "2026-10-07T00:00:00.000Z", retiredAt: null, version: 1,
  };

  it("stamps a stable-id selection from the canonical definition", async () => {
    const records = fixture({ trainingExecutionVariants: [spiderStaticHold] });
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    const result = await ports.commitTrainingSession(commitContext([{
      canonicalExerciseId: "spider_curl",
      executionVariant: { variantId: spiderStaticHold.id, key: "client-key-ignored", label: "client label ignored" },
      sets: [{ reps: 12, load: 35, unit: "lb" }],
    }]));
    expect(committedExercises(records, result)[0].executionVariant).toEqual({
      variantId: spiderStaticHold.id, key: "static_hold", label: "Static Hold", rawLabel: "Static Hold",
    });
  });

  it("rejects a variant of another exercise and an unknown variant id", async () => {
    const records = fixture({ trainingExecutionVariants: [spiderStaticHold] });
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    await expect(ports.commitTrainingSession(commitContext([{
      canonicalExerciseId: "pendulum_squat_machine",
      executionVariant: { variantId: spiderStaticHold.id, key: "static_hold", label: "Static Hold" },
      sets: [{ reps: 10, load: 90, unit: "lb" }],
    }]))).rejects.toMatchObject({ status: 400, code: "TRAINING_EXECUTION_VARIANT_EXERCISE_MISMATCH" });
    await expect(ports.commitTrainingSession(commitContext([{
      canonicalExerciseId: "spider_curl",
      executionVariant: { variantId: "tev_unknown_variant", key: "static_hold", label: "Static Hold" },
      sets: [{ reps: 10, load: 35, unit: "lb" }],
    }]))).rejects.toMatchObject({ status: 400, code: "TRAINING_EXECUTION_VARIANT_UNKNOWN" });
    expect(records.snapshot().canonicalEvidenceObjects).toEqual([]);
  });

  it("keeps the legacy key/label finalize shape valid and attaches the stable identity additively", async () => {
    const records = fixture({ trainingExecutionVariants: [spiderStaticHold] });
    const ports = createCanonicalPersistenceCommandPorts({ records, now });
    const result = await ports.commitTrainingSession(commitContext([
      { canonicalExerciseId: "spider_curl", executionVariant: { key: "static_hold", label: "Static Hold", rawLabel: "static hold" },
        sets: [{ reps: 12, load: 35, unit: "lb" }] },
      { canonicalExerciseId: "bench_press", executionVariant: { key: "slow_eccentric", label: "Slow Eccentric", rawLabel: "Slow Eccentric" },
        sets: [{ reps: 8, load: 185, unit: "lb" }] },
    ]));
    const [spider, bench] = committedExercises(records, result);
    expect(spider.executionVariant).toEqual({ variantId: spiderStaticHold.id, key: "static_hold", label: "Static Hold", rawLabel: "static hold" });
    expect(bench.executionVariant).toEqual({ key: "slow_eccentric", label: "Slow Eccentric", rawLabel: "Slow Eccentric" });
  });

  it("commits a Build 90 Ordinary-only workout exactly as before and never reads definitions for it", async () => {
    const records = fixture({ trainingExecutionVariants: [spiderStaticHold] });
    const reads = [];
    const tracked = { ...records, list: (input) => { reads.push(input.collection); return records.list(input); } };
    const result = await createCanonicalPersistenceCommandPorts({ records: tracked, now }).commitTrainingSession(commitContext([{
      canonicalExerciseId: "spider_curl", sets: [{ reps: 12, load: 35, unit: "lb" }],
    }]));
    expect(committedExercises(records, result)[0]).not.toHaveProperty("executionVariant");
    // Only the PR-baseline stage reads definitions (identical output when none apply).
    expect(reads.filter((collection) => collection === "trainingExecutionVariants")).toHaveLength(1);
  });
});

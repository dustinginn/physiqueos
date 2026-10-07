import { describe, expect, it } from "vitest";
import {
  getTrainingExecutionVariantKey,
  normalizeTrainingExecutionVariant,
} from "./trainingExecutionVariant.js";
import {
  createTrainingExecutionVariantDefinition,
  createTrainingExecutionVariantResolver,
  createTrainingExecutionVariantSelection,
  EMPTY_TRAINING_EXECUTION_VARIANT_RESOLVER,
  normalizeTrainingExecutionVariantName,
  planTrainingExecutionVariantCreate,
  planTrainingExecutionVariantReactivate,
  planTrainingExecutionVariantRename,
  planTrainingExecutionVariantRetire,
  projectTrainingExecutionVariantChoices,
  TRAINING_EXECUTION_VARIANT_PROVENANCE,
  TrainingExecutionVariantError,
} from "./trainingExecutionVariantDefinition.js";

const NOW = "2026-10-07T16:00:00.000Z";
const LATER = "2026-10-08T16:00:00.000Z";

function definition(overrides = {}) {
  return createTrainingExecutionVariantDefinition({
    id: "tev_spider_static_hold",
    canonicalExerciseId: "spider_curl",
    displayName: "Static Hold",
    createdAt: NOW,
    ...overrides,
  });
}

function errorCode(run) {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(TrainingExecutionVariantError);
    return error.code;
  }
  throw new Error("expected a TrainingExecutionVariantError");
}

describe("Training Execution Variant definitions (Build 92 V1)", () => {
  it("creates a per-exercise definition with an immutable id, Server-normalized key and no timing fields", () => {
    const created = definition({ displayName: "  3-second   pause " });
    expect(created).toEqual({
      id: "tev_spider_static_hold",
      schemaVersion: "training_execution_variant_v1",
      canonicalExerciseId: "spider_curl",
      displayName: "3-Second Pause",
      key: "3_second_pause",
      legacyKeys: [],
      status: "active",
      provenance: "user_created",
      createdAt: NOW,
      updatedAt: NOW,
      retiredAt: null,
    });
    for (const forbidden of ["durationSeconds", "loggingMode", "tempo", "measurement"]) {
      expect(created).not.toHaveProperty(forbidden);
    }
  });

  it("keeps Ordinary as the sentinel and reserves the misfiled Superset family", () => {
    expect(errorCode(() => normalizeTrainingExecutionVariantName("Ordinary"))).toBe("TRAINING_EXECUTION_VARIANT_NAME_RESERVED");
    for (const name of ["Super Set", "superset", "SUPER-SETS"]) {
      expect(errorCode(() => normalizeTrainingExecutionVariantName(name))).toBe("TRAINING_EXECUTION_VARIANT_NAME_RESERVED");
    }
    expect(errorCode(() => normalizeTrainingExecutionVariantName("   "))).toBe("TRAINING_EXECUTION_VARIANT_NAME_REQUIRED");
    expect(errorCode(() => normalizeTrainingExecutionVariantName("x".repeat(41)))).toBe("TRAINING_EXECUTION_VARIANT_NAME_TOO_LONG");
    expect(errorCode(() => definition({ id: "static_hold" }))).toBe("TRAINING_EXECUTION_VARIANT_ID_INVALID");
    expect(errorCode(() => definition({ canonicalExerciseId: " " }))).toBe("TRAINING_EXECUTION_VARIANT_EXERCISE_REQUIRED");
  });

  it("returns the existing identity for a case/whitespace duplicate on the same exercise", () => {
    const existing = definition();
    const plan = planTrainingExecutionVariantCreate({
      definitions: [existing],
      canonicalExerciseId: "spider_curl",
      displayName: "static   HOLD",
      id: "tev_second_attempt",
      now: LATER,
    });
    expect(plan.outcome).toBe("existing");
    expect(plan.definition.id).toBe(existing.id);
  });

  it("allows the same name on another exercise (per-exercise scope, never globally merged)", () => {
    const plan = planTrainingExecutionVariantCreate({
      definitions: [definition()],
      canonicalExerciseId: "pendulum_squat_machine",
      displayName: "Static Hold",
      id: "tev_pendulum_static_hold",
      now: LATER,
    });
    expect(plan.outcome).toBe("created");
    expect(plan.definition).toMatchObject({ id: "tev_pendulum_static_hold", canonicalExerciseId: "pendulum_squat_machine", key: "static_hold" });
  });

  it("reactivates a retired same-exercise definition instead of duplicating it", () => {
    const retired = planTrainingExecutionVariantRetire({ definitions: [definition()], variantId: "tev_spider_static_hold", now: NOW }).definition;
    expect(retired).toMatchObject({ status: "retired", retiredAt: NOW });
    const plan = planTrainingExecutionVariantCreate({
      definitions: [retired],
      canonicalExerciseId: "spider_curl",
      displayName: "Static Hold",
      id: "tev_would_be_duplicate",
      now: LATER,
    });
    expect(plan.outcome).toBe("reactivated");
    expect(plan.definition).toMatchObject({ id: "tev_spider_static_hold", status: "active", retiredAt: null, updatedAt: LATER });
  });

  it("renames without changing identity and keeps the prior key as a legacy alias", () => {
    const renamed = planTrainingExecutionVariantRename({
      definitions: [definition()], variantId: "tev_spider_static_hold", displayName: "Peak Squeeze", now: LATER,
    });
    expect(renamed.outcome).toBe("renamed");
    expect(renamed.definition).toMatchObject({
      id: "tev_spider_static_hold", displayName: "Peak Squeeze", key: "peak_squeeze", legacyKeys: ["static_hold"],
    });
    // A later create of the old name resolves to the same identity.
    const again = planTrainingExecutionVariantCreate({
      definitions: [renamed.definition], canonicalExerciseId: "spider_curl", displayName: "Static Hold", id: "tev_other", now: LATER,
    });
    expect(again).toMatchObject({ outcome: "existing", definition: { id: "tev_spider_static_hold" } });
    // Renaming onto another variant's name is refused.
    const other = definition({ id: "tev_spider_slow_eccentric", displayName: "Slow Eccentric" });
    expect(errorCode(() => planTrainingExecutionVariantRename({
      definitions: [renamed.definition, other], variantId: other.id, displayName: "static hold", now: LATER,
    }))).toBe("TRAINING_EXECUTION_VARIANT_DUPLICATE");
    expect(planTrainingExecutionVariantRename({
      definitions: [other], variantId: other.id, displayName: "Slow Eccentric", now: LATER,
    }).outcome).toBe("unchanged");
  });

  it("retire and reactivate are idempotent and unknown identities are refused", () => {
    const active = definition();
    expect(planTrainingExecutionVariantReactivate({ definitions: [active], variantId: active.id, now: LATER }).outcome).toBe("unchanged");
    const retired = planTrainingExecutionVariantRetire({ definitions: [active], variantId: active.id, now: LATER }).definition;
    expect(planTrainingExecutionVariantRetire({ definitions: [retired], variantId: active.id, now: LATER }).outcome).toBe("unchanged");
    expect(planTrainingExecutionVariantReactivate({ definitions: [retired], variantId: active.id, now: LATER }).definition.status).toBe("active");
    expect(errorCode(() => planTrainingExecutionVariantRetire({ definitions: [], variantId: "tev_missing_one", now: LATER })))
      .toBe("TRAINING_EXECUTION_VARIANT_NOT_FOUND");
  });

  it("projects active choices per exercise only, never a global list and never retired definitions", () => {
    const spider = definition();
    const slow = definition({ id: "tev_spider_slow_eccentric", displayName: "Slow Eccentric" });
    const pendulum = definition({ id: "tev_pendulum_static_hold", canonicalExerciseId: "pendulum_squat_machine" });
    const retired = planTrainingExecutionVariantRetire({
      definitions: [definition({ id: "tev_spider_pause", displayName: "3-Second Pause" })], variantId: "tev_spider_pause", now: LATER,
    }).definition;
    const projection = projectTrainingExecutionVariantChoices([pendulum, slow, retired, spider]);
    expect(Object.keys(projection)).toEqual(["pendulum_squat_machine", "spider_curl"]);
    expect(projection.spider_curl.map((choice) => choice.label)).toEqual(["Slow Eccentric", "Static Hold"]);
    expect(projection.spider_curl[1]).toEqual({
      variantId: "tev_spider_static_hold",
      key: "static_hold",
      label: "Static Hold",
      legacyKeys: [],
      status: "active",
      provenance: "user_created",
      selection: { variantId: "tev_spider_static_hold", key: "static_hold", label: "Static Hold", rawLabel: "Static Hold" },
    });
    expect(projectTrainingExecutionVariantChoices([spider], { canonicalExerciseIds: ["bench_press"] })).toEqual({});
    expect(projectTrainingExecutionVariantChoices([])).toEqual({});
  });

  it("selection payloads stay valid legacy executionVariant shapes and normalization preserves only well-formed ids", () => {
    const selection = createTrainingExecutionVariantSelection(definition());
    expect(normalizeTrainingExecutionVariant(selection)).toEqual(selection);
    expect(getTrainingExecutionVariantKey(selection)).toBe("static_hold");
    expect(normalizeTrainingExecutionVariant({ variantId: "not-an-id", label: "Static Hold" }))
      .toEqual({ key: "static_hold", label: "Static Hold", rawLabel: "Static Hold" });
    expect(normalizeTrainingExecutionVariant("Static Hold"))
      .toEqual({ key: "static_hold", label: "Static Hold", rawLabel: "Static Hold" });
  });
});

describe("Training Execution Variant identity resolver", () => {
  const spider = definition({
    provenance: TRAINING_EXECUTION_VARIANT_PROVENANCE.LEGACY_SEED,
    legacyKeys: ["static_hold"],
  });

  it("is byte-identical to the legacy key partition when no definitions exist", () => {
    for (const value of [null, undefined, "Static Hold", { key: "super_set", label: "Super Set", rawLabel: "super set" }, { key: "ordinary", label: "Ordinary" }]) {
      expect(EMPTY_TRAINING_EXECUTION_VARIANT_RESOLVER.identity(value, "spider_curl")).toBe(getTrainingExecutionVariantKey(value ?? null));
    }
  });

  it("maps legacy key-only history and stable-id selections to the same definition identity", () => {
    const resolver = createTrainingExecutionVariantResolver([spider]);
    expect(resolver.identity({ key: "static_hold", label: "Static Hold", rawLabel: "static hold" }, "spider_curl")).toBe(spider.id);
    expect(resolver.identity(createTrainingExecutionVariantSelection(spider), "spider_curl")).toBe(spider.id);
    expect(resolver.identity(null, "spider_curl")).toBe("ordinary");
  });

  it("never resolves across exercises and keeps unknown history (including Super Set) as its legacy key", () => {
    const resolver = createTrainingExecutionVariantResolver([spider]);
    expect(resolver.identity({ key: "static_hold", label: "Static Hold" }, "pendulum_squat_machine")).toBe("static_hold");
    expect(resolver.identity({ variantId: spider.id, key: "static_hold", label: "Static Hold" }, "pendulum_squat_machine")).toBe("static_hold");
    expect(resolver.identity({ key: "super_set", label: "Super Set", rawLabel: "super set" }, "leg_extension")).toBe("super_set");
  });

  it("keeps renamed and retired definitions resolvable for history", () => {
    const renamed = planTrainingExecutionVariantRename({ definitions: [spider], variantId: spider.id, displayName: "Peak Squeeze", now: LATER }).definition;
    const retired = planTrainingExecutionVariantRetire({ definitions: [renamed], variantId: spider.id, now: LATER }).definition;
    const resolver = createTrainingExecutionVariantResolver([retired]);
    expect(resolver.identity({ key: "static_hold", label: "Static Hold" }, "spider_curl")).toBe(spider.id);
    expect(resolver.identity({ key: "peak_squeeze", label: "Peak Squeeze" }, "spider_curl")).toBe(spider.id);
  });
});

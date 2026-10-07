import {
  normalizeTrainingExecutionVariant,
  ORDINARY_EXECUTION_VARIANT_KEY,
  TRAINING_EXECUTION_VARIANT_ID_PATTERN,
} from "./trainingExecutionVariant.js";

/// Canonical Training Execution Variant definitions (Build 92 V1).
///
/// A definition is a per-canonical-exercise execution-context identity such
/// as "Static Hold" or "3-Second Pause". It inherits the exercise's normal
/// Logger semantics (sets / reps / load); V1 deliberately carries no
/// duration, tempo, or per-variant set schema, and a duration embedded in a
/// label is never treated as measured telemetry.
///
/// Ordinary stays the absent-variant sentinel and is never materialized.
/// Historical occurrences keep their `executionVariant {key,label,rawLabel}`
/// shape unchanged; `createTrainingExecutionVariantResolver` maps them to a
/// definition through its current key or `legacyKeys` at read time, so no
/// evidence is ever rewritten.

export const TRAINING_EXECUTION_VARIANT_COLLECTION = "trainingExecutionVariants";
export const TRAINING_EXECUTION_VARIANT_SCHEMA_VERSION = "training_execution_variant_v1";
export const TRAINING_EXECUTION_VARIANT_DISPLAY_NAME_MAX_LENGTH = 40;

export const TRAINING_EXECUTION_VARIANT_STATUS = Object.freeze({
  ACTIVE: "active",
  RETIRED: "retired",
});

export const TRAINING_EXECUTION_VARIANT_PROVENANCE = Object.freeze({
  SYSTEM: "system",
  USER_CREATED: "user_created",
  LEGACY_SEED: "legacy_seed",
});

// Ordinary is the sentinel, and Superset is relationship context (it was
// historically misfiled as a variant); neither may become a definition.
const RESERVED_VARIANT_KEYS = new Set([
  ORDINARY_EXECUTION_VARIANT_KEY,
  "super_set",
  "super_sets",
  "superset",
  "supersets",
]);

export class TrainingExecutionVariantError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "TrainingExecutionVariantError";
    this.code = code;
    this.details = details;
  }
}

export function isTrainingExecutionVariantId(value) {
  return typeof value === "string" && TRAINING_EXECUTION_VARIANT_ID_PATTERN.test(value);
}

/// Server-owned display-name normalization. Returns the display label and the
/// normalized key used for duplicate detection and legacy compatibility.
export function normalizeTrainingExecutionVariantName(displayName) {
  if (typeof displayName !== "string") {
    throw new TrainingExecutionVariantError(
      "TRAINING_EXECUTION_VARIANT_NAME_REQUIRED",
      "A variant name is required.",
    );
  }
  const normalized = normalizeTrainingExecutionVariant(displayName);
  if (!normalized?.key) {
    throw new TrainingExecutionVariantError(
      "TRAINING_EXECUTION_VARIANT_NAME_REQUIRED",
      "A variant name is required.",
    );
  }
  if (normalized.rawLabel.length > TRAINING_EXECUTION_VARIANT_DISPLAY_NAME_MAX_LENGTH) {
    throw new TrainingExecutionVariantError(
      "TRAINING_EXECUTION_VARIANT_NAME_TOO_LONG",
      `A variant name can be at most ${TRAINING_EXECUTION_VARIANT_DISPLAY_NAME_MAX_LENGTH} characters.`,
    );
  }
  if (RESERVED_VARIANT_KEYS.has(normalized.key)) {
    throw new TrainingExecutionVariantError(
      "TRAINING_EXECUTION_VARIANT_NAME_RESERVED",
      normalized.key === ORDINARY_EXECUTION_VARIANT_KEY
        ? "Ordinary is the default execution and is always available."
        : "Supersets are recorded as an exercise relationship, not an execution variant.",
    );
  }
  return Object.freeze({ displayName: normalized.label, key: normalized.key });
}

export function createTrainingExecutionVariantDefinition({
  id,
  canonicalExerciseId,
  displayName,
  provenance = TRAINING_EXECUTION_VARIANT_PROVENANCE.USER_CREATED,
  legacyKeys = [],
  createdAt,
} = {}) {
  if (!isTrainingExecutionVariantId(id)) {
    throw new TrainingExecutionVariantError("TRAINING_EXECUTION_VARIANT_ID_INVALID", "The variant identity is invalid.");
  }
  const exerciseId = cleanIdentity(canonicalExerciseId);
  if (!exerciseId) {
    throw new TrainingExecutionVariantError(
      "TRAINING_EXECUTION_VARIANT_EXERCISE_REQUIRED",
      "A variant must belong to one canonical exercise.",
    );
  }
  if (!Object.values(TRAINING_EXECUTION_VARIANT_PROVENANCE).includes(provenance)) {
    throw new TrainingExecutionVariantError("TRAINING_EXECUTION_VARIANT_PROVENANCE_INVALID", "The variant provenance is invalid.");
  }
  const name = normalizeTrainingExecutionVariantName(displayName);
  const timestamp = new Date(createdAt ?? Date.now()).toISOString();
  return Object.freeze({
    id,
    schemaVersion: TRAINING_EXECUTION_VARIANT_SCHEMA_VERSION,
    canonicalExerciseId: exerciseId,
    displayName: name.displayName,
    key: name.key,
    // A legacy seed may list its own current key: historical occurrences were
    // recorded under it before the definition existed.
    legacyKeys: Object.freeze(uniqueKeys(legacyKeys)),
    status: TRAINING_EXECUTION_VARIANT_STATUS.ACTIVE,
    provenance,
    createdAt: timestamp,
    updatedAt: timestamp,
    retiredAt: null,
  });
}

/// The same-exercise definition whose current key or any legacy key equals
/// `key`, ignoring `excludeId`. Scope is per exercise: the same name on a
/// different exercise is never a collision.
export function findTrainingExecutionVariantCollision(definitions = [], {
  canonicalExerciseId,
  key,
  excludeId = null,
} = {}) {
  const exerciseId = cleanIdentity(canonicalExerciseId);
  const candidates = listValidDefinitions(definitions)
    .filter((definition) => definition.canonicalExerciseId === exerciseId && definition.id !== excludeId);
  return candidates.find((definition) => definition.key === key) ??
    candidates.find((definition) => definition.legacyKeys.includes(key)) ??
    null;
}

/// create: an active same-exercise collision returns the existing identity;
/// a retired one is reactivated rather than duplicated (Founder D6).
export function planTrainingExecutionVariantCreate({
  definitions = [],
  canonicalExerciseId,
  displayName,
  id,
  provenance = TRAINING_EXECUTION_VARIANT_PROVENANCE.USER_CREATED,
  legacyKeys = [],
  now,
} = {}) {
  const name = normalizeTrainingExecutionVariantName(displayName);
  const collision = findTrainingExecutionVariantCollision(definitions, {
    canonicalExerciseId,
    key: name.key,
  }) ?? uniqueKeys(legacyKeys)
    .map((key) => findTrainingExecutionVariantCollision(definitions, { canonicalExerciseId, key }))
    .find(Boolean) ?? null;
  if (collision) {
    if (collision.status === TRAINING_EXECUTION_VARIANT_STATUS.RETIRED) {
      return Object.freeze({
        outcome: "reactivated",
        previous: collision,
        definition: reactivated(collision, now),
      });
    }
    return Object.freeze({ outcome: "existing", previous: collision, definition: collision });
  }
  return Object.freeze({
    outcome: "created",
    previous: null,
    definition: createTrainingExecutionVariantDefinition({
      id,
      canonicalExerciseId,
      displayName,
      provenance,
      legacyKeys,
      createdAt: now,
    }),
  });
}

/// rename: identity never changes; the prior key is kept in legacyKeys so
/// historical occurrences recorded under it still resolve.
export function planTrainingExecutionVariantRename({ definitions = [], variantId, displayName, now } = {}) {
  const current = requireDefinition(definitions, variantId);
  const name = normalizeTrainingExecutionVariantName(displayName);
  if (name.displayName === current.displayName && name.key === current.key) {
    return Object.freeze({ outcome: "unchanged", previous: current, definition: current });
  }
  const collision = findTrainingExecutionVariantCollision(definitions, {
    canonicalExerciseId: current.canonicalExerciseId,
    key: name.key,
    excludeId: current.id,
  });
  if (collision) {
    throw new TrainingExecutionVariantError(
      "TRAINING_EXECUTION_VARIANT_DUPLICATE",
      `"${name.displayName}" already identifies another variant of this exercise.`,
      { existingVariantId: collision.id, existingDisplayName: collision.displayName },
    );
  }
  const legacyKeys = uniqueKeys([...current.legacyKeys, current.key]).filter((key) => key !== name.key);
  return Object.freeze({
    outcome: "renamed",
    previous: current,
    definition: Object.freeze({
      ...current,
      displayName: name.displayName,
      key: name.key,
      legacyKeys: Object.freeze(legacyKeys),
      updatedAt: timestampOf(now),
    }),
  });
}

/// retire removes the variant from future choices only; history, progression
/// evidence and performance records stay resolvable through its identity.
export function planTrainingExecutionVariantRetire({ definitions = [], variantId, now } = {}) {
  const current = requireDefinition(definitions, variantId);
  if (current.status === TRAINING_EXECUTION_VARIANT_STATUS.RETIRED) {
    return Object.freeze({ outcome: "unchanged", previous: current, definition: current });
  }
  const timestamp = timestampOf(now);
  return Object.freeze({
    outcome: "retired",
    previous: current,
    definition: Object.freeze({
      ...current,
      status: TRAINING_EXECUTION_VARIANT_STATUS.RETIRED,
      retiredAt: timestamp,
      updatedAt: timestamp,
    }),
  });
}

export function planTrainingExecutionVariantReactivate({ definitions = [], variantId, now } = {}) {
  const current = requireDefinition(definitions, variantId);
  if (current.status === TRAINING_EXECUTION_VARIANT_STATUS.ACTIVE) {
    return Object.freeze({ outcome: "unchanged", previous: current, definition: current });
  }
  return Object.freeze({ outcome: "reactivated", previous: current, definition: reactivated(current, now) });
}

/// The payload a client sends back unchanged when the variant is selected;
/// it is also a valid legacy `executionVariant` for older readers.
export function createTrainingExecutionVariantSelection(definition) {
  return Object.freeze({
    variantId: definition.id,
    key: definition.key,
    label: definition.displayName,
    rawLabel: definition.displayName,
  });
}

/// Additive Logger projection: active choices keyed by canonical exercise.
/// Only explicit definitions are selectable; historical freeform variants
/// (including the misfiled legacy "Super Set") never become choices.
export function projectTrainingExecutionVariantChoices(definitions = [], { canonicalExerciseIds = null } = {}) {
  const allowed = canonicalExerciseIds ? new Set(canonicalExerciseIds) : null;
  const grouped = {};
  for (const definition of listValidDefinitions(definitions)) {
    if (definition.status !== TRAINING_EXECUTION_VARIANT_STATUS.ACTIVE) continue;
    if (allowed && !allowed.has(definition.canonicalExerciseId)) continue;
    (grouped[definition.canonicalExerciseId] ??= []).push(definition);
  }
  return Object.freeze(Object.fromEntries(Object.keys(grouped).sort().map((exerciseId) => [
    exerciseId,
    Object.freeze(grouped[exerciseId]
      .sort((left, right) =>
        left.displayName.localeCompare(right.displayName) || left.id.localeCompare(right.id))
      .map((definition) => Object.freeze({
        variantId: definition.id,
        key: definition.key,
        label: definition.displayName,
        legacyKeys: Object.freeze([...definition.legacyKeys]),
        status: definition.status,
        provenance: definition.provenance,
        selection: createTrainingExecutionVariantSelection(definition),
      }))),
  ])));
}

/// The one occurrence -> variant-context resolver:
///   absent / ordinary                 -> "ordinary"
///   variantId of a same-exercise def  -> that definition's id
///   key or legacyKey of a same-exercise def -> that definition's id
///   anything else                     -> the legacy normalized key
/// With no definitions this returns exactly the pre-Build-92 key, so every
/// existing partition is byte-identical until a definition exists.
export function createTrainingExecutionVariantResolver(definitions = []) {
  const valid = listValidDefinitions(definitions)
    .sort((left, right) =>
      String(left.createdAt).localeCompare(String(right.createdAt)) || left.id.localeCompare(right.id));
  const byId = new Map(valid.map((definition) => [definition.id, definition]));
  const byExerciseKey = new Map();
  for (const definition of valid) {
    const slot = `${definition.canonicalExerciseId}|${definition.key}`;
    if (!byExerciseKey.has(slot)) byExerciseKey.set(slot, definition);
  }
  for (const definition of valid) {
    for (const key of definition.legacyKeys) {
      const slot = `${definition.canonicalExerciseId}|${key}`;
      if (!byExerciseKey.has(slot)) byExerciseKey.set(slot, definition);
    }
  }

  function resolve(executionVariant, canonicalExerciseId) {
    const normalized = normalizeTrainingExecutionVariant(executionVariant);
    if (!normalized || normalized.key === ORDINARY_EXECUTION_VARIANT_KEY) {
      return ORDINARY_RESOLUTION;
    }
    const exerciseId = cleanIdentity(canonicalExerciseId);
    const byIdentity = normalized.variantId ? byId.get(normalized.variantId) : null;
    const definition = byIdentity && byIdentity.canonicalExerciseId === exerciseId
      ? byIdentity
      : byExerciseKey.get(`${exerciseId}|${normalized.key}`) ?? null;
    return Object.freeze({
      identity: definition ? definition.id : normalized.key,
      ordinary: false,
      variantId: definition?.id ?? null,
      key: normalized.key,
      definition,
    });
  }

  return Object.freeze({
    hasDefinitions: valid.length > 0,
    resolve,
    identity: (executionVariant, canonicalExerciseId) => resolve(executionVariant, canonicalExerciseId).identity,
    getDefinition: (variantId) => byId.get(variantId) ?? null,
  });
}

export const EMPTY_TRAINING_EXECUTION_VARIANT_RESOLVER = createTrainingExecutionVariantResolver([]);

const ORDINARY_RESOLUTION = Object.freeze({
  identity: ORDINARY_EXECUTION_VARIANT_KEY,
  ordinary: true,
  variantId: null,
  key: ORDINARY_EXECUTION_VARIANT_KEY,
  definition: null,
});

function reactivated(definition, now) {
  return Object.freeze({
    ...definition,
    status: TRAINING_EXECUTION_VARIANT_STATUS.ACTIVE,
    retiredAt: null,
    updatedAt: timestampOf(now),
  });
}

function requireDefinition(definitions, variantId) {
  const definition = listValidDefinitions(definitions).find((item) => item.id === variantId) ?? null;
  if (!definition) {
    throw new TrainingExecutionVariantError(
      "TRAINING_EXECUTION_VARIANT_NOT_FOUND",
      "The execution variant is unavailable.",
    );
  }
  return definition;
}

function listValidDefinitions(definitions) {
  return (definitions ?? [])
    .map((item) => item?.payload ?? item)
    .filter((item) => isTrainingExecutionVariantId(item?.id) && cleanIdentity(item?.canonicalExerciseId) && item?.key)
    .map((item) => ({
      ...item,
      canonicalExerciseId: cleanIdentity(item.canonicalExerciseId),
      displayName: String(item.displayName ?? item.key),
      legacyKeys: Array.isArray(item.legacyKeys) ? item.legacyKeys : [],
      status: item.status === TRAINING_EXECUTION_VARIANT_STATUS.RETIRED
        ? TRAINING_EXECUTION_VARIANT_STATUS.RETIRED
        : TRAINING_EXECUTION_VARIANT_STATUS.ACTIVE,
    }));
}

function uniqueKeys(keys) {
  return [...new Set((keys ?? [])
    .map((key) => normalizeTrainingExecutionVariant(key)?.key)
    .filter((key) => key && !RESERVED_VARIANT_KEYS.has(key)))];
}

function cleanIdentity(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function timestampOf(now) {
  return new Date(now ?? Date.now()).toISOString();
}

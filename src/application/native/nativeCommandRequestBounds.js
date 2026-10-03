import { Phase3Command } from "../commands/Phase3CommandService.js";
import {
  HEALTHKIT_MAX_DAILY_ACTIVITY_KEY_LENGTH,
  HEALTHKIT_MAX_DAILY_ACTIVITY_METRICS,
  HEALTHKIT_MAX_NUMERIC_TEXT_LENGTH,
  HEALTHKIT_MAX_OBSERVATIONS_PER_BATCH,
  HEALTHKIT_MAX_RING_COMPLETION_METRICS,
  HEALTHKIT_MAX_TEXT_LENGTH,
  HEALTHKIT_MAX_TIMESTAMP_LENGTH,
} from "../../domain/services/HealthKitObservationService.js";
import {
  HEALTHKIT_SLEEP_MAX_DELETIONS_PER_BATCH,
  HEALTHKIT_SLEEP_MAX_EXTERNAL_ID_LENGTH,
  HEALTHKIT_SLEEP_MAX_MANIFEST_LIVE_IDS,
  HEALTHKIT_SLEEP_MAX_SAMPLES_PER_BATCH,
  HEALTHKIT_SLEEP_MAX_TEXT_LENGTH,
  HEALTHKIT_SLEEP_MAX_TIMESTAMP_LENGTH,
  SLEEP_DELETION_WIRE_FIELDS,
  SLEEP_MANIFEST_WIRE_FIELDS,
  SLEEP_SAMPLE_WIRE_FIELDS,
} from "../../domain/services/HealthKitSleepContract.js";

/**
 * HTTP request-body bounds for POST /api/v1/native/commands.
 *
 * The command type lives inside the JSON body, so it is known only after the
 * (already size-bounded) body is parsed. Every command therefore keeps the
 * historical 4 KiB bound except commands that declare an override here. The
 * route reads at most the largest declared bound, parses once, and then
 * enforces the bound of the command that was actually named.
 */
export const NATIVE_COMMAND_DEFAULT_MAXIMUM_REQUEST_BYTES = 4 * 1024;

/**
 * Maximum HTTP body for healthkit.observations.ingest.v1 (healthkit-ingestion-v1).
 *
 * This is deliberately a fixed, reviewed constant rather than a computed value.
 * computeHealthKitIngestMaximumRequestBytes() derives the largest body the
 * frozen contract can produce (about 4.5 MiB, deliberately pessimistic: every
 * bounded field at its maximum and fully escaped). NativeCommandRequestBounds.test.js
 * fails if this constant is smaller than that derivation (a legitimate batch
 * would be rejected) or more than 15% larger (silent loosening). A realistic
 * 100-observation Activity batch is about 58 KB.
 */
export const HEALTHKIT_INGEST_MAXIMUM_REQUEST_BYTES = 5 * 1024 * 1024;

/**
 * Maximum HTTP body for healthkit.sleep.ingest.v1 (healthkit-sleep-ingestion-v1).
 * Reviewed constant; NativeCommandRequestBounds.test.js checks it against
 * computeHealthKitSleepIngestMaximumRequestBytes() the same way (about 1.4 MiB,
 * deliberately pessimistic). A realistic 100-sample Sleep batch is about 35 KB.
 */
export const HEALTHKIT_SLEEP_INGEST_MAXIMUM_REQUEST_BYTES = 1.5 * 1024 * 1024;

/**
 * Maximum HTTP body for training-session.commit.v1 (the Logger workout commit).
 *
 * Under the historical 4 KiB default a structured workout of roughly 25-30 sets
 * was refused with 413 (a 13-set Native workout is about 2-3 KB). Unlike the
 * HealthKit contracts, the Server declares no count or length maxima for this
 * payload: Phase3CommandService only requires a non-empty `exercises` array,
 * and createNativeTrainingPackage requires at least one set per exercise,
 * finite reps/duration/load, an enumerated loadType/unit, and supersets of at
 * least two occurrences of the same session. A contract-maximum derivation is
 * therefore impossible, so this reviewed constant is instead checked against
 * computeTrainingSessionCommitReviewedMaximumRequestBytes(): a pessimistic
 * encoding of TRAINING_SESSION_COMMIT_REVIEWED_MAXIMUM, a 24-exercise,
 * 120-set workout (about twice the largest realistic session) with every
 * optional field present (about 54 KB). NativeCommandRequestBounds.test.js
 * fails if this constant is below that derivation or more than 25% above it.
 * Realistic Native workouts encode at about 140 bytes per set: 40 sets is
 * about 6 KB (refused under 4 KiB), 80 sets about 12 KB.
 */
export const TRAINING_SESSION_COMMIT_MAXIMUM_REQUEST_BYTES = 64 * 1024;

const COMMAND_MAXIMUM_REQUEST_BYTES = Object.freeze({
  [Phase3Command.COMMIT_TRAINING_SESSION]: TRAINING_SESSION_COMMIT_MAXIMUM_REQUEST_BYTES,
  [Phase3Command.INGEST_HEALTHKIT_OBSERVATIONS]: HEALTHKIT_INGEST_MAXIMUM_REQUEST_BYTES,
  [Phase3Command.INGEST_HEALTHKIT_SLEEP]: HEALTHKIT_SLEEP_INGEST_MAXIMUM_REQUEST_BYTES,
  // Samples-only subset of the Sleep request, so the same reviewed bound covers it.
  [Phase3Command.INGEST_HEALTHKIT_SLEEP_HISTORICAL_VALIDATION]: HEALTHKIT_SLEEP_INGEST_MAXIMUM_REQUEST_BYTES,
  [Phase3Command.INGEST_HEALTHKIT_SLEEP_HISTORICAL_EVIDENCE]: HEALTHKIT_SLEEP_INGEST_MAXIMUM_REQUEST_BYTES,
});

/** Largest body the route will buffer before it knows the command type. */
export const NATIVE_COMMAND_MAXIMUM_REQUEST_CEILING_BYTES = Math.max(
  NATIVE_COMMAND_DEFAULT_MAXIMUM_REQUEST_BYTES,
  ...Object.values(COMMAND_MAXIMUM_REQUEST_BYTES)
);

export function resolveNativeCommandMaximumRequestBytes(commandType) {
  return typeof commandType === "string" && Object.hasOwn(COMMAND_MAXIMUM_REQUEST_BYTES, commandType)
    ? COMMAND_MAXIMUM_REQUEST_BYTES[commandType]
    : NATIVE_COMMAND_DEFAULT_MAXIMUM_REQUEST_BYTES;
}

/**
 * Body-size resolver for readBoundedJsonRequest. `body` is the parsed JSON, or
 * undefined when the body is not a JSON object; either way an unknown command
 * gets the default bound, so malformed or unrelated requests are unaffected.
 */
export function nativeCommandRequestMaximumBytes(body) {
  return resolveNativeCommandMaximumRequestBytes(body?.commandType);
}

/**
 * Every field healthkit-ingestion-v1 reads from an observation, with the kind
 * of value the derivation sizes it as. The derivation is built only from this
 * table, and NativeCommandRequestBounds.test.js fails if the normalizer reads
 * a property that is not listed, so a new accepted field cannot be added
 * without the request bound accounting for it.
 *
 *   text       bounded string, HEALTHKIT_MAX_TEXT_LENGTH code units
 *   timestamp  bounded string, HEALTHKIT_MAX_TIMESTAMP_LENGTH code units
 *   numeric    number or numeric string, HEALTHKIT_MAX_NUMERIC_TEXT_LENGTH units
 *   metrics    the bounded dailyActivity metric map
 *   boolean    a literal `true`/`false`; any other value is treated as absent
 *              (never guessed), so it can never be padded beyond its own
 *              fixed-length literal encoding
 *   { exact }  compared exactly and never trimmed, so it cannot be padded
 */
export const HEALTHKIT_OBSERVATION_WIRE_FIELDS = Object.freeze({
  observation: Object.freeze({ observationType: "text", externalId: "text", ingestionPurpose: "text" }),
  source: Object.freeze({
    bundleIdentifier: "text", sourceName: "text", sourceRevision: "text", productType: "text",
    deviceModel: "text", operatingSystemVersion: "text", privacySafeDeviceProvenance: "text",
  }),
  occurrence: Object.freeze({
    localDate: "text", timeZone: "text", utcOffsetSeconds: "numeric",
    startedAt: "timestamp", endedAt: "timestamp",
  }),
  // The observation shapes are alternatives; one is present per observation.
  activitySummary: Object.freeze({
    aggregationScope: Object.freeze({ exact: "daily_total_including_workouts" }),
    coverage: "text", sourceRevision: "numeric", dailyActivity: "metrics",
  }),
  nutritionDailyTotal: Object.freeze({
    aggregationScope: Object.freeze({ exact: "daily_total_all_sources" }),
    coverage: "text", sourceRevision: "numeric", dailyNutrition: "metrics",
  }),
  workout: Object.freeze({
    activityType: "text", durationSeconds: "numeric", activeCalories: "numeric", totalCalories: "numeric",
    distance: "numeric", distanceUnit: "text", averageHeartRate: "numeric", sourceRevision: "numeric",
    isIndoorWorkout: "boolean", physiqueOSSessionId: "text",
  }),
  quantitySample: Object.freeze({
    sampleType: "text", value: "numeric", unit: "text", workoutExternalId: "text",
  }),
});

const ALTERNATIVE_SHAPES = Object.freeze(["activitySummary", "nutritionDailyTotal", "workout", "quantitySample"]);

// Worst-case JSON encoding of one UTF-16 code unit is a six-byte \uXXXX escape
// (for example a control character or \v padding that trim() removes).
const CONTROL_UNIT = "\u0001";
// commandType, the request metadata object (commandId, idempotencyKey up to
// 200 characters, correlationId up to 128, expectedVersion, payloadVersion,
// clientOccurredAt, clientTimeZone, canonicalStoreEpoch) and envelope
// punctuation. Canonical Native metadata is under 1 KiB.
const WORST_CASE_ENVELOPE_BYTES = 4 * 1024;

/**
 * Largest JSON body a valid healthkit-ingestion-v1 request can occupy:
 * HEALTHKIT_MAX_OBSERVATIONS_PER_BATCH observations, each at the maximum of the
 * three observation shapes, with every bounded string at its maximum length
 * fully escaped, plus the command envelope. Properties the contract does not
 * define are ignored by validation and are not part of a valid request.
 *
 * This is the maximum over canonical JSON encodings of valid values. A body
 * padded with non-canonical encodings (needless array nesting around a scalar,
 * or long digit runs in a number literal) cannot be bounded by validation,
 * because parsing discards the literal's length, so the HTTP bound is what
 * rejects it. That is intentional: such a request is not one Native produces.
 */
export function computeHealthKitIngestMaximumRequestBytes() {
  const units = (count) => CONTROL_UNIT.repeat(count);
  const metricKey = (index) => `${String(index).padStart(2, "0")}${units(HEALTHKIT_MAX_DAILY_ACTIVITY_KEY_LENGTH - 2)}`;
  const metrics = () => Object.fromEntries([
    ...Array.from({ length: HEALTHKIT_MAX_DAILY_ACTIVITY_METRICS - 1 }, (_, index) =>
      [metricKey(index), units(HEALTHKIT_MAX_NUMERIC_TEXT_LENGTH)]),
    ["ring_completion", Object.fromEntries(
      Array.from({ length: HEALTHKIT_MAX_RING_COMPLETION_METRICS }, (_, index) =>
        [metricKey(index), units(HEALTHKIT_MAX_NUMERIC_TEXT_LENGTH)])
    )],
  ]);
  const valueOf = (kind) => {
    if (kind === "text") return units(HEALTHKIT_MAX_TEXT_LENGTH);
    if (kind === "timestamp") return units(HEALTHKIT_MAX_TIMESTAMP_LENGTH);
    if (kind === "numeric") return units(HEALTHKIT_MAX_NUMERIC_TEXT_LENGTH);
    if (kind === "metrics") return metrics();
    if (kind === "boolean") return false; // "false" (5 bytes) is the longer of the two literals.
    if (typeof kind?.exact === "string") return kind.exact;
    throw new Error(`Unknown HealthKit wire field kind: ${JSON.stringify(kind)}`);
  };
  const section = (fields) => Object.fromEntries(Object.entries(fields).map(([name, kind]) => [name, valueOf(kind)]));
  const encodedBytes = (value) => JSON.stringify(value).length; // ASCII-only after escaping

  const common = {
    ...section(HEALTHKIT_OBSERVATION_WIRE_FIELDS.observation),
    source: section(HEALTHKIT_OBSERVATION_WIRE_FIELDS.source),
    occurrence: section(HEALTHKIT_OBSERVATION_WIRE_FIELDS.occurrence),
  };
  const largestObservation = Math.max(...ALTERNATIVE_SHAPES.map((shape) =>
    encodedBytes({ ...common, [shape]: section(HEALTHKIT_OBSERVATION_WIRE_FIELDS[shape]) })));
  const batch = encodedBytes({ batchId: units(HEALTHKIT_MAX_TEXT_LENGTH), observations: [] }) - "[]".length;
  return WORST_CASE_ENVELOPE_BYTES +
    batch +
    HEALTHKIT_MAX_OBSERVATIONS_PER_BATCH * largestObservation +
    (HEALTHKIT_MAX_OBSERVATIONS_PER_BATCH - 1) + // array commas
    "[]".length;
}

/**
 * Largest JSON body a valid healthkit-sleep-ingestion-v1 request can occupy:
 * the maximum samples, deletions and manifest identifiers, every bounded
 * string at its maximum length fully escaped, plus the command envelope.
 * Built only from the Sleep wire-field tables, like the observation bound.
 */
export function computeHealthKitSleepIngestMaximumRequestBytes() {
  const units = (count) => CONTROL_UNIT.repeat(count);
  const valueOf = (kind) => {
    if (kind === "text") return units(HEALTHKIT_SLEEP_MAX_TEXT_LENGTH);
    if (kind === "timestamp") return units(HEALTHKIT_SLEEP_MAX_TIMESTAMP_LENGTH);
    // A UUID is validated against a fixed ASCII pattern after trimming, but
    // the raw value may carry up to the bounded length of whitespace padding.
    if (kind === "external_id") return units(HEALTHKIT_SLEEP_MAX_EXTERNAL_ID_LENGTH);
    if (kind === "integer") return 1000;
    if (kind === "boolean") return false;
    if (kind === "external_id_list") {
      return Array.from({ length: HEALTHKIT_SLEEP_MAX_MANIFEST_LIVE_IDS }, () => units(HEALTHKIT_SLEEP_MAX_EXTERNAL_ID_LENGTH));
    }
    throw new Error(`Unknown HealthKit Sleep wire field kind: ${JSON.stringify(kind)}`);
  };
  const section = (fields) => Object.fromEntries(Object.entries(fields).map(([name, kind]) => [name, valueOf(kind)]));
  const encodedBytes = (value) => JSON.stringify(value).length;
  const sample = { ...section(SLEEP_SAMPLE_WIRE_FIELDS.sample), source: section(SLEEP_SAMPLE_WIRE_FIELDS.source) };
  const deletion = section(SLEEP_DELETION_WIRE_FIELDS);
  return WORST_CASE_ENVELOPE_BYTES + encodedBytes({
    batchId: units(HEALTHKIT_SLEEP_MAX_TEXT_LENGTH),
    samples: Array.from({ length: HEALTHKIT_SLEEP_MAX_SAMPLES_PER_BATCH }, () => sample),
    deletions: Array.from({ length: HEALTHKIT_SLEEP_MAX_DELETIONS_PER_BATCH }, () => deletion),
    windowManifest: section(SLEEP_MANIFEST_WIRE_FIELDS),
  });
}

/**
 * The reviewed realistic-maximum Logger workout the training-session.commit.v1
 * bound is derived from. These are review limits for the HTTP bound, not
 * validation rules: the Server does not reject a workout that exceeds them,
 * only a body larger than TRAINING_SESSION_COMMIT_MAXIMUM_REQUEST_BYTES.
 *
 *   exercises / sets             a very long session, about twice a realistic
 *                                maximum (10-12 exercises, 50-60 sets)
 *   supersetGroups / members     every exercise paired into a superset
 *   identifierLength             Native UUID().uuidString session, occurrence
 *                                and set ids
 *   numericLiteralLength         the longest shortest-round-trip Double literal
 *                                Swift's JSONEncoder emits (-1.2345678901234567e-300)
 *   exerciseNameLength,          Founder-typed text, sized at three UTF-8 bytes
 *   variantTextLength            per UTF-16 unit (non-ASCII; Swift's encoder
 *                                does not \u-escape it)
 */
export const TRAINING_SESSION_COMMIT_REVIEWED_MAXIMUM = Object.freeze({
  exercises: 24,
  sets: 120,
  supersetGroups: 12,
  membersPerSuperset: 2,
  identifierLength: 36,
  supersetIdLength: 64,
  canonicalExerciseIdLength: 96,
  exerciseNameLength: 96,
  muscleGroupIdLength: 48,
  variantTextLength: 48,
  reviewIdLength: 128,
  timestampLength: 32,
  numericLiteralLength: 24,
});

/**
 * Encoded size of TRAINING_SESSION_COMMIT_REVIEWED_MAXIMUM, deliberately
 * pessimistic: every exercise carries BOTH a canonical id and a provisional
 * exercise (Native sends one or the other), an execution variant, and every
 * set carries reps, duration and load at the longest numeric literal with the
 * longest loadType/unit, plus the same 4 KiB command envelope allowance the
 * HealthKit derivations use.
 */
export function computeTrainingSessionCommitReviewedMaximumRequestBytes(
  maximum = TRAINING_SESSION_COMMIT_REVIEWED_MAXIMUM,
) {
  const ascii = (count) => "a".repeat(count);
  const wide = (count) => "€".repeat(count); // U+20AC: three UTF-8 bytes
  const numeric = -1.2345678901234567e-300;
  if (JSON.stringify(numeric).length < maximum.numericLiteralLength) {
    throw new Error("The pessimistic numeric literal is shorter than the reviewed length.");
  }
  const set = {
    setId: ascii(maximum.identifierLength),
    reps: numeric,
    durationSeconds: numeric,
    load: numeric,
    loadType: "external_load",
    unit: "bodyweight",
  };
  const exerciseWithSets = (setCount) => ({
    canonicalExerciseId: ascii(maximum.canonicalExerciseIdLength),
    provisionalExercise: {
      name: wide(maximum.exerciseNameLength),
      primaryMuscleGroupId: ascii(maximum.muscleGroupIdLength),
    },
    occurrenceId: ascii(maximum.identifierLength),
    executionVariant: {
      key: ascii(maximum.variantTextLength),
      label: wide(maximum.variantTextLength),
      rawLabel: wide(maximum.variantTextLength),
    },
    sets: Array.from({ length: setCount }, () => set),
  });
  // Every exercise has at least one set; the remainder goes to the first.
  const baseSets = Math.floor(maximum.sets / maximum.exercises);
  const exercises = Array.from({ length: maximum.exercises }, (_, index) =>
    exerciseWithSets(baseSets + (index === 0 ? maximum.sets - baseSets * maximum.exercises : 0)));
  const payload = {
    sessionId: ascii(maximum.identifierLength),
    localDate: "2026-10-02",
    mode: "retrospective",
    startedAt: ascii(maximum.timestampLength),
    finishedAt: ascii(maximum.timestampLength),
    exercises,
    supersets: Array.from({ length: maximum.supersetGroups }, () => ({
      id: ascii(maximum.supersetIdLength),
      memberExerciseIds: Array.from({ length: maximum.membersPerSuperset }, () => ascii(maximum.identifierLength)),
    })),
    supportingEvidenceReviewId: ascii(maximum.reviewIdLength),
    supportingEvidenceReviewVersion: Number.MAX_SAFE_INTEGER,
  };
  return WORST_CASE_ENVELOPE_BYTES + new TextEncoder().encode(JSON.stringify({ payload })).length;
}

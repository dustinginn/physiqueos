import { createHash } from "node:crypto";
import { HEALTHKIT_OBSERVATION_ID_PREFIX, createHealthKitQuarantinedEligibility } from "./HealthKitEvidenceEligibilityPolicy.js";
import { isStrengthWorkout } from "./HealthKitObservationService.js";

// Dormant canonical Apple workout records.
//
//   HKWorkout observation -> canonical Apple workout / telemetry record
//     -> (separate) link candidate to a PhysiqueOS Logger session
//     -> (separate) Evidence eligibility -> V3 only after explicit authorization.
//
// One record per SOURCE workout, stored in the application-only
// `healthKitCanonicalWorkouts` collection. It carries Apple telemetry only. It
// never carries exercises, sets, reps, or load: the Workout Logger stays the
// sole authority for training content, and nothing here reads or writes it.

export const HEALTHKIT_CANONICAL_WORKOUT_SCHEMA_VERSION = "healthkit-canonical-workout-v1";
export const HEALTHKIT_CANONICAL_WORKOUT_COLLECTION = "healthKitCanonicalWorkouts";
export const HEALTHKIT_CANONICAL_WORKOUT_ID_PREFIX = "healthkit_canonical_workout_";

export const HealthKitWorkoutFamily = Object.freeze({
  STRENGTH: "strength",
  CARDIO: "cardio",
  UNSUPPORTED: "unsupported",
});

// The only workout types this foundation canonicalizes. Native sends the
// numeric HKWorkoutActivityType raw value; display names are accepted for the
// same types. Anything else stays a raw source observation, never guessed.
//   strength: traditionalStrengthTraining (50), functionalStrengthTraining (20)
//   cardio:   walking (52), running (37), cycling (13), the types PhysiqueOS
//             already models as cardio today (Apple Fitness walks, Voice run/walk/cycling)
const NUMERIC_TYPES = Object.freeze({
  50: { family: HealthKitWorkoutFamily.STRENGTH, canonicalType: "traditional_strength_training" },
  20: { family: HealthKitWorkoutFamily.STRENGTH, canonicalType: "functional_strength_training" },
  52: { family: HealthKitWorkoutFamily.CARDIO, canonicalType: "walking" },
  37: { family: HealthKitWorkoutFamily.CARDIO, canonicalType: "running" },
  13: { family: HealthKitWorkoutFamily.CARDIO, canonicalType: "cycling" },
});

// Apple uses the SAME raw HKWorkoutActivityType value for the indoor and
// outdoor variant of a given cardio activity (e.g. "52" is walking whether
// Indoor Walk or Outdoor Walk); the two are only distinguished by a separate
// boolean, `HKMetadataKeyIndoorWorkout`. Only the cardio canonical types below
// have a location-specific variant. This table is the one place that variant
// naming lives, so it stays consistent with this codebase's existing
// snake_case canonicalType convention (see `traditional_strength_training`).
const CARDIO_LOCATION_VARIANTS = Object.freeze({
  walking: Object.freeze({ indoor: "indoor_walking", outdoor: "outdoor_walking" }),
  running: Object.freeze({ indoor: "indoor_running", outdoor: "outdoor_running" }),
  cycling: Object.freeze({ indoor: "indoor_cycling", outdoor: "outdoor_cycling" }),
});

/**
 * Classify a raw Apple workout activity type into { family, canonicalType }.
 *
 * `isIndoorWorkout` is the explicit, optional Apple signal (true = indoor,
 * false = outdoor, null/omitted = unknown) -- read directly from
 * `HKMetadataKeyIndoorWorkout` upstream and NEVER inferred from GPS,
 * distance, speed, or date. It only ever specializes a cardio canonicalType
 * that already has a location variant (walking/running/cycling); it can
 * never change `family`, and it never affects a non-cardio or unsupported
 * type. An unknown/omitted signal always keeps the generic canonicalType
 * exactly as classified today -- this is the case every currently-stored
 * historical workout (and any future workout Apple never tags) falls into,
 * and it is never guessed toward indoor or outdoor.
 */
export function classifyHealthKitWorkoutType(activityType, { isIndoorWorkout = null } = {}) {
  const base = classifyHealthKitWorkoutFamilyAndType(activityType);
  if (typeof isIndoorWorkout !== "boolean") return base;
  const variant = base.family === HealthKitWorkoutFamily.CARDIO
    ? CARDIO_LOCATION_VARIANTS[base.canonicalType]
    : null;
  if (!variant) return base;
  return Object.freeze({
    ...base,
    canonicalType: isIndoorWorkout ? variant.indoor : variant.outdoor,
    locationBasis: "explicit_indoor_workout_metadata",
  });
}

// The raw family/canonicalType mapping table, unaware of indoor/outdoor.
// `classifyHealthKitWorkoutType` above is the only caller; keeping this
// separate means the indoor/outdoor overlay composes with it instead of
// duplicating (or being tangled into) the family-mapping table itself.
function classifyHealthKitWorkoutFamilyAndType(activityType) {
  const text = String(activityType ?? "").trim();
  if (Object.hasOwn(NUMERIC_TYPES, text)) {
    return Object.freeze({ ...NUMERIC_TYPES[text], appleActivityType: text, basis: "numeric_raw_value" });
  }
  const lower = text.toLowerCase();
  if (/^\d+$/.test(lower)) {
    return Object.freeze({ family: HealthKitWorkoutFamily.UNSUPPORTED, canonicalType: null, appleActivityType: text, basis: "numeric_raw_value" });
  }
  if (isStrengthWorkout(text)) {
    return Object.freeze({
      family: HealthKitWorkoutFamily.STRENGTH,
      canonicalType: /functional/.test(lower) ? "functional_strength_training" : "traditional_strength_training",
      appleActivityType: text,
      basis: "display_name",
    });
  }
  const cardio = /\b(walk|walking)\b/.test(lower) ? "walking"
    : /\b(run|running|jog|jogging)\b/.test(lower) ? "running"
      : /\b(cycl|cycling|bike|biking)/.test(lower) ? "cycling" : null;
  if (cardio) {
    return Object.freeze({ family: HealthKitWorkoutFamily.CARDIO, canonicalType: cardio, appleActivityType: text, basis: "display_name" });
  }
  return Object.freeze({ family: HealthKitWorkoutFamily.UNSUPPORTED, canonicalType: null, appleActivityType: text, basis: "display_name" });
}

/**
 * The workout's effective local date comes from its own start instant in its
 * own time zone. The client's label and the ingestion time never decide it.
 */
export function deriveHealthKitWorkoutLocalDate({ startedAt, timeZone } = {}) {
  const instant = Date.parse(String(startedAt ?? ""));
  if (!Number.isFinite(instant)) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date(instant));
    const pick = (type) => parts.find((part) => part.type === type)?.value;
    return `${pick("year")}-${pick("month")}-${pick("day")}`;
  } catch {
    return null;
  }
}

/**
 * Normalize a Logger / Evidence workout time to an absolute instant, using the
 * Apple workout's own time zone for anything that carries no offset. Real
 * Evidence times arrive as offset ISO instants, timezone-naive ISO strings,
 * bare wall times ("07:38:00", "07:45") and meridiem times ("7:38 AM"); the
 * shared duplicate service would otherwise compare an instant with a
 * minute-of-day. Returns an ISO instant or null when the value is not usable.
 */
export function normalizeWorkoutTimeToInstant(value, { dateKey = null, timeZone } = {}) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim();
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(text) && Number.isFinite(Date.parse(text))) {
    return new Date(Date.parse(text)).toISOString();
  }
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/);
  let year; let month; let day; let hours; let minutes; let seconds;
  if (match) {
    [year, month, day, hours, minutes] = [match[1], match[2], match[3], match[4], match[5]].map(Number);
    seconds = Number(match[6] ?? 0);
  } else {
    match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i);
    if (!match || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey ?? ""))) return null;
    [year, month, day] = String(dateKey).split("-").map(Number);
    hours = Number(match[1]);
    minutes = Number(match[2]);
    seconds = Number(match[3] ?? 0);
    const meridiem = match[4]?.toLowerCase();
    if (meridiem === "pm" && hours < 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;
  }
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  const instant = wallTimeToInstant({ year, month, day, hours, minutes, seconds }, timeZone);
  return instant === null ? null : new Date(instant).toISOString();
}

function wallTimeToInstant({ year, month, day, hours, minutes, seconds }, timeZone) {
  try {
    const guess = Date.UTC(year, month - 1, day, hours, minutes, seconds);
    const offsetAt = (instant) => {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      }).formatToParts(new Date(instant));
      const pick = (type) => Number(parts.find((part) => part.type === type)?.value);
      return Date.UTC(pick("year"), pick("month") - 1, pick("day"), pick("hour"), pick("minute"), pick("second")) - instant;
    };
    const first = guess - offsetAt(guess);
    const second = guess - offsetAt(first);
    return second;
  } catch {
    return null;
  }
}

/**
 * Stable canonical id of the SOURCE workout. It is a hash of the source bundle
 * and the immutable HealthKit workout identity, so the private HealthKit UUID
 * is never stored in the id, and every revision of the same source workout
 * resolves to the same record.
 */
export function getHealthKitCanonicalWorkoutIdForSource({ bundleIdentifier, externalId }) {
  const digest = createHash("sha256")
    .update([bundleIdentifier, "workout", externalId].join("\u0000"))
    .digest("hex")
    .slice(0, 40);
  return `${HEALTHKIT_CANONICAL_WORKOUT_ID_PREFIX}${digest}`;
}

export function getHealthKitCanonicalWorkoutRecordId(observation) {
  return getHealthKitCanonicalWorkoutIdForSource({
    bundleIdentifier: observation.source.bundleIdentifier,
    externalId: observation.externalId,
  });
}

/**
 * Reconcile one workout observation into its canonical Apple workout record.
 * Pure. Actions: create | update | replay | superseded.
 * Precedence between revisions of one source workout is the observed source
 * revision (a missing revision is 1); an older revision never displaces a newer.
 */
export function reconcileHealthKitCanonicalWorkout({
  observation,
  existing = null,
  ownerUserId,
  now,
  activation = null,
} = {}) {
  if (observation?.observationType !== "workout") {
    throw new TypeError("Only a HealthKit workout observation can canonicalize to a workout.");
  }
  const at = new Date(now).toISOString();
  const classification = classifyHealthKitWorkoutType(observation.measurement.activityType, {
    isIndoorWorkout: typeof observation.measurement.isIndoorWorkout === "boolean"
      ? observation.measurement.isIndoorWorkout
      : null,
  });
  const incoming = snapshotOf(observation, classification);
  const id = getHealthKitCanonicalWorkoutRecordId(observation);

  if (!existing) {
    return Object.freeze({ action: "create", reason: "first_canonical_revision", record: buildRecord({
      id, ownerUserId, at, activation, current: incoming, revision: 1, priorFingerprint: null, history: [],
      sourceObservationIds: [observation.id], createdAt: at,
    }) });
  }
  if ((existing.provenance?.sourceObservationIds ?? []).includes(observation.id)) {
    return Object.freeze({ action: "replay", reason: "source_observation_already_applied", record: existing });
  }
  const order = Number(incoming.sourceRevision) - Number(existing.current.sourceRevision);
  if (order <= 0) {
    return Object.freeze({
      action: "superseded",
      reason: order < 0 ? "newer_source_revision_already_canonical" : "equal_source_revision_kept_existing",
      record: existing,
    });
  }
  const nextFingerprint = fingerprintOf(incoming);
  const semanticChanged = nextFingerprint !== existing.semanticFingerprint;
  const history = semanticChanged
    ? [...(existing.revisionHistory ?? []), {
      revision: existing.revision,
      semanticFingerprint: existing.semanticFingerprint,
      sourceRevision: existing.current.sourceRevision,
      sourceObservationId: existing.current.sourceObservationId,
      telemetry: structuredClone(existing.current.telemetry),
      replacedAt: at,
    }]
    : [...(existing.revisionHistory ?? [])];
  return Object.freeze({
    action: "update",
    reason: "newer_source_revision",
    record: buildRecord({
      id, ownerUserId, at, activation, current: incoming,
      revision: semanticChanged ? Number(existing.revision) + 1 : Number(existing.revision),
      priorFingerprint: semanticChanged ? existing.semanticFingerprint : existing.priorSemanticFingerprint ?? null,
      history,
      sourceObservationIds: [...(existing.provenance?.sourceObservationIds ?? []), observation.id],
      createdAt: existing.createdAt ?? at,
      linkAssessment: existing.linkAssessment ?? null,
      coexistence: existing.coexistence ?? null,
    }),
  });
}

/**
 * Workout energy is already inside Apple's daily active-energy total. This is
 * the one place a daily figure and workouts meet, and it never adds them.
 */
export function composeDailyActiveEnergyWithWorkouts({ dailyMoveCalories, canonicalWorkouts = [] } = {}) {
  return Object.freeze({
    activeEnergy: Number.isFinite(Number(dailyMoveCalories)) ? Number(dailyMoveCalories) : null,
    workoutEnergyIncludedInDailyTotal: canonicalWorkouts.reduce(
      (sum, workout) => sum + (Number(workout?.current?.telemetry?.activeCalories) || 0), 0),
    workoutEnergyAdded: 0,
    policy: "workout_energy_is_descriptive_never_additive",
  });
}

export function isHealthKitCanonicalWorkoutRecord(record) {
  return String(record?.id ?? "").startsWith(HEALTHKIT_CANONICAL_WORKOUT_ID_PREFIX);
}

function snapshotOf(observation, classification) {
  const m = observation.measurement;
  const derived = deriveHealthKitWorkoutLocalDate({
    startedAt: observation.occurrence.startedAt,
    timeZone: observation.occurrence.timeZone,
  });
  const localDate = derived ?? observation.occurrence.localDate;
  return {
    sourceObservationId: observation.id,
    sourceRevision: m.sourceRevision ?? 1,
    family: classification.family,
    canonicalType: classification.canonicalType,
    appleActivityType: classification.appleActivityType,
    localDate,
    localDateBasis: derived ? "workout_start_in_workout_time_zone" : "client_local_date_unverified",
    clientLocalDate: observation.occurrence.localDate,
    localDateCorrected: Boolean(derived) && derived !== observation.occurrence.localDate,
    timeZone: observation.occurrence.timeZone,
    startedAt: observation.occurrence.startedAt,
    endedAt: observation.occurrence.endedAt ?? null,
    // Apple telemetry only: no exercises, sets, reps, or load, ever.
    telemetry: {
      durationSeconds: m.durationSeconds ?? null,
      activeCalories: m.activeCalories ?? null,
      totalCalories: m.totalCalories ?? null,
      distance: m.distance ?? null,
      distanceUnit: m.distanceUnit ?? null,
      averageHeartRate: m.averageHeartRate ?? null,
    },
    source: {
      bundleIdentifier: observation.source.bundleIdentifier,
      sourceName: observation.source.sourceName ?? null,
      productType: observation.source.productType ?? null,
      deliveryDeviceId: observation.ingestion.deliveryDeviceId,
    },
  };
}

function fingerprintOf(snapshot) {
  const semantic = {
    family: snapshot.family, canonicalType: snapshot.canonicalType, appleActivityType: snapshot.appleActivityType,
    localDate: snapshot.localDate, startedAt: snapshot.startedAt, endedAt: snapshot.endedAt, telemetry: snapshot.telemetry,
  };
  return `sha256_${createHash("sha256").update(stable(semantic)).digest("hex")}`;
}

function buildRecord({
  id, ownerUserId, at, activation, current, revision, priorFingerprint, history, sourceObservationIds, createdAt,
  linkAssessment = null,
  coexistence = null,
}) {
  return Object.freeze({
    schemaVersion: HEALTHKIT_CANONICAL_WORKOUT_SCHEMA_VERSION,
    id,
    userId: ownerUserId,
    localDate: current.localDate,
    revision,
    semanticFingerprint: fingerprintOf(current),
    priorSemanticFingerprint: priorFingerprint,
    current,
    revisionHistory: history,
    provenance: {
      sourceObservationIds,
      currentSourceObservationId: current.sourceObservationId,
      application: "Apple Health",
      integration: "HealthKit",
      modality: "direct",
      bundleIdentifier: current.source.bundleIdentifier,
      basis: "healthkit_workout_observation",
    },
    // Authority split: Apple owns telemetry, the Workout Logger owns training content.
    contentAuthority: { telemetry: "healthkit", trainingContent: "workout_logger" },
    activityInteraction: {
      policy: "workout_energy_is_descriptive_never_additive",
      additiveToDailyActivity: false,
    },
    linkAssessment,
    ...(coexistence ? { coexistence } : {}),
    evidenceEligibility: createHealthKitQuarantinedEligibility(),
    activation: activation ? structuredClone(activation) : null,
    createdAt,
    updatedAt: at,
  });
}

function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}

export { HEALTHKIT_OBSERVATION_ID_PREFIX };

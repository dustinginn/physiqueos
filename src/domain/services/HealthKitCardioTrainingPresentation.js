import {
  HEALTHKIT_CANONICAL_WORKOUT_ID_PREFIX,
  HealthKitWorkoutFamily,
} from "./HealthKitWorkoutService.js";
import { isActiveCanonicalTrainingSession } from "./CanonicalReadModel.js";
import { getLocalDateKey, resolveLocalTimeZone } from "../utils/localDate.js";
import { isPresentableCanonicalCardioWorkout } from "./HealthKitWorkoutPresentationService.js";
import {
  HealthKitCardioCoexistenceState,
  assessHealthKitCardioCoexistence,
} from "./HealthKitWorkoutLinkService.js";

// Training Day / Training Session presentation of canonical HealthKit Cardio
// workouts.
//
// Training Day is a unified workout presentation surface built from canonical
// `training` evidence objects (Logger sessions and screenshot-derived workouts
// such as "Outdoor Walk"). A canonical HealthKit Cardio workout is NOT such an
// evidence object -- it lives in its own collection -- so before this module it
// never reached Training Day, even though it is a valid workout that Activity
// accounting already counts. This module is the one place that adapts it into
// the exact record shape the existing Training Day / session-detail code
// already consumes for a screenshot-derived walk, so ordering, the day summary
// ("Walking · Cardio"), the row and the existing Cardio detail all follow the
// established path with no new presentation code.
//
// It is PRESENTATION ONLY and deliberately does not:
//  - create or imply a Training Logger session, a Strength link, a claim, or an
//    auto-confirm (the adapted record has no exercises and no relationship);
//  - change strategic eligibility (the canonical workout stays quarantined; this
//    module never reads or writes that decision);
//  - infer Indoor/Outdoor (the label comes ONLY from the stored canonicalType,
//    which is location-specific only when Apple's explicit signal was retained;
//    a generic `walking` stays a generic "Walking");
//  - touch Activity Day accounting (workout energy stays descriptive there).

const CARDIO_LABELS = Object.freeze({
  walking: "Walking",
  indoor_walking: "Indoor Walk",
  outdoor_walking: "Outdoor Walk",
  running: "Running",
  indoor_running: "Indoor Run",
  outdoor_running: "Outdoor Run",
  cycling: "Cycling",
  indoor_cycling: "Indoor Cycle",
  outdoor_cycling: "Outdoor Cycle",
});
const METERS_PER_MILE = 1609.344;
const COEXISTS_WITH_EVIDENCE = "matches_existing_evidence_workout";

export function isHealthKitCanonicalWorkoutIdentity(value) {
  return String(value ?? "").startsWith(HEALTHKIT_CANONICAL_WORKOUT_ID_PREFIX);
}

export function healthKitCardioActivityLabel(canonicalType) {
  const type = String(canonicalType ?? "").trim();
  if (Object.hasOwn(CARDIO_LABELS, type)) return CARDIO_LABELS[type];
  return type ? type.split("_").filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join(" ") : "Cardio";
}

/**
 * Adapt one canonical HealthKit Cardio workout into a Training evidence-shaped
 * record, or null when it is not an eligible presentation candidate (not Cardio,
 * retired, or malformed).
 */
export function projectHealthKitCardioWorkoutAsTrainingRecord(workout) {
  const current = workout?.current;
  if (!workout?.id || !isHealthKitCanonicalWorkoutIdentity(workout.id) || !current) return null;
  if (current.family !== HealthKitWorkoutFamily.CARDIO) return null;
  if (workout.retiredAt || workout.quality?.status === "superseded") return null;
  // Same structural-integrity gate Activity's whole-day accounting uses, so a
  // workout is presented in Training Day exactly when Activity counts it.
  if (!isPresentableCanonicalCardioWorkout(workout)) return null;
  const localDate = workout.localDate ?? current.localDate ?? null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(localDate ?? ""))) return null;

  const telemetry = current.telemetry ?? {};
  const label = healthKitCardioActivityLabel(current.canonicalType);
  const distance = distanceInMiles(telemetry.distance, telemetry.distanceUnit);
  const metadata = {
    activity_type: label,
    duration_seconds: roundedOrNull(telemetry.durationSeconds),
    distance: distance.value,
    distance_unit: distance.unit,
    active_calories: roundedOrNull(telemetry.activeCalories),
    total_calories: roundedOrNull(telemetry.totalCalories),
    average_heart_rate: roundedOrNull(telemetry.averageHeartRate),
    average_pace: null,
    effort_level: null,
    location: null,
    start_time: current.startedAt ?? null,
    end_time: current.endedAt ?? null,
  };
  // Same envelope as a screenshot-derived workout evidence object. `observed_at`
  // is the workout's own local date (the day the canonical Activity accounting
  // already attributes it to). `captured_at` is the workout's start in ITS OWN
  // local time with an explicit offset (e.g. 2026-09-23T06:29:52-07:00) -- the
  // same form screenshot-derived workouts already store -- because the
  // established Training Day comparator orders rows by that string. Ordering by
  // a UTC instant instead would sort every morning walk AFTER the day's Strength
  // session (whose stored captured_at is a T12:00:00Z placeholder) and break the
  // established Sep 21 presentation (walks, then Strength).
  return Object.freeze({
    id: workout.id,
    canonicalId: workout.id,
    payload: {
      id: workout.id,
      evidence_type: "training",
      observed_at: localDate,
      captured_at: localCaptureTimestamp(current.startedAt, current.timeZone) ?? current.startedAt ?? workout.createdAt ?? localDate,
      exercises: [],
      metadata,
      // `workout_id` is the record's authoritative duplicate identity. Without it the
      // only identity would be the shared "Apple Health" artifact ref, so every
      // projected workout would collapse into ONE record wherever the aggregate
      // Training reports dedupe by workout identity (landing/reporting/library).
      source: { application: "apple_health", integration: "healthkit", modality: "workout", workout_id: workout.id, source_artifact_refs: ["Apple Health"] },
      provenance: {
        source_artifact_refs: ["Apple Health"],
        healthkit_canonical_workout_id: workout.id,
        healthkit_family: current.family,
        healthkit_canonical_type: current.canonicalType ?? null,
      },
      quality: { status: "active" },
      values: {},
    },
  });
}

function shouldSuppressAsDuplicate(workout, activeEvidenceObjects, presentEvidenceIdentities) {
  // 1. Stored decision: the canonicalizer recorded this workout as the same workout as a
  //    present evidence workout. Only suppress when that evidence is really ACTIVE on the
  //    page, so a retired/superseded screenshot workout can never make the row vanish.
  const stored = workout?.coexistence;
  if (stored?.state === HealthKitCardioCoexistenceState.MATCHES_EXISTING_WORKOUT &&
    (stored.candidates ?? []).some((candidate) => presentEvidenceIdentities.has(String(candidate?.canonicalId)))) return true;
  // 2. Live reassessment: the stored decision is computed only at HealthKit ingestion /
  //    reassessment time, so a screenshot uploaded AFTER canonicalization would otherwise
  //    show as a second row. Re-run the same pure assessment against the active evidence on
  //    the page; only a single unambiguous duplicate suppresses (ambiguous / possible /
  //    unverifiable always fail open and show both).
  try {
    return assessHealthKitCardioCoexistence({ canonicalWorkout: workout, canonicalObjects: activeEvidenceObjects })
      .state === HealthKitCardioCoexistenceState.MATCHES_EXISTING_WORKOUT;
  } catch {
    return false;
  }
}

/**
 * Project the canonical HealthKit Cardio workouts of ONE local date into
 * Training evidence-shaped records for Training Day, suppressing any workout the
 * canonicalizer already recorded as the same workout as an existing evidence
 * (screenshot/typed) workout that is present for that day, and any duplicate
 * canonical identity.
 */
export function projectHealthKitCardioTrainingRecords({ canonicalWorkouts = [], date, existingEvidenceObjects = [] } = {}) {
  // Only ACTIVE evidence workouts count as "already on the page" (Training Day itself drops
  // superseded/retired evidence, so suppressing against one would make the workout vanish).
  const activeEvidence = existingEvidenceObjects.filter(isActiveCanonicalTrainingSession);
  const present = new Set();
  for (const record of activeEvidence) {
    for (const value of [record?.canonicalId, record?.id, record?.payload?.id]) if (value != null) present.add(String(value));
  }
  const seen = new Set();
  const records = [];
  for (const workout of canonicalWorkouts) {
    if (!workout?.id || seen.has(workout.id)) continue;
    const localDate = workout.localDate ?? workout.current?.localDate ?? null;
    if (date && localDate !== date) continue;
    if (shouldSuppressAsDuplicate(workout, activeEvidence, present)) continue;
    const record = projectHealthKitCardioWorkoutAsTrainingRecord(workout);
    if (!record) continue;
    seen.add(workout.id);
    records.push(record);
  }
  return records;
}

/**
 * The presented-workout universe for the AGGREGATE Training surfaces (landing /
 * Recent Training History, reporting, Cardio library history): every canonical
 * HealthKit Cardio workout that Training Day would present for its own local
 * date, across all dates, with exactly Training Day's per-day duplicate
 * suppression. Each workout is judged only against the active evidence that
 * Training Day would place on that same day (evidence local date resolved in the
 * same time zone Training Day uses), so an aggregate day and its Training Day
 * always agree on which workouts exist. Output order is deterministic
 * (local date, then capture stamp, then id) regardless of input order.
 */
export function projectPresentedHealthKitCardioTrainingRecords({ canonicalWorkouts = [], existingEvidenceObjects = [], timeZone = null } = {}) {
  const zone = resolveLocalTimeZone(timeZone);
  const evidenceByDate = new Map();
  for (const record of existingEvidenceObjects) {
    const payload = record?.payload ?? record ?? {};
    if (payload.evidence_type !== "training") continue;
    const dateKey = getLocalDateKey(payload.observed_at ?? record?.lastObservedAt, zone);
    if (!dateKey) continue;
    if (!evidenceByDate.has(dateKey)) evidenceByDate.set(dateKey, []);
    evidenceByDate.get(dateKey).push(record);
  }
  const workoutsByDate = new Map();
  for (const workout of canonicalWorkouts) {
    const localDate = workout?.localDate ?? workout?.current?.localDate ?? null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(localDate ?? ""))) continue;
    if (!workoutsByDate.has(localDate)) workoutsByDate.set(localDate, []);
    workoutsByDate.get(localDate).push(workout);
  }
  const records = [];
  for (const date of [...workoutsByDate.keys()].sort()) {
    const ordered = workoutsByDate.get(date).slice().sort((left, right) => String(left?.id).localeCompare(String(right?.id)));
    records.push(...projectHealthKitCardioTrainingRecords({
      canonicalWorkouts: ordered,
      date,
      existingEvidenceObjects: evidenceByDate.get(date) ?? [],
    }));
  }
  return records.sort((left, right) =>
    left.payload.observed_at.localeCompare(right.payload.observed_at) ||
    String(left.payload.captured_at).localeCompare(String(right.payload.captured_at)) ||
    left.id.localeCompare(right.id));
}

// "2026-09-23T13:29:52.000Z" + "America/Los_Angeles" -> "2026-09-23T06:29:52-07:00".
// Returns null for a missing/invalid instant or time zone (caller falls back).
function localCaptureTimestamp(instant, timeZone) {
  const at = new Date(instant);
  if (!instant || Number.isNaN(at.valueOf()) || !timeZone) return null;
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
      timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(at).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
    const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    const offsetMinutes = Math.round((asUtc - Math.floor(at.valueOf() / 1000) * 1000) / 60000);
    const sign = offsetMinutes < 0 ? "-" : "+";
    const abs = Math.abs(offsetMinutes);
    const hh = String(Math.floor(abs / 60)).padStart(2, "0");
    const mm = String(abs % 60).padStart(2, "0");
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${sign}${hh}:${mm}`;
  } catch {
    return null;
  }
}

function roundedOrNull(value) {
  return Number.isFinite(Number(value)) && value !== null && value !== "" ? Math.round(Number(value)) : null;
}

// Established Training rows show distance in miles ("0.97 mi"). Stored canonical
// telemetry is in the source unit (meters for Apple workouts); convert without
// inventing precision, and pass an unknown unit through unchanged.
function distanceInMiles(value, unit) {
  if (!Number.isFinite(Number(value)) || value === null || value === "") return { value: null, unit: null };
  const normalized = String(unit ?? "").toLowerCase();
  if (normalized === "m" || normalized === "meter" || normalized === "meters") {
    return { value: Math.round((Number(value) / METERS_PER_MILE) * 100) / 100, unit: "mi" };
  }
  if (normalized === "km" || normalized === "kilometer" || normalized === "kilometers") {
    return { value: Math.round((Number(value) * 1000 / METERS_PER_MILE) * 100) / 100, unit: "mi" };
  }
  if (normalized === "mi" || normalized === "mile" || normalized === "miles") return { value: Math.round(Number(value) * 100) / 100, unit: "mi" };
  return { value: Number(value), unit: unit ?? null };
}

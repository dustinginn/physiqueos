import { normalizeIdentityPart } from "./normalizeIdentityPart";

const DUPLICATE_CONFIDENCE_THRESHOLD = 80;
const POSSIBLE_DUPLICATE_CONFIDENCE_THRESHOLD = 50;
const TEMPORAL_TOLERANCE_MINUTES = 5;
// A bare display filename ("Apple Health Screenshot 2.jpg", "IMG_1688.png") is
// only a label the uploading device chose. Native names every Health screenshot
// with the same ordinal names on every day, so a filename alone can never
// establish that two workouts are the same workout. It is weak, same-date,
// contextual support that must be corroborated by real temporal, exercise or
// telemetry evidence; it is ignored entirely across different workout dates.
const WEAK_FILENAME_WEIGHT = 30;

// Ordered identity evidence, strongest first. Only the first two tiers can
// decide a duplicate by themselves.
export const WORKOUT_IDENTITY_EVIDENCE = Object.freeze([
  "strong_stable_artifact_identity",
  "same_session_canonical_linkage",
  "temporal_overlap",
  "exercise_set_similarity",
  "telemetry_similarity",
  "bare_display_filename",
]);

const AUTHORITATIVE_ID_KEYS = [
  ["reconciliation", "canonical_id"],
  ["reconciliation", "source_workout_id"],
  ["reconciliation", "source_workout_identifier"],
  ["reconciliation", "apple_health_uuid"],
  ["reconciliation", "uuid"],
  ["source", "uuid"],
  ["source", "workout_uuid"],
  ["source", "workout_id"],
  ["source", "source_workout_id"],
  ["source", "source_workout_identifier"],
  ["source", "identifier"],
  ["source", "record_id"],
  ["metadata", "apple_health_uuid"],
  ["metadata", "uuid"],
  ["metadata", "workout_uuid"],
  ["metadata", "workout_id"],
  ["metadata", "source_workout_id"],
  ["metadata", "source_workout_identifier"],
  ["provenance", "apple_health_uuid"],
  ["provenance", "uuid"],
  ["provenance", "source_workout_id"],
  ["provenance", "source_workout_identifier"],
];

export function assessWorkoutDuplicatePair(left = {}, right = {}) {
  const leftIdentity = getWorkoutIdentityFacts(left);
  const rightIdentity = getWorkoutIdentityFacts(right);
  const sharedAuthoritativeIds = intersectingValues(
    leftIdentity.authoritativeIds,
    rightIdentity.authoritativeIds
  );
  const sharedDisplayFilenames = intersectingValues(
    leftIdentity.displayFilenames,
    rightIdentity.displayFilenames
  );

  if (sharedAuthoritativeIds.length > 0) {
    return {
      outcome: "duplicate",
      confidence: 100,
      reasons: sharedAuthoritativeIds.map((value) => `Shared authoritative identity: ${value}`),
      signals: {
        authoritative: sharedAuthoritativeIds,
        displayFilenames: sharedDisplayFilenames,
        metricPoints: [],
        temporal: null,
      },
    };
  }

  const temporalFacts = assessTemporalCompatibility(leftIdentity, rightIdentity);
  if (temporalFacts.excluded) {
    return {
      outcome: "not_duplicate",
      confidence: 0,
      reasons: [
        ...temporalFacts.reasons,
        ...(sharedDisplayFilenames.length > 0
          ? ["Shared display filename ignored across different workout dates"]
          : []),
      ],
      signals: {
        authoritative: [],
        displayFilenames: sharedDisplayFilenames,
        metricPoints: [],
        temporal: temporalFacts,
      },
    };
  }

  const metricPoints = scoreSupportingMetrics(leftIdentity, rightIdentity);
  const exercisePoints = scoreExerciseSupport(left, right);
  const filenamePoints = sharedDisplayFilenames.length > 0
    ? [{
        reason: "Shared display filename on the same workout date is weak supporting context",
        weight: WEAK_FILENAME_WEIGHT,
      }]
    : [];
  const confidence = Math.min(
    99,
    temporalFacts.score +
      metricPoints.reduce((sum, point) => sum + point.weight, 0) +
      exercisePoints.reduce((sum, point) => sum + point.weight, 0) +
      filenamePoints.reduce((sum, point) => sum + point.weight, 0)
  );
  const outcome =
    confidence >= DUPLICATE_CONFIDENCE_THRESHOLD
      ? "duplicate"
      : confidence >= POSSIBLE_DUPLICATE_CONFIDENCE_THRESHOLD
        ? "possible_duplicate"
        : "not_duplicate";

  return {
    outcome,
    confidence,
    reasons: [
      ...temporalFacts.reasons,
      ...metricPoints.map((point) => point.reason),
      ...filenamePoints.map((point) => point.reason),
    ],
    signals: {
      authoritative: [],
      displayFilenames: sharedDisplayFilenames,
      metricPoints,
      exercisePoints,
      filenamePoints,
      temporal: temporalFacts,
    },
  };
}

export function areWorkoutsLikelyDuplicates(left = {}, right = {}) {
  return assessWorkoutDuplicatePair(left, right).outcome === "duplicate";
}

export function getWorkoutDuplicateIdentityKey(evidenceObject = {}) {
  const facts = getWorkoutIdentityFacts(evidenceObject);
  if (facts.authoritativeIds.length > 0) {
    // Stable identities keep their historical key shape, display filenames
    // included, so an existing canonical record is still found by id.
    return ["training", "authoritative", ...facts.legacyIdentityValues].join("|");
  }

  if (facts.displayFilenames.length > 0 && facts.dateKey) {
    // A display filename repeats across days, so it can only scope an identity
    // inside one workout date. Without the date the second day's upload would
    // resolve to the first day's canonical id and merge into it.
    return ["training", "filename", facts.dateKey, ...facts.displayFilenames].join("|");
  }

  if (facts.temporalKey) {
    return ["training", "temporal", facts.temporalKey].join("|");
  }

  return ["training", "evidence", String(evidenceObject.id ?? evidenceObject.canonicalId ?? "")].join("|");
}

export function getWorkoutIdentityFacts(evidenceObject = {}) {
  const metadata = evidenceObject.metadata ?? {};
  const provenance = evidenceObject.provenance ?? {};
  const source = evidenceObject.source ?? {};
  const explicitIdentityValues = AUTHORITATIVE_ID_KEYS.map(([scope, key]) => {
    if (scope === "reconciliation") return evidenceObject.reconciliation?.[key];
    if (scope === "source") return source?.[key];
    if (scope === "metadata") return metadata?.[key];
    return provenance?.[key];
  });
  const sourceRefs = [
    ...(provenance.source_artifact_refs ?? []),
    ...(source.source_artifact_refs ?? []),
  ].filter(isAuthoritativeSourceArtifactRef);
  const authoritativeIds = uniqueStrings(
    explicitIdentityValues.concat(sourceRefs.filter((ref) => !isBareDisplayFilename(ref)))
  );
  const displayFilenames = uniqueStrings(sourceRefs.filter(isBareDisplayFilename));
  const legacyIdentityValues = uniqueStrings(explicitIdentityValues.concat(sourceRefs));
  const temporal = getTemporalFacts(evidenceObject);

  return {
    authoritativeIds,
    displayFilenames,
    legacyIdentityValues,
    activityType: normalizeIdentityPart(metadata.activity_type),
    durationSeconds: toNumber(metadata.duration_seconds),
    distance: toNumber(metadata.distance),
    averageHeartRate: toNumber(metadata.average_heart_rate),
    averagePace: normalizeIdentityPart(metadata.average_pace),
    elevationGain: toNumber(metadata.elevation_gain ?? metadata.elevation ?? metadata.ascent),
    activeCalories: toNumber(metadata.active_calories),
    start: temporal.start,
    end: temporal.end,
    dateKey: temporal.dateKey,
    temporalKey: temporal.temporalKey,
  };
}

function getTemporalFacts(evidenceObject = {}) {
  const metadata = evidenceObject.metadata ?? {};
  const start = metadata.start_time ?? metadata.started_at ?? metadata.start ?? null;
  const end = metadata.end_time ?? metadata.ended_at ?? metadata.end ?? null;
  const dateKey = getDateKey(evidenceObject.observed_at);
  const normalizedStart = normalizeTemporalValue(start);
  const normalizedEnd = normalizeTemporalValue(end);

  return {
    start,
    end,
    dateKey,
    temporalKey:
      normalizedStart !== null || normalizedEnd !== null
        ? [dateKey, normalizedStart ?? "", normalizedEnd ?? "", normalizeIdentityPart(metadata.duration_seconds)].join("|")
        : "",
  };
}

function assessTemporalCompatibility(left = {}, right = {}) {
  const leftHasWindow = hasTemporalWindow(left);
  const rightHasWindow = hasTemporalWindow(right);
  const leftStart = normalizeTemporalValue(left.start);
  const leftEnd = normalizeTemporalValue(left.end);
  const rightStart = normalizeTemporalValue(right.start);
  const rightEnd = normalizeTemporalValue(right.end);
  const reasons = [];

  if (left.dateKey && right.dateKey && left.dateKey !== right.dateKey) {
    return {
      excluded: true,
      score: 0,
      reasons: [
        `Different workout dates: ${left.dateKey} vs ${right.dateKey}`,
      ],
      overlapping: false,
      startDifferenceMinutes: null,
    };
  }

  if (leftStart !== null && rightStart !== null) {
    const startDifferenceMinutes = Math.abs(leftStart - rightStart);
    if (
      leftHasWindow &&
      rightHasWindow &&
      !windowsOverlap(leftStart, leftEnd, rightStart, rightEnd) &&
      startDifferenceMinutes > TEMPORAL_TOLERANCE_MINUTES
    ) {
      return {
        excluded: true,
        score: 0,
        reasons: [
          `Start times differ by ${Math.round(startDifferenceMinutes)} minutes`,
          "No temporal overlap",
        ],
        overlapping: false,
        startDifferenceMinutes,
      };
    }

    reasons.push(
      startDifferenceMinutes <= TEMPORAL_TOLERANCE_MINUTES
        ? "Start times are closely aligned"
        : "Start times provide temporal context"
    );
  }

  const overlapping = windowsOverlap(leftStart, leftEnd, rightStart, rightEnd);
  const startDifferenceMinutes =
    leftStart !== null && rightStart !== null
      ? Math.abs(leftStart - rightStart)
      : null;
  const score = [
    overlapping ? 35 : 0,
    startDifferenceMinutes !== null && startDifferenceMinutes <= TEMPORAL_TOLERANCE_MINUTES ? 25 : 0,
    left.end !== null && right.end !== null && normalizeTemporalValue(left.end) !== null && normalizeTemporalValue(right.end) !== null && Math.abs(normalizeTemporalValue(left.end) - normalizeTemporalValue(right.end)) <= TEMPORAL_TOLERANCE_MINUTES ? 20 : 0,
    left.durationSeconds !== null && right.durationSeconds !== null && compatibleOptionalNumber(left.durationSeconds, right.durationSeconds, 120) ? 15 : 0,
  ].reduce((sum, value) => sum + value, 0);

  if (leftHasWindow || rightHasWindow) {
    reasons.push(overlapping ? "Workout windows overlap" : "Workout windows do not overlap");
  }

  return {
    excluded: false,
    score,
    reasons,
    overlapping,
    startDifferenceMinutes,
  };
}

function scoreSupportingMetrics(left = {}, right = {}) {
  const points = [];

  if (compatibleOptionalNumber(left.distance, right.distance, 0.05)) {
    points.push({ reason: "Matching distance supports a duplicate candidate", weight: 10 });
  }

  if (compatibleOptionalNumber(left.activeCalories, right.activeCalories, 15)) {
    points.push({ reason: "Matching calories supports a duplicate candidate", weight: 10 });
  }

  if (compatibleOptionalNumber(left.averageHeartRate, right.averageHeartRate, 5)) {
    points.push({ reason: "Matching heart rate supports a duplicate candidate", weight: 8 });
  }

  if (compatibleOptionalNumber(left.durationSeconds, right.durationSeconds, 120)) {
    points.push({ reason: "Matching duration supports a duplicate candidate", weight: 15 });
  }

  if (compatiblePace(left.averagePace, right.averagePace)) {
    points.push({ reason: "Matching pace supports a duplicate candidate", weight: 8 });
  }

  if (compatibleOptionalNumber(left.elevationGain, right.elevationGain, 20)) {
    points.push({ reason: "Matching elevation supports a duplicate candidate", weight: 5 });
  }

  return points;
}

function scoreExerciseSupport(left = {}, right = {}) {
  const leftExercises = normalizeExerciseSignature(left.exercises ?? []);
  const rightExercises = normalizeExerciseSignature(right.exercises ?? []);
  if (leftExercises.length === 0 || rightExercises.length === 0) return [];

  if (leftExercises.join("|") !== rightExercises.join("|")) return [];

  return [
    {
      reason: "Matching exercise structure supports a duplicate candidate",
      weight: 25,
    },
  ];
}

function compatiblePace(left, right) {
  if (left === null || left === undefined || left === "") return false;
  if (right === null || right === undefined || right === "") return false;

  return normalizeIdentityPart(left) === normalizeIdentityPart(right);
}

function normalizeExerciseSignature(exercises = []) {
  return exercises
    .map((exercise) => [
      normalizeIdentityPart(exercise?.canonicalExerciseId ?? exercise?.name ?? exercise?.id),
      normalizeIdentityPart(exercise?.sets?.length ?? ""),
      normalizeIdentityPart(exercise?.equipment ?? ""),
    ].join("|"))
    .filter(Boolean)
    .sort();
}

function windowsOverlap(leftStart, leftEnd, rightStart, rightEnd) {
  if (leftStart === null || rightStart === null) return false;
  const leftStop = leftEnd ?? leftStart;
  const rightStop = rightEnd ?? rightStart;

  return leftStart <= rightStop && rightStart <= leftStop;
}

function hasTemporalWindow(facts = {}) {
  return facts.start !== null || facts.end !== null;
}

function normalizeTemporalValue(value) {
  if (value === null || value === undefined || value === "") return null;

  const parsedDate = Date.parse(String(value));
  if (Number.isFinite(parsedDate)) return parsedDate / 60000;

  const parsedTime = parseTimeToMinutes(value);
  return parsedTime;
}

function parseTimeToMinutes(value) {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);

  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  const meridiem = match[3]?.toLowerCase();

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

function compatibleOptionalNumber(left, right, tolerance = 0) {
  if (left === null || left === undefined || left === "") return false;
  if (right === null || right === undefined || right === "") return false;

  const leftNumber = Number(left);
  const rightNumber = Number(right);

  if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) {
    return normalizeIdentityPart(left) === normalizeIdentityPart(right);
  }

  return Math.abs(leftNumber - rightNumber) <= tolerance;
}

function getDateKey(value) {
  return String(value ?? "").slice(0, 10);
}

function intersectingValues(left = [], right = []) {
  const rightSet = new Set(right.map(String));

  return uniqueStrings(left.filter((value) => rightSet.has(String(value))));
}

function uniqueStrings(values = []) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function isAuthoritativeSourceArtifactRef(value) {
  return !/^typed_evidence_\d+$/i.test(String(value ?? "").trim());
}

// Refs scoped to one upload, package or draft are stable artifact identities
// even when they end in an original filename
// (`evidence_submission_..._images_file_4_IMG_2026.png`).
const SCOPED_ARTIFACT_REF = /^(evidence_submission_|evidence_intake_|evidence_review_|training_logger_|artifact_|upload_|media:\/\/)/i;
const FILE_EXTENSION = /\.[a-z0-9]{2,5}$/i;

// A ref that is only a device-chosen file name: it has an extension and no
// package, upload or draft scope.
export function isBareDisplayFilename(value) {
  const text = String(value ?? "").trim();
  return FILE_EXTENSION.test(text) && !SCOPED_ARTIFACT_REF.test(text);
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

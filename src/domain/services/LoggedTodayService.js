import {
  DEFAULT_LOCAL_TIME_ZONE,
  getLocalDateKey,
} from "../utils/localDate";
import {
  selectActiveCanonicalNutritionDays,
} from "./CanonicalNutritionDayService";
import { selectActiveCanonicalActivityDays } from "./CanonicalActivityDayService";
import { projectHealthKitStrengthWorkoutPresentationBySession } from "./HealthKitWorkoutPresentationService.js";
import { projectHealthKitCardioTrainingRecords } from "./HealthKitCardioTrainingPresentation.js";

const EMPTY_SUMMARY = "Nothing logged yet";

export function createLoggedTodayService({
  repositories,
  now = () => new Date(),
} = {}) {
  return {
    // `healthKitRelationshipState` (canonicalWorkouts/workoutLinks/
    // workoutLinkClaims) is optional and additive: omitting it reproduces the
    // exact prior behavior (the Training row's own duration, confirmed or
    // not). When supplied, the row never keeps showing a Logger session's
    // frozen/synthetic duration once a canonical HK Strength workout has been
    // resolved for it -- confirmed, or an unconfirmed but deterministically
    // picked candidate.
    async getSummary({ userId, timeZone, healthKitRelationshipState = null } = {}) {
      const user = userId
        ? await repositories.users.getUserById(userId)
        : await repositories.users.getCurrentUser();
      const resolvedUserId = userId ?? user?.id;
      const resolvedTimeZone =
        timeZone ??
        user?.timeZone ??
        user?.timezone ??
        DEFAULT_LOCAL_TIME_ZONE;
      const canonicalObjects = resolvedUserId
        ? await repositories.canonicalEvidence.listCanonicalEvidenceObjects(
            resolvedUserId
          )
        : [];
      const healthKitStrengthPresentationBySession = healthKitRelationshipState
        ? projectHealthKitStrengthWorkoutPresentationBySession({
            canonicalEvidenceObjects: canonicalObjects,
            canonicalWorkouts: healthKitRelationshipState.canonicalWorkouts ?? [],
            workoutLinks: healthKitRelationshipState.workoutLinks ?? [],
            workoutLinkClaims: healthKitRelationshipState.workoutLinkClaims ?? [],
          })
        : new Map();

      const dateKey = getLocalDateKey(now(), resolvedTimeZone);
      // Today's canonical Cardio workouts, exactly as Training Day presents
      // them (same eligibility and duplicate suppression), so Logged Today and
      // Training Day never disagree about which workouts exist.
      const cardioWorkouts = healthKitRelationshipState
        ? projectHealthKitCardioTrainingRecords({
            canonicalWorkouts: healthKitRelationshipState.canonicalWorkouts ?? [],
            date: dateKey,
            existingEvidenceObjects: canonicalObjects,
          }).map(unwrapCanonicalObject)
        : [];

      return composeLoggedTodaySummary({
        canonicalObjects,
        dateKey,
        healthKitStrengthPresentationBySession,
        cardioWorkouts,
      });
    },
  };
}

export function composeLoggedTodaySummary({
  canonicalObjects = [],
  dateKey,
  healthKitStrengthPresentationBySession = new Map(),
  cardioWorkouts = [],
} = {}) {
  const activeNonNutrition = canonicalObjects
    .filter((object) => object?.quality?.status !== "superseded")
    .filter((object) =>
      (object.payload ?? object).evidence_type !== "nutrition"
    )
    .map(unwrapCanonicalObject)
    .filter((record) => getEvidenceDate(record) === dateKey);
  const nutritionSelection = selectActiveCanonicalNutritionDays(
    canonicalObjects,
    { date: dateKey }
  );
  if (nutritionSelection.diagnostics.length > 0) {
    console.warn("[LoggedToday] Multiple active NutritionDays detected.",
      nutritionSelection.diagnostics);
  }
  const nutrition = nutritionSelection.records.map(unwrapCanonicalObject);
  const activitySelection = selectActiveCanonicalActivityDays(
    canonicalObjects,
    { date: dateKey }
  );
  if (activitySelection.diagnostics.length > 0) {
    console.warn("[LoggedToday] Multiple active ActivityDays detected.",
      activitySelection.diagnostics);
  }
  const activity = activitySelection.records.map(unwrapCanonicalObject);

  return Object.freeze({
    dateKey,
    rows: Object.freeze([
      composeTrainingRow(
        activeNonNutrition.filter((record) => record.evidence_type === "training"),
        healthKitStrengthPresentationBySession,
        cardioWorkouts,
      ),
      composeNutritionRow(nutrition),
      composeActivityRow(activity),
    ]),
  });
}

// Logged Today's Training row summarizes the day's training compactly, one
// line per modality: the Logger session(s) (Strength) and today's canonical
// standalone canonical workouts grouped by type ("2 Outdoor Walks · 32 min").
// These lines include Cardio plus explicit OTHER history such as Cooldown and
// come from the same canonical projection Training Day uses; nothing here
// invents a Logger session. `summary` stays one string (every
// line, comma-joined) for clients that render a single line; `lines` carries
// the same content line by line.
function composeTrainingRow(sessions, healthKitStrengthPresentationBySession = new Map(), cardioWorkouts = []) {
  if (!sessions.length && !cardioWorkouts.length) return emptyRow("training", "Training");

  const strength = sessions.length ? composeLoggerSessionLine(sessions, healthKitStrengthPresentationBySession) : null;
  const cardioLines = composeCardioLines(cardioWorkouts);
  const lines = [strength, ...cardioLines].filter(Boolean).map(({ id, kind, summary, href, recordId, provenance }) =>
    Object.freeze({ id, kind, summary, href, recordId, provenance }));
  // With a Logger session the row keeps that session's own record, link and
  // context (clients that render only `summary` still open the Strength
  // session); clients that render `lines` open Training Day for a
  // multi-line row. A Cardio-only row opens Training Day.
  return Object.freeze({
    id: "training",
    label: "Training",
    summary: lines.map((line) => line.summary).join(", "),
    context: strength ? strength.context : APPLE_HEALTH_LABEL,
    // Typed provenance (Log Sources): a Training row can mix sources, so its
    // provenance lives on each line; `contextDetail` is `context` without any
    // source caption, for clients that present provenance separately.
    contextDetail: strength ? strength.context : null,
    provenance: null,
    href: strength ? strength.href : "/progress/training",
    recordId: strength ? strength.recordId : null,
    lines: Object.freeze(lines),
  });
}

function composeLoggerSessionLine(sessions, healthKitStrengthPresentationBySession) {
  const labels = unique(sessions.map((session) => formatTrainingType(session)));
  const single = sessions.length === 1 ? sessions[0] : null;
  const singleId = single ? String(single._canonicalId ?? single.canonicalId ?? single.id ?? "") : null;
  // Real Apple Health telemetry -- confirmed, or an unconfirmed but
  // deterministically resolved candidate -- always wins over the Logger
  // session's own frozen/synthetic duration. Absent any resolution, the
  // Logger's own duration is used unchanged (never invented).
  const presentedDurationSeconds = singleId
    ? healthKitStrengthPresentationBySession.get(singleId)?.session?.durationSeconds
    : null;
  const duration = single
    ? formatDuration(presentedDurationSeconds ?? single.metadata?.duration_seconds)
    : null;
  const noMovements = single && (single.exercises?.length ?? 0) === 0;
  const summary =
    single && duration
      ? `${labels[0]} · ${duration}`
      : single
        ? `${labels[0]} logged`
        : labels.length <= 2
          ? labels.join(" · ")
          : `${sessions.length} training sessions`;
  const recordId = single?._canonicalId ?? single?.canonicalId ?? single?.id ?? null;

  return {
    id: "training:logger",
    kind: "logger",
    summary,
    provenance: provenance(
      labels.length <= 2 ? labels.join(" · ") : `${sessions.length} training sessions`,
      sessions.map(trainingSessionSource),
    ),
    context: noMovements ? "Movements not added" : null,
    href: single ? `/progress/training/session/${encodeURIComponent(recordId)}` : "/progress/training",
    recordId,
  };
}

function composeCardioLines(cardioWorkouts = []) {
  const groups = new Map();
  for (const workout of cardioWorkouts) {
    const label = formatTrainingType(workout);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(workout);
  }
  const firstStart = (list) => list.map((workout) => String(workout.captured_at ?? workout.metadata?.start_time ?? "")).sort()[0] ?? "";
  return [...groups.entries()]
    .sort(([, left], [, right]) => firstStart(left).localeCompare(firstStart(right)))
    .map(([label, workouts]) => {
      const seconds = workouts.reduce((total, workout) => total + (Number(workout.metadata?.duration_seconds) || 0), 0);
      const duration = formatDuration(seconds);
      const name = workouts.length === 1 ? label : pluralTrainingLabel(label, workouts.length);
      const single = workouts.length === 1 ? workouts[0] : null;
      const recordId = single ? String(single._canonicalId ?? single.canonicalId ?? single.id) : null;
      const family = String(workouts[0]?.provenance?.healthkit_family ?? "");
      // Preserve the legacy/default Cardio shape for older projected records
      // that predate the explicit family stamp. Only an explicit OTHER family
      // may narrow the row to non-Cardio.
      const isOtherHistory = family === "other";
      const idFamily = isOtherHistory ? "workout" : "cardio";
      return {
        id: `training:${idFamily}:${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        kind: isOtherHistory ? "other" : "cardio",
        summary: duration ? `${name} · ${duration}` : name,
        // Cardio and explicit OTHER history lines are projected from
        // canonical HealthKit workouts only.
        provenance: provenance(name, [APPLE_HEALTH_SOURCE]),
        href: "/progress/training",
        recordId,
      };
    });
}

// "2 Outdoor Walks"; an activity named as a gerund takes its noun plural
// ("2 Walks", "2 Rides"), and any other gerund counts its sessions.
const GERUND_PLURALS = Object.freeze({ Walking: "Walks", Running: "Runs", Cycling: "Rides", Hiking: "Hikes", Swimming: "Swims" });
function pluralTrainingLabel(label, count) {
  if (Object.hasOwn(GERUND_PLURALS, label)) return `${count} ${GERUND_PLURALS[label]}`;
  return /ing$/i.test(label) ? `${label} · ${count} sessions` : `${count} ${label}s`;
}

function composeNutritionRow(days) {
  if (!days.length) return emptyRow("nutrition", "Nutrition");

  const day = days[0];
  const mealCount = Number.isFinite(Number(day.metadata?.meal_count))
    ? Number(day.metadata.meal_count)
    : day.meals?.length ?? 0;
  const calorieValue = Number(day.daily_totals?.calories);
  const calories = Number.isFinite(calorieValue) ? calorieValue : 0;
  const mealLabel = `${mealCount} meal${mealCount === 1 ? "" : "s"}`;
  const deviceTotals = isDeviceDailyTotal(day);
  // The authoritative total can be a device daily total even on a day that
  // also carries independent meal detail (a graduated HealthKit day merged
  // with existing meals); attribution follows the total's actual source,
  // not whether meal detail happens to exist alongside it.
  const deviceSourced = isAppleHealthDirect(day);

  return Object.freeze({
    id: "nutrition",
    label: "Nutrition",
    // A device daily total with no meal objects is a complete, valid day: it is
    // never described by a meal count it does not have.
    summary: deviceTotals && mealCount === 0
      ? calories > 0 ? `${formatNumber(calories)} calories` : "Nutrition logged"
      : calories > 0 ? `${mealLabel} · ${formatNumber(calories)} calories` : `${mealLabel} logged`,
    context: deviceTotals ? formatDeviceNutritionContext(day) : deviceSourced ? APPLE_HEALTH_LABEL : null,
    contextDetail: deviceTotals ? formatDeviceNutritionMacros(day) : null,
    provenance: provenance("Nutrition", [deviceSourced ? APPLE_HEALTH_SOURCE : UNAVAILABLE_SOURCE]),
    href: day?.id
      ? `/progress/nutrition/day/${encodeURIComponent(day.id)}`
      : "/progress/nutrition",
    recordId: day?.id ?? null,
  });
}

function composeActivityRow(days) {
  if (!days.length) return emptyRow("activity", "Activity");

  const latest = days.at(-1);
  const calories = Number(latest.daily_activity?.move_calories);
  const linkedTrainingType = latest.metadata?.activity_type;
  // Apple Health's summary for a day still in progress is a "so far" total.
  const soFar = latest.metadata?.coverage === "partial_day" ? " so far" : "";
  const calorieSummary = Number.isFinite(calories)
    ? `${formatNumber(calories)} active calories${soFar}`
    : "Activity logged";

  return Object.freeze({
    id: "activity",
    label: "Activity",
    summary: linkedTrainingType
      ? `${formatTrainingLabel(linkedTrainingType)} · ${calorieSummary}`
      : calorieSummary,
    context: isAppleHealthDirect(latest) ? APPLE_HEALTH_LABEL : null,
    contextDetail: null,
    provenance: provenance("Activity", [isAppleHealthDirect(latest) ? APPLE_HEALTH_SOURCE : UNAVAILABLE_SOURCE]),
    href: "/progress/activity",
    recordId: latest._canonicalId ?? latest.canonicalId ?? latest.id ?? null,
  });
}

const APPLE_HEALTH_LABEL = "Apple Health";

// Typed provenance for clients that present Log sources separately from the
// tiles. Only provable sources are named: a direct Apple Health record, or a
// session the structured Workout Logger committed. Anything else is reported
// as unavailable rather than guessed from display text.
export const LOGGED_TODAY_SOURCE_KINDS = Object.freeze(["apple_health", "physiqueos_logger", "unavailable"]);
const APPLE_HEALTH_SOURCE = Object.freeze({ kind: "apple_health", label: APPLE_HEALTH_LABEL });
const LOGGER_SOURCE = Object.freeze({ kind: "physiqueos_logger", label: "PhysiqueOS Logger" });
const UNAVAILABLE_SOURCE = Object.freeze({ kind: "unavailable", label: "Source unavailable" });

function provenance(scope, sources) {
  const distinct = [];
  for (const source of sources) {
    if (!distinct.some((item) => item.kind === source.kind)) distinct.push(source);
  }
  return Object.freeze({ scope, sources: Object.freeze(distinct) });
}

function trainingSessionSource(session) {
  if (session?.metadata?.logger_origin === "training_logger") return LOGGER_SOURCE;
  if (isAppleHealthDirect(session)) return APPLE_HEALTH_SOURCE;
  return UNAVAILABLE_SOURCE;
}

export function withAppleHealthLineSource(line) {
  if (!line?.provenance) return line;
  return Object.freeze({
    ...line,
    provenance: provenance(line.provenance.scope, [...line.provenance.sources, APPLE_HEALTH_SOURCE]),
  });
}

// Existing source treatment only: the row's existing secondary line names the
// source and, for a device daily total, the macros the compact row can hold.
function isAppleHealthDirect(record) {
  return /apple health/i.test(String(record?.source?.application ?? "")) &&
    /^(direct|api|device|integration|wearable)$/i.test(String(record?.source?.modality ?? ""));
}

function isDeviceDailyTotal(day) {
  return isAppleHealthDirect(day) && (day.meals?.length ?? 0) === 0;
}

function formatDeviceNutritionContext(day) {
  return [formatDeviceNutritionMacros(day), APPLE_HEALTH_LABEL].filter(Boolean).join(" · ");
}

function formatDeviceNutritionMacros(day) {
  const totals = day.daily_totals ?? {};
  const macro = (value, letter) => (Number.isFinite(Number(value)) && value !== null ? `${Math.round(Number(value))}${letter}` : null);
  const macros = [macro(totals.protein_g, "P"), macro(totals.carbs_g, "C"), macro(totals.fat_g, "F")].filter(Boolean);
  return macros.length ? macros.join(" · ") : null;
}

function emptyRow(id, label) {
  return Object.freeze({
    id,
    label,
    summary: EMPTY_SUMMARY,
    context: null,
    contextDetail: null,
    provenance: null,
    href: null,
    recordId: null,
  });
}

function unwrapCanonicalObject(object) {
  return {
    ...(object.payload ?? object),
    _canonicalId: object.canonicalId ?? object._canonicalId ?? null,
  };
}

function getEvidenceDate(record) {
  return String(
    record.observed_at ?? record.date ?? record.lastObservedAt ?? ""
  ).slice(0, 10);
}

function formatTrainingType(session) {
  return formatTrainingLabel(
    session.metadata?.activity_type ?? session.activityType ?? "Workout"
  );
}

function formatTrainingLabel(value) {
  return String(value)
    .replace(/^Traditional Strength Training$/i, "Strength Training")
    .replace(/^Walk$/i, "Outdoor Walk");
}

function formatDuration(seconds) {
  const minutes = Math.round(Number(seconds) / 60);
  return Number.isFinite(minutes) && minutes > 0 ? `${minutes} min` : null;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    value
  );
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

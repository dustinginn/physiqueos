import {
  DEFAULT_LOCAL_TIME_ZONE,
  getLocalDateKey,
} from "../utils/localDate";
import {
  selectActiveCanonicalNutritionDays,
} from "./CanonicalNutritionDayService";
import { selectActiveCanonicalActivityDays } from "./CanonicalActivityDayService";
import { projectHealthKitStrengthWorkoutPresentationBySession } from "./HealthKitWorkoutPresentationService.js";

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

      return composeLoggedTodaySummary({
        canonicalObjects,
        dateKey: getLocalDateKey(now(), resolvedTimeZone),
        healthKitStrengthPresentationBySession,
      });
    },
  };
}

export function composeLoggedTodaySummary({
  canonicalObjects = [],
  dateKey,
  healthKitStrengthPresentationBySession = new Map(),
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
      ),
      composeNutritionRow(nutrition),
      composeActivityRow(activity),
    ]),
  });
}

function composeTrainingRow(sessions, healthKitStrengthPresentationBySession = new Map()) {
  if (!sessions.length) return emptyRow("training", "Training");

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

  return Object.freeze({
    id: "training",
    label: "Training",
    summary,
    context: noMovements ? "Movements not added" : null,
    href: single
      ? `/progress/training/session/${encodeURIComponent(
          single._canonicalId ?? single.canonicalId ?? single.id
        )}`
      : "/progress/training",
    recordId: single?._canonicalId ?? single?.canonicalId ?? single?.id ?? null,
  });
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
  const calorieSummary = Number.isFinite(calories)
    ? `${formatNumber(calories)} active calories`
    : "Activity logged";

  return Object.freeze({
    id: "activity",
    label: "Activity",
    summary: linkedTrainingType
      ? `${formatTrainingLabel(linkedTrainingType)} · ${calorieSummary}`
      : calorieSummary,
    context: isAppleHealthDirect(latest) ? APPLE_HEALTH_LABEL : null,
    href: "/progress/activity",
    recordId: latest._canonicalId ?? latest.canonicalId ?? latest.id ?? null,
  });
}

const APPLE_HEALTH_LABEL = "Apple Health";

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
  const totals = day.daily_totals ?? {};
  const macro = (value, letter) => (Number.isFinite(Number(value)) && value !== null ? `${Math.round(Number(value))}${letter}` : null);
  const macros = [macro(totals.protein_g, "P"), macro(totals.carbs_g, "C"), macro(totals.fat_g, "F")].filter(Boolean);
  return [macros.length ? macros.join(" · ") : null, APPLE_HEALTH_LABEL].filter(Boolean).join(" · ");
}

function emptyRow(id, label) {
  return Object.freeze({
    id,
    label,
    summary: EMPTY_SUMMARY,
    context: null,
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

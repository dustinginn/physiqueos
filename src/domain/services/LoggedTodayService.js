import {
  DEFAULT_LOCAL_TIME_ZONE,
  getLocalDateKey,
} from "../utils/localDate";
import {
  selectActiveCanonicalNutritionDays,
} from "./CanonicalNutritionDayService";

const EMPTY_SUMMARY = "Nothing logged yet";

export function createLoggedTodayService({
  repositories,
  now = () => new Date(),
} = {}) {
  return {
    async getSummary({ userId, timeZone } = {}) {
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

      return composeLoggedTodaySummary({
        canonicalObjects,
        dateKey: getLocalDateKey(now(), resolvedTimeZone),
      });
    },
  };
}

export function composeLoggedTodaySummary({
  canonicalObjects = [],
  dateKey,
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

  return Object.freeze({
    dateKey,
    rows: Object.freeze([
      composeTrainingRow(activeNonNutrition.filter((record) => record.evidence_type === "training")),
      composeNutritionRow(nutrition),
      composeActivityRow(activeNonNutrition.filter((record) => record.evidence_type === "activity_day")),
    ]),
  });
}

function composeTrainingRow(sessions) {
  if (!sessions.length) return emptyRow("training", "Training");

  const labels = unique(sessions.map((session) => formatTrainingType(session)));
  const single = sessions.length === 1 ? sessions[0] : null;
  const duration = single ? formatDuration(single.metadata?.duration_seconds) : null;
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

  return Object.freeze({
    id: "nutrition",
    label: "Nutrition",
    summary: calories > 0 ? `${mealLabel} · ${formatNumber(calories)} calories` : `${mealLabel} logged`,
    context: null,
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
    context: null,
    href: "/progress/activity",
    recordId: latest._canonicalId ?? latest.canonicalId ?? latest.id ?? null,
  });
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

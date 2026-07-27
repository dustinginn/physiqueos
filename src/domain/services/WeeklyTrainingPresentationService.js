const STATUS_ORDER = Object.freeze({
  regressing: 0,
  plateauing: 1,
  improving: 2,
  stable: 3,
  insufficient: 4,
});
const CONFIDENCE_ORDER = Object.freeze({ high: 0, moderate: 1, low: 2 });

export function createWeeklyTrainingPresentationModel({
  window,
  trainingDays = 0,
  trainingReport = null,
  piObservations = [],
  performanceEvents = [],
} = {}) {
  const categorySource = trainingReport?.categoryObservations?.length
    ? trainingReport.categoryObservations
    : piObservations.filter((item) => subjectType(item) === "training_category");
  const exerciseSource = trainingReport?.exerciseObservations?.length
    ? trainingReport.exerciseObservations
    : piObservations.filter((item) => subjectType(item) === "exercise");
  const boundedEvents = (performanceEvents ?? []).filter((event) =>
    !window?.startDate || (event.workoutDate >= window.startDate && event.workoutDate <= window.endDate)
  );
  const categories = categorySource.map(normalizeCategory).filter(Boolean).map((category) => ({
    ...category,
    performanceEventIds: unique([
      ...category.performanceEventIds,
      ...boundedEvents
        .filter((event) => category.exercises.includes(event.canonicalExerciseName))
        .map((event) => event.id),
    ]),
  }));
  const orderedCategories = [...categories].sort(compareCategories);
  const counts = countStatuses(categories);
  const comparableCategoryCount = categories.length;
  const highlights = selectWeeklyTrainingHighlights({
    observations: exerciseSource,
    categories,
    window,
  }).map((highlight) => ({
    ...highlight,
    performanceEventIds: unique([
      ...(highlight.performanceEventIds ?? []),
      ...boundedEvents
        .filter((event) => event.canonicalExerciseName === highlight.exercise)
        .map((event) => event.id),
    ]),
  }));
  return {
    schemaVersion: "weekly_training_presentation_v1",
    reportingWindow: window ? {
      startDate: window.startDate,
      endDate: window.endDate,
    } : null,
    trainingDayCount: trainingDays,
    completedSessionCount: trainingDays,
    finalizedReportId: trainingReport?.id ?? trainingReport?.reportId ?? null,
    comparableCategoryCount,
    counts,
    categorySummaries: orderedCategories.slice(0, 4),
    highlights,
    evidenceCompleteness: comparableCategoryCount ? "available" : "insufficient",
    evidenceCutoff: window?.endDate ?? null,
    sourcePerformanceEventIds: unique(boundedEvents.map((event) => event.id)),
  };
}

export function selectWeeklyTrainingHighlights({
  observations = [],
  categories = [],
  window,
  limit = 3,
} = {}) {
  const categoryByExercise = new Map();
  categories.forEach((category) => {
    category.exercises.forEach((name) => categoryByExercise.set(name.toLowerCase(), category));
  });
  const candidates = observations
    .map(normalizeExercise)
    .filter(Boolean)
    .filter((item) => item.status === "improving")
    .filter((item) => !["background", "retired"].includes(item.lifecycle))
    .filter((item) => !window?.startDate || (item.date >= window.startDate && item.date <= window.endDate))
    .map((item) => {
      const category = categoryByExercise.get(item.exercise.toLowerCase()) ?? null;
      return {
        ...item,
        categoryId: category?.id ?? "uncategorized",
        score: (item.prDetected ? 40 : 0)
          + (item.confidence === "high" ? 20 : item.confidence === "moderate" ? 10 : 0)
          + Math.min(Math.max(item.percentChange ?? 0, 0), 30)
          + Math.min(item.evidenceCount, 8),
      };
    })
    .sort((left, right) =>
      right.score - left.score
      || String(right.date).localeCompare(String(left.date))
      || left.exercise.localeCompare(right.exercise)
    );

  const selected = [];
  const representedCategories = new Set();
  for (const item of candidates) {
    if (selected.length >= limit) break;
    if (representedCategories.has(item.categoryId) && candidates.some((candidate) =>
      !representedCategories.has(candidate.categoryId) && !selected.includes(candidate)
    )) continue;
    representedCategories.add(item.categoryId);
    selected.push({
      exercise: item.exercise,
      icon: item.prDetected ? "🏆" : "↗",
      kind: item.prDetected ? "Record" : "Progress",
      label: item.prDetected ? prLabel(item.prType) : "Repeated improvement",
      value: item.value,
      previous: item.previous,
      delta: Number.isFinite(item.value) && Number.isFinite(item.previous)
        ? item.value - item.previous
        : null,
      percentChange: item.percentChange,
      unit: item.unit,
      performanceEventIds: item.performanceEventIds,
    });
  }
  return selected;
}

function normalizeCategory(item) {
  const source = explanation(item);
  const id = item.category ?? item.subject?.id ?? item.subject?.label;
  if (!id) return null;
  const status = normalizeStatus(item.status);
  const exercises = source.exercise_names ?? source.exerciseNames ?? [];
  return {
    id: String(id),
    label: titleCase(id),
    status,
    statusLabel: statusLabel(status),
    direction: item.direction ?? directionFor(status),
    strength: item.strength ?? item.confidence?.level ?? "moderate",
    comparableExerciseCount: source.exercise_count ?? source.exerciseCount ?? exercises.length,
    exercises,
    supportingExercises: exercises,
    performanceEventIds: unique(item.performanceEventIds ?? source.performance_event_ids ?? []),
  };
}

function normalizeExercise(item) {
  const source = explanation(item);
  const exercise = item.exercise?.name ?? item.subject?.label;
  if (!exercise) return null;
  const last = source.last_session ?? source.lastSession ?? {};
  const previous = source.previous_comparable_session ?? source.previousComparableSession ?? {};
  const pr = source.pr_detection ?? source.prDetection ?? {};
  const trend = source.volume_trend ?? source.volumeTrend ?? {};
  return {
    exercise,
    status: normalizeStatus(item.status),
    confidence: item.confidence?.level ?? "low",
    lifecycle: item.lifecycle?.state ?? item.novelty?.state ?? "new",
    date: last.date ?? item.evidence_date_range?.end ?? item.evidenceWindow?.endDate ?? null,
    prDetected: pr.detected === true,
    prType: pr.type ?? pr.prs?.[0]?.type ?? null,
    percentChange: finite(trend.percent_change ?? trend.percentChange),
    value: finite(last.total_volume ?? last.totalVolume),
    previous: finite(previous.total_volume ?? previous.totalVolume),
    unit: "lb volume",
    evidenceCount: (item.supporting_session_ids ?? item.supportingEvidenceIds ?? []).length,
    performanceEventIds: unique(item.performanceEventIds ?? source.performance_event_ids ?? []),
  };
}

function countStatuses(categories) {
  const result = { improving: 0, stable: 0, plateauing: 0, regressing: 0, insufficient: 0 };
  categories.forEach((item) => { result[item.status] += 1; });
  return result;
}

function compareCategories(left, right) {
  return STATUS_ORDER[left.status] - STATUS_ORDER[right.status]
    || (CONFIDENCE_ORDER[left.strength] ?? 3) - (CONFIDENCE_ORDER[right.strength] ?? 3)
    || right.comparableExerciseCount - left.comparableExerciseCount
    || left.label.localeCompare(right.label);
}

function prLabel(type) {
  return ({
    session_volume: "New session-volume mark",
    session_volume_pr: "New session-volume mark",
    heaviest_load: "New load mark",
    reps_at_load: "New reps-at-load mark",
    reps_at_load_pr: "New reps-at-load mark",
  })[type] ?? "New performance mark";
}

function explanation(item) {
  return item.explanation_data ?? item.explanationData ?? {};
}

function subjectType(item) {
  return item.subject?.type ?? (item.category ? "training_category" : item.exercise ? "exercise" : null);
}

function normalizeStatus(value) {
  return value === "insufficient_data" ? "insufficient" : value in STATUS_ORDER ? value : "insufficient";
}

function statusLabel(value) {
  return value === "insufficient" ? "Insufficient" : titleCase(value);
}

function directionFor(status) {
  if (status === "improving") return "positive";
  if (status === "regressing") return "negative";
  if (status === "insufficient") return "not_applicable";
  return "neutral";
}

function titleCase(value) {
  return String(value).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function finite(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function unique(values = []) {
  return [...new Set((values ?? []).filter(Boolean).map(String))].sort();
}

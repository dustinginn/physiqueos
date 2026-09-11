const STATUS_ORDER = Object.freeze([
  ["improving", "Improving"],
  ["stable", "Stable"],
  ["plateauing", "Plateauing"],
  ["regressing", "Regressing"],
  ["insufficient_data", "Needs data"],
]);

export function createTrainingReportingPresentation(report = {}) {
  const performance = report.resistancePerformance ?? {};
  const exercises = performance.exerciseObservations ?? [];
  const categories = performance.categoryObservations ?? [];
  return Object.freeze({
    schemaVersion: "1",
    availableReports: Object.freeze((report.reportingLinks ?? []).slice(0, 20).map((item) => Object.freeze({
      id: item.id,
      label: item.label,
      detail: item.detail ?? null,
    }))),
    resistance: Object.freeze({
      title: "Resistance Training",
      summary: "Strength progression, PRs, and category momentum from training history.",
      statusGroups: Object.freeze(STATUS_ORDER.map(([status, label]) => Object.freeze({
        status,
        label,
        count: exercises.filter((item) => (item.status ?? "insufficient_data") === status).length,
        exercises: Object.freeze(exercises
          .filter((item) => (item.status ?? "insufficient_data") === status)
          .slice(0, 50)
          .map(projectExerciseStatus)),
      }))),
      recentPrs: Object.freeze(exercises
        .filter((item) => item.explanation_data?.pr_detection?.detected)
        .slice(0, 20)
        .map(projectPr)),
      highlights: Object.freeze(createHighlights(exercises, categories)),
      needsAttention: Object.freeze(exercises
        .filter((item) => ["regressing", "plateauing"].includes(item.status))
        .slice(0, 50)
        .map(projectAttention)),
      categories: Object.freeze(categories.slice(0, 50).map(projectCategory)),
      source: "canonical_training_sessions",
    }),
    history: Object.freeze({
      title: "Training History",
      summary: "Recent canonical training days and their session identities.",
      days: Object.freeze((report.trainingDays ?? []).slice(0, 20).map((day) => Object.freeze({
        id: day.id,
        date: day.date,
        label: day.label ?? null,
        sessions: Object.freeze((day.sessions ?? []).slice(0, 20).map((session) => Object.freeze({
          sessionId: session.canonicalId ?? session.id,
          label: session.label ?? null,
          occurrenceDate: session.date ?? day.date,
          revision: session.revision == null && session.version == null
            ? null
            : Number(session.revision ?? session.version),
        }))),
      }))),
    }),
  });
}

function projectExerciseStatus(observation) {
  return Object.freeze({
    canonicalExerciseId: observation.exercise?.key ?? null,
    label: observation.exercise?.name ?? null,
    status: observation.status ?? "insufficient_data",
    latestEvidenceDate: observation.evidence_date_range?.end ?? null,
    detail: statusDetail(observation),
  });
}

function projectPr(observation) {
  const pr = observation.explanation_data?.pr_detection?.prs?.[0] ?? null;
  return Object.freeze({
    canonicalExerciseId: observation.exercise?.key ?? null,
    label: observation.exercise?.name ?? null,
    latestEvidenceDate: observation.evidence_date_range?.end ?? null,
    detail: prDetail(pr),
  });
}

function projectAttention(observation) {
  const reason = observation.status === "regressing"
    ? "Recent performance moved down."
    : "Multiple comparable sessions without clear overload.";
  return Object.freeze({
    canonicalExerciseId: observation.exercise?.key ?? null,
    label: observation.exercise?.name ?? null,
    status: observation.status,
    latestEvidenceDate: observation.evidence_date_range?.end ?? null,
    detail: reason,
  });
}

function projectCategory(observation) {
  const data = observation.explanation_data ?? {};
  return Object.freeze({
    categoryId: observation.category,
    label: title(observation.category),
    status: observation.status,
    latestEvidenceDate: data.latest_trained_at ?? observation.evidence_date_range?.end ?? null,
    exerciseCount: data.exercise_count ?? 0,
    latestKnownSets: data.latest_known_sets ?? null,
    latestKnownVolume: data.latest_known_volume ?? null,
    statusCounts: Object.freeze({ ...(data.status_counts ?? {}) }),
  });
}

function createHighlights(exercises, categories) {
  const exerciseHighlights = exercises
    .filter((item) => item.status === "improving")
    .slice(0, 3)
    .map((item) => Object.freeze({
      type: "exercise",
      canonicalExerciseId: item.exercise?.key ?? null,
      label: item.exercise?.name ?? null,
      detail: highlightDetail(item),
    }));
  const categoryHighlight = categories
    .filter((item) => (item.explanation_data?.status_counts?.improving ?? 0) > 1)
    .slice(0, 1)
    .map((item) => Object.freeze({
      type: "category",
      categoryId: item.category,
      label: title(item.category),
      detail: exercises
        .filter((exercise) => exercise.status === "improving" &&
          exercise.exercise?.primaryNavigationCategory === item.category)
        .slice(0, 2)
        .map((exercise) => exercise.exercise?.name)
        .filter(Boolean)
        .join(" · "),
    }));
  return [...exerciseHighlights, ...categoryHighlight].slice(0, 3);
}

function statusDetail(observation) {
  const label = title(String(observation.status ?? "needs_data"));
  const latest = observation.evidence_date_range?.end;
  return [label, latest ? `Latest ${formatDate(latest)}` : null].filter(Boolean).join(" · ");
}

function highlightDetail(observation) {
  const pr = observation.explanation_data?.pr_detection;
  if (pr?.detected) return prDetail(pr.prs?.[0]);
  if (observation.explanation_data?.volume_trend?.direction === "up") {
    return "Volume moved up from the previous session.";
  }
  return "Recent same-exercise performance is improving.";
}

function prDetail(pr) {
  if (!pr) return "Performance PR detected.";
  if (pr.type === "reps_at_load") {
    const load = pr.load_unit === "bodyweight" || pr.load == null || pr.load === 0
      ? "BW"
      : `${pr.load} ${pr.load_unit ?? "lb"}`;
    return `New reps-at-load PR: ${pr.value} reps at ${load}.`;
  }
  if (pr.type === "session_volume") return `Volume PR: ${number(pr.value)} ${pr.unit ?? "lb"}.`;
  if (pr.type === "heaviest_load") return `Load PR: ${pr.value} ${pr.unit ?? "lb"}.`;
  return "Performance PR detected.";
}

function title(value) {
  return String(value ?? "").replaceAll(/[-_]/g, " ").replaceAll(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T12:00:00Z`));
}

function number(value) {
  return Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

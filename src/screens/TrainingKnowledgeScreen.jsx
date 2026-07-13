import {
  BrowseCard,
  CompactTable,
  DeepPageCard,
  HistoryCard,
  InformationList,
  InformationListItem,
  MetadataFooter,
  MetadataCard,
  MetricGroup,
  PerformanceMetric,
  PressableCard,
  SectionHeader,
  SessionBadge,
  SummaryCard,
} from "../components/deep-page/DeepPagePrimitives";
import MobilePageHeader from "../components/navigation/MobilePageHeader";
import Card from "../components/ui/Card";
import {
  getCanonicalTrainingExerciseLabel,
  getCanonicalTrainingExerciseSlug,
} from "../domain/models/trainingExerciseIdentity";
import { withPrimaryTrainingNavigationCategory } from "../navigation/trainingNavigationMapping";

const FLAT_TRAINING_NAV_GROUPS = [
  "Chest",
  "Back",
  "Shoulders",
  "Biceps",
  "Triceps",
  "Core",
  "Quads",
  "Hamstrings",
  "Glutes",
  "Calves",
];

export default function TrainingKnowledgeScreen({
  backHref,
  correctionAction,
  correctionStatus,
  mode,
  navigation,
  report,
  session,
  slug,
}) {
  const content = getPageContent({
    correctionAction,
    correctionStatus,
    mode,
    report,
    session,
    slug,
  });

  return (
    <main className="app-surface min-h-screen">
      <div className="mx-auto max-w-[393px] px-4 pt-4 pb-24">
        <MobilePageHeader
          breadcrumbs={navigation?.breadcrumbs}
          description={content.summary}
          parentHref={navigation?.parentRoute ?? backHref ?? "/progress/training"}
          parentLabel={getParentLabel(navigation)}
          sectionLabel={content.eyebrow}
          title={content.title}
        />

        <div className="space-y-4">{content.sections}</div>
      </div>
    </main>
  );
}

function getParentLabel(navigation) {
  const breadcrumbs = navigation?.breadcrumbs ?? [];

  if (navigation?.parentRoute === "/progress/training/library") {
    return "Training Library";
  }

  if (!breadcrumbs.length) return "Training";
  return breadcrumbs.at(-2)?.label ?? "Training";
}

function getPageContent({ correctionAction, correctionStatus, mode, report, session, slug }) {
  if (mode === "session") {
    return getSessionContent({ correctionAction, correctionStatus, session });
  }
  if (mode === "library") return getLibraryContent({ report, slug });

  return getReportingContent({ report, slug });
}

function getReportingContent({ report, slug }) {
  const reportingLink = (report.reportingLinks ?? []).find((item) => item.id === slug);
  const title = reportingLink?.label ?? "Training Report";

  if (slug === "resistance") {
    return getResistanceReportingContent({ report });
  }

  if (slug === "history") {
    return {
      eyebrow: "Reporting",
      title: "Training History",
      summary: "Browse recent training days and open the sessions you want to review.",
      sections: [
        <TrainingDayHistoryCard
          days={report.trainingDays ?? []}
          key="training-history"
        />,
      ],
    };
  }

  return {
    eyebrow: "Reporting",
    title,
    summary:
      reportingLink?.detail ??
      "This reporting area will organize long-term training progress over time.",
    sections: [
      <Card className="space-y-2" key="foundation">
        <h2 className="text-lg font-extrabold text-slate-950">Foundation</h2>
        <p className="text-sm font-semibold leading-6 text-slate-500">
          This page is now a permanent destination. It will grow into graphs,
          trends, comparisons, goal impact, and historical analysis as more
          canonical training evidence accumulates.
        </p>
      </Card>,
    ],
  };
}

function getResistanceReportingContent({ report }) {
  const performance = report.resistancePerformance;
  const summary = performance?.summary ?? {};
  const statusCounts = getExerciseStatusCounts(performance?.exerciseObservations ?? []);
  const highlights = getResistanceHighlights(performance);
  const needsAttention = getResistanceNeedsAttention(performance);
  const recentPrs = getRecentPrs(performance);

  return {
    eyebrow: "Reporting",
    title: "Resistance Training",
    summary: "Strength progression, PRs, and category momentum from training history.",
    sections: [
      <SummaryCard key="summary" title="Resistance Summary">
        <MetricGroup
          items={[
            {
              label: "7 days",
              value: summary.resistance_sessions_last_7_days ?? 0,
            },
            {
              label: "30 days",
              value: summary.exercises_trained_last_30_days ?? summary.exercises_tracked ?? 0,
            },
            {
              label: "Improving",
              value: summary.exercises_improving ?? 0,
            },
            {
              label: "Recent PRs",
              value: summary.recent_pr_count ?? 0,
            },
          ]}
        />
      </SummaryCard>,
      <DeepPageCard className="space-y-2.5" key="status">
        <SectionHeader title="Performance Status" />
        <MetricGroup
          items={[
            { label: "Improving", value: statusCounts.improving ?? 0 },
            { label: "Stable", value: statusCounts.stable ?? 0 },
            { label: "Plateauing", value: statusCounts.plateauing ?? 0 },
            { label: "Regressing", value: statusCounts.regressing ?? 0 },
            {
              label: "Needs data",
              value: statusCounts.insufficient_data ?? 0,
            },
          ]}
        />
      </DeepPageCard>,
      <DeepPageCard className="space-y-2.5" key="highlights">
        <SectionHeader title="Highlights" />
        <ObservationList
          emptyText="No clear positive signals yet."
          items={highlights}
        />
      </DeepPageCard>,
      <DeepPageCard className="space-y-2.5" key="needs-attention">
        <SectionHeader title="Needs Attention" />
        <ObservationList
          emptyText="No clear training concerns yet."
          items={needsAttention}
        />
      </DeepPageCard>,
      <DeepPageCard className="space-y-2.5" key="categories">
        <SectionHeader title="Category Rollups" />
        <CategoryRollups observations={performance?.categoryObservations ?? []} />
      </DeepPageCard>,
      <DeepPageCard className="space-y-2.5" key="prs">
        <SectionHeader title="Recent PRs" />
        <ObservationList emptyText="No recent PRs yet." items={recentPrs} />
      </DeepPageCard>,
      <MetadataFooter
        items={[
          {
            label: "Source",
            value: "Training sessions",
          },
        ]}
        key="metadata"
        title="Details"
      />,
    ],
  };
}

function ObservationList({ emptyText, items = [] }) {
  if (!items.length) {
    return (
      <p className="text-sm font-semibold leading-6 text-slate-500">
        {emptyText}
      </p>
    );
  }

  return (
    <InformationList>
      {items.map((item) => (
        <InformationListItem
          detail={item.detail}
          key={`${item.label}-${item.detail}`}
          label={item.label}
        />
      ))}
    </InformationList>
  );
}

function CategoryRollups({ observations = [] }) {
  const ordered = FLAT_TRAINING_NAV_GROUPS.map((label) => {
    const category = slugify(label);

    return observations.find((observation) => observation.category === category);
  }).filter(Boolean);

  if (!ordered.length) {
    return (
      <p className="text-sm font-semibold leading-6 text-slate-500">
        Resistance category history will appear as exercises accumulate.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {ordered.map((observation) => {
        const categoryLabel = toTitle(observation.category);
        const data = observation.explanation_data ?? {};
        const statusCounts = data.status_counts ?? {};
        const parts = [
          data.latest_trained_at ? `Latest ${formatDate(data.latest_trained_at)}` : null,
          `${data.exercise_count ?? 0} exercise${data.exercise_count === 1 ? "" : "s"}`,
          data.latest_known_sets
            ? `${data.latest_known_sets} set${data.latest_known_sets === 1 ? "" : "s"}`
            : null,
          data.latest_known_volume ? `${formatNumber(data.latest_known_volume)} lb` : null,
        ].filter(Boolean);

        return (
          <PressableCard
            className="block px-3 py-2.5"
            href={`/progress/training/library/${observation.category}`}
            key={observation.category}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-slate-950">
                  {categoryLabel}
                </p>
                <p className="mt-0.5 text-xs font-semibold leading-5 text-slate-500">
                  {parts.join(" · ")}
                </p>
                <p className="mt-1 text-[11px] font-bold text-slate-400">
                  {formatStatusCounts(statusCounts)}
                </p>
              </div>
              <span className="shrink-0 text-sm font-extrabold text-indigo-600">
                &gt;
              </span>
            </div>
          </PressableCard>
        );
      })}
    </div>
  );
}

function getExerciseStatusCounts(exerciseObservations = []) {
  return exerciseObservations.reduce((counts, observation) => {
    counts[observation.status] = (counts[observation.status] ?? 0) + 1;

    return counts;
  }, {});
}

function getResistanceHighlights(performance) {
  const exerciseHighlights = (performance?.exerciseObservations ?? [])
    .filter((observation) => observation.status === "improving")
    .slice(0, 3)
    .map((observation) => ({
      label: observation.exercise.name,
      detail: formatExerciseHighlight(observation),
    }));
  const categoryHighlight = (performance?.categoryObservations ?? [])
    .filter(
      (observation) =>
        (observation.explanation_data?.status_counts?.improving ?? 0) > 1
    )
    .slice(0, 1)
    .map((observation) => ({
      label: toTitle(observation.category),
      detail: `${observation.explanation_data.status_counts.improving} improving exercises`,
    }));

  return [...exerciseHighlights, ...categoryHighlight].slice(0, 4);
}

function getResistanceNeedsAttention(performance) {
  return (performance?.exerciseObservations ?? [])
    .filter((observation) => ["regressing", "plateauing"].includes(observation.status))
    .slice(0, 4)
    .map((observation) => ({
      label: observation.exercise.name,
      detail:
        observation.status === "regressing"
          ? "Recent performance moved down."
          : "Multiple comparable sessions without clear overload.",
    }));
}

function getRecentPrs(performance) {
  return (performance?.exerciseObservations ?? [])
    .filter((observation) => observation.explanation_data?.pr_detection?.detected)
    .slice(0, 5)
    .map((observation) => ({
      label: observation.exercise.name,
      detail: formatPrDetail(observation.explanation_data.pr_detection.prs?.[0]),
    }));
}

function formatExerciseHighlight(observation) {
  const pr = observation.explanation_data?.pr_detection;

  if (pr?.detected) return formatPrDetail(pr.prs?.[0]);

  if (observation.explanation_data?.volume_trend?.direction === "up") {
    return "Volume moved up from the previous session.";
  }

  return "Recent same-exercise performance is improving.";
}

function formatPrDetail(pr) {
  if (!pr) return "Performance PR detected.";
  if (pr.type === "reps_at_load") {
    return `New reps-at-load PR: ${pr.value} reps at ${pr.load} ${pr.load_unit ?? "lb"}.`;
  }
  if (pr.type === "session_volume") {
    return `Volume PR: ${formatNumber(pr.value)} ${pr.unit ?? "lb"}.`;
  }
  if (pr.type === "heaviest_load") {
    return `Load PR: ${pr.value} ${pr.unit ?? "lb"}.`;
  }

  return "Performance PR detected.";
}

function formatStatusCounts(statusCounts = {}) {
  const parts = [
    statusCounts.improving ? `${statusCounts.improving} improving` : null,
    statusCounts.stable ? `${statusCounts.stable} stable` : null,
    statusCounts.plateauing ? `${statusCounts.plateauing} plateauing` : null,
    statusCounts.regressing ? `${statusCounts.regressing} regressing` : null,
    statusCounts.insufficient_data ? `${statusCounts.insufficient_data} needs data` : null,
  ].filter(Boolean);

  return parts.join(" · ") || "More history needed";
}

function TrainingDayHistoryCard({ days = [] }) {
  return (
    <HistoryCard emptyText="Training days will appear here." title="Recent Training History">
      {days.length > 0 && (
        <div className="space-y-2">
          {days.slice(0, 20).map((day) => (
            <PressableCard className="px-3 py-2" key={day.id}>
              <details>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0">
                  <span className="block text-sm font-extrabold text-slate-950">
                    {day.label}
                  </span>
                  <span className="mt-0.5 block text-xs font-bold text-slate-500">
                    {day.summary}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-extrabold text-[var(--primary)]">
                  &gt;
                </span>
              </summary>
              <div className="mt-2 border-t border-[var(--divider)] pt-2">
                <InformationList>
                  {(day.sessions ?? []).map((session) => (
                    <InformationListItem
                      detail={session.detail || session.value}
                      href={session.href}
                      key={session.id}
                      label={session.label}
                    />
                  ))}
                </InformationList>
              </div>
              </details>
            </PressableCard>
          ))}
        </div>
      )}
    </HistoryCard>
  );
}

function getLibraryContent({ report, slug = [] }) {
  const path = Array.isArray(slug) ? slug : [slug].filter(Boolean);
  const leafDetail = getLibraryLeafDetail({ path, report });
  const title = path.length ? toTitle(path.at(-1)) : "Training Library";

  if (leafDetail) return leafDetail;

  const children = getLibraryChildren({ path, report });

  return {
    eyebrow: "Training Library",
    title,
    summary: path.length
      ? "Choose an exercise to review your last performance."
      : "Browse by muscle group and jump straight to exercises.",
    sections: [
      <BrowseCard items={children} key="library" />,
    ],
  };
}

function getSessionContent({ correctionAction, correctionStatus, session }) {
  if (!session) {
    return {
      eyebrow: "Workout Detail",
      title: "Workout not found",
      summary: "This session is not available in canonical training history.",
      sections: [],
    };
  }

  return {
    eyebrow: "Workout Detail",
    title: session.label,
    summary: `${session.value} - ${formatDate(session.date)}`,
    sections: [
      <SummaryCard
        detail={session.detail}
        key="metrics"
        meta={formatDate(session.date)}
        title="Session Details"
      >
        <div className="grid grid-cols-2 gap-2">
          <PerformanceMetric label="Workout" value={session.value} />
          <PerformanceMetric label="Date" value={formatDate(session.date)} />
        </div>
        {session.sourceEvidence?.length > 0 && (
          <p className="text-xs font-bold text-slate-400">
            Source: {session.sourceEvidence.join(" + ")}
          </p>
        )}
      </SummaryCard>,
      session.exercises?.length > 0 && (
        <DeepPageCard className="space-y-2.5" key="exercises">
          <SectionHeader title="Exercises" />
          {session.exercises.map((exercise) => (
            <div
              className="rounded-[12px] bg-[var(--surface-muted)] px-3 py-2.5"
              key={exercise.id ?? exercise.name}
            >
              <p className="text-sm font-extrabold text-slate-950">
                {exercise.name}
              </p>
              <div className="mt-2 space-y-1">
                {(exercise.sets ?? []).map((set, index) => (
                  <p
                    className="text-xs font-semibold text-slate-500"
                    key={`${set.set_number ?? index}-${set.reps ?? "duration"}-${set.duration_seconds ?? set.weight ?? "bodyweight"}`}
                  >
                    Set {set.set_number ?? index + 1}: {formatSetDetail(set)}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </DeepPageCard>
      ),
      correctionAction && (
        <TrainingSessionCorrectionCard
          action={correctionAction}
          key="correction"
          session={session}
          status={correctionStatus}
        />
      ),
    ].filter(Boolean),
  };
}

function TrainingSessionCorrectionCard({ action, session, status }) {
  const message = getCorrectionStatusMessage(status);

  return (
    <MetadataCard title="Add / Correct Workout Details">
      <div>
        <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
          Add missing exercises, sets, reps, or loads for this workout. The
          original source stays attached while this detail improves the workout
          record.
        </p>
      </div>
      {message && (
        <p className={`text-sm font-bold ${message.tone}`}>{message.text}</p>
      )}
      <form action={action} className="space-y-3">
        <input name="sessionId" type="hidden" value={session.id} />
        <textarea
          className="min-h-36 w-full rounded-[14px] border border-slate-200 bg-white p-3 text-sm font-semibold leading-6 text-slate-700 outline-none focus:border-indigo-500"
          name="correctionText"
          placeholder={[
            "Shoulder Press Machine",
            "15 x #120",
            "12 x #130",
            "10 x #140",
            "8 x #150",
          ].join("\n")}
        />
        <button
          className="w-full rounded-[14px] bg-indigo-600 px-4 py-3 text-sm font-extrabold text-white"
          type="submit"
        >
          Save workout details
        </button>
      </form>
    </MetadataCard>
  );
}

function getCorrectionStatusMessage(status) {
  if (status === "saved") {
    return {
      text: "Workout details saved.",
      tone: "text-emerald-600",
    };
  }

  if (status === "missing-details") {
    return {
      text: "Add workout details before saving.",
      tone: "text-amber-600",
    };
  }

  if (status === "session-not-found") {
    return {
      text: "This workout could not be found.",
      tone: "text-rose-600",
    };
  }

  if (status === "failed") {
    return {
      text: "Workout details could not be saved. Please try again.",
      tone: "text-rose-600",
    };
  }

  return null;
}

function getLibraryChildren({ path, report }) {
  if (path.length === 0) {
    return getFlatTrainingNavigationGroups(report);
  }

  if (isFlatTrainingNavigationPath(path)) {
    return getFlatTrainingNavigationChildren({ path, report });
  }

  if (path[0] === "cardio" && path.length === 1) {
    return (report.trainingBreakdowns?.cardio ?? []).map((item) => ({
      detail: `${item.count} session${item.count === 1 ? "" : "s"}`,
      href: `/progress/training/library/cardio/${slugify(item.label)}`,
      label: item.label,
    }));
  }

  if (path[0] === "resistance" && path.length === 1) {
    return [
      {
        detail: "Arms, chest, back, shoulders",
        href: "/progress/training/library/resistance/upper-body",
        label: "Upper Body",
      },
      {
        detail: "Legs, glutes, calves",
        href: "/progress/training/library/resistance/lower-body",
        label: "Lower Body",
      },
    ];
  }

  if (path[0] === "resistance" && path[1] === "upper-body" && path.length === 2) {
    const regions = report.trainingBreakdowns?.resistance ?? [];

    return regions.map((region) => ({
      detail: null,
      href: `/progress/training/library/resistance/upper-body/${slugify(region.label)}`,
      label: region.label,
    }));
  }

  if (path[0] === "resistance" && path.length === 3) {
    const regions = report.trainingBreakdowns?.resistance ?? [];
    const region = regions.find((item) => slugify(item.label) === path[2]);

    return (region?.movementFamilies ?? region?.muscleGroups ?? []).map((family) => ({
      detail: null,
      href: `/progress/training/library/resistance/upper-body/${path[2]}/${slugify(family.label)}`,
      label: family.label,
    }));
  }

  if (path[0] === "resistance" && path.length === 4) {
    const regions = report.trainingBreakdowns?.resistance ?? [];
    const region = regions.find((item) => slugify(item.label) === path[2]);
    const family = (region?.movementFamilies ?? region?.muscleGroups ?? []).find(
      (item) => slugify(item.label) === path[3]
    );

    return (family?.exercises ?? []).map((exercise) => ({
      detail: formatExerciseSetSummary(exercise.sets),
      href: `/progress/training/library/resistance/upper-body/${path[2]}/${path[3]}/${slugify(exercise.label)}`,
      label: exercise.label,
    }));
  }

  return [];
}

function getLibraryLeafDetail({ path, report }) {
  if (isFlatTrainingNavigationPath(path) && path.length >= 2) {
    return getExerciseDetailContent({
      exerciseSlug: path.at(-1),
      report,
    });
  }

  if (path[0] === "cardio" && path.length >= 2) {
    return getActivityDetailContent({
      activitySlug: path[1],
      report,
    });
  }

  if (path[0] === "resistance" && path.length >= 5) {
    return getExerciseDetailContent({
      exerciseSlug: path[4],
      report,
    });
  }

  return null;
}

function getFlatTrainingNavigationGroups(report) {
  const exerciseCounts = getFlatTrainingExerciseCounts(report);

  return FLAT_TRAINING_NAV_GROUPS.map((label) => {
    const slug = slugify(label);
    const count = exerciseCounts.get(slug) ?? 0;

    return {
      detail: count ? `${count} exercise${count === 1 ? "" : "s"}` : null,
      href: `/progress/training/library/${slug}`,
      label,
    };
  });
}

function getFlatTrainingNavigationChildren({ path, report }) {
  const groupSlug = path[0];
  const exercises = getExercisesForFlatTrainingGroup({ groupSlug, report });

  return exercises.map((exercise) => ({
    detail: formatExerciseSetSummary(exercise.sets),
    href: `/progress/training/library/${groupSlug}/${slugify(exercise.label)}`,
    label: exercise.label,
  }));
}

function getFlatTrainingExerciseCounts(report) {
  return new Map(
    FLAT_TRAINING_NAV_GROUPS.map((label) => {
      const slug = slugify(label);

      return [
        slug,
        getExercisesForFlatTrainingGroup({ groupSlug: slug, report }).length,
      ];
    })
  );
}

function getExercisesForFlatTrainingGroup({ groupSlug, report }) {
  const regions = report.trainingBreakdowns?.resistance ?? [];
  const exercises = regions.flatMap((region) =>
    (region.movementFamilies ?? region.muscleGroups ?? []).flatMap((family) =>
      (family.exercises ?? []).map((exercise) =>
        withPrimaryTrainingNavigationCategory({
          ...exercise,
          familyLabel: family.label,
          regionLabel: region.label,
        })
      )
    )
  );
  const matches = exercises.filter((exercise) =>
    exerciseBelongsToFlatTrainingGroup({ exercise, groupSlug })
  );
  const exercisesBySlug = new Map();

  matches.forEach((exercise) => {
    const key = slugify(exercise.label);
    const current = exercisesBySlug.get(key);

    if (!current) {
      exercisesBySlug.set(key, exercise);
      return;
    }

    exercisesBySlug.set(key, {
      ...current,
      sets: [...(current.sets ?? []), ...(exercise.sets ?? [])],
    });
  });

  return [...exercisesBySlug.values()].sort((a, b) =>
    a.label.localeCompare(b.label)
  );
}

function exerciseBelongsToFlatTrainingGroup({ exercise, groupSlug }) {
  return exercise.primaryNavigationCategory === groupSlug;
}

function isFlatTrainingNavigationPath(path = []) {
  return FLAT_TRAINING_NAV_GROUPS.map(slugify).includes(path[0]);
}

function getActivityDetailContent({ activitySlug, report }) {
  const sessions = getTrainingSessions(report).filter(
    (session) => slugify(session.label) === activitySlug
  );
  const latest = sessions[0];
  const title = latest?.label ?? toTitle(activitySlug);

  return {
    eyebrow: "Training Library",
    title,
    summary: "Review the most recent session and recent history for this activity.",
    sections: [
      <MostRecentTrainingCard
        key="most-recent"
        record={latest}
        value={latest?.detail || latest?.value}
      />,
      <TrainingHistoryCard key="history" records={sessions} title="Recent Sessions" />,
      <WorkoutDetailLinksCard key="details" records={sessions} />,
    ],
  };
}

function getExerciseDetailContent({ exerciseSlug, report }) {
  const occurrences = getExerciseOccurrences({ exerciseSlug, report });
  const latest = occurrences[0];
  const title = latest?.exercise.name ?? toTitle(exerciseSlug);
  const lifetimeSessions = getExerciseSessionCount(occurrences);
  const summary = latest?.session
    ? `Last trained ${formatDate(latest.session.date)} - ${formatLifetimeSessions(
        lifetimeSessions
      )}`
    : `No matching history yet - ${formatLifetimeSessions(lifetimeSessions)}`;

  return {
    eyebrow: "Training Library",
    title,
    summary,
    sections: [
      <MostRecentExerciseCard key="most-recent" occurrence={latest} />,
      <ExerciseHistoryCard key="history" occurrences={occurrences} />,
      <ExerciseMetadataFooter
        key="metadata"
        records={occurrences.map((occurrence) => occurrence.session)}
      />,
    ],
  };
}

function MostRecentTrainingCard({ record, value }) {
  return (
    <SummaryCard
      detail={record ? value : null}
      meta={record ? formatDate(record.date) : null}
      title="Most Recent"
    >
      {record ? (
        null
      ) : (
        <p className="text-sm font-semibold leading-6 text-slate-500">
          No matching history yet.
        </p>
      )}
    </SummaryCard>
  );
}

function MostRecentExerciseCard({ occurrence }) {
  const sets = occurrence?.exercise?.sets ?? [];

  return (
    <SummaryCard
      meta={occurrence?.session ? <SessionBadge date={occurrence.session.date} /> : null}
      title="Last Performance"
    >
      {occurrence?.session ? (
        <div className="space-y-2">
          <MetricGroup items={getExerciseMetricItems(sets)} />
          <ExerciseSetList sets={sets} />
        </div>
      ) : (
        <p className="text-sm font-semibold leading-6 text-slate-500">
          No matching history yet.
        </p>
      )}
    </SummaryCard>
  );
}

function TrainingHistoryCard({ records = [], title = "Recent History" }) {
  return (
    <HistoryCard emptyText="Future sessions will appear here." title={title}>
      {records.length > 0 && (
        <InformationList>
          {records.slice(0, 10).map((record) => (
            <TrainingHistoryRow key={record.id} record={record} />
          ))}
        </InformationList>
      )}
    </HistoryCard>
  );
}

function ExerciseHistoryCard({ occurrences = [] }) {
  return (
    <HistoryCard emptyText="Future sets will appear here." title="Recent History">
      {occurrences.length > 0 ? (
        <div className="space-y-1">
          {occurrences.slice(0, 10).map((occurrence) => (
            <details
              className="rounded-[12px] bg-[var(--surface-muted)] px-3 py-2"
              key={`${occurrence.session.id}-${occurrence.exercise.id ?? occurrence.exercise.name}`}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                <span className="flex min-w-0 items-center gap-2">
                  <SessionBadge date={occurrence.session.date} />
                  <span className="block truncate text-xs font-semibold text-slate-500">
                    {formatExerciseHistoryMeta(occurrence.exercise.sets)}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-extrabold text-indigo-600">
                  &gt;
                </span>
              </summary>
              <div className="mt-2 border-t border-[var(--divider)] pt-2">
                <ExerciseSetList sets={occurrence.exercise.sets} />
              </div>
            </details>
          ))}
        </div>
      ) : (
        null
      )}
    </HistoryCard>
  );
}

function ExerciseMetadataFooter({ records = [] }) {
  const uniqueRecords = dedupeRecords(records).slice(0, 5);
  const items = uniqueRecords.map((record) => ({
    href: record.href,
    label: `Workout ${formatDate(record.date)}`,
    value:
      record.sourceEvidence?.length > 0
        ? record.sourceEvidence.join(" + ")
        : "Details available",
  }));

  return <MetadataFooter items={items} title="Source workouts" />;
}

function ExerciseSetList({ sets = [] }) {
  if (!sets?.length) {
    return (
      <p className="text-sm font-semibold leading-6 text-slate-500">
        Details pending.
      </p>
    );
  }

  return (
    <CompactTable
      columns={[
        { key: "set", label: "Set", width: "0.7fr" },
        { key: "reps", label: "Reps", width: "1fr", align: "right" },
        { key: "weight", label: "Load", width: "1.2fr", align: "right" },
      ]}
      rows={sets.map((set, index) => ({
        id: `${set.set_number ?? index + 1}-${set.reps ?? "unknown"}-${set.duration_seconds ?? "reps"}-${set.weight ?? "bodyweight"}-${set.weight_unit ?? "lb"}`,
        reps: hasDurationSeconds(set)
          ? formatDurationSet(Number(set.duration_seconds))
          : set.reps ?? "?",
        set: set.set_number ?? index + 1,
        weight: formatSetWeight(set),
      }))}
    />
  );
}

function formatSetDetail(set = {}) {
  if (hasDurationSeconds(set)) {
    return formatDurationSet(Number(set.duration_seconds));
  }

  const reps = set.reps ?? "?";

  if (set.weight_unit === "bodyweight" || set.load_type === "bodyweight") {
    return `${reps} reps · Bodyweight`;
  }

  return `${reps} reps @ ${formatSetWeight(set)}`;
}

function formatSetGlance(set = {}) {
  if (hasDurationSeconds(set)) {
    return formatDurationSet(Number(set.duration_seconds));
  }

  const reps = set.reps ?? "?";
  return `${reps} x ${formatSetWeight(set)}`;
}

function TrainingHistoryRow({ record }) {
  return (
    <InformationListItem
      detail={record.detail || record.value || "Workout details available"}
      label={formatDate(record.date)}
    />
  );
}

function WorkoutDetailLinksCard({ records = [] }) {
  const uniqueRecords = dedupeRecords(records).slice(0, 5);

  return (
    <MetadataCard title="Workout Details">
      {uniqueRecords.length > 0 ? (
        <InformationList>
          {uniqueRecords.map((record) => (
            <InformationListItem
              detail={
                record.sourceEvidence?.length > 0
                  ? `Source: ${record.sourceEvidence.join(" + ")}`
                  : null
              }
              href={record.href}
              key={record.id}
              label={formatDate(record.date)}
            />
          ))}
        </InformationList>
      ) : (
        <p className="text-sm font-semibold leading-6 text-slate-500">
          Workout details will appear as this history grows.
        </p>
      )}
    </MetadataCard>
  );
}

function getTrainingSessions(report) {
  return (report.trainingDays ?? []).flatMap((day) => day.sessions ?? []);
}

function getExerciseOccurrences({ exerciseSlug, report }) {
  const targetSlug = getCanonicalTrainingExerciseSlug(exerciseSlug);

  return getTrainingSessions(report).flatMap((session) =>
    (session.exercises ?? [])
      .filter(
        (exercise) => getCanonicalTrainingExerciseSlug(exercise.name) === targetSlug
      )
      .map((exercise) => ({
        exercise: {
          ...exercise,
          name: getCanonicalTrainingExerciseLabel(exercise.name),
        },
        session,
      }))
  );
}

function dedupeRecords(records = []) {
  const recordsById = new Map();

  records.filter(Boolean).forEach((record) => {
    if (!recordsById.has(record.id)) recordsById.set(record.id, record);
  });

  return [...recordsById.values()];
}

function getExerciseSessionCount(occurrences = []) {
  return dedupeRecords(occurrences.map((occurrence) => occurrence.session)).length;
}

function getExerciseSetStats(sets = []) {
  const validSets = sets.filter(Boolean);
  const volume = validSets.reduce((total, set) => {
    const reps = Number(set.reps);
    const weight = Number(set.weight);

    if (!Number.isFinite(reps) || !Number.isFinite(weight)) return total;
    return total + reps * weight;
  }, 0);
  const bestSet = validSets
    .map((set) => ({
      reps: Number(set.reps),
      set,
      weight: Number(set.weight),
    }))
    .filter(({ reps }) => Number.isFinite(reps))
    .sort((a, b) => {
      const aWeight = Number.isFinite(a.weight) ? a.weight : -1;
      const bWeight = Number.isFinite(b.weight) ? b.weight : -1;

      if (bWeight !== aWeight) return bWeight - aWeight;
      return b.reps - a.reps;
    })[0]?.set;

  return {
    bestSet,
    totalSets: validSets.length,
    volume: volume > 0 ? volume : null,
  };
}

function getExerciseMetricItems(sets = []) {
  const stats = getExerciseSetStats(sets);
  return [
    stats.volume ? { label: "Volume", value: formatVolume(stats.volume) } : null,
    stats.bestSet ? { label: "Best Set", value: formatSetGlance(stats.bestSet) } : null,
    stats.totalSets ? { label: "Sets", value: `${stats.totalSets}` } : null,
  ].filter(Boolean);
}

function formatExerciseHistoryMeta(sets = []) {
  const stats = getExerciseSetStats(sets);
  return [
    stats.totalSets ? `${stats.totalSets} sets` : null,
    stats.bestSet ? `Best ${formatSetGlance(stats.bestSet)}` : null,
    stats.volume ? formatVolume(stats.volume) : null,
  ]
    .filter(Boolean)
    .join(" - ");
}

function formatVolume(value) {
  return `${Math.round(value).toLocaleString("en-US")} lb`;
}

function formatLifetimeSessions(count) {
  return `${count} lifetime ${count === 1 ? "session" : "sessions"}`;
}

function formatSetWeight(set = {}) {
  if (hasDurationSeconds(set)) {
    return "Timed";
  }

  if (set.weight_unit === "bodyweight") {
    return "Bodyweight";
  }

  if (set.weight === null || set.weight === undefined || set.weight === "") {
    return "BW";
  }

  return `${set.weight} ${set.weight_unit ?? "lb"}`;
}

function hasDurationSeconds(set = {}) {
  return (
    set.duration_seconds !== null &&
    set.duration_seconds !== undefined &&
    set.duration_seconds !== "" &&
    Number.isFinite(Number(set.duration_seconds))
  );
}

function formatDurationSet(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes <= 0) return `${seconds}s`;

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatExerciseSetSummary(sets = []) {
  if (!sets.length) return "Exercise history";

  return sets.map((set) => set.summary).filter(Boolean).join(" - ");
}

function formatDate(value) {
  if (!value) return "Pending";

  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  const date =
    year && month && day ? new Date(year, month - 1, day) : new Date(value);

  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) ? number.toLocaleString("en-US") : "Pending";
}

function slugify(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function toTitle(value) {
  return String(value ?? "")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  CircleDot,
  ClipboardList,
  Dumbbell,
  Flame,
  Shield,
  Zap,
} from "lucide-react";
import EvidenceReportContext from "../components/progress/EvidenceReportContext";
import ProgressPhotoGallery from "../components/progress/ProgressPhotoGallery";
import ReportDrawer from "../components/progress/ReportDrawer";
import {
  DrawerPreview,
  PressableCard,
  PressableRow,
  SectionHeader,
  nativePressClassName,
} from "../components/deep-page/DeepPagePrimitives";
import Card from "../components/ui/Card";
import IconBadge from "../components/ui/IconBadge";
import ActivityHistorySheet from "../components/activity/ActivityHistorySheet";
import NutritionHistorySheet from "../components/nutrition/NutritionHistorySheet";
import TrainingHistorySheet from "../components/training/TrainingHistorySheet";
import TrainingTimelineSelector from "../components/training/TrainingTimelineSelector";
import { withPrimaryTrainingNavigationCategory } from "../navigation/trainingNavigationMapping";
import { getTrainingDaySummary } from "../presentation/trainingPresentation";

const TRAINING_AREA_NAV_GROUPS = [
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
export const NUTRITION_HISTORY_PREVIEW_LIMIT = 3;
export const ACTIVITY_HISTORY_PREVIEW_LIMIT = 3;

export default function ProgressPlaceholderScreen({ evidenceContext, from, report }) {
  return (
    <main className="app-surface min-h-screen">
      <div className="mx-auto max-w-[393px] px-4 pt-10 pb-24">
        <Link
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-500"
          href={from === "you" ? "/progress?from=you" : "/progress"}
        >
          <ArrowLeft size={18} />
          Evidence Hub
        </Link>

        <header className="mb-5 flex items-start gap-3">
          <IconBadge
            className="rounded-full"
            color={report.tone}
            icon={ClipboardList}
            size="lg"
          />
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-indigo-600">
              Evidence Report
            </p>
            <h1 className="mt-1 text-3xl font-extrabold leading-tight text-slate-950">
              {report.title}
            </h1>
            <p className="mt-2 text-base leading-7 text-slate-500">
              {report.subtitle ?? "What PhysiqueOS currently understands."}
            </p>
          </div>
        </header>

        {report.id === "training" && evidenceContext && (
          <TrainingEvidenceContext context={evidenceContext} />
        )}
        {report.id === "nutrition" && evidenceContext && (
          <NutritionEvidenceContext context={evidenceContext} from={from} />
        )}
        {report.id === "activity" && evidenceContext && (
          <ActivityEvidenceContext context={evidenceContext} from={from} />
        )}
        {report.id === "photos" && evidenceContext && (
          <PhotosEvidenceContext context={evidenceContext} from={from} />
        )}

        {report.id === "training" && (
          <TrainingEvidenceReport
            evidenceContext={evidenceContext}
            report={report}
          />
        )}
        {report.id === "nutrition" && <NutritionEvidenceReport report={report} />}
        {report.id === "activity" && <ActivityEvidenceReport report={report} />}

        {report.id !== "photos" &&
          report.id !== "training" &&
          report.id !== "nutrition" &&
          report.id !== "activity" && (
          <Card className="space-y-3">
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
                  Latest
                </p>
                <p className="mt-1 text-2xl font-extrabold text-slate-950">
                  {report.metric}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">Latest</p>
                <p className="mt-1 text-sm font-extrabold text-slate-700">
                  {formatDate(report.lastUpdated)}
                </p>
              </div>
            </div>
            <p className="text-sm font-semibold leading-6 text-slate-500">
              {report.trend}
            </p>
            {report.educationalContext && (
              <p className="rounded-[12px] bg-[var(--surface-muted)] p-3 text-sm font-medium leading-5 text-[var(--text-secondary)]">
                {report.educationalContext}
              </p>
            )}
          </Card>
        )}

        {report.id === "photos" && (
          <ProgressPhotoGallery
            latestPhotoSet={report.latestPhotoSet}
            records={report.entries}
            sets={report.photoSets}
          />
        )}

        {report.expandableRecords?.length > 0 && (
          <Card className="mt-4 space-y-3">
            <h2 className="text-lg font-extrabold text-slate-950">
              Protocol Intelligence
            </h2>
            <div className="space-y-2">
              {report.expandableRecords.map((record) => (
                <details
                  className="rounded-[12px] border border-[var(--divider)] bg-[var(--surface-muted)] p-3"
                  key={record.id}
                >
                  <summary className="cursor-pointer text-sm font-extrabold text-slate-950">
                    {record.title}
                  </summary>
                  <p className="mt-2 text-xs font-bold text-slate-500">
                    {record.detail}
                  </p>
                  <p className="mt-2 text-xs font-medium leading-5 text-slate-500">
                    {record.education}
                  </p>
                </details>
              ))}
            </div>
          </Card>
        )}

        {report.id !== "photos" &&
          report.id !== "training" &&
          report.id !== "nutrition" &&
          report.id !== "activity" && (
          <div className="mt-4">
            <ReportDrawer
              description="Evidence records for this stream."
              preview={<RecordPreview entries={report.entries.slice(0, 3)} />}
              title="Available Records"
            >
              <RecordPreview entries={report.entries} />
            </ReportDrawer>
          </div>
        )}

        {report.id !== "training" && (
          <div className="mt-4 space-y-4">
            {report.id !== "photos" &&
              report.id !== "nutrition" &&
              report.id !== "activity" && (
              <EvidenceReportContext
                flush
                mode="related-goals"
                relatedGoals={report.relatedGoals}
              />
            )}
            {report.id !== "photos" && (
              <EvidenceReportContext
                dataSources={report.dataSources}
                flush
                mode="data-sources"
              />
            )}
          </div>
        )}

      </div>
    </main>
  );
}

function TrainingEvidenceContext({ context }) {
  return (
    <div data-testid="training-evidence-context">
      <TrainingTimelineSelector
        currentPath={context.currentPath}
        timeline={context}
      />
    </div>
  );
}

function NutritionEvidenceContext({ context, from }) {
  return (
    <div data-testid="nutrition-evidence-context">
      <TrainingTimelineSelector
        ariaLabel="Nutrition evidence context"
        currentPath="/progress/nutrition"
        preservedParams={{ from }}
        timeline={context}
      />
    </div>
  );
}

function ActivityEvidenceContext({ context, from }) {
  return (
    <div data-testid="activity-evidence-context">
      <TrainingTimelineSelector
        ariaLabel="Activity evidence context"
        currentPath="/progress/activity"
        preservedParams={{ from }}
        timeline={context}
      />
    </div>
  );
}

function PhotosEvidenceContext({ context, from }) {
  return (
    <div data-testid="photos-evidence-context">
      <TrainingTimelineSelector
        ariaLabel="Photos evidence context"
        currentPath="/progress/photos"
        preservedParams={{ from }}
        timeline={context}
      />
    </div>
  );
}

function NutritionEvidenceReport({ report }) {
  const {
    fullHistory,
    previewHistory,
    showAll,
  } = getNutritionHistoryPresentation(report.nutritionDays);

  return (
    <div className="space-y-4">
      <EvidenceSection title="Latest Nutrition Day">
        <LatestNutritionDayCard nutritionDay={report.latestNutrition} />
      </EvidenceSection>

      <EvidenceSection title="Reporting">
        <ReportingLinks items={report.nutritionReportingLinks ?? []} />
      </EvidenceSection>

      <EvidenceSection title="Nutrition Areas">
        <TrainingLibraryLinks items={report.nutritionLibrary ?? []} />
      </EvidenceSection>

      <EvidenceSection
        action={
          showAll ? (
            <NutritionHistorySheet days={fullHistory} />
          ) : null
        }
        title="Recent Nutrition History"
      >
        <NutritionDayHistory days={previewHistory} />
      </EvidenceSection>
    </div>
  );
}

export function getNutritionHistoryPresentation(scopedHistory = []) {
  const fullHistory = Array.isArray(scopedHistory) ? scopedHistory : [];

  return {
    fullHistory,
    previewHistory: fullHistory.slice(0, NUTRITION_HISTORY_PREVIEW_LIMIT),
    showAll: fullHistory.length > NUTRITION_HISTORY_PREVIEW_LIMIT,
  };
}

function TrainingEvidenceReport({ evidenceContext, report }) {
  const adaptHref = evidenceContext?.adaptHref ?? ((href) => href);
  const trainingDays = (report.trainingDays ?? []).map((day) => ({
    ...day,
    href: adaptHref(day.href ?? `/progress/training/day/${day.date}`),
    sessions: (day.sessions ?? []).map((session) => ({
      ...session,
      href: adaptHref(session.href),
    })),
  }));
  const latestTrainingDay = report.latestTrainingDay
    ? {
        ...report.latestTrainingDay,
        href: adaptHref(report.latestTrainingDay.href ?? `/progress/training/day/${report.latestTrainingDay.date}`),
        sessions: (report.latestTrainingDay.sessions ?? []).map((session) => ({
          ...session,
          href: adaptHref(session.href),
        })),
      }
    : null;

  return (
    <div className="space-y-4">
      <EvidenceSection title="Latest Training Day">
        <LatestTrainingDayCard trainingDay={latestTrainingDay} />
      </EvidenceSection>

      <EvidenceSection
        action={{ href: adaptHref("/progress/training/library"), label: "Browse" }}
        title="Training Areas"
      >
        <TrainingAreas
          adaptHref={adaptHref}
          breakdowns={report.trainingBreakdowns ?? {}}
          library={report.trainingLibrary ?? []}
        />
      </EvidenceSection>

      <EvidenceSection title="Reporting">
        <ReportingLinks
          adaptHref={adaptHref}
          items={report.reportingLinks ?? []}
          compact
        />
      </EvidenceSection>

      <EvidenceSection
        action={<TrainingHistorySheet days={trainingDays} />}
        title="Recent Training History"
      >
        <TrainingDayHistoryPreview
          day={trainingDays[0]}
          href={trainingDays[0]?.href ?? adaptHref("/progress/training/reporting/history")}
        />
      </EvidenceSection>

      <EvidenceSection title="Current Protocol">
        <CurrentProtocolCard protocol={report.currentProtocol} />
      </EvidenceSection>

      <EvidenceReportContext
        mode="related-goals"
        relatedGoals={report.relatedGoals}
      />

      <TrainingSourceMetadataFooter items={report.sourceEvidence ?? []} />
    </div>
  );
}

function ActivityEvidenceReport({ report }) {
  const {
    fullHistory,
    previewHistory,
    showAll,
  } = getActivityHistoryPresentation(report.activityHistory);

  return (
    <div className="space-y-4">
      <EvidenceSection title={report.latestActivitySectionTitle ?? "Latest Activity Day"}>
        <LatestActivityDayCard
          activityDay={report.latestActivityDay}
          label={report.latestActivityLabel}
        />
      </EvidenceSection>

      <EvidenceSection title="Activity Areas">
        <ActivityAreaLinks items={report.activityAreas ?? []} />
      </EvidenceSection>

      <EvidenceSection title="Linked Training Context">
        {report.linkedTrainingContext?.length > 0 ? (
          <RecordPreview entries={report.linkedTrainingContext} />
        ) : (
          <p className="text-sm font-semibold leading-6 text-slate-500">
            No linked workouts are available for this activity day.
          </p>
        )}
      </EvidenceSection>

      <EvidenceSection
        action={showAll ? <ActivityHistorySheet days={fullHistory} /> : null}
        title="Recent Activity History"
      >
        <ActivityDayHistory days={previewHistory} />
      </EvidenceSection>
    </div>
  );
}

export function getActivityHistoryPresentation(scopedHistory = []) {
  const fullHistory = Array.isArray(scopedHistory) ? scopedHistory : [];

  return {
    fullHistory,
    previewHistory: fullHistory.slice(0, ACTIVITY_HISTORY_PREVIEW_LIMIT),
    showAll: fullHistory.length > ACTIVITY_HISTORY_PREVIEW_LIMIT,
  };
}

function LatestActivityDayCard({ activityDay, label }) {
  if (!activityDay) {
    return (
      <p className="text-sm font-semibold leading-6 text-slate-500">
        Activity days will appear here once daily movement evidence is uploaded
        or connected.
      </p>
    );
  }

  return (
    <div className="rounded-[12px] bg-[var(--surface-muted)] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-extrabold text-slate-950">
            {formatDate(activityDay.date)}
          </p>
          <p className="mt-1 text-sm font-bold text-slate-700">
            {activityDay.value}
          </p>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
            {activityDay.detail}
          </p>
        </div>
        <span className="shrink-0 text-sm font-extrabold text-indigo-600">
          {label ?? (activityDay.isToday ? "Today" : "Latest Recorded")}
        </span>
      </div>
      <ActivityMetricGrid activityDay={activityDay} />
    </div>
  );
}

function CurrentActivityProtocolCard({ protocol }) {
  return (
    <details className="rounded-[12px] bg-[var(--surface-muted)] p-3">
      <summary className="cursor-pointer list-none">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-extrabold text-slate-950">
              {protocol?.sourceOfTruth ?? "User-defined"}
            </p>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
              {protocol?.dailyActivityTarget ?? "~1000 active calories/day"}
            </p>
          </div>
          <span className="shrink-0 text-sm font-extrabold text-indigo-600">
            View protocol details
          </span>
        </div>
      </summary>
      <div className="mt-3 space-y-2 border-t border-[var(--divider)] pt-3">
        <ProtocolRow
          label="Source of truth"
          value={protocol?.sourceOfTruth ?? "User-defined"}
        />
        <ProtocolRow
          label="Daily activity target"
          value={protocol?.dailyActivityTarget ?? "~1000 active calories/day"}
        />
        <ProtocolRow label="Goal" value={protocol?.goal ?? "Pending"} />
        <ProtocolRow
          label="How activity is used"
          value={
            protocol?.interpretation ??
            "Daily activity describes whole-day movement, separate from workout history."
          }
        />
        <ProtocolRow label="Future protocol settings" value="Coming soon" />
      </div>
    </details>
  );
}

function ActivityAreaLinks({ items }) {
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <Link
          className="flex items-start justify-between gap-3 rounded-[12px] bg-[var(--surface-muted)] p-3"
          href={item.href}
          key={item.id}
        >
          <div>
            <p className="text-sm font-extrabold text-slate-950">{item.label}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {item.value}
            </p>
            <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
              {item.detail}
            </p>
          </div>
          <span className="shrink-0 text-sm font-extrabold text-indigo-600">
            &gt;
          </span>
        </Link>
      ))}
    </div>
  );
}

function ActivityDayHistory({ days }) {
  if (!days.length) {
    return (
      <p className="text-sm font-semibold leading-6 text-slate-500">
        Activity history will appear as daily movement evidence is uploaded or
        connected.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {days.map((day) => (
        <details
          className="rounded-[12px] bg-[var(--surface-muted)] p-3"
          key={day.id}
        >
          <summary className="cursor-pointer list-none">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-extrabold text-slate-950">
                  {formatDate(day.date)}
                </p>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  {day.protocolStatus}
                </p>
              </div>
              <p className="shrink-0 text-sm font-extrabold text-slate-950">
                {day.value}
              </p>
            </div>
          </summary>
          <div className="mt-3 border-t border-[var(--divider)] pt-3">
            <ActivityMetricGrid activityDay={day} />
          </div>
        </details>
      ))}
    </div>
  );
}

function ActivityMetricGrid({ activityDay }) {
  const metrics = [
    ["Active Calories", formatOptionalCalories(activityDay.activeCalories)],
    ["Total Calories", formatOptionalCalories(activityDay.totalCalories)],
    ["Exercise Minutes", formatOptionalMinutes(activityDay.exerciseMinutes)],
    ["Stand Hours", formatOptionalHours(activityDay.standHours)],
    ["Workout Calories", formatOptionalCalories(activityDay.workoutActiveCalories)],
    [
      "Non-Workout Calories",
      formatOptionalCalories(activityDay.nonWorkoutActiveCalories),
    ],
    ["Move Goal", formatOptionalCalories(activityDay.moveGoal)],
    ["Linked Workouts", String(activityDay.linkedTrainingSessionCount ?? 0)],
  ];

  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      {metrics.map(([label, value]) => (
        <div className="rounded-[10px] bg-white/70 p-3" key={label}>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
            {label}
          </p>
          <p className="mt-1 text-sm font-extrabold text-slate-950">{value}</p>
        </div>
      ))}
    </div>
  );
}

function LatestNutritionDayCard({ nutritionDay }) {
  if (!nutritionDay) {
    return (
      <p className="text-sm font-semibold leading-6 text-slate-500">
        Nutrition days will appear here once meals, macros, or nutrition
        screenshots are uploaded.
      </p>
    );
  }

  return (
    <Link
      className="block rounded-[12px] bg-[var(--surface-muted)] p-3"
      href={nutritionDay.href}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-extrabold text-slate-950">
            {nutritionDay.label}
          </p>
          <p className="mt-1 text-sm font-bold text-slate-700">
            {nutritionDay.value}
          </p>
          {nutritionDay.detail && (
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
              {nutritionDay.detail}
            </p>
          )}
          {nutritionDay.sourceEvidence?.length > 0 && (
            <p className="mt-2 text-xs font-bold text-slate-400">
              Source: {nutritionDay.sourceEvidence.join(" + ")}
            </p>
          )}
        </div>
        <span className="shrink-0 text-sm font-extrabold text-indigo-600">
          View nutrition day
        </span>
      </div>
    </Link>
  );
}

function CurrentNutritionProtocolCard({ protocol }) {
  return (
    <details className="rounded-[12px] bg-[var(--surface-muted)] p-3">
      <summary className="cursor-pointer list-none">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-extrabold text-slate-950">
              {protocol?.sourceOfTruth ?? "User-defined"}
            </p>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
              {protocol?.calorieTarget ?? "Nutrition target pending"}
            </p>
          </div>
          <span className="shrink-0 text-sm font-extrabold text-indigo-600">
            View protocol details
          </span>
        </div>
      </summary>
      <div className="mt-3 space-y-2 border-t border-[var(--divider)] pt-3">
        <ProtocolRow
          label="Source of truth"
          value={protocol?.sourceOfTruth ?? "User-defined"}
        />
        <ProtocolRow
          label="Calorie target"
          value={protocol?.calorieTarget ?? "Pending"}
        />
        <ProtocolRow
          label="Protein target"
          value={protocol?.proteinTarget ?? "Pending"}
        />
        <ProtocolRow
          label="Meal strategy"
          value={protocol?.mealStrategy ?? "Pending"}
        />
        <ProtocolRow label="Goal" value={protocol?.goal ?? "Pending"} />
        <ProtocolRow label="Future protocol settings" value="Coming soon" />
      </div>
    </details>
  );
}

function EvidenceSection({ action, children, eyebrow, title }) {
  return (
    <Card className="space-y-3">
      <SectionHeader action={action} eyebrow={eyebrow} title={title} />
      {children}
    </Card>
  );
}

function NutritionDayHistory({ days }) {
  if (!days.length) {
    return (
      <p className="text-sm font-semibold leading-6 text-slate-500">
        Logged nutrition days will appear here after nutrition evidence is
        uploaded or connected.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {days.map((day) => (
        <PressableCard className="block p-3" href={day.href} key={day.id}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-extrabold text-slate-950">
                {formatDate(day.date)}
              </p>
              <p className="mt-1 text-xs font-bold text-slate-500">
                {day.detail}
              </p>
              {day.sourceEvidence?.length > 0 && (
                <p className="mt-2 text-xs font-bold text-slate-400">
                  Source: {day.sourceEvidence.join(" + ")}
                </p>
              )}
            </div>
            <p className="shrink-0 text-sm font-extrabold text-slate-950">
              {day.value}
            </p>
          </div>
        </PressableCard>
      ))}
    </div>
  );
}

function LatestTrainingDayCard({ trainingDay }) {
  if (!trainingDay) {
    return (
      <p className="text-sm font-semibold leading-6 text-slate-500">
        Upload or enter a workout to begin building your training history.
      </p>
    );
  }

  const daySummary = getTrainingDaySummary(
    trainingDay.sessions,
    summarizeTrainingActivities(trainingDay.sessions).join(" · ")
  );

  return (
    <details className={`rounded-[12px] bg-[var(--surface-muted)] p-3 ${nativePressClassName}`}>
      <summary className="cursor-pointer list-none">
        <p className="text-base font-extrabold text-slate-950">
          {trainingDay.label}
        </p>
        {daySummary && (
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
            {daySummary}
          </p>
        )}
        <span className="mt-2 inline-flex text-sm font-extrabold leading-5 text-indigo-600">
          View Training Day →
        </span>
      </summary>
      <div className="mt-3 border-t border-[var(--divider)] pt-3">
        <RecordPreview entries={trainingDay.sessions} showSources />
      </div>
    </details>
  );
}

export function summarizeTrainingActivities(sessions = []) {
  const labels = [];
  const seen = new Set();

  sessions.forEach((session) => {
    const source = String(session.label ?? "").trim();
    if (!source) return;
    const label = /^(traditional |functional )?strength training$/i.test(source)
      ? "Strength Training"
      : source;
    const key = label.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    labels.push(label);
  });

  return labels.sort((left, right) => {
    if (left === "Strength Training") return -1;
    if (right === "Strength Training") return 1;
    return 0;
  });
}

function CurrentProtocolCard({ protocol }) {
  return (
    <details className="rounded-[12px] bg-[var(--surface-muted)] p-3">
      <summary className="cursor-pointer list-none">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-extrabold text-slate-950">
              {protocol?.sourceOfTruth ?? "Evidence-inferred"}
            </p>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
              {protocol?.goal ?? "Goal pending"}
            </p>
          </div>
          <span className="shrink-0 text-sm font-extrabold text-indigo-600">
            View protocol details
          </span>
        </div>
      </summary>
      <div className="mt-3 space-y-2 border-t border-[var(--divider)] pt-3">
        <ProtocolRow
          label="Source of truth"
          value={protocol?.sourceOfTruth ?? "Evidence-inferred"}
        />
        <ProtocolRow
          label="Daily activity target"
          value={protocol?.dailyActivityTarget ?? "Pending"}
        />
        <ProtocolRow
          label="Training objective"
          value={protocol?.resistanceTraining ?? "Pending"}
        />
        <ProtocolRow label="Goal" value={protocol?.goal ?? "Pending"} />
        <ProtocolRow label="Future protocol settings" value="Coming soon" />
      </div>
    </details>
  );
}

function TrainingSourceMetadataFooter({ items = [] }) {
  const sourceItems = items.slice(0, 5);

  if (!sourceItems.length) return null;

  return (
    <section className="border-t border-[var(--divider)] pt-3">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
        Data Sources
      </p>
      <div className="mt-2 space-y-1.5">
        {sourceItems.map((item) => (
          <div
            className="flex items-center justify-between gap-3 text-xs font-bold text-slate-500"
            key={item.id}
          >
            <span>{item.label}</span>
            <span className="text-slate-400">{item.sources.join(" + ")}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProtocolRow({ label, value }) {
  return (
    <div className="rounded-[10px] bg-white/70 p-3">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-extrabold text-slate-950">{value}</p>
    </div>
  );
}

function ReportingLinks({ adaptHref = (href) => href, compact = false, items }) {
  if (compact) {
    return (
      <details className={`rounded-[12px] bg-[var(--surface-muted)] p-3 ${nativePressClassName}`}>
        <summary className="cursor-pointer list-none">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-extrabold text-slate-950">
                Review trends and summaries
              </p>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                Resistance, cardio, volume, frequency, and consistency.
              </p>
            </div>
            <span className="shrink-0 text-sm font-extrabold text-indigo-600">
              &gt;
            </span>
          </div>
        </summary>
        <div className="mt-3 space-y-2 border-t border-[var(--divider)] pt-3">
          <ReportingLinks adaptHref={adaptHref} items={items} />
        </div>
      </details>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <PressableCard
          className="flex items-start justify-between gap-3 p-3"
          href={adaptHref(item.href)}
          key={item.label}
        >
          <div>
            <p className="text-sm font-extrabold text-slate-950">{item.label}</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
              {item.detail}
            </p>
          </div>
          <span className="shrink-0 text-sm font-extrabold text-indigo-600">
            &gt;
          </span>
        </PressableCard>
      ))}
    </div>
  );
}

function TrainingLibraryLinks({ items }) {
  const topLevelItems = items.filter((item) => !item.parent);

  return (
    <div className="space-y-2">
      {topLevelItems.map((item) => (
        <PressableCard
          className="flex items-center justify-between gap-3 p-3"
          href={item.href}
          key={item.id}
        >
          <div>
            <p className="text-sm font-extrabold text-slate-950">{item.label}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {item.detail}
            </p>
          </div>
          <span className="shrink-0 text-sm font-extrabold text-indigo-600">
            &gt;
          </span>
        </PressableCard>
      ))}
    </div>
  );
}

function TrainingAreas({ adaptHref = (href) => href, breakdowns = {}, library = [] }) {
  const groups = getTrainingAreaNavigationGroups(breakdowns);

  if (!groups.length) {
    return (
      <TrainingLibraryLinks items={library} />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {groups.map((group) => (
        <TrainingAreaGroup
          detail={group.detail}
          href={adaptHref(group.href)}
          icon={group.icon}
          key={group.label}
          title={group.label}
        />
      ))}
    </div>
  );
}

function TrainingAreaGroup({ detail, href, icon: Icon, title }) {
  return (
    <PressableRow className="min-h-14 gap-2" href={href}>
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon && (
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--surface-elevated)] text-slate-500 ring-1 ring-[var(--divider)]">
            <Icon size={14} strokeWidth={2.4} />
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold text-slate-950">
            {title}
          </p>
          {detail && (
            <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">
              {detail}
            </p>
          )}
        </div>
      </div>
      <span className="shrink-0 text-sm font-extrabold text-indigo-600">
        &gt;
      </span>
    </PressableRow>
  );
}

function getTrainingAreaNavigationGroups(breakdowns = {}) {
  const counts = getTrainingAreaExerciseCounts(breakdowns);

  return TRAINING_AREA_NAV_GROUPS.map((label) => {
    const count = counts.get(slugify(label)) ?? 0;

    return {
      detail: count ? `${count} exercise${count === 1 ? "" : "s"}` : null,
      href: `/progress/training/library/${slugify(label)}`,
      icon: getTrainingAreaIcon(label),
      label,
    };
  });
}

function getTrainingAreaExerciseCounts(breakdowns = {}) {
  return new Map(
    TRAINING_AREA_NAV_GROUPS.map((label) => {
      const slug = slugify(label);
      const count = getExercisesForTrainingAreaGroup({
        breakdowns,
        groupSlug: slug,
      }).length;

      return [slug, count];
    })
  );
}

function getExercisesForTrainingAreaGroup({ breakdowns = {}, groupSlug }) {
  const exercises = (breakdowns.resistance ?? []).flatMap((region) =>
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
    exerciseBelongsToTrainingAreaGroup({ exercise, groupSlug })
  );
  const exercisesBySlug = new Map();

  matches.forEach((exercise) => {
    const key = slugify(exercise.label);
    if (!exercisesBySlug.has(key)) exercisesBySlug.set(key, exercise);
  });

  return [...exercisesBySlug.values()];
}

function exerciseBelongsToTrainingAreaGroup({ exercise, groupSlug }) {
  return exercise.primaryNavigationCategory === groupSlug;
}

function getTrainingAreaIcon(label) {
  const icons = {
    Back: Dumbbell,
    Biceps: Dumbbell,
    Calves: Activity,
    Chest: CircleDot,
    Core: Shield,
    Glutes: Flame,
    Hamstrings: Activity,
    Quads: Zap,
    Shoulders: Activity,
    Triceps: Dumbbell,
  };

  return icons[label] ?? Dumbbell;
}

function TrainingBreakdowns({ breakdowns = {} }) {
  const cardio = breakdowns.cardio ?? [];
  const resistance = breakdowns.resistance ?? [];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-extrabold text-slate-950">Cardio</p>
        <div className="mt-2 space-y-2">
          {cardio.length > 0 ? (
            cardio.map((item) => (
              <div
                className="flex items-center justify-between rounded-[12px] bg-[var(--surface-muted)] p-3"
                key={item.label}
              >
                <p className="text-sm font-bold text-slate-700">{item.label}</p>
                <p className="text-sm font-extrabold text-slate-950">
                  x{item.count}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm font-semibold text-slate-500">
              No cardio sessions yet.
            </p>
          )}
        </div>
      </div>

      <div>
        <p className="text-sm font-extrabold text-slate-950">
          Resistance Training
        </p>
        <div className="mt-2 space-y-3">
          {resistance.length > 0 ? (
            resistance.map((region) => (
              <div
                className="rounded-[12px] bg-[var(--surface-muted)] p-3"
                key={region.label}
              >
                <p className="text-sm font-extrabold text-slate-950">
                  {region.label}
                </p>
                <div className="mt-2 space-y-2">
                  {region.muscleGroups.map((muscleGroup) => (
                    <div key={muscleGroup.label}>
                      <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-slate-400">
                        {muscleGroup.label}
                      </p>
                      <div className="mt-1 space-y-1">
                        {muscleGroup.exercises.map((exercise) => (
                          <div key={exercise.id}>
                            <p className="text-sm font-bold text-slate-700">
                              {exercise.label}
                            </p>
                            {exercise.sets.length > 0 && (
                              <p className="text-xs font-semibold text-slate-500">
                                {exercise.sets.join(", ")}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm font-semibold text-slate-500">
              No resistance training logged yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function TrainingDayHistory({ days }) {
  if (!days.length) {
    return (
      <p className="text-sm font-semibold leading-6 text-slate-500">
        Training days will appear as workouts are uploaded or connected.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {days.map((day) => (
        <details
          className="rounded-[12px] bg-[var(--surface-muted)] p-3"
          key={day.id}
        >
          <summary className="cursor-pointer list-none">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-extrabold text-slate-950">
                  {day.label}
                </p>
                {getTrainingDaySummary(day.sessions) && (
                  <p className="mt-1 text-xs font-bold text-slate-500">
                    {getTrainingDaySummary(day.sessions)}
                  </p>
                )}
              </div>
              <span className="text-sm font-extrabold text-indigo-600">&gt;</span>
            </div>
          </summary>
          <div className="mt-3 border-t border-[var(--divider)] pt-3">
            <RecordPreview entries={day.sessions} showSources />
          </div>
        </details>
      ))}
    </div>
  );
}

function TrainingDayHistoryPreview({
  day,
  href = "/progress/training/reporting/history",
}) {
  if (!day) {
    return (
      <p className="text-sm font-semibold leading-6 text-slate-500">
        Training days will appear as workouts are uploaded or connected.
      </p>
    );
  }

  return (
    <DrawerPreview href={href}>
      <div className="min-w-0">
        <p className="truncate text-sm font-extrabold text-slate-950">
          {day.label}
        </p>
        <p className="mt-0.5 text-xs font-bold text-slate-500">
          {getTrainingDaySummary(day.sessions)}
        </p>
      </div>
      <span className="shrink-0 text-sm font-extrabold text-[var(--primary)]">
        &gt;
      </span>
    </DrawerPreview>
  );
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

function slugify(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatOptionalCalories(value) {
  return Number.isFinite(value) ? `${value} cal` : "Pending";
}

function formatOptionalMinutes(value) {
  return Number.isFinite(value) ? `${value} min` : "Pending";
}

function formatOptionalHours(value) {
  return Number.isFinite(value) ? `${value} hr` : "Pending";
}

function RecordPreview({ entries, showSources = false }) {
  return (
    <div className="space-y-2">
      {entries.map((entry) => (
        <RecordPreviewItem entry={entry} key={entry.id ?? `${entry.label}-${entry.value}`} showSources={showSources} />
      ))}
    </div>
  );
}

function RecordPreviewItem({ entry, showSources }) {
  const content = (
    <>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-slate-700">{entry.label}</p>
              {entry.detail && (
                <p className="mt-0.5 text-xs font-medium leading-5 text-slate-500">
                  {entry.detail}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-sm font-extrabold text-slate-950">
                {entry.value}
              </p>
              {entry.date && (
                <p className="mt-1 text-xs font-bold text-slate-400">
                  {formatDate(entry.date)}
                </p>
              )}
            </div>
          </div>
          {showSources && entry.sourceEvidence?.length > 0 && (
            <p className="mt-2 text-xs font-bold text-slate-400">
              Source: {entry.sourceEvidence.join(" + ")}
            </p>
          )}
    </>
  );

  if (entry.href) {
    return (
      <Link className="block rounded-[12px] bg-[var(--surface-muted)] p-3" href={entry.href}>
        {content}
      </Link>
    );
  }

  return <div className="rounded-[12px] bg-[var(--surface-muted)] p-3">{content}</div>;
}

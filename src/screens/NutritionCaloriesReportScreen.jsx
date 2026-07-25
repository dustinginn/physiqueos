"use client";

import Link from "next/link";
import { ArrowLeft, Salad } from "lucide-react";
import { useState } from "react";
import NutritionCaloriesOverTimeChart, {
  formatCalories,
  formatWeekRange,
} from "../components/nutrition/NutritionCaloriesOverTimeChart";
import EvidenceReportContext from "../components/progress/EvidenceReportContext";
import TrainingTimelineSelector from "../components/training/TrainingTimelineSelector";
import Card from "../components/ui/Card";
import FloatingSheet from "../components/ui/FloatingSheet";
import IconBadge from "../components/ui/IconBadge";
import { filterNutritionCaloriesReport } from "../domain/services/NutritionCaloriesPresentationService";

const INLINE_HISTORY_LIMIT = 3;

export default function NutritionCaloriesReportScreen({ report }) {
  const [rangeId, setRangeId] = useState("all");
  const [weeklyOpen, setWeeklyOpen] = useState(false);
  const [dailyOpen, setDailyOpen] = useState(false);
  const presentation = filterNutritionCaloriesReport(report, rangeId);

  return (
    <main className="app-surface min-h-screen">
      <div className="mx-auto max-w-[393px] overflow-x-hidden px-4 pb-24 pt-10">
        <Link
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-muted)]"
          href="/progress/nutrition"
        >
          <ArrowLeft size={18} />
          Nutrition
        </Link>

        <header className="mb-5 flex items-start gap-3">
          <IconBadge className="rounded-full" color="effort" icon={Salad} size="lg" />
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--primary)]">
              Nutrition Reporting
            </p>
            <h1 className="mt-1 text-3xl font-extrabold leading-tight text-[var(--text-primary)]">
              Calories
            </h1>
            <p className="mt-2 text-base leading-7 text-[var(--text-muted)]">
              Daily intake, weekly averages, and calorie history over time.
            </p>
          </div>
        </header>

        <TrainingTimelineSelector
          ariaLabel="Calories reporting time filter"
          currentPath={report.timeline.currentPath}
          timeline={report.timeline}
        />

        <section aria-labelledby="calories-period-summary">
          <div className="mb-2 flex items-end justify-between gap-3">
            <h2
              className="text-lg font-extrabold text-[var(--text-primary)]"
              id="calories-period-summary"
            >
              Period Summary
            </h2>
            <span className="text-right text-[10px] font-bold text-[var(--text-subtle)]">
              {report.target.label}
            </span>
          </div>
          <SummaryGrid summary={presentation.summary} />
        </section>

        <section className="mt-4" aria-labelledby="calories-over-time">
          <Card>
            <h2
              className="text-lg font-extrabold text-[var(--text-primary)]"
              id="calories-over-time"
            >
              Calories Over Time
            </h2>
            <p className="mt-1 text-xs font-semibold leading-5 text-[var(--text-muted)]">
              Weekly average calorie intake across the selected period.
            </p>
            <div className="mt-3">
              <NutritionCaloriesOverTimeChart
                onRangeChange={setRangeId}
                rangeId={rangeId}
                weeks={presentation.weeks}
              />
            </div>
          </Card>
        </section>

        <HistorySection
          onShowAll={() => setWeeklyOpen(true)}
          showAll={presentation.weeks.length > INLINE_HISTORY_LIMIT}
          title="Weekly Averages"
        >
          <WeeklyRows weeks={presentation.weeks.slice(0, INLINE_HISTORY_LIMIT)} />
        </HistorySection>

        <HistorySection
          onShowAll={() => setDailyOpen(true)}
          showAll={presentation.days.length > INLINE_HISTORY_LIMIT}
          title="Recent Daily Calories"
        >
          <DailyRows days={presentation.days.slice(0, INLINE_HISTORY_LIMIT)} />
        </HistorySection>

        <div className="mt-4">
          <EvidenceReportContext
            dataSources={report.dataSources}
            flush
            mode="data-sources"
          />
        </div>
      </div>

      <FloatingSheet
        description={`Weekly calorie averages in ${report.timeline.selectedLabel} and the selected chart range.`}
        onOpenChange={setWeeklyOpen}
        open={weeklyOpen}
        title="Weekly Averages"
      >
        <WeeklyRows weeks={presentation.weeks} />
      </FloatingSheet>
      <FloatingSheet
        description={`Daily calorie evidence in ${report.timeline.selectedLabel} and the selected chart range.`}
        onOpenChange={setDailyOpen}
        open={dailyOpen}
        title="Daily Calories"
      >
        <DailyRows days={presentation.days} />
      </FloatingSheet>
    </main>
  );
}

function SummaryGrid({ summary }) {
  const items = [
    {
      label: "Average Calories",
      value: formatCalories(summary.averageCalories),
    },
    {
      label: "Logged Days",
      value: String(summary.loggedDays),
      supporting: summary.calendarDays
        ? `${summary.loggedDays} of ${summary.calendarDays} days logged`
        : "No calendar period available",
    },
    {
      label: "Lowest Day",
      value: formatCalories(summary.lowestDay?.calories),
      supporting: summary.lowestDay ? formatLongDate(summary.lowestDay.date) : null,
    },
    {
      label: "Highest Day",
      value: formatCalories(summary.highestDay?.calories),
      supporting: summary.highestDay ? formatLongDate(summary.highestDay.date) : null,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((item) => (
        <Card className="min-w-0" key={item.label} padding="sm">
          <p className="text-[9px] font-extrabold uppercase tracking-[0.06em] text-[var(--text-subtle)]">
            {item.label}
          </p>
          <p className="mt-1 break-words text-base font-extrabold text-[var(--text-primary)]">
            {item.value}
          </p>
          {item.supporting && (
            <p className="mt-1 text-[10px] font-semibold leading-4 text-[var(--text-muted)]">
              {item.supporting}
            </p>
          )}
        </Card>
      ))}
    </div>
  );
}

function HistorySection({ children, onShowAll, showAll, title }) {
  return (
    <section className="mt-4">
      <Card padding="none">
        <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
          <h2 className="text-lg font-extrabold text-[var(--text-primary)]">
            {title}
          </h2>
          {showAll && (
            <button
              className="min-h-11 shrink-0 text-xs font-extrabold text-[var(--primary)]"
              onClick={onShowAll}
              type="button"
            >
              Show All
            </button>
          )}
        </div>
        {children}
      </Card>
    </section>
  );
}

function WeeklyRows({ weeks }) {
  if (weeks.length === 0) {
    return <EmptyRow label="No weekly calorie evidence available." />;
  }

  return (
    <div className="divide-y divide-[var(--divider)]">
      {weeks.map((week) => (
        <div className="flex items-center justify-between gap-3 px-4 py-3" key={week.id}>
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-[var(--text-primary)]">
              {formatWeekRange(week)}
            </p>
            <p className="mt-1 text-[10px] font-semibold text-[var(--text-muted)]">
              {week.loggedDayCount} day{week.loggedDayCount === 1 ? "" : "s"} logged
            </p>
          </div>
          <p className="shrink-0 text-sm font-extrabold text-[var(--text-secondary)]">
            {formatCalories(week.averageCalories)}
          </p>
        </div>
      ))}
    </div>
  );
}

function DailyRows({ days }) {
  if (days.length === 0) {
    return <EmptyRow label="No daily calorie evidence available." />;
  }

  return (
    <div className="divide-y divide-[var(--divider)]">
      {days.map((day) => (
        <Link
          className="flex items-center justify-between gap-3 px-4 py-3"
          href={day.href}
          key={day.id}
        >
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-[var(--text-primary)]">
              {formatLongDate(day.date)}
            </p>
            <p className="mt-1 truncate text-[10px] font-semibold text-[var(--text-muted)]">
              {formatDailyMetadata(day)}
            </p>
          </div>
          <p className="shrink-0 text-sm font-extrabold text-[var(--text-secondary)]">
            {formatCalories(day.calories)}
          </p>
        </Link>
      ))}
    </div>
  );
}

function EmptyRow({ label }) {
  return (
    <p className="px-4 pb-4 text-sm font-semibold text-[var(--text-muted)]">
      {label}
    </p>
  );
}

function formatDailyMetadata(day) {
  return [
    day.sourceLabels.join(" + "),
    day.mealCount
      ? `${day.mealCount} meal${day.mealCount === 1 ? "" : "s"}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ") || "Nutrition evidence";
}

function formatLongDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00Z`));
}

"use client";

import Link from "next/link";
import { ArrowLeft, Zap } from "lucide-react";
import EnergyOverTimeChart from "../components/progress/EnergyOverTimeChart";
import EnergyWeeklyChart, {
  formatCalories,
  formatRange,
  formatSignedCalories,
} from "../components/progress/EnergyWeeklyChart";
import EvidenceReportContext from "../components/progress/EvidenceReportContext";
import TrainingTimelineSelector from "../components/training/TrainingTimelineSelector";
import Card from "../components/ui/Card";
import FloatingSheet from "../components/ui/FloatingSheet";
import IconBadge from "../components/ui/IconBadge";
import { useState } from "react";
import { getEnergyMetricValueClass } from "../presentation/energyPresentation";

export const ENERGY_HISTORY_PREVIEW_LIMIT = 3;

export default function EnergyEvidenceScreen({ report }) {
  const preview = report;
  const [weeklyOpen, setWeeklyOpen] = useState(false);
  const [dailyOpen, setDailyOpen] = useState(false);

  return (
    <main className="app-surface min-h-screen">
      <div className="mx-auto max-w-[393px] overflow-x-hidden px-4 pb-24 pt-10">
        <Link
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-muted)]"
          href="/progress"
        >
          <ArrowLeft size={18} />
          Evidence Hub
        </Link>

        <header className="mb-5 flex items-start gap-3">
          <IconBadge className="rounded-full" color="primary" icon={Zap} size="lg" />
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--primary)]">
              Energy
            </p>
            <h1 className="mt-1 text-3xl font-extrabold leading-tight text-[var(--text-primary)]">
              Energy Balance
            </h1>
            <p className="mt-2 text-base leading-7 text-[var(--text-muted)]">
              Intake and expenditure over time.
            </p>
          </div>
        </header>

        <TrainingTimelineSelector
          ariaLabel="Energy evidence time filter"
          currentPath={preview.timeline.currentPath}
          timeline={preview.timeline}
        />

        <section aria-labelledby="energy-summary-title">
          <h2
            className="mb-2 text-lg font-extrabold text-[var(--text-primary)]"
            id="energy-summary-title"
          >
            Period Summary
          </h2>
          <div className="grid grid-cols-2 gap-2">
            <SummaryMetric
              label="Average Intake"
              metric="intake"
              numericValue={preview.summary.averageIntake}
              value={formatCalories(preview.summary.averageIntake)}
            />
            <SummaryMetric
              label="Average Expenditure"
              metric="expenditure"
              numericValue={preview.summary.averageExpenditure}
              value={formatCalories(preview.summary.averageExpenditure)}
            />
            <SummaryMetric
              label="Average Balance"
              metric="balance"
              numericValue={preview.summary.averageBalance}
              value={formatSignedCalories(preview.summary.averageBalance)}
            />
            <SummaryMetric
              label="Complete Days"
              supporting={`${preview.summary.completeDays} of ${preview.summary.evidenceDays} evidence days`}
              value={String(preview.summary.completeDays)}
            />
          </div>
        </section>

        <section className="mt-4" aria-labelledby="energy-over-time-title">
          <Card>
            <h2
              className="text-lg font-extrabold text-[var(--text-primary)]"
              id="energy-over-time-title"
            >
              Energy Over Time
            </h2>
            <p className="mt-1 text-xs font-semibold leading-5 text-[var(--text-muted)]">
              Weekly average intake and estimated expenditure over time.
            </p>
            <div className="mt-3">
              <EnergyOverTimeChart
                latestEvidenceDate={preview.latestEvidenceDate}
                weeks={preview.weeks}
              />
            </div>
          </Card>
        </section>

        <section className="mt-4" aria-labelledby="weekly-energy-title">
          <Card>
            <h2
              className="text-lg font-extrabold text-[var(--text-primary)]"
              id="weekly-energy-title"
            >
              Weekly Energy Balance
            </h2>
            <p className="mt-1 text-xs font-semibold leading-5 text-[var(--text-muted)]">
              Average daily intake and estimated expenditure across the latest
              four weeks.
            </p>
            <div className="mt-3">
              <EnergyWeeklyChart weeks={preview.recentFourWeeks} />
            </div>
          </Card>
        </section>

        <HistorySection
          onShowAll={() => setWeeklyOpen(true)}
          showAll={preview.weeks.length > ENERGY_HISTORY_PREVIEW_LIMIT}
          title="Weekly History"
        >
          <WeeklyRows weeks={preview.weeks.slice(0, ENERGY_HISTORY_PREVIEW_LIMIT)} />
        </HistorySection>

        <HistorySection
          onShowAll={() => setDailyOpen(true)}
          showAll={preview.days.length > ENERGY_HISTORY_PREVIEW_LIMIT}
          title="Recent Daily Energy"
        >
          <DailyRows days={preview.days.slice(0, ENERGY_HISTORY_PREVIEW_LIMIT)} />
        </HistorySection>

        <div className="mt-4">
          <EvidenceReportContext
            dataSources={preview.dataSources}
            flush
            mode="data-sources"
          />
        </div>
      </div>

      <FloatingSheet
        description={`All weekly buckets in ${preview.timeline.selectedLabel}.`}
        onOpenChange={setWeeklyOpen}
        open={weeklyOpen}
        title="Weekly History"
      >
        <WeeklyRows weeks={preview.weeks} />
      </FloatingSheet>
      <FloatingSheet
        description={`All daily energy evidence in ${preview.timeline.selectedLabel}.`}
        onOpenChange={setDailyOpen}
        open={dailyOpen}
        title="Daily Energy History"
      >
        <DailyRows days={preview.days} />
      </FloatingSheet>
    </main>
  );
}

function SummaryMetric({
  label,
  metric = "neutral",
  numericValue,
  supporting,
  value,
}) {
  return (
    <Card className="min-w-0" padding="sm">
      <p className="text-[9px] font-extrabold uppercase tracking-[0.06em] text-[var(--text-subtle)]">
        {label}
      </p>
      <p
        className={`mt-1 break-words text-base font-extrabold ${getEnergyMetricValueClass(
          metric,
          numericValue
        )}`}
      >
        {value}
      </p>
      {supporting && (
        <p className="mt-1 text-[10px] font-semibold leading-4 text-[var(--text-muted)]">
          {supporting}
        </p>
      )}
    </Card>
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
  if (weeks.length === 0) return <EmptyRow label="No weekly evidence available." />;
  return (
    <div className="divide-y divide-[var(--divider)]">
      {weeks.map((week) => (
        <div className="px-4 py-3" key={week.id}>
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-extrabold text-[var(--text-primary)]">
              {formatRange(week)}
            </p>
            <span className="text-[10px] font-bold text-[var(--text-subtle)]">
              {week.partial ? "Partial" : "Complete"}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] font-semibold text-[var(--text-muted)]">
            <HistoryMetric
              label="Intake"
              metric="intake"
              value={week.averageIntake}
            />
            <HistoryMetric
              label="Estimated expenditure"
              metric="expenditure"
              value={week.averageExpenditure}
            />
            <HistoryMetric
              label="Balance"
              metric="balance"
              value={week.averageBalance}
            />
            <span>{week.completeDayCount} complete days</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function DailyRows({ days }) {
  if (days.length === 0) return <EmptyRow label="No daily energy evidence available." />;
  return (
    <div className="divide-y divide-[var(--divider)]">
      {days.map((day) => (
        <div className="px-4 py-3" key={day.date}>
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-extrabold text-[var(--text-primary)]">
              {formatLongDate(day.date)}
            </p>
            <span className="text-right text-[10px] font-bold text-[var(--text-subtle)]">
              {completenessLabel(day)}
            </span>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            <DailyValue
              label="Intake"
              metric="intake"
              numericValue={day.calorieIntake}
              value={formatCalories(day.calorieIntake)}
            />
            <DailyValue
              label="Active calories"
              numericValue={day.activeCalories}
              value={formatCalories(day.activeCalories)}
            />
            <DailyValue
              label="Estimated expenditure"
              metric="expenditure"
              numericValue={day.estimatedExpenditure}
              value={formatCalories(day.estimatedExpenditure)}
            />
            <DailyValue
              label="Balance"
              metric="balance"
              numericValue={day.energyBalance}
              value={formatSignedCalories(day.energyBalance)}
            />
          </dl>
          {(day.nutritionHref || day.activityHref) && (
            <div className="mt-2 flex gap-3 text-[10px] font-extrabold text-[var(--primary)]">
              {day.nutritionHref && <Link href={day.nutritionHref}>Nutrition Day</Link>}
              {day.activityHref && <Link href={day.activityHref}>Activity</Link>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function DailyValue({ label, metric = "neutral", numericValue, value }) {
  return (
    <div className="min-w-0">
      <dt className="font-bold text-[var(--text-subtle)]">{label}</dt>
      <dd
        className={`break-words font-semibold ${getEnergyMetricValueClass(
          metric,
          numericValue
        )}`}
      >
        {value}
      </dd>
    </div>
  );
}

function HistoryMetric({ label, metric, value }) {
  return (
    <span>
      {label}{" "}
      <strong className={getEnergyMetricValueClass(metric, value)}>
        {metric === "balance"
          ? formatSignedCalories(value)
          : formatCalories(value)}
      </strong>
    </span>
  );
}

function EmptyRow({ label }) {
  return (
    <p className="px-4 pb-4 text-sm font-semibold text-[var(--text-muted)]">
      {label}
    </p>
  );
}

function completenessLabel(day) {
  return {
    complete: "Complete · Estimated",
    "nutrition-only": "Nutrition only",
    "activity-only": "Activity only",
    "missing-rmr": "Missing RMR",
    "no-paired-evidence": "No paired evidence",
  }[day.completeness];
}

function formatLongDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    weekday: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00Z`));
}

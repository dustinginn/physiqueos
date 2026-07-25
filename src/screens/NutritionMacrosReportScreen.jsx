"use client";

import Link from "next/link";
import { ArrowLeft, Salad } from "lucide-react";
import { useState } from "react";
import NutritionAverageMacrosChart from "../components/nutrition/NutritionAverageMacrosChart";
import NutritionMacroDistributionChart from "../components/nutrition/NutritionMacroDistributionChart";
import NutritionMacroTrendChart, { formatWeekRange } from "../components/nutrition/NutritionMacroTrendChart";
import EvidenceReportContext from "../components/progress/EvidenceReportContext";
import TrainingTimelineSelector from "../components/training/TrainingTimelineSelector";
import Card from "../components/ui/Card";
import FloatingSheet from "../components/ui/FloatingSheet";
import IconBadge from "../components/ui/IconBadge";
import { filterNutritionMacrosReport } from "../domain/services/NutritionMacrosPresentationService";
import { NUTRITION_MACRO_KEYS, NUTRITION_MACRO_PRESENTATION } from "../presentation/nutritionMacroPresentation";

const INLINE_LIMIT = 3;

export default function NutritionMacrosReportScreen({ report }) {
  const [macroKey, setMacroKey] = useState("protein");
  const [rangeId, setRangeId] = useState("all");
  const [weeklyOpen, setWeeklyOpen] = useState(false);
  const [dailyOpen, setDailyOpen] = useState(false);
  const view = filterNutritionMacrosReport(report, { macroKey, rangeId });

  return (
    <main className="app-surface min-h-screen">
      <div className="mx-auto max-w-[393px] overflow-x-hidden px-4 pb-24 pt-10">
        <Link className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-muted)]" href="/progress/nutrition">
          <ArrowLeft size={18} /> Nutrition
        </Link>
        <header className="mb-5 flex items-start gap-3">
          <IconBadge className="rounded-full" color="effort" icon={Salad} size="lg" />
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--primary)]">Nutrition Reporting</p>
            <h1 className="mt-1 text-3xl font-extrabold leading-tight text-[var(--text-primary)]">Macros</h1>
            <p className="mt-2 text-base leading-7 text-[var(--text-muted)]">Macro distribution, daily averages, and weekly trends over time.</p>
          </div>
        </header>

        <TrainingTimelineSelector ariaLabel="Macros reporting time filter" currentPath={report.timeline.currentPath} timeline={report.timeline} />
        <MacroSelector onChange={setMacroKey} selectedKey={macroKey} />

        <section className="mt-4" aria-labelledby="macro-period-summary">
          <div className="mb-2 flex items-end justify-between gap-3">
            <h2 className="text-lg font-extrabold text-[var(--text-primary)]" id="macro-period-summary">Period Summary</h2>
            <span className="text-right text-[10px] font-bold text-[var(--text-subtle)]">{report.target.label}</span>
          </div>
          <SummaryGrid summary={view.summary} />
        </section>

        <ReportCard title="Macro Distribution" copy="Share of macro-derived calories across the selected period.">
          <NutritionMacroDistributionChart distribution={view.distribution} />
        </ReportCard>
        <ReportCard title="Average Daily Macros" copy="Average grams per logged Nutrition day across the selected period.">
          <NutritionAverageMacrosChart averages={view.averages} />
        </ReportCard>
        <ReportCard title="Macro Trends Over Time" copy={`Weekly average ${view.selectedMacro.label.toLowerCase()} intake across the selected period.`}>
          <NutritionMacroTrendChart macro={view.selectedMacro} onRangeChange={setRangeId} rangeId={rangeId} weeks={view.weeks} />
        </ReportCard>

        <HistorySection onShowAll={() => setWeeklyOpen(true)} showAll={view.weeks.length > INLINE_LIMIT} title="Weekly Averages">
          <WeeklyRows macroKey={macroKey} weeks={view.weeks.slice(0, INLINE_LIMIT)} />
        </HistorySection>
        <HistorySection onShowAll={() => setDailyOpen(true)} showAll={view.days.length > INLINE_LIMIT} title="Recent Daily Macros">
          <DailyRows days={view.days.slice(0, INLINE_LIMIT)} macroKey={macroKey} />
        </HistorySection>

        <div className="mt-4">
          <EvidenceReportContext dataSources={report.dataSources} flush mode="data-sources" />
        </div>
      </div>

      <FloatingSheet description={`Weekly macros in ${report.timeline.selectedLabel}, preserving the selected range and macro.`} onOpenChange={setWeeklyOpen} open={weeklyOpen} title="Weekly Averages">
        <WeeklyRows macroKey={macroKey} weeks={view.weeks} />
      </FloatingSheet>
      <FloatingSheet description={`Daily macros in ${report.timeline.selectedLabel}, preserving the selected range and macro.`} onOpenChange={setDailyOpen} open={dailyOpen} title="Daily Macros">
        <DailyRows days={view.days} macroKey={macroKey} />
      </FloatingSheet>
    </main>
  );
}

function MacroSelector({ onChange, selectedKey }) {
  return (
    <section aria-label="Select macro" className="grid grid-cols-3 gap-1.5 rounded-[14px] bg-[var(--surface-muted)] p-1.5">
      {NUTRITION_MACRO_KEYS.map((key) => {
        const item = NUTRITION_MACRO_PRESENTATION[key];
        const selected = key === selectedKey;
        return (
          <button
            aria-pressed={selected}
            className={`min-h-10 min-w-0 rounded-[10px] px-1 text-[11px] font-extrabold ${selected ? `${item.backgroundClassName} ${item.foregroundClassName}` : "text-[var(--text-muted)]"}`}
            key={key}
            onClick={() => onChange(key)}
            type="button"
          >
            <span className="block truncate">{item.label}</span>
          </button>
        );
      })}
    </section>
  );
}

function SummaryGrid({ summary }) {
  const items = [
    ["Average per Logged Day", grams(summary.average), null],
    ["Logged Days", String(summary.loggedDays), summary.calendarDays ? `${summary.loggedDays} of ${summary.calendarDays} days logged` : null],
    ["Lowest Day", grams(summary.lowestDay?.value), summary.lowestDay ? longDate(summary.lowestDay.date) : null],
    ["Highest Day", grams(summary.highestDay?.value), summary.highestDay ? longDate(summary.highestDay.date) : null],
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map(([label, value, supporting]) => (
        <Card className="min-w-0" key={label} padding="sm">
          <p className="text-[9px] font-extrabold uppercase tracking-[0.06em] text-[var(--text-subtle)]">{label}</p>
          <p className="mt-1 break-words text-base font-extrabold text-[var(--text-primary)]">{value}</p>
          {supporting && <p className="mt-1 text-[10px] font-semibold leading-4 text-[var(--text-muted)]">{supporting}</p>}
        </Card>
      ))}
    </div>
  );
}

function ReportCard({ children, copy, title }) {
  return (
    <section className="mt-4">
      <Card>
        <h2 className="text-lg font-extrabold text-[var(--text-primary)]">{title}</h2>
        <p className="mt-1 text-xs font-semibold leading-5 text-[var(--text-muted)]">{copy}</p>
        <div className="mt-3">{children}</div>
      </Card>
    </section>
  );
}

function HistorySection({ children, onShowAll, showAll, title }) {
  return (
    <section className="mt-4">
      <Card padding="none">
        <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
          <h2 className="text-lg font-extrabold text-[var(--text-primary)]">{title}</h2>
          {showAll && <button className="min-h-11 shrink-0 text-xs font-extrabold text-[var(--primary)]" onClick={onShowAll} type="button">Show All</button>}
        </div>
        {children}
      </Card>
    </section>
  );
}

function WeeklyRows({ macroKey, weeks }) {
  if (!weeks.length) return <EmptyRow label="No weekly macro evidence available." />;
  return (
    <div className="divide-y divide-[var(--divider)]">
      {weeks.map((week) => (
        <div className="px-4 py-3" key={week.id}>
          <div className="flex justify-between gap-3">
            <p className="text-xs font-extrabold text-[var(--text-primary)]">{formatWeekRange(week)}</p>
            <span className="text-[10px] font-bold text-[var(--text-muted)]">{week.loggedDayCount} day{week.loggedDayCount === 1 ? "" : "s"} logged</span>
          </div>
          <MacroValues macroKey={macroKey} values={Object.fromEntries(NUTRITION_MACRO_KEYS.map((key) => [key, week.macros[key].average]))} />
        </div>
      ))}
    </div>
  );
}

function DailyRows({ days, macroKey }) {
  if (!days.length) return <EmptyRow label="No daily macro evidence available." />;
  return (
    <div className="divide-y divide-[var(--divider)]">
      {days.map((day) => (
        <Link className="block px-4 py-3" href={day.href} key={day.id}>
          <div className="flex justify-between gap-3">
            <p className="text-xs font-extrabold text-[var(--text-primary)]">{longDate(day.date)}</p>
            <span className="truncate text-[10px] font-semibold text-[var(--text-muted)]">{day.sourceLabels.join(" + ") || "Nutrition evidence"}</span>
          </div>
          <MacroValues macroKey={macroKey} values={day.macros} />
        </Link>
      ))}
    </div>
  );
}

function MacroValues({ macroKey, values }) {
  return (
    <div className="mt-2 grid grid-cols-3 gap-2">
      {NUTRITION_MACRO_KEYS.map((key) => {
        const item = NUTRITION_MACRO_PRESENTATION[key];
        return <span className={`text-[11px] font-bold ${key === macroKey ? item.foregroundClassName : "text-[var(--text-secondary)]"}`} key={key}>{item.label === "Carbohydrates" ? "Carbs" : item.label} {grams(values[key])}</span>;
      })}
    </div>
  );
}

function EmptyRow({ label }) {
  return <p className="px-4 pb-4 text-sm font-semibold text-[var(--text-muted)]">{label}</p>;
}

function grams(value) {
  return value == null ? "Not available" : `${Math.round(value)}g`;
}

function longDate(value) {
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", timeZone: "UTC", year: "numeric" }).format(new Date(`${value}T12:00:00Z`));
}

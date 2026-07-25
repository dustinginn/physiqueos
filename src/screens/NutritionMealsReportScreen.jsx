"use client";

import Link from "next/link";
import { ArrowLeft, ChevronRight, Utensils } from "lucide-react";
import { useState } from "react";
import NutritionMealDistributionChart from "../components/nutrition/NutritionMealDistributionChart";
import NutritionMacroDistributionChart from "../components/nutrition/NutritionMacroDistributionChart";
import NutritionMealTrendChart from "../components/nutrition/NutritionMealTrendChart";
import EvidenceReportContext from "../components/progress/EvidenceReportContext";
import TrainingTimelineSelector from "../components/training/TrainingTimelineSelector";
import Card from "../components/ui/Card";
import FloatingSheet from "../components/ui/FloatingSheet";
import IconBadge from "../components/ui/IconBadge";
import { filterNutritionMealsReport } from "../domain/services/NutritionMealsPresentationService";
import { NUTRITION_MEAL_SLOT_KEYS, getNutritionMealSlotPresentation } from "../presentation/nutritionMealPresentation";

const INLINE_LIMIT = 3;
const TREND_SLOTS = ["all", ...NUTRITION_MEAL_SLOT_KEYS];
const TREND_METRICS = [
  ["calories", "Calories"],
  ["protein", "Protein"],
  ["carbohydrates", "Carbs"],
  ["fat", "Fat"],
  ["mealCount", "Meal Count"],
];

export default function NutritionMealsReportScreen({ report }) {
  const [rangeId, setRangeId] = useState("all");
  const [macroMixSlot, setMacroMixSlot] = useState("dinner");
  const [trendSlot, setTrendSlot] = useState("all");
  const [trendMetric, setTrendMetric] = useState("calories");
  const [weeklyOpen, setWeeklyOpen] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedHistoryGroupId, setSelectedHistoryGroupId] = useState(null);
  const view = filterNutritionMealsReport(report, { rangeId, macroMixSlot, trendSlot, trendMetric });
  const selectedHistoryGroup = view.historyGroups.find(
    (group) => group.id === selectedHistoryGroupId
  ) ?? null;
  const trendUnit = trendMetric === "calories" ? " kcal" : trendMetric === "mealCount" ? "" : "g";

  return (
    <main className="app-surface min-h-screen">
      <div className="mx-auto max-w-[393px] overflow-x-hidden px-4 pb-24 pt-10">
        <Link className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-muted)]" href="/progress/nutrition"><ArrowLeft size={18} /> Nutrition</Link>
        <header className="mb-5 flex items-start gap-3">
          <IconBadge className="rounded-full" color="effort" icon={Utensils} size="lg" />
          <div><p className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--primary)]">Nutrition Reporting</p><h1 className="mt-1 text-3xl font-extrabold text-[var(--text-primary)]">Meals</h1><p className="mt-2 text-base leading-7 text-[var(--text-muted)]">Meal structure across the selected period.</p></div>
        </header>
        <TrainingTimelineSelector ariaLabel="Meals reporting time filter" currentPath={report.timeline.currentPath} timeline={report.timeline} />

        <Section title="Period Summary"><Summary summary={view.summary} /></Section>
        <Section copy="Average calories by meal across the selected period." title="Meal Distribution"><NutritionMealDistributionChart distribution={view.distribution} /></Section>
        <Section copy="Macro-derived calorie distribution for the selected meal." title="Meal Macro Mix">
          <SlotSelector onChange={setMacroMixSlot} selected={macroMixSlot} values={NUTRITION_MEAL_SLOT_KEYS} />
          <div className="mt-3"><NutritionMacroDistributionChart distribution={view.macroMix} /></div>
        </Section>
        <Section copy="One selected weekly meal metric across the selected period." title="Meal Trends Over Time">
          <SlotSelector onChange={setTrendSlot} selected={trendSlot} values={TREND_SLOTS} />
          <select aria-label="Meal trend metric" className="mt-2 min-h-11 w-full rounded-[10px] border border-[var(--divider)] bg-[var(--surface-elevated)] px-3 text-sm font-bold text-[var(--text-primary)]" onChange={(event) => setTrendMetric(event.target.value)} value={trendMetric}>
            {TREND_METRICS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <NutritionMealTrendChart onRangeChange={setRangeId} points={view.trend} rangeId={rangeId} unit={trendUnit} />
        </Section>

        <History title="Weekly Meal Summary" showAll={view.weeks.length > INLINE_LIMIT} onShowAll={() => setWeeklyOpen(true)}><WeeklyRows weeks={view.weeks.slice(0, INLINE_LIMIT)} /></History>
        <History title="Recurring Meals" showAll={view.recurringMeals.length > INLINE_LIMIT} onShowAll={() => setRecurringOpen(true)}><RecurringRows rows={view.recurringMeals.slice(0, INLINE_LIMIT)} /></History>
        <History title="Recent Meal History" showAll={view.historyGroups.length > INLINE_LIMIT} onShowAll={() => setHistoryOpen(true)}><MealHistoryDayEntries groups={view.historyGroups.slice(0, INLINE_LIMIT)} onSelect={setSelectedHistoryGroupId} /></History>
        <div className="mt-4"><EvidenceReportContext dataSources={report.dataSources} flush mode="data-sources" /></div>
      </div>
      <FloatingSheet open={weeklyOpen} onOpenChange={setWeeklyOpen} title="Weekly Meal Summary" description="Weekly meal evidence in the selected context and range."><WeeklyRows weeks={view.weeks} /></FloatingSheet>
      <FloatingSheet open={recurringOpen} onOpenChange={setRecurringOpen} title="Recurring Meals" description="Exact recurring food-set patterns in the selected period."><RecurringRows expanded rows={view.recurringMeals} /></FloatingSheet>
      <FloatingSheet open={historyOpen} onOpenChange={setHistoryOpen} title="Recent Meal History" description="Canonical meal records in the selected period."><MealHistoryGroups groups={view.historyGroups} /></FloatingSheet>
      <FloatingSheet
        description={selectedHistoryGroup ? `${selectedHistoryGroup.mealCount} canonical meal record${selectedHistoryGroup.mealCount === 1 ? "" : "s"}.` : "Canonical meal records for this day."}
        onOpenChange={(open) => {
          if (!open) setSelectedHistoryGroupId(null);
        }}
        open={Boolean(selectedHistoryGroup)}
        title={selectedHistoryGroup?.dateLabel ?? "Meal History"}
      >
        <MealHistoryGroups groups={selectedHistoryGroup ? [selectedHistoryGroup] : []} hideDateHeading />
      </FloatingSheet>
    </main>
  );
}

function Section({ children, copy, title }) {
  return <section className="mt-4"><Card><h2 className="text-lg font-extrabold text-[var(--text-primary)]">{title}</h2>{copy && <p className="mt-1 text-xs font-semibold leading-5 text-[var(--text-muted)]">{copy}</p>}<div className="mt-3">{children}</div></Card></section>;
}

function Summary({ summary }) {
  const slot = summary.mostCommonSlot ? getNutritionMealSlotPresentation(summary.mostCommonSlot).label : "Not available";
  const items = [["Average Meals per Logged Day", summary.averageMealsPerLoggedDay ?? "Not available"], ["Most Common Meal Slot", slot], ["Average Calories per Meal", summary.averageCaloriesPerMeal == null ? "Not available" : `${summary.averageCaloriesPerMeal} kcal`], ["Logged Days", summary.loggedDays]];
  return <div className="grid grid-cols-2 gap-2">{items.map(([label, value]) => <div className="rounded-[12px] bg-[var(--surface-muted)] p-3" key={label}><p className="text-[9px] font-extrabold uppercase tracking-[0.06em] text-[var(--text-subtle)]">{label}</p><p className="mt-1 text-sm font-extrabold text-[var(--text-primary)]">{value}</p></div>)}</div>;
}

function SlotSelector({ onChange, selected, values }) {
  return <div className={`grid gap-1 rounded-[12px] bg-[var(--surface-muted)] p-1 ${values.length === 5 ? "grid-cols-5" : "grid-cols-4"}`}>{values.map((key) => {
    const item = key === "all" ? { label: "All", foregroundClassName: "text-[var(--primary)]", backgroundClassName: "bg-[var(--surface-elevated)]" } : getNutritionMealSlotPresentation(key);
    return <button aria-pressed={selected === key} className={`min-h-10 min-w-0 rounded-[9px] px-1 text-[9px] font-extrabold ${selected === key ? `${item.backgroundClassName} ${item.foregroundClassName}` : "text-[var(--text-muted)]"}`} key={key} onClick={() => onChange(key)} type="button"><span className="block truncate">{item.label}</span></button>;
  })}</div>;
}

function History({ children, onShowAll, showAll, title }) {
  return <section className="mt-4"><Card padding="none"><div className="flex items-center justify-between px-4 pb-2 pt-4"><h2 className="text-lg font-extrabold text-[var(--text-primary)]">{title}</h2>{showAll && <button className="min-h-11 text-xs font-extrabold text-[var(--primary)]" onClick={onShowAll} type="button">Show All</button>}</div>{children}</Card></section>;
}

function WeeklyRows({ weeks }) {
  if (!weeks.length) return <Empty text="No weekly meal evidence available." />;
  return <div className="divide-y divide-[var(--divider)]">{weeks.map((week) => <div className="px-4 py-3" key={week.id}><div className="flex justify-between gap-2"><strong className="text-xs text-[var(--text-primary)]">{shortDate(week.weekStart)}–{shortDate(week.weekEnd)}</strong><span className="text-[10px] font-bold text-[var(--text-muted)]">{week.mealCount} meals · {week.loggedDayCount} days</span></div><div className="mt-2 grid grid-cols-4 gap-1">{NUTRITION_MEAL_SLOT_KEYS.map((slot) => <span className={`text-[9px] font-bold ${getNutritionMealSlotPresentation(slot).foregroundClassName}`} key={slot}>{getNutritionMealSlotPresentation(slot).label.slice(0, 3)} {week.slots[slot].averageCalories == null ? "—" : week.slots[slot].averageCalories}</span>)}</div></div>)}</div>;
}

function RecurringRows({ expanded, rows }) {
  if (!rows.length) return <Empty text="No recurring meals identified yet." />;
  return <div className="divide-y divide-[var(--divider)]">{rows.map((row) => <div className="px-4 py-3" key={row.id}><p className="text-xs font-extrabold leading-5 text-[var(--text-primary)]">{row.name}</p><p className="mt-1 text-[10px] font-bold text-[var(--text-muted)]">{row.occurrenceCount} occurrences · {row.averageCalories} kcal average · last eaten {shortDate(row.lastEaten)}</p><p className="mt-1 text-[10px] font-semibold text-[var(--text-secondary)]">P {grams(row.averages.protein)} · C {grams(row.averages.carbohydrates)} · F {grams(row.averages.fat)}</p>{expanded && <div className="mt-2 space-y-1">{row.occurrences.map((meal) => <Link className="block text-xs font-bold text-[var(--primary)]" href={meal.href} key={`${row.id}-${meal.date}`}>{longDate(meal.date)}</Link>)}</div>}</div>)}</div>;
}

export function MealHistoryDayEntries({ groups, onSelect }) {
  if (!groups.length) return <Empty text="No meal history available." />;
  return <div className="divide-y divide-[var(--divider)]">{groups.map((group) => (
    <button
      className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left"
      key={group.id}
      onClick={() => onSelect(group.id)}
      type="button"
    >
      <span className="min-w-0">
        <span className="block break-words text-xs font-extrabold leading-5 text-[var(--text-primary)]">{group.dateLabel}</span>
        <span className="mt-0.5 block break-words text-[10px] font-semibold leading-4 text-[var(--text-muted)]">
          {group.mealCount} meal{group.mealCount === 1 ? "" : "s"} · {group.dailyCalories == null ? "Calories unavailable" : `${group.dailyCalories.toLocaleString()} kcal`}
        </span>
        {hasDailyMacros(group.dailyMacros) && (
          <span className="mt-0.5 block break-words text-[9px] font-semibold leading-4 text-[var(--text-subtle)]">
            P {grams(group.dailyMacros.protein)} · C {grams(group.dailyMacros.carbohydrates)} · F {grams(group.dailyMacros.fat)}
          </span>
        )}
      </span>
      <ChevronRight aria-hidden className="shrink-0 text-[var(--text-subtle)]" size={17} />
    </button>
  ))}</div>;
}

export function MealHistoryGroups({ groups, hideDateHeading = false }) {
  if (!groups.length) return <Empty text="No meal history available." />;
  return <div>{groups.map((group, groupIndex) => (
    <section className={`${groupIndex ? "mt-4 border-t border-[var(--divider)] pt-3" : ""}`} key={group.id}>
      {!hideDateHeading && <h3 className="px-4 pb-1 text-[11px] font-extrabold uppercase tracking-[0.06em] text-[var(--text-subtle)]">{group.dateLabel}</h3>}
      <div className="divide-y divide-[color-mix(in_srgb,var(--divider)_70%,transparent)]">
        {group.meals.map((meal) => <MealHistoryRow key={`${meal.dayId}-${meal.id}`} meal={meal} />)}
      </div>
    </section>
  ))}</div>;
}

function MealHistoryRow({ meal }) {
  const appearance = NUTRITION_MEAL_SLOT_KEYS.includes(meal.slot)
    ? getNutritionMealSlotPresentation(meal.slot)
    : { label: meal.slot || "Meal", foregroundClassName: "text-[var(--text-secondary)]" };
  const slotLabel = appearance.label || meal.slot || "Meal";
  const foodCount = Number.isFinite(meal.foodCount) ? `${meal.foodCount} food${meal.foodCount === 1 ? "" : "s"}` : "Food count unavailable";
  return <Link className="block min-h-11 px-4 py-2.5" href={meal.href}><div className="flex items-start justify-between gap-3"><p className={`min-w-0 break-words text-[11px] font-extrabold leading-5 ${appearance.foregroundClassName}`}>{slotLabel}{meal.showDistinctName && <><span className="text-[var(--text-subtle)]"> · </span><span className="text-[var(--text-primary)]">{meal.displayName}</span></>}</p><span className="shrink-0 text-xs font-extrabold leading-5 text-[var(--text-primary)]">{meal.totals.calories} kcal</span></div><p className="mt-0.5 break-words text-[10px] font-semibold leading-4 text-[var(--text-muted)]">P {grams(meal.totals.protein_g)} · C {grams(meal.totals.carbs_g)} · F {grams(meal.totals.fat_g)} · {foodCount}</p></Link>;
}

function Empty({ text }) { return <p className="px-4 pb-4 text-sm font-semibold text-[var(--text-muted)]">{text}</p>; }
function hasDailyMacros(macros) { return Object.values(macros ?? {}).some((value) => value != null); }
function grams(value) { return value == null ? "—" : `${Math.round(value)}g`; }
function shortDate(value) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)); }
function longDate(value) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)); }

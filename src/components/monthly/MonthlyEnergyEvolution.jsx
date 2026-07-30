"use client";

import { Info, Zap } from "lucide-react";

const MAX_ENERGY = 3600;
const height = (value) => `${Math.max(5, Math.round((Number(value) / MAX_ENERGY) * 92))}px`;

export default function MonthlyEnergyEvolution({ model }) {
  return (
    <section
      className="mb-3 overflow-hidden rounded-[22px] border border-sky-300/70 bg-gradient-to-br from-sky-50 via-white to-emerald-50/40 shadow-[0_22px_54px_-36px_rgba(14,165,233,.85)] dark:border-sky-300/25 dark:from-sky-950/35 dark:via-slate-900 dark:to-emerald-950/20"
      data-testid="monthly-energy-evolution"
    >
      <div className="border-b border-sky-200/70 p-4 dark:border-sky-300/15">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-300/15 dark:text-sky-300"><Zap size={16} /></span>
          <p className="text-[10px] font-extrabold uppercase tracking-[.1em] text-sky-700 dark:text-sky-300">{model.eyebrow}</p>
        </div>
        <h2 className="mt-3 text-[23px] font-extrabold leading-7 text-slate-950 dark:text-white">{model.title}</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-[.07em] text-violet-700 dark:bg-violet-300/15 dark:text-violet-200">{model.phaseLabel}</span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-black text-slate-600 dark:bg-white/10 dark:text-slate-200">{model.phaseDates}</span>
        </div>
        <p className="mt-3 text-sm font-semibold leading-6 text-slate-700 dark:text-slate-100">{model.summary}</p>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-2 gap-2" data-testid="monthly-energy-summary">
          {model.summaryMetrics.map((metric) => <SummaryMetric key={metric.label} metric={metric} />)}
        </div>

        <div className="mt-3 flex gap-2 rounded-2xl border-l-4 border-emerald-500 bg-emerald-100/70 p-3 dark:bg-emerald-300/[.08]">
          <Info className="mt-0.5 shrink-0 text-emerald-700 dark:text-emerald-300" size={16} />
          <p className="text-xs font-extrabold leading-5 text-slate-800 dark:text-slate-100">{model.whyItMatters}</p>
        </div>

        <EnergyLegend />
        <WeeklyChart weeks={model.weekly} />
      </div>
    </section>
  );
}

function SummaryMetric({ metric }) {
  const colors = {
    balance: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-300/20 dark:bg-emerald-300/[.08] dark:text-emerald-300",
    coverage: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-300/20 dark:bg-violet-300/[.08] dark:text-violet-300",
    expenditure: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-300/20 dark:bg-sky-300/[.08] dark:text-sky-300",
    intake: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-300/20 dark:bg-amber-300/[.08] dark:text-amber-300",
  };
  const available = metric.value !== null && metric.value !== undefined;
  return (
    <section className={`rounded-2xl border p-3 ${colors[metric.tone]}`}>
      <p className="text-[9px] font-black uppercase tracking-[.07em]">{metric.label}</p>
      <p className="mt-2 text-lg font-black text-slate-950 dark:text-white">
        {available ? metric.value : "—"}{available && metric.suffix ? <span className="ml-1 text-[9px] font-extrabold text-slate-500 dark:text-slate-300">{metric.suffix}</span> : null}
      </p>
      {metric.detail && <p className="mt-1 text-[9px] font-semibold text-slate-600 dark:text-slate-300">{metric.detail}</p>}
    </section>
  );
}

function EnergyLegend() {
  return (
    <div className="mt-3 flex flex-wrap gap-3 text-[9px] font-bold text-slate-600 dark:text-slate-300">
      <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber-400" />Intake</span>
      <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-sky-500" />Estimated expenditure</span>
      <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />Balance</span>
    </div>
  );
}

function WeeklyChart({ weeks }) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-3" data-testid="energy-weekly-variant">
      {weeks.map((week) => (
        <section className="min-w-0 text-center" key={week.id}>
          {week.missing ? (
            <div className="flex h-[112px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/50 text-[9px] font-bold text-slate-500 dark:border-slate-600 dark:bg-white/[.03] dark:text-slate-400">No complete days</div>
          ) : (
            <>
              <div className="flex h-[112px] items-end justify-center gap-2 rounded-2xl bg-slate-100 px-2 dark:bg-white/[.06]">
                <span aria-label={`Intake ${week.intake}`} className="w-5 rounded-t-md bg-amber-400" style={{ height: height(week.intake) }} />
                <span aria-label={`Estimated expenditure ${week.expenditure}`} className="w-5 rounded-t-md bg-sky-500" style={{ height: height(week.expenditure) }} />
              </div>
              <p className="mt-2 text-xs font-black text-emerald-600 dark:text-emerald-300">{week.balance} kcal</p>
            </>
          )}
          <p className="mt-1 text-[9px] font-extrabold text-slate-600 dark:text-slate-300">{week.label}</p>
        </section>
      ))}
    </div>
  );
}

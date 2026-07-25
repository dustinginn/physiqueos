"use client";

import { useState } from "react";
import { getEnergyMetricValueClass } from "../../presentation/energyPresentation";

export default function EnergyWeeklyChart({ weeks = [] }) {
  const chronological = [...weeks].reverse();
  const [selectedId, setSelectedId] = useState(
    chronological.at(-1)?.id ?? null
  );
  const selected =
    chronological.find((week) => week.id === selectedId) ??
    chronological.at(-1) ??
    null;
  const maximum = Math.max(
    ...chronological.flatMap((week) => [
      week.averageIntake ?? 0,
      week.averageExpenditure ?? 0,
    ]),
    1
  );

  if (chronological.length === 0) {
    return (
      <div className="grid h-40 place-items-center rounded-[14px] bg-[var(--chart-bg)] px-4 text-center text-sm font-bold text-[var(--text-subtle)]">
        No weekly energy evidence available
      </div>
    );
  }

  return (
    <figure aria-label="Weekly average intake and estimated expenditure">
      <div className="flex h-44 items-end gap-2 rounded-[14px] bg-[var(--chart-bg)] px-3 pb-3 pt-5">
        {chronological.map((week) => (
          <button
            aria-label={`${formatRange(week)}. ${describeWeek(week)}`}
            aria-pressed={week.id === selected?.id}
            className="group flex min-w-0 flex-1 flex-col items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
            key={week.id}
            onClick={() => setSelectedId(week.id)}
            type="button"
          >
            <span className="flex h-28 w-full items-end justify-center gap-1">
              <ChartBar
                className="bg-[var(--energy-intake)]"
                maximum={maximum}
                value={week.averageIntake}
              />
              <ChartBar
                className="border-2 border-[var(--energy-expenditure)] bg-transparent"
                maximum={maximum}
                value={week.averageExpenditure}
              />
            </span>
            <span className="truncate text-[9px] font-extrabold text-[var(--text-muted)]">
              {formatShortDate(week.weekStart)}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-bold text-[var(--text-muted)]">
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-[var(--energy-intake)]" />
          Intake
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm border-2 border-[var(--energy-expenditure)]" />
          Estimated expenditure
        </span>
      </div>
      {selected && (
        <div
          aria-live="polite"
          className="mt-3 rounded-[12px] bg-[var(--surface-muted)] p-3"
        >
          <p className="text-xs font-extrabold text-[var(--text-primary)]">
            {formatRange(selected)}
            {selected.partial ? " · Partial" : ""}
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
            <ChartValue
              label="Average intake"
              metric="intake"
              numericValue={selected.averageIntake}
              value={formatCalories(selected.averageIntake)}
            />
            <ChartValue
              label="Average estimated expenditure"
              metric="expenditure"
              numericValue={selected.averageExpenditure}
              value={formatCalories(selected.averageExpenditure)}
            />
            <ChartValue
              label="Average balance"
              metric="balance"
              numericValue={selected.averageBalance}
              value={formatSignedCalories(selected.averageBalance)}
            />
            <ChartValue
              label="Complete days"
              value={`${selected.completeDayCount} of ${selected.evidenceDayCount}`}
            />
          </dl>
        </div>
      )}
    </figure>
  );
}

function ChartBar({ className, maximum, value }) {
  const height = value == null ? 0 : Math.max(5, (value / maximum) * 100);
  return (
    <span
      className={`block w-[min(14px,42%)] rounded-t-[4px] ${className}`}
      style={{ height: `${height}%` }}
    />
  );
}

function ChartValue({ label, metric = "neutral", numericValue, value }) {
  return (
    <div>
      <dt className="font-bold text-[var(--text-subtle)]">{label}</dt>
      <dd
        className={`mt-0.5 font-extrabold ${getEnergyMetricValueClass(
          metric,
          numericValue
        )}`}
      >
        {value}
      </dd>
    </div>
  );
}

function describeWeek(week) {
  return [
    `Average intake ${formatCalories(week.averageIntake)}`,
    `average estimated expenditure ${formatCalories(week.averageExpenditure)}`,
    `average balance ${formatSignedCalories(week.averageBalance)}`,
    `${week.completeDayCount} complete days`,
  ].join(", ");
}

export function formatCalories(value) {
  return value == null ? "Not available" : `${Math.round(value).toLocaleString()} kcal`;
}

export function formatSignedCalories(value) {
  if (value == null) return "Not available";
  const rounded = Math.round(value);
  if (rounded === 0) return "0 kcal";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toLocaleString()} kcal`;
}

export function formatRange(week) {
  return `${formatShortDate(week.weekStart)}–${formatShortDate(week.weekEnd)}`;
}

function formatShortDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

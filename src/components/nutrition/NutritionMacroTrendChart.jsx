"use client";

import { useState } from "react";
import { LONG_RANGE_OPTIONS } from "../../domain/services/LongRangeTimeSeriesService";

const WIDTH = 320;
const HEIGHT = 190;
const PADDING_X = 22;
const PADDING_Y = 22;

export default function NutritionMacroTrendChart({
  macro,
  onRangeChange,
  rangeId,
  weeks = [],
}) {
  const chronological = [...weeks].reverse().filter(
    (week) => week.macros[macro.key]?.average != null
  );
  const [selectedId, setSelectedId] = useState(null);
  const resolvedId = chronological.some((week) => week.id === selectedId)
    ? selectedId
    : chronological.at(-1)?.id ?? null;
  const selected = chronological.find((week) => week.id === resolvedId) ?? null;

  return (
    <>
      <div
        aria-label="Macro trends date range"
        className="grid grid-cols-5 gap-1 rounded-[12px] bg-[var(--surface-muted)] p-1"
        role="group"
      >
        {LONG_RANGE_OPTIONS.map((option) => (
          <button
            aria-pressed={rangeId === option.id}
            className={`min-h-9 rounded-[9px] px-1 text-[11px] font-extrabold ${
              rangeId === option.id
                ? "bg-[var(--surface-elevated)] text-[var(--primary)] shadow-[var(--shadow-card)]"
                : "text-[var(--text-muted)]"
            }`}
            key={option.id}
            onClick={() => onRangeChange(option.id)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="mt-3">
        <MacroPlot
          macro={macro}
          onSelect={setSelectedId}
          selectedId={resolvedId}
          weeks={chronological}
        />
      </div>
      {chronological.length === 1 && (
        <p className="mt-2 text-xs font-semibold text-[var(--text-muted)]">
          More weekly history is needed to show a trend.
        </p>
      )}
      {selected && <SelectedWeek macro={macro} week={selected} />}
    </>
  );
}

function MacroPlot({ macro, onSelect, selectedId, weeks }) {
  if (!weeks.length) {
    return (
      <div className="grid h-[190px] place-items-center rounded-[14px] bg-[var(--chart-bg)] px-4 text-center text-sm font-bold text-[var(--text-subtle)]">
        No {macro.label.toLowerCase()} evidence available in this period
      </div>
    );
  }
  const values = weeks.map((week) => week.macros[macro.key].average);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum || 1;
  const first = time(weeks[0].weekStart);
  const last = time(weeks.at(-1).weekStart);
  const span = last - first || 1;
  const points = weeks.map((week) => ({
    ...week,
    value: week.macros[macro.key].average,
    x:
      weeks.length === 1
        ? WIDTH / 2
        : PADDING_X + ((time(week.weekStart) - first) / span) * (WIDTH - PADDING_X * 2),
    y:
      PADDING_Y +
      ((maximum - week.macros[macro.key].average) / range) *
        (HEIGHT - PADDING_Y * 2 - 14),
  }));

  return (
    <figure aria-label={`Weekly average ${macro.label.toLowerCase()} over time`}>
      <svg className="h-auto w-full overflow-visible" role="img" viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        <title>Weekly average {macro.label.toLowerCase()} over time</title>
        {[0, 1, 2].map((line) => {
          const y = PADDING_Y + line * ((HEIGHT - PADDING_Y * 2) / 2);
          return <line key={line} stroke="var(--chart-grid)" x1={PADDING_X} x2={WIDTH - PADDING_X} y1={y} y2={y} />;
        })}
        {buildMacroTrendPaths(points).map((path, index) => (
          <path d={path} fill="none" key={index} stroke={macro.color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
        ))}
        {points.map((point) => (
          <g
            aria-label={`${formatWeekRange(point)}. ${point.value} grams average. ${point.macros[macro.key].count} days logged.`}
            className="cursor-pointer outline-none"
            key={point.id}
            onClick={() => onSelect(point.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(point.id);
              }
            }}
            role="button"
            tabIndex="0"
          >
            <rect fill="transparent" height={HEIGHT - PADDING_Y * 2} width="28" x={point.x - 14} y={PADDING_Y} />
            <circle cx={point.x} cy={point.y} fill={macro.color} r={point.id === selectedId ? 5 : 3.5} stroke="var(--surface-elevated)" strokeWidth="2" />
          </g>
        ))}
      </svg>
    </figure>
  );
}

function SelectedWeek({ macro, week }) {
  const value = week.macros[macro.key];
  return (
    <div aria-live="polite" className="mt-3 rounded-[12px] bg-[var(--surface-muted)] p-3">
      <p className="text-xs font-extrabold text-[var(--text-primary)]">{formatWeekRange(week)}</p>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
        <Detail label={`Average ${macro.label.toLowerCase()}`} value={`${value.average}g`} />
        <Detail label="Logged days" value={`${value.count} day${value.count === 1 ? "" : "s"} logged`} />
        <Detail label="Lowest day" value={`${value.minimum}g`} />
        <Detail label="Highest day" value={`${value.maximum}g`} />
      </dl>
    </div>
  );
}

function Detail({ label, value }) {
  return <div><dt className="font-bold text-[var(--text-subtle)]">{label}</dt><dd className="mt-0.5 font-extrabold text-[var(--text-primary)]">{value}</dd></div>;
}

export function buildMacroTrendPaths(points) {
  const paths = [];
  let segment = [];
  const flush = () => {
    if (segment.length > 1) paths.push(segment.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" "));
    segment = [];
  };
  points.forEach((point, index) => {
    if (index && (time(point.weekStart) - time(points[index - 1].weekStart)) / 86400000 > 7) flush();
    segment.push(point);
  });
  flush();
  return paths;
}

function time(value) {
  return new Date(`${value}T12:00:00Z`).getTime();
}

export function formatWeekRange(week) {
  return `${shortDate(week.weekStart)}–${shortDate(week.weekEnd)}`;
}

function shortDate(value) {
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

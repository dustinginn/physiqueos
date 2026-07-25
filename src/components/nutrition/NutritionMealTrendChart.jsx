"use client";

import { useState } from "react";
import { LONG_RANGE_OPTIONS } from "../../domain/services/LongRangeTimeSeriesService";

const WIDTH = 320;
const HEIGHT = 180;

export default function NutritionMealTrendChart({
  points,
  rangeId,
  onRangeChange,
  unit,
}) {
  const chronological = [...points].reverse();
  const [selectedId, setSelectedId] = useState(null);
  const selected = chronological.find((point) => point.id === selectedId) ??
    chronological.at(-1) ?? null;
  return (
    <>
      <div className="grid grid-cols-5 gap-1 rounded-[12px] bg-[var(--surface-muted)] p-1" role="group" aria-label="Meal trend date range">
        {LONG_RANGE_OPTIONS.map((option) => (
          <button
            aria-pressed={rangeId === option.id}
            className={`min-h-9 rounded-[9px] text-[11px] font-extrabold ${rangeId === option.id ? "bg-[var(--surface-elevated)] text-[var(--primary)] shadow-[var(--shadow-card)]" : "text-[var(--text-muted)]"}`}
            key={option.id}
            onClick={() => onRangeChange(option.id)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
      <MealPlot onSelect={setSelectedId} points={chronological} selectedId={selected?.id} />
      {chronological.length === 1 && <p className="mt-2 text-xs font-semibold text-[var(--text-muted)]">More weekly history is needed to show a trend.</p>}
      {selected && (
        <div className="mt-3 rounded-[12px] bg-[var(--surface-muted)] p-3" aria-live="polite">
          <p className="text-xs font-extrabold text-[var(--text-primary)]">{weekLabel(selected)}</p>
          <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
            <Detail label="Average" value={`${selected.value}${unit}`} />
            <Detail label="Meals" value={selected.occurrenceCount} />
            <Detail label="Logged days" value={selected.loggedDayCount} />
          </div>
        </div>
      )}
    </>
  );
}
function MealPlot({ onSelect, points, selectedId }) {
  if (!points.length) return <div className="mt-3 grid h-[180px] place-items-center rounded-[14px] bg-[var(--chart-bg)] text-sm font-bold text-[var(--text-subtle)]">No contributing meal evidence.</div>;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const first = dateNumber(points[0].weekStart);
  const last = dateNumber(points.at(-1).weekStart);
  const span = last - first || 1;
  const plotted = points.map((point) => ({
    ...point,
    x: points.length === 1 ? WIDTH / 2 : 20 + (dateNumber(point.weekStart) - first) / span * 280,
    y: 20 + (max - point.value) / range * 130,
  }));
  return (
    <svg className="mt-3 h-auto w-full" role="img" viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
      <title>Weekly meal trend</title>
      {buildMealTrendPaths(plotted).map((path) => <path d={path} fill="none" key={path} stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" />)}
      {plotted.map((point) => (
        <g key={point.id} role="button" tabIndex="0" onClick={() => onSelect(point.id)} onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") onSelect(point.id);
        }}>
          <rect fill="transparent" height="150" width="28" x={point.x - 14} y="10" />
          <circle cx={point.x} cy={point.y} fill="var(--primary)" r={point.id === selectedId ? 5 : 3.5} />
        </g>
      ))}
    </svg>
  );
}

export function buildMealTrendPaths(points) {
  const paths = [];
  let segment = [];
  const flush = () => {
    if (segment.length > 1) paths.push(segment.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" "));
    segment = [];
  };
  points.forEach((point, index) => {
    if (index && (dateNumber(point.weekStart) - dateNumber(points[index - 1].weekStart)) / 86400000 > 7) flush();
    segment.push(point);
  });
  flush();
  return paths;
}

function Detail({ label, value }) {
  return <div><p className="font-bold text-[var(--text-subtle)]">{label}</p><p className="mt-0.5 font-extrabold text-[var(--text-primary)]">{value}</p></div>;
}

function weekLabel(point) {
  return `${shortDate(point.weekStart)}–${shortDate(point.weekEnd)}`;
}

function shortDate(value) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

function dateNumber(value) {
  return new Date(`${value}T12:00:00Z`).getTime();
}

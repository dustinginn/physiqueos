"use client";

import { useState } from "react";
import { LONG_RANGE_OPTIONS } from "../../domain/services/LongRangeTimeSeriesService";

const WIDTH = 320;
const HEIGHT = 190;
const PADDING_X = 22;
const PADDING_Y = 22;

export default function NutritionCaloriesOverTimeChart({
  onRangeChange,
  rangeId,
  weeks = [],
}) {
  const chronological = [...weeks].reverse();
  const [selectedId, setSelectedId] = useState(
    chronological.at(-1)?.id ?? null
  );
  const resolvedSelectedId = reconcileSelectedId(
    chronological,
    selectedId
  );
  const selected =
    chronological.find((week) => week.id === resolvedSelectedId) ?? null;

  return (
    <>
      <div
        aria-label="Calories over time date range"
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
        <CaloriesPlot
          onSelect={setSelectedId}
          selectedId={resolvedSelectedId}
          weeks={chronological}
        />
      </div>
      {chronological.length === 1 && (
        <p className="mt-2 text-xs font-semibold text-[var(--text-muted)]">
          More weekly history is needed to show a trend.
        </p>
      )}
      {selected && <SelectedWeekDetail week={selected} />}
    </>
  );
}

function CaloriesPlot({ onSelect, selectedId, weeks }) {
  if (weeks.length === 0) {
    return (
      <div className="grid h-[190px] place-items-center rounded-[14px] bg-[var(--chart-bg)] px-4 text-center text-sm font-bold text-[var(--text-subtle)]">
        No calorie evidence available in this period
      </div>
    );
  }

  const values = weeks.map((week) => week.averageCalories);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum || 1;
  const firstTime = getTime(weeks[0].weekStart);
  const lastTime = getTime(weeks.at(-1).weekStart);
  const timeRange = lastTime - firstTime || 1;
  const points = weeks.map((week) => ({
    ...week,
    x:
      weeks.length === 1
        ? WIDTH / 2
        : PADDING_X +
          ((getTime(week.weekStart) - firstTime) / timeRange) *
            (WIDTH - PADDING_X * 2),
    y:
      PADDING_Y +
      ((maximum - week.averageCalories) / range) *
        (HEIGHT - PADDING_Y * 2 - 14),
  }));
  const labelPoints =
    points.length <= 3
      ? points
      : [points[0], points[Math.floor((points.length - 1) / 2)], points.at(-1)];

  return (
    <figure aria-label="Weekly average calorie intake over time">
      <svg
        className="h-auto w-full overflow-visible"
        role="img"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      >
        <title>Weekly average calorie intake over time</title>
        {[0, 1, 2].map((line) => {
          const y = PADDING_Y + line * ((HEIGHT - PADDING_Y * 2) / 2);
          return (
            <line
              key={line}
              stroke="var(--chart-grid)"
              strokeWidth="1"
              x1={PADDING_X}
              x2={WIDTH - PADDING_X}
              y1={y}
              y2={y}
            />
          );
        })}
        {buildNutritionCalorieSeriesPaths(points).map((path, index) => (
          <path
            d={path}
            fill="none"
            key={index}
            stroke="var(--chart-3)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />
        ))}
        {points.map((point) => (
          <g
            aria-label={`${formatWeekRange(point)}. ${formatCalories(
              point.averageCalories
            )} average. ${formatLoggedDays(point.loggedDayCount)}.`}
            className="cursor-pointer outline-none focus-visible:[&>rect]:stroke-[var(--primary)]"
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
            <rect
              fill="transparent"
              height={HEIGHT - PADDING_Y * 2}
              stroke="transparent"
              strokeWidth="2"
              width="28"
              x={point.x - 14}
              y={PADDING_Y}
            />
            <circle
              cx={point.x}
              cy={point.y}
              fill="var(--chart-3)"
              r={point.id === selectedId ? 5 : 3.5}
              stroke="var(--surface-elevated)"
              strokeWidth="2"
            />
          </g>
        ))}
        {labelPoints.map((point) => (
          <text
            fill="var(--text-subtle)"
            fontSize="9"
            fontWeight="700"
            key={`label-${point.id}`}
            textAnchor={
              point === points[0]
                ? "start"
                : point === points.at(-1)
                  ? "end"
                  : "middle"
            }
            x={point.x}
            y={HEIGHT - 3}
          >
            {formatShortDate(point.weekStart)}
          </text>
        ))}
      </svg>
    </figure>
  );
}

function SelectedWeekDetail({ week }) {
  return (
    <div
      aria-live="polite"
      className="mt-3 rounded-[12px] bg-[var(--surface-muted)] p-3"
    >
      <p className="text-xs font-extrabold text-[var(--text-primary)]">
        {formatWeekRange(week)}
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
        <Detail
          label="Average calories"
          value={formatCalories(week.averageCalories)}
        />
        <Detail label="Logged days" value={formatLoggedDays(week.loggedDayCount)} />
        <Detail label="Lowest day" value={formatCalories(week.minimumCalories)} />
        <Detail label="Highest day" value={formatCalories(week.maximumCalories)} />
      </dl>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <dt className="font-bold text-[var(--text-subtle)]">{label}</dt>
      <dd className="mt-0.5 font-extrabold text-[var(--text-primary)]">
        {value}
      </dd>
    </div>
  );
}

export function buildNutritionCalorieSeriesPaths(points) {
  const paths = [];
  let segment = [];
  const flush = () => {
    if (segment.length > 1) {
      paths.push(
        segment
          .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
          .join(" ")
      );
    }
    segment = [];
  };

  points.forEach((point, index) => {
    const prior = points[index - 1];
    if (prior && differenceInDays(prior.weekStart, point.weekStart) > 7) {
      flush();
    }
    segment.push(point);
  });
  flush();
  return paths;
}

function reconcileSelectedId(weeks, selectedId) {
  if (weeks.some((week) => week.id === selectedId)) return selectedId;
  return weeks.at(-1)?.id ?? null;
}

function differenceInDays(start, end) {
  return Math.round((getTime(end) - getTime(start)) / 86400000);
}

function getTime(value) {
  return new Date(`${value}T12:00:00Z`).getTime();
}

export function formatCalories(value) {
  return value == null ? "Not available" : `${Math.round(value).toLocaleString()} kcal`;
}

export function formatWeekRange(week) {
  return `${formatShortDate(week.weekStart)}–${formatShortDate(week.weekEnd)}`;
}

function formatLoggedDays(value) {
  return `${value} day${value === 1 ? "" : "s"} logged`;
}

function formatShortDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

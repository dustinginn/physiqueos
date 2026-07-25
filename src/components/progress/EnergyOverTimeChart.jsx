"use client";

import { useState } from "react";
import {
  ENERGY_RANGE_OPTIONS,
  filterWeeklyEnergyByRange,
  reconcileSelectedWeekId,
} from "../../domain/services/EnergyWeeklyRangeService";
import {
  formatCalories,
  formatRange,
  formatSignedCalories,
} from "./EnergyWeeklyChart";
import { getEnergyMetricValueClass } from "../../presentation/energyPresentation";

const WIDTH = 320;
const HEIGHT = 190;
const PADDING_X = 22;
const PADDING_Y = 22;

export default function EnergyOverTimeChart({
  latestEvidenceDate,
  weeks = [],
}) {
  const [rangeId, setRangeId] = useState("all");
  const visibleWeeks = filterWeeklyEnergyByRange(
    weeks,
    rangeId,
    latestEvidenceDate
  );
  const [selectedId, setSelectedId] = useState(() =>
    reconcileSelectedWeekId(visibleWeeks)
  );
  const resolvedSelectedId = reconcileSelectedWeekId(
    visibleWeeks,
    selectedId
  );
  const selected =
    visibleWeeks.find((week) => week.id === resolvedSelectedId) ?? null;

  function selectRange(nextRangeId) {
    const nextWeeks = filterWeeklyEnergyByRange(
      weeks,
      nextRangeId,
      latestEvidenceDate
    );
    setRangeId(nextRangeId);
    setSelectedId((current) => reconcileSelectedWeekId(nextWeeks, current));
  }

  return (
    <>
      <div
        aria-label="Energy over time date range"
        className="grid grid-cols-5 gap-1 rounded-[12px] bg-[var(--surface-muted)] p-1"
        role="group"
      >
        {ENERGY_RANGE_OPTIONS.map((option) => (
          <button
            aria-pressed={rangeId === option.id}
            className={`min-h-9 rounded-[9px] px-1 text-[11px] font-extrabold ${
              rangeId === option.id
                ? "bg-[var(--surface-elevated)] text-[var(--primary)] shadow-[var(--shadow-card)]"
                : "text-[var(--text-muted)]"
            }`}
            key={option.id}
            onClick={() => selectRange(option.id)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="mt-3">
        <EnergyLinePlot
          onSelect={setSelectedId}
          selectedId={resolvedSelectedId}
          weeks={visibleWeeks}
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-bold text-[var(--text-muted)]">
        <span className="inline-flex items-center gap-1">
          <span className="h-0 w-5 border-t-2 border-[var(--energy-intake)]" />
          Intake
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-0 w-5 border-t-2 border-dashed border-[var(--energy-expenditure)]" />
          Estimated expenditure
        </span>
      </div>
      {selected && <SelectedWeekDetail week={selected} />}
    </>
  );
}

function EnergyLinePlot({ onSelect, selectedId, weeks }) {
  if (weeks.length === 0) {
    return (
      <div className="grid h-[190px] place-items-center rounded-[14px] bg-[var(--chart-bg)] px-4 text-center text-sm font-bold text-[var(--text-subtle)]">
        No weekly energy evidence available
      </div>
    );
  }

  const chronological = [...weeks].sort((left, right) =>
    left.weekStart.localeCompare(right.weekStart)
  );
  const values = chronological.flatMap((week) => [
    week.averageIntake,
    week.averageExpenditure,
  ]).filter(Number.isFinite);
  const minimum = values.length ? Math.min(...values) : 0;
  const maximum = values.length ? Math.max(...values) : 1;
  const range = maximum - minimum || 1;
  const points = chronological.map((week, index) => ({
    ...week,
    x:
      chronological.length === 1
        ? WIDTH / 2
        : PADDING_X +
          (index / (chronological.length - 1)) * (WIDTH - PADDING_X * 2),
    intakeY: coordinateY(week.averageIntake, maximum, range),
    expenditureY: coordinateY(week.averageExpenditure, maximum, range),
  }));
  const labelPoints =
    points.length <= 3
      ? points
      : [points[0], points[Math.floor((points.length - 1) / 2)], points.at(-1)];

  return (
    <figure aria-label="Weekly intake and estimated expenditure over time">
      <svg
        className="h-auto w-full overflow-visible"
        role="img"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      >
        <title>Weekly intake and estimated expenditure over time</title>
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
        {buildSeriesPaths(points, "intakeY").map((path, index) => (
          <path
            d={path}
            fill="none"
            key={`intake-${index}`}
            stroke="var(--energy-intake)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />
        ))}
        {buildSeriesPaths(points, "expenditureY").map((path, index) => (
          <path
            d={path}
            fill="none"
            key={`expenditure-${index}`}
            stroke="var(--energy-expenditure)"
            strokeDasharray="6 4"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.5"
          />
        ))}
        {points.map((point) => (
          <g
            aria-label={`${formatRange(point)}. ${describeWeek(point)}`}
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
            {point.intakeY != null && (
              <circle
                cx={point.x}
                cy={point.intakeY}
                fill="var(--energy-intake)"
                r={point.id === selectedId ? 5 : 3.5}
                stroke="var(--surface-elevated)"
                strokeWidth="2"
              />
            )}
            {point.expenditureY != null && (
              <circle
                cx={point.x}
                cy={point.expenditureY}
                fill="var(--surface-elevated)"
                r={point.id === selectedId ? 5 : 3.5}
                stroke="var(--energy-expenditure)"
                strokeWidth="2.5"
              />
            )}
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
            {formatWeekLabel(point.weekStart)}
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
        {formatRange(week)}
        {week.partial ? " · Partial" : ""}
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
        <Detail
          label="Average intake"
          metric="intake"
          numericValue={week.averageIntake}
          value={formatCalories(week.averageIntake)}
        />
        <Detail
          label="Average estimated expenditure"
          metric="expenditure"
          numericValue={week.averageExpenditure}
          value={formatCalories(week.averageExpenditure)}
        />
        <Detail
          label="Average balance"
          metric="balance"
          numericValue={week.averageBalance}
          value={formatSignedCalories(week.averageBalance)}
        />
        <Detail
          label="Evidence coverage"
          value={`${week.completeDayCount} complete · ${week.evidenceDayCount} evidence`}
        />
      </dl>
    </div>
  );
}

function Detail({ label, metric = "neutral", numericValue, value }) {
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

export function buildSeriesPaths(points, field) {
  const paths = [];
  let segment = [];
  const flush = () => {
    if (segment.length > 1) {
      paths.push(
        segment
          .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point[field]}`)
          .join(" ")
      );
    }
    segment = [];
  };

  points.forEach((point) => {
    if (point[field] == null) flush();
    else segment.push(point);
  });
  flush();
  return paths;
}

function coordinateY(value, maximum, range) {
  if (!Number.isFinite(value)) return null;
  return (
    PADDING_Y +
    ((maximum - value) / range) * (HEIGHT - PADDING_Y * 2 - 14)
  );
}

function describeWeek(week) {
  return [
    `average intake ${formatCalories(week.averageIntake)}`,
    `average estimated expenditure ${formatCalories(week.averageExpenditure)}`,
    `average balance ${formatSignedCalories(week.averageBalance)}`,
    `${week.completeDayCount} complete days`,
    `${week.evidenceDayCount} evidence days`,
  ].join(", ");
}

function formatWeekLabel(value) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

"use client";

import { useState } from "react";

export default function ProgressLineChart({
  ariaLabel,
  color = "var(--chart-line-primary)",
  metricLabel = "Value",
  markers = [],
  points = [],
  suffix = "",
}) {
  const [activeIndex, setActiveIndex] = useState(null);
  const [scrubbingPointerId, setScrubbingPointerId] = useState(null);
  const width = 320;
  const height = 170;
  const padding = 22;
  const values = points
    .map((point) => point.value)
    .filter((value) => Number.isFinite(value));
  const minValue = values.length > 0 ? Math.min(...values) : 0;
  const maxValue = values.length > 0 ? Math.max(...values) : 1;
  const valueRange = maxValue - minValue || 1;
  const firstDate = getTime(points.at(0)?.date);
  const lastDate = getTime(points.at(-1)?.date);
  const timeRange = lastDate - firstDate || 1;
  const coordinates = points.map((point) => ({
    ...point,
    x:
      padding +
      ((getTime(point.date) - firstDate) / timeRange) * (width - padding * 2),
    y:
      padding +
      ((maxValue - point.value) / valueRange) * (height - padding * 2),
  }));
  const path = coordinates
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const activePoint = activeIndex === null ? coordinates.at(-1) : coordinates[activeIndex];

  if (values.length < 2) {
    return (
      <div className="grid h-[170px] place-items-center rounded-[14px] bg-[var(--chart-bg)] text-sm font-bold text-[var(--text-subtle)]">
        More history needed
      </div>
    );
  }

  function updateActivePoint(event) {
    event.preventDefault?.();
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const x = padding + ratio * (width - padding * 2);
    const nearestIndex = coordinates.reduce((nearest, point, index) => {
      const currentDistance = Math.abs(point.x - x);
      const nearestDistance = Math.abs(coordinates[nearest].x - x);

      return currentDistance < nearestDistance ? index : nearest;
    }, 0);

    setActiveIndex(nearestIndex);
  }

  function handlePointerDown(event) {
    event.preventDefault?.();
    setScrubbingPointerId(event.pointerId);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateActivePoint(event);
  }

  function handlePointerMove(event) {
    if (event.pointerType === "mouse" || scrubbingPointerId === event.pointerId) {
      updateActivePoint(event);
    }
  }

  function handlePointerUp(event) {
    updateActivePoint(event);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setScrubbingPointerId(null);
  }

  function handlePointerCancel(event) {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setScrubbingPointerId(null);
  }

  function handlePointerLeave() {
    if (scrubbingPointerId === null) setActiveIndex(null);
  }

  return (
    <figure
      aria-label={ariaLabel}
      className="overflow-hidden rounded-[14px] bg-[var(--chart-bg)] p-3"
    >
      <svg
        className="h-auto w-full touch-none select-none"
        onPointerCancel={handlePointerCancel}
        onPointerDown={handlePointerDown}
        onPointerLeave={handlePointerLeave}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        <title>{ariaLabel}</title>
        <rect
          fill="transparent"
          height={height}
          pointerEvents="all"
          width={width}
          x="0"
          y="0"
        />
        {[0, 1, 2].map((line) => {
          const y = padding + line * ((height - padding * 2) / 2);

          return (
            <line
              key={line}
              stroke="var(--chart-grid)"
              strokeWidth="1"
              x1={padding}
              x2={width - padding}
              y1={y}
              y2={y}
            />
          );
        })}
        {markers.map((marker) => {
          const markerTime = getTime(marker.date);
          const x =
            padding + ((markerTime - firstDate) / timeRange) * (width - padding * 2);

          if (x < padding || x > width - padding) return null;

          return (
            <g key={`${marker.id}-${marker.date}`}>
              <line
                stroke="var(--chart-marker)"
                strokeDasharray="3 4"
                strokeWidth="1.5"
                x1={x}
                x2={x}
                y1={padding}
                y2={height - padding}
              />
              <circle cx={x} cy={padding} fill="var(--chart-marker)" r="3" />
            </g>
          );
        })}
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
        />
        {coordinates.map((point) => (
          <circle
            cx={point.x}
            cy={point.y}
            fill="var(--surface-elevated)"
            key={point.id}
            r="3"
            stroke={color}
            strokeWidth="2"
          />
        ))}
        {activePoint && (
          <g>
            <line
              stroke="var(--chart-grid)"
              strokeDasharray="3 3"
              strokeWidth="1"
              x1={activePoint.x}
              x2={activePoint.x}
              y1={padding}
              y2={height - padding}
            />
            <circle
              cx={activePoint.x}
              cy={activePoint.y}
              fill={color}
              r="5"
              stroke="var(--chart-tooltip)"
              strokeWidth="2"
            />
          </g>
        )}
      </svg>
      {activePoint && (
        <div className="mt-2 rounded-[10px] bg-[var(--chart-tooltip)] px-3 py-2 text-xs font-bold text-[var(--text-muted)] shadow-[var(--shadow-card)]">
          <span className="text-[var(--text-subtle)]">{formatDate(activePoint.date)}</span>
          <span className="mx-2 text-[var(--text-subtle)]">/</span>
          <span className="text-[var(--text-primary)]">{metricLabel}: </span>
          <span>
            {activePoint.value.toFixed(1)}
            {suffix}
          </span>
        </div>
      )}
      <div className="mt-2 flex justify-between text-[11px] font-bold text-[var(--text-subtle)]">
        <span>{formatDate(points.at(0).date)}</span>
        <span>
          {points.at(-1).value.toFixed(1)}
          {suffix}
        </span>
        <span>{formatDate(points.at(-1).date)}</span>
      </div>
    </figure>
  );
}

function getTime(value) {
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  const date =
    year && month && day ? new Date(year, month - 1, day) : new Date(value);

  return date.getTime();
}

function formatDate(value) {
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  const date =
    year && month && day ? new Date(year, month - 1, day) : new Date(value);

  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

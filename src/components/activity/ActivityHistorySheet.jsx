"use client";

import { useState } from "react";
import FloatingSheet from "../ui/FloatingSheet";

export default function ActivityHistorySheet({ days = [] }) {
  const [open, setOpen] = useState(false);

  if (days.length === 0) return null;

  return (
    <>
      <button
        className="shrink-0 rounded-full px-2 py-1 text-sm font-extrabold text-[var(--primary)] transition hover:bg-[var(--surface-hover)] active:bg-[var(--surface-active)]"
        onClick={() => setOpen(true)}
        type="button"
      >
        Show All &gt;
      </button>
      <FloatingSheet
        description="Review every activity day in the selected evidence context."
        onOpenChange={setOpen}
        open={open}
        title="Recent Activity History"
      >
        <div className="divide-y divide-[var(--divider)] pb-6">
          {days.map((day) => (
            <div className="px-2 py-3" key={day.id}>
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-sm font-extrabold text-[var(--text-primary)]">
                    {formatDate(day.date)}
                  </span>
                  <span className="mt-1 block text-xs font-semibold leading-5 text-[var(--text-muted)]">
                    {day.protocolStatus}
                  </span>
                  <span className="mt-1 block text-xs font-semibold text-[var(--text-subtle)]">
                    {formatExerciseMinutes(day.exerciseMinutes)}
                  </span>
                </span>
                <span className="shrink-0 text-right text-sm font-extrabold text-[var(--text-primary)]">
                  {day.value}
                </span>
              </div>
            </div>
          ))}
        </div>
      </FloatingSheet>
    </>
  );
}

function formatDate(value) {
  const [year, month, day] = String(value ?? "")
    .slice(0, 10)
    .split("-")
    .map(Number);
  const date = year && month && day ? new Date(year, month - 1, day) : null;

  return date
    ? date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "Pending";
}

function formatExerciseMinutes(value) {
  return Number.isFinite(Number(value))
    ? `${value} exercise min`
    : "Exercise minutes unavailable";
}

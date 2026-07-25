"use client";

import { useState } from "react";
import Link from "next/link";
import FloatingSheet from "../ui/FloatingSheet";

export default function NutritionHistorySheet({ days = [] }) {
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
        description="Open a nutrition day to review its complete evidence record."
        onOpenChange={setOpen}
        open={open}
        title="Recent Nutrition History"
      >
        <div className="divide-y divide-[var(--divider)] pb-6">
          {days.map((day) => (
            <Link
              className="flex min-h-14 items-start justify-between gap-3 rounded-xl px-2 py-2.5 transition hover:bg-[var(--surface-hover)]"
              href={day.href}
              key={day.id}
            >
              <span className="min-w-0">
                <span className="block text-sm font-extrabold text-[var(--text-primary)]">
                  {formatDate(day.date)}
                </span>
                <span className="mt-0.5 block text-xs font-semibold leading-5 text-[var(--text-muted)]">
                  {day.detail}
                </span>
                {day.sourceEvidence?.length > 0 && (
                  <span className="mt-1 block text-xs font-bold text-[var(--text-subtle)]">
                    Source: {day.sourceEvidence.join(" + ")}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-right text-sm font-extrabold text-[var(--text-primary)]">
                {day.value}
              </span>
            </Link>
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

"use client";

import { useState } from "react";
import FloatingSheet from "../ui/FloatingSheet";
import { getTrainingDaySummary } from "../../presentation/trainingPresentation";
import Link from "next/link";

export default function TrainingHistorySheet({ days = [] }) {
  const [open, setOpen] = useState(false);

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
        description="Open a training day to review its recorded sessions."
        onOpenChange={setOpen}
        open={open}
        title="Recent Training History"
      >
        <div className="divide-y divide-[var(--divider)]">
          {days.map((day) => (
            <Link
              className="flex min-h-14 items-center justify-between gap-3 rounded-xl px-2 py-2.5 transition hover:bg-[var(--surface-hover)]"
              href={day.sessions?.[0]?.href ?? "/progress/training/reporting/history"}
              key={day.id}
            >
              <span className="min-w-0">
                <span className="block text-sm font-extrabold text-[var(--text-primary)]">{day.label}</span>
                <span className="mt-0.5 block text-xs font-semibold leading-5 text-[var(--text-muted)]">
                  {getTrainingDaySummary(day.sessions)}
                </span>
              </span>
              <span aria-hidden className="shrink-0 text-sm font-black text-[var(--primary)]">&gt;</span>
            </Link>
          ))}
        </div>
      </FloatingSheet>
    </>
  );
}

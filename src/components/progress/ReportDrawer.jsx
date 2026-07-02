"use client";

import { useId } from "react";

export default function ReportDrawer({
  children,
  defaultOpen = false,
  description,
  preview,
  title,
}) {
  const drawerId = useId();

  return (
    <section className="rounded-[18px] border border-[var(--divider)] bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow-card)]">
      <input
        className="peer sr-only"
        defaultChecked={defaultOpen}
        id={drawerId}
        type="checkbox"
      />

      <div className="peer-checked:hidden">
        <label
          className="block cursor-pointer rounded-[14px] transition hover:bg-[var(--surface-hover)]"
          htmlFor={drawerId}
        >
          <DrawerHeader description={description} stateLabel="Show all" title={title} />
          {preview && <div className="mt-3">{preview}</div>}
        </label>
      </div>

      <div className="hidden peer-checked:block">
        <div className="sticky top-2 z-10 rounded-[14px] bg-[var(--surface-elevated)] pb-3">
          <label className="block cursor-pointer" htmlFor={drawerId}>
            <DrawerHeader description={description} stateLabel="Close" title={title} />
          </label>
        </div>
        <div className="mt-3">{children}</div>
        <label
          className="mt-3 block w-full cursor-pointer rounded-[14px] bg-[var(--surface-muted)] px-3 py-3 text-center text-sm font-extrabold text-slate-700"
          htmlFor={drawerId}
        >
          Collapse
        </label>
      </div>
    </section>
  );
}

function DrawerHeader({ description, stateLabel, title }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-extrabold text-slate-950">{title}</h2>
        {description && (
          <p className="mt-1 text-sm font-medium leading-5 text-slate-500">
            {description}
          </p>
        )}
      </div>
      <span className="rounded-full bg-[var(--surface-muted)] px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-500">
        {stateLabel}
      </span>
    </div>
  );
}

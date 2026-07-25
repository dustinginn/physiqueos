"use client";

import Link from "next/link";
import { useState } from "react";
import FloatingSheet from "../ui/FloatingSheet";

const TONES = {
  danger: "border-rose-200/70 text-rose-800 dark:border-rose-300/15 dark:text-rose-200",
  neutral: "border-[var(--divider)] text-slate-700 dark:text-slate-300",
  stable: "border-blue-200/70 text-blue-800 dark:border-blue-300/15 dark:text-blue-200",
  success: "border-emerald-200/80 text-emerald-800 dark:border-emerald-300/15 dark:text-emerald-200",
  warning: "border-amber-200/80 text-amber-900 dark:border-amber-300/15 dark:text-amber-200",
};

export default function TrainingAnalysisDrawerGroup({
  groups = [],
  mode = "list",
  previewItems,
  sheetDescription,
  sheetTitle,
  viewAllLabel = "View all →",
}) {
  const [activeKey, setActiveKey] = useState(null);
  const active = groups.find((group) => group.key === activeKey) ?? null;
  const sheetItems = previewItems ? groups : active?.items;

  return (
    <>
      {previewItems ? (
        <div className="space-y-1">
          <div className="divide-y divide-[var(--divider)]">
            {previewItems.map((item) => <AnalysisLink item={item} key={item.href} />)}
          </div>
          {groups.length > previewItems.length && (
            <button className="flex min-h-11 w-full items-center rounded-xl px-2 text-sm font-extrabold text-[var(--primary)]" onClick={() => setActiveKey("__all__")} type="button">
              {viewAllLabel}
            </button>
          )}
        </div>
      ) : (
        <div className={mode === "status" ? "grid grid-cols-2 gap-2" : "space-y-2"}>
          {groups.map((group, index) => (
            <button
              key={group.key}
                className={mode === "status"
                  ? `flex min-h-14 cursor-pointer items-center justify-between gap-2 rounded-xl border bg-transparent px-3 py-2.5 text-left transition hover:bg-[var(--surface-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] active:scale-[0.99] active:bg-[var(--surface-active)] ${groups.length % 2 === 1 && index === groups.length - 1 ? "col-span-2" : ""} ${TONES[group.tone] ?? TONES.neutral}`
                  : "flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-[var(--divider)] bg-[var(--surface-muted)] px-3 py-2.5 text-left text-slate-700"}
                onClick={() => setActiveKey(group.key)}
                type="button"
              >
                <span className="min-w-0"><span className="block text-sm font-extrabold">{group.label}</span></span>
                {Number.isFinite(group.count) && <span className="ml-auto text-xl font-black leading-none">{group.count}</span>}
                {mode !== "status" && <span aria-hidden className="shrink-0 text-sm font-black">&gt;</span>}
            </button>
          ))}
        </div>
      )}
      <FloatingSheet
        description={sheetDescription ?? active?.drawerDescription ?? "Select an exercise to review its training history."}
        onOpenChange={(open) => { if (!open) setActiveKey(null); }}
        open={Boolean(active) || activeKey === "__all__"}
        title={sheetTitle ?? active?.label ?? "Training details"}
      >
        {sheetItems?.length ? (
          <div className="divide-y divide-[var(--divider)]">
            {sheetItems.map((item) => <AnalysisLink item={item} key={`${activeKey}-${item.href}`} />)}
          </div>
        ) : <p className="px-2 py-4 text-sm font-semibold text-[var(--text-muted)]">No exercises in this group.</p>}
      </FloatingSheet>
    </>
  );
}

function AnalysisLink({ item }) {
  return (
    <Link className="flex min-h-14 items-center justify-between gap-3 rounded-xl px-2 py-2.5 transition hover:bg-[var(--surface-hover)]" href={item.href}>
      <span className="min-w-0">
        <span className="block text-sm font-extrabold text-[var(--text-primary)]">{item.label}</span>
        {item.detail && <span className="mt-0.5 block text-xs font-semibold leading-5 text-[var(--text-muted)]">{item.detail}</span>}
      </span>
      <span aria-hidden className="shrink-0 text-sm font-black text-[var(--primary)]">&gt;</span>
    </Link>
  );
}

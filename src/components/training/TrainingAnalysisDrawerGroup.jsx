"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useState } from "react";

const TONES = {
  celebration:
    "border-violet-200/70 text-violet-800 dark:border-violet-300/15 dark:text-violet-200",
  danger:
    "border-rose-200/70 text-rose-800 dark:border-rose-300/15 dark:text-rose-200",
  neutral:
    "border-[var(--divider)] text-slate-700 dark:text-slate-300",
  stable:
    "border-blue-200/70 text-blue-800 dark:border-blue-300/15 dark:text-blue-200",
  success:
    "border-emerald-200/80 text-emerald-800 dark:border-emerald-300/15 dark:text-emerald-200",
  warning:
    "border-amber-200/80 text-amber-900 dark:border-amber-300/15 dark:text-amber-200",
};

export default function TrainingAnalysisDrawerGroup({
  groups = [],
  mode = "list",
}) {
  const [activeKey, setActiveKey] = useState(null);
  const active = groups.find((group) => group.key === activeKey) ?? null;

  return (
    <DialogPrimitive.Root
      onOpenChange={(open) => {
        if (!open) setActiveKey(null);
      }}
      open={Boolean(active)}
    >
      <div className={mode === "status" ? "grid grid-cols-2 gap-2" : "space-y-2"}>
        {groups.map((group, index) => (
          <DialogPrimitive.Trigger asChild key={group.key}>
            <button
              className={
                mode === "status"
                  ? `flex min-h-14 items-center justify-between gap-2 rounded-xl border bg-transparent px-3 py-2.5 text-left ${index === groups.length - 1 ? "col-span-2" : ""} ${TONES[group.tone] ?? TONES.neutral}`
                  : "flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-[var(--divider)] bg-[var(--surface-muted)] px-3 py-2.5 text-left text-slate-700 transition hover:border-[var(--border-strong)]"
              }
              onClick={() => setActiveKey(group.key)}
              type="button"
            >
              <span className="min-w-0">
                <span className="block text-sm font-extrabold">{group.label}</span>
                {group.description && (
                  <span className="mt-0.5 block text-[11px] font-semibold leading-4 text-slate-500">
                    {group.description}
                  </span>
                )}
              </span>
              {Number.isFinite(group.count) && (
                <span className="ml-auto text-xl font-black leading-none">
                  {group.count}
                </span>
              )}
              <span aria-hidden className="shrink-0 text-sm font-black">
                &gt;
              </span>
            </button>
          </DialogPrimitive.Trigger>
        ))}
      </div>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby="training-analysis-drawer-description"
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[calc(100dvh-4rem)] w-full max-w-[393px] flex-col overflow-hidden rounded-t-[24px] border border-b-0 border-[var(--divider)] bg-[var(--surface-elevated)] shadow-2xl outline-none data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom"
          data-testid="training-analysis-bottom-drawer"
        >
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--divider)] px-4 py-4">
            <div>
              <DialogPrimitive.Title className="text-lg font-extrabold text-[var(--text-primary)]">
                {active?.label ?? "Training details"}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description
                className="mt-1 text-xs font-semibold text-[var(--text-muted)]"
                id="training-analysis-drawer-description"
              >
                {active?.drawerDescription ?? "Select an exercise to review its training history."}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              aria-label="Close training drawer"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[var(--text-secondary)]"
              type="button"
            >
              <X aria-hidden size={18} />
            </DialogPrimitive.Close>
          </div>

          <div className="min-h-0 overflow-y-auto px-3 py-2 pb-[calc(6rem+env(safe-area-inset-bottom))]">
            {active?.items?.length ? (
              <div className="divide-y divide-[var(--divider)]">
                {active.items.map((item) => (
                  <Link
                    className="flex min-h-14 items-center justify-between gap-3 rounded-xl px-2 py-2.5 transition hover:bg-[var(--surface-hover)]"
                    href={item.href}
                    key={`${active.key}-${item.href}`}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-extrabold text-[var(--text-primary)]">
                        {item.label}
                      </span>
                      {item.detail && (
                        <span className="mt-0.5 block text-xs font-semibold leading-5 text-[var(--text-muted)]">
                          {item.detail}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-sm font-black text-[var(--primary)]">
                      &gt;
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="px-2 py-4 text-sm font-semibold text-[var(--text-muted)]">
                No exercises in this group.
              </p>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

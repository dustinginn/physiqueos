import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import BreadcrumbTrail from "./BreadcrumbTrail";

export default function MobilePageHeader({
  breadcrumbs = [],
  description,
  parentHref,
  parentLabel,
  rightAction,
  sectionLabel,
  title,
}) {
  return (
    <header className="mb-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        {parentHref ? (
          <Link
            aria-label={`Back to ${parentLabel ?? "parent"}`}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--divider)] bg-[var(--surface-elevated)] text-slate-500 shadow-[var(--shadow-card)]"
            href={parentHref}
          >
            <ArrowLeft aria-hidden="true" size={18} />
          </Link>
        ) : (
          <span className="h-10 w-10" />
        )}

        <div className="min-w-0 flex-1">
          {sectionLabel && (
            <p className="truncate text-[11px] font-extrabold uppercase tracking-[0.1em] text-indigo-600">
              {sectionLabel}
            </p>
          )}
          <h1 className="truncate text-2xl font-extrabold leading-tight text-slate-950">
            {title}
          </h1>
        </div>

        <div className="flex h-10 min-w-10 shrink-0 items-center justify-end">
          {rightAction}
        </div>
      </div>

      <BreadcrumbTrail items={breadcrumbs} />

      {description && (
        <p className="text-sm font-semibold leading-6 text-slate-500">
          {description}
        </p>
      )}
    </header>
  );
}

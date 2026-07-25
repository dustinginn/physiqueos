import Link from "next/link";

export default function TrainingTimelineSelector({
  ariaLabel = "Training evidence time filter",
  currentPath,
  preservedParams = {},
  timeline,
}) {
  return (
    <section
      aria-label={ariaLabel}
      className="mb-4 rounded-[14px] border border-[var(--divider)] bg-[var(--surface-card)] px-3 py-2.5"
    >
      <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-muted)]">
        Viewing
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {timeline.options.map((option) => (
          <Link
            aria-current={option.selected ? "page" : undefined}
            className={`rounded-full px-2.5 py-1.5 text-[11px] font-bold ${
              option.selected
                ? "bg-[var(--primary)] text-white"
                : "bg-[var(--surface-muted)] text-[var(--text-secondary)]"
            }`}
            href={getContextHref(currentPath, option.id, preservedParams)}
            key={option.id}
          >
            {option.label}
          </Link>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] font-semibold text-[var(--text-muted)]">
        {timeline.dateRangeLabel}
      </p>
    </section>
  );
}

function getContextHref(currentPath, contextId, preservedParams) {
  const params = new URLSearchParams(
    Object.entries(preservedParams).filter(([, value]) => value != null)
  );
  params.set("context", contextId);

  return `${currentPath}?${params.toString()}`;
}

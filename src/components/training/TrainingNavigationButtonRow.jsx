import Link from "next/link";

export default function TrainingNavigationButtonRow({
  ariaLabel = "Training navigation",
  items = [],
}) {
  return (
    <nav aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Link
          className="inline-flex min-h-11 items-center rounded-xl border border-[var(--divider)] bg-[var(--surface-muted)] px-3.5 text-sm font-extrabold text-slate-700 transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100 active:bg-[var(--surface-active)]"
          href={item.href}
          key={item.href}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

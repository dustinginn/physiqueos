import Link from "next/link";
import Card from "../ui/Card";

export const nativePressClassName =
  "border border-transparent transition duration-150 ease-out hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] hover:shadow-[0_8px_24px_rgba(15,23,42,0.06)] focus-visible:border-[var(--border-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] active:translate-y-0 active:scale-[0.99] active:bg-[var(--surface-active)] active:shadow-none";

export function CompactAction({ href, label }) {
  if (!href || !label) return null;

  return (
    <Link
      className="shrink-0 rounded-full px-2 py-1 text-sm font-extrabold text-[var(--primary)] transition hover:bg-[var(--surface-hover)] active:bg-[var(--surface-active)]"
      href={href}
    >
      {label} &gt;
    </Link>
  );
}

export function PressableCard({ children, className = "", href }) {
  const classes = `deep-pressable-card rounded-[12px] bg-[var(--surface-muted)] ${nativePressClassName} ${className}`;

  if (href) {
    return (
      <Link className={classes} href={href}>
        {children}
      </Link>
    );
  }

  return <div className={classes}>{children}</div>;
}

export function PressableRow({ children, className = "", href }) {
  return (
    <PressableCard
      className={`flex min-h-11 items-center justify-between gap-3 px-3 py-2.5 ${className}`}
      href={href}
    >
      {children}
    </PressableCard>
  );
}

export function DrawerPreview({ children, href }) {
  return (
    <PressableRow className="min-h-12" href={href}>
      {children}
    </PressableRow>
  );
}

export function BrowseCard({ items = [], title = "Browse" }) {
  return (
    <DeepPageCard className="space-y-2.5">
      <SectionHeader title={title} />
      <InformationList>
        {items.map((item) => (
          <InformationListItem
            detail={item.detail}
            href={item.href}
            key={item.href ?? item.label}
            label={item.label}
          />
        ))}
      </InformationList>
    </DeepPageCard>
  );
}

export function DeepPageCard({ children, className = "", variant = "elevated" }) {
  return (
    <Card className={className} padding="sm" variant={variant}>
      {children}
    </Card>
  );
}

export function HistoryCard({ children, emptyText, title = "Recent History" }) {
  return (
    <DeepPageCard className="space-y-2.5">
      <SectionHeader title={title} />
      {children || (
        <p className="text-sm font-semibold leading-6 text-slate-500">
          {emptyText}
        </p>
      )}
    </DeepPageCard>
  );
}

export function HeroSummary({ children, detail, stats = [], title }) {
  return (
    <DeepPageCard className="space-y-3">
      <div>
        <h2 className="text-xl font-extrabold leading-7 text-slate-950">
          {title}
        </h2>
        {detail && (
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
            {detail}
          </p>
        )}
      </div>
      {stats.length > 0 && <StatRow items={stats} />}
      {children}
    </DeepPageCard>
  );
}

export function InformationSection({ children, title }) {
  return (
    <section className="space-y-2.5">
      {title && <SectionHeader title={title} />}
      {children}
    </section>
  );
}

export function InformationList({ children }) {
  return <div className="divide-y divide-[var(--divider)]">{children}</div>;
}

export function InformationListItem({ detail, href, label, meta }) {
  const content = (
    <>
      <div className="min-w-0">
        <p className="truncate text-sm font-extrabold text-slate-950">{label}</p>
        {detail && (
          <p className="mt-0.5 text-xs font-semibold leading-5 text-slate-500">
            {detail}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2 pl-3">
        {meta && (
          <span className="text-xs font-extrabold text-slate-400">{meta}</span>
        )}
        {href && <span className="text-sm font-extrabold text-indigo-600">&gt;</span>}
      </div>
    </>
  );

  if (href) {
    return (
      <PressableRow className="px-2 py-2" href={href}>
        {content}
      </PressableRow>
    );
  }

  return (
    <div className="flex min-h-11 items-center justify-between gap-3 py-2.5">
      {content}
    </div>
  );
}

export function MetadataCard({ children, title }) {
  return (
    <DeepPageCard className="space-y-2.5">
      {title && <SectionHeader title={title} />}
      {children}
    </DeepPageCard>
  );
}

export function MetadataFooter({ items = [], title = "Details" }) {
  if (!items.length) return null;

  return (
    <section className="border-t border-[var(--divider)] pt-3">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
        {title}
      </p>
      <div className="mt-2 space-y-1.5">
        {items.map((item) => {
          const content = (
            <>
              <span>{item.label}</span>
              {item.value && <span className="text-slate-400">{item.value}</span>}
            </>
          );

          if (item.href) {
            return (
              <PressableRow
                className="min-h-0 px-2 py-1.5 text-xs font-bold text-slate-500"
                href={item.href}
                key={`${item.label}-${item.href}`}
              >
                {content}
              </PressableRow>
            );
          }

          return (
            <div
              className="flex items-center justify-between gap-3 text-xs font-bold text-slate-500"
              key={`${item.label}-${item.value}`}
            >
              {content}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function CompactTable({ columns = [], rows = [] }) {
  if (!columns.length || !rows.length) return null;
  const gridTemplateColumns = columns
    .map((column) => column.width ?? "1fr")
    .join(" ");

  return (
    <div className="overflow-hidden rounded-[12px] border border-[var(--divider)]">
      <div
        className="grid bg-[var(--surface-muted)] px-3 py-2 text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400"
        style={{ gridTemplateColumns }}
      >
        {columns.map((column) => (
          <span
            className={column.align === "right" ? "text-right" : ""}
            key={column.key}
          >
            {column.label}
          </span>
        ))}
      </div>
      <div className="divide-y divide-[var(--divider)]">
        {rows.map((row) => (
          <div
            className="grid px-3 py-2 text-sm font-bold"
            key={row.id}
            style={{ gridTemplateColumns }}
          >
            {columns.map((column) => (
              <span
                className={
                  column.align === "right"
                    ? "text-right text-slate-950"
                    : "text-slate-500"
                }
                key={column.key}
              >
                {row[column.key]}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function MetricGroup({ items = [] }) {
  if (!items.length) return null;

  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((item) => (
        <div className="min-w-0" key={`${item.label}-${item.value}`}>
          <p className="truncate text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
            {item.label}
          </p>
          <p className="mt-0.5 truncate text-sm font-extrabold text-slate-950">
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

export function PerformanceMetric({ label, value }) {
  return (
    <div className="rounded-[12px] bg-[var(--surface-muted)] px-3 py-2.5">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-extrabold text-slate-950">{value}</p>
    </div>
  );
}

export function SessionBadge({ date, label }) {
  const badgeLabel = label ?? getSessionBadgeLabel(date);
  const isToday = badgeLabel === "Today";
  const className = isToday
    ? "bg-[var(--surface-success)] text-[var(--chart-1)]"
    : "bg-[var(--surface-muted)] text-slate-500";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-extrabold ${className}`}
    >
      {badgeLabel}
    </span>
  );
}

export function StatRow({ items = [], variant = "default" }) {
  if (!items.length) return null;

  if (variant === "compact") {
    return (
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            className="rounded-full bg-[var(--surface-muted)] px-3 py-1.5 text-xs font-extrabold text-slate-700"
            key={`${item.label}-${item.value}`}
          >
            {item.label ? `${item.label} ` : ""}
            <span className="text-slate-950">{item.value}</span>
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((item) => (
        <PerformanceMetric
          key={`${item.label}-${item.value}`}
          label={item.label}
          value={item.value}
        />
      ))}
    </div>
  );
}

export function SectionHeader({ action, eyebrow, title }) {
  const actionNode =
    action?.href && action?.label ? (
      <CompactAction href={action.href} label={action.label} />
    ) : (
      action
    );

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
            {eyebrow}
          </p>
        )}
        <h2 className="truncate text-base font-extrabold text-slate-950">
          {title}
        </h2>
        {action?.subtitle && (
          <p className="mt-0.5 text-xs font-semibold leading-5 text-slate-500">
            {action.subtitle}
          </p>
        )}
      </div>
      {actionNode}
    </div>
  );
}

export function SummaryCard({ children, detail, meta, title }) {
  return (
    <DeepPageCard className="space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-extrabold text-slate-950">{title}</h2>
          {detail && (
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
              {detail}
            </p>
          )}
        </div>
        {meta && (
          <span className="shrink-0 text-sm font-extrabold text-indigo-600">
            {meta}
          </span>
        )}
      </div>
      {children}
    </DeepPageCard>
  );
}

function getSessionBadgeLabel(value) {
  if (!value) return "Pending";

  const dateKey = String(value).slice(0, 10);
  const today = new Date();
  const todayKey = toDateKey(today);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (dateKey === todayKey) return "Today";
  if (dateKey === toDateKey(yesterday)) return "Yesterday";

  const [year, month, day] = dateKey.split("-").map(Number);
  const date =
    year && month && day ? new Date(year, month - 1, day) : new Date(value);

  if (Number.isNaN(date.getTime())) return dateKey;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

import { Activity, Camera, Check, Scale, Target } from "lucide-react";
import Link from "next/link";
import Card from "../ui/Card";
import SectionTitle from "../ui/SectionTitle";
import FocusTile from "../focus/FocusTile";
import IconBadge from "../ui/IconBadge";

export default function TodaysFocusCard({
  completeAction,
  items = [],
  onItemClick,
}) {
  if (items.length === 0) return null;

  const hasSessions = items.some((item) => isSessionPriority(item));
  const gridClass = items.length === 1 || hasSessions ? "grid-cols-1" : "grid-cols-2";
  const density =
    items.length === 1 || hasSessions
      ? "expanded"
      : items.length === 2
        ? "balanced"
        : "compact";

  return (
    <Card as="section" padding="sm">
      <SectionTitle title="Today's Priorities" />

      <div className={`mt-2.5 grid ${gridClass} gap-2`}>
        {items.map((item) =>
          isSessionPriority(item) ? (
            <SessionPriorityCard item={item} key={item.id} />
          ) : (
            <FocusTile
              key={item.id}
              {...item}
              completeAction={completeAction}
              density={density}
              onClick={onItemClick ? () => onItemClick(item) : undefined}
            />
          )
        )}
      </div>
    </Card>
  );
}

function SessionPriorityCard({ item }) {
  const visibleItems = item.sessionItems.slice(0, 5);
  const hiddenCount = Math.max(item.sessionItems.length - visibleItems.length, 0);
  const completedCount = item.sessionItems.filter((sessionItem) => sessionItem.completed).length;
  const totalCount = item.sessionItems.length;
  const Icon = iconMap[item.icon] ?? Target;

  return (
    <Link
      className="
        block
        rounded-[16px]
        border
        border-[color-mix(in_srgb,var(--primary)_24%,var(--divider))]
        bg-[var(--surface-elevated)]
        p-3
        text-left
        shadow-[var(--shadow-card)]
        transition
        hover:border-[color-mix(in_srgb,var(--primary)_42%,var(--divider))]
        hover:bg-[var(--surface-muted)]
        focus-visible:outline
        focus-visible:outline-2
        focus-visible:outline-offset-2
        focus-visible:outline-[var(--primary)]
        active:scale-[0.99]
      "
      data-testid="session-priority-card"
      href={item.href}
    >
      <div className="flex items-start gap-3">
        <IconBadge icon={Icon} color={item.color} size="sm" className="rounded-full" />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold leading-[1.15] text-[var(--text-primary)]">
                {item.label}
              </h3>
              {item.subtitle && (
                <p className="mt-1 text-[11px] font-medium leading-4 text-[var(--text-muted)]">
                  {item.subtitle}
                </p>
              )}
            </div>
            <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] px-2 py-1 text-[10px] font-extrabold leading-none text-[var(--primary)]">
              Continue
            </span>
          </div>

          <div className="mt-3 space-y-1.5">
            {visibleItems.map((sessionItem) => (
              <SessionItemRow item={sessionItem} key={sessionItem.id} />
            ))}
            {hiddenCount > 0 && (
              <p className="pl-6 text-[11px] font-semibold text-[var(--text-muted)]">
                +{hiddenCount} more
              </p>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--surface-muted)]">
              <div
                className="h-full rounded-full bg-[var(--primary)]"
                style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
              />
            </div>
            <span className="shrink-0 text-[11px] font-bold text-[var(--text-secondary)]">
              {completedCount}/{totalCount} complete
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function SessionItemRow({ item }) {
  return (
    <div className="flex items-center gap-2 text-[12px] font-semibold leading-4 text-[var(--text-primary)]">
      <span
        aria-label={item.completed ? "Completed" : "Pending"}
        className={`
          flex
          h-4
          w-4
          shrink-0
          items-center
          justify-center
          rounded-full
          border
          ${
            item.completed
              ? "border-[var(--confidence)] bg-[var(--confidence)] text-white"
              : "border-[var(--divider)] bg-[var(--surface)] text-transparent"
          }
        `}
      >
        <Check size={10} strokeWidth={3} aria-hidden="true" />
      </span>
      <span className="min-w-0 truncate">{item.label}</span>
    </div>
  );
}

function isSessionPriority(item) {
  return Array.isArray(item.sessionItems) && item.sessionItems.length > 0;
}

const iconMap = {
  activity: Activity,
  camera: Camera,
  scale: Scale,
  target: Target,
};

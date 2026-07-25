import Link from "next/link";
import { ArrowRight, Calendar, Clock3, Compass, Dumbbell, Target } from "lucide-react";
import Card from "../ui/Card";
import IconBadge from "../ui/IconBadge";
import SectionTitle from "../ui/SectionTitle";
import HomeConfidenceDetail from "./HomeConfidenceDetail";

const goalIcons = { dumbbell: Dumbbell, target: Target };
const metricIcons = { calendar: Calendar, phase: Compass };

export default function HomeHeroCard({ actionHref, actionLabel, confidence, confidenceDetail, confidenceState, daysRemaining, goalIcon = "target", goalLabel, headline, mode = "active", plannedReviewDate, primaryTimeline, projectedFinish, schedulerMessage, supportLine, supportingMetrics = [] }) {
  const GoalIcon = goalIcons[goalIcon] ?? Target;

  return (
    <Card as="section" data-testid="home-hero" padding="sm" className="overflow-hidden bg-gradient-to-br from-[color-mix(in_srgb,var(--primary)_7%,var(--surface-elevated))] to-[var(--surface-elevated)]">
      <SectionTitle title="Trajectory" />
      <div className="mt-2.5 grid grid-cols-[minmax(0,1fr)_82px] items-center gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <IconBadge icon={GoalIcon} color={goalIcon === "dumbbell" ? "effort" : "primary"} size="xs" className="shrink-0 rounded-full" />
            <p className="truncate text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--primary)]">{goalLabel}</p>
          </div>
          <h1 className="mt-1.5 text-[18px] font-extrabold leading-[1.15] text-[var(--text-primary)]">{headline}</h1>
          {mode === "phase_trajectory" && <p className="mt-1.5 text-[15px] font-extrabold leading-5 text-[var(--primary)]">{primaryTimeline}</p>}
          {mode === "phase_trajectory" && plannedReviewDate && <p className="mt-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">Planned review: {formatDate(plannedReviewDate)}</p>}
          <p className="mt-1.5 text-[12px] font-medium leading-4 text-[var(--text-secondary)]">{supportLine}</p>
        </div>
        {mode === "calibration" ? (
          <div className="flex h-[82px] w-[82px] flex-col items-center justify-center rounded-full border-[6px] border-amber-200 text-center dark:border-amber-300/20">
            <span className="text-[11px] font-extrabold leading-3 text-[var(--text-primary)]">{confidenceState}</span>
            <span className="mt-1 text-[8px] font-bold leading-3 text-[var(--text-secondary)]">Confidence builds with evidence</span>
          </div>
        ) : Number.isFinite(confidence) && confidenceDetail ? (
          <HomeConfidenceDetail confidence={confidence} detail={confidenceDetail} />
        ) : (
          <div className="flex h-[82px] w-[82px] flex-col items-center justify-center rounded-full border-[6px] border-[var(--divider)] text-center">
            <span className="text-lg font-extrabold text-[var(--text-primary)]">—</span>
            <span className="text-[9px] font-bold leading-3 text-[var(--text-secondary)]">Confidence</span>
          </div>
        )}
      </div>
      {mode === "phase_trajectory" ? null : mode === "terminal" ? (
        <Link className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--primary)] px-4 text-sm font-extrabold text-white" href={actionHref}>
          <span>{actionLabel}</span>
          <ArrowRight aria-hidden size={16} />
        </Link>
      ) : mode === "calibration" ? (
        <>
          <div className="mt-3 grid grid-cols-2 items-start gap-3 pt-1">
            {supportingMetrics.map((metric) => (
              <HeroMetric
                icon={metricIcons[metric.icon] ?? Compass}
                key={metric.label}
                label={metric.label}
                value={metric.value}
              />
            ))}
          </div>
          {schedulerMessage && (
            <p className="mt-3 rounded-xl bg-[var(--surface-muted)] px-3 py-2 text-[11px] font-semibold leading-4 text-[var(--text-secondary)]">
              {schedulerMessage}
            </p>
          )}
        </>
      ) : (
        <div className="mt-3 grid grid-cols-2 items-center gap-5 pt-1">
          <HeroMetric icon={Calendar} label="Projected Finish" value={projectedFinish} />
          <HeroMetric icon={Clock3} label="Days Remaining" value={daysRemaining} />
        </div>
      )}
    </Card>
  );
}

function formatDate(value) { return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)); }

function HeroMetric({ icon, label, value }) {
  return <div className="flex min-w-0 items-center gap-2"><IconBadge icon={icon} color="evidence" size="sm" className="h-7 w-7 shrink-0"/><div className="min-w-0"><p className="text-[10px] font-medium text-[var(--text-secondary)]">{label}</p><p className="mt-0.5 truncate text-[14px] font-extrabold leading-none text-[var(--text-primary)]">{value}</p></div></div>;
}

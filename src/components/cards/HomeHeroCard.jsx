import { Calendar, Clock3, Target } from "lucide-react";
import Card from "../ui/Card";
import IconBadge from "../ui/IconBadge";
import SectionTitle from "../ui/SectionTitle";
import ConfidenceRing from "../ui/ConfidenceRing";

export default function HomeHeroCard({ confidence, daysRemaining, goalLabel, headline, projectedFinish, supportLine }) {
  return (
    <Card as="section" data-testid="home-hero" padding="sm" className="overflow-hidden bg-gradient-to-br from-[color-mix(in_srgb,var(--primary)_7%,var(--surface-elevated))] to-[var(--surface-elevated)]">
      <SectionTitle title="Trajectory" />
      <div className="mt-2.5 grid grid-cols-[minmax(0,1fr)_82px] items-center gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <IconBadge icon={Target} color="primary" size="xs" className="shrink-0 rounded-full" />
            <p className="truncate text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--primary)]">{goalLabel}</p>
          </div>
          <h1 className="mt-1.5 text-[18px] font-extrabold leading-[1.15] text-[var(--text-primary)]">{headline}</h1>
          <p className="mt-1.5 text-[12px] font-medium leading-4 text-[var(--text-secondary)]">{supportLine}</p>
        </div>
        {Number.isFinite(confidence) ? (
          <ConfidenceRing className="justify-self-end" label="Confidence" size={82} value={confidence} />
        ) : (
          <div className="flex h-[82px] w-[82px] flex-col items-center justify-center rounded-full border-[6px] border-[var(--divider)] text-center">
            <span className="text-lg font-extrabold text-[var(--text-primary)]">—</span>
            <span className="text-[9px] font-bold leading-3 text-[var(--text-secondary)]">Confidence</span>
          </div>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 items-center gap-5 pt-1">
        <HeroMetric icon={Calendar} label="Projected Finish" value={projectedFinish} />
        <HeroMetric icon={Clock3} label="Days Remaining" value={daysRemaining} />
      </div>
    </Card>
  );
}

function HeroMetric({ icon, label, value }) {
  return <div className="flex min-w-0 items-center gap-2"><IconBadge icon={icon} color="evidence" size="sm" className="h-7 w-7 shrink-0"/><div className="min-w-0"><p className="text-[10px] font-medium text-[var(--text-secondary)]">{label}</p><p className="mt-0.5 truncate text-[14px] font-extrabold leading-none text-[var(--text-primary)]">{value}</p></div></div>;
}

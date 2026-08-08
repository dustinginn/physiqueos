import Link from "next/link";
import { ArrowLeft, Scale } from "lucide-react";
import Card from "../components/ui/Card";
import IconBadge from "../components/ui/IconBadge";

export default function TrackingScreen({ morningWeighIn }) {
  return (
    <main className="app-surface min-h-screen">
      <div className="mx-auto max-w-[393px] px-4 pb-28 pt-10">
        <Link className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]" href="/profile/operating-plan">
          <ArrowLeft size={18} />
          Operating Plan
        </Link>

        <header className="mb-6 flex items-start gap-3">
          <IconBadge className="rounded-full" color="evidence" icon={Scale} size="lg" />
          <h1 className="text-3xl font-extrabold leading-tight text-[var(--text-primary)]">Tracking</h1>
        </header>

        <div className="space-y-5">
          <Card className="space-y-2" variant="accent">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--primary)]">Purpose</p>
            <p className="text-sm font-semibold leading-6 text-[var(--text-primary)]">
              Define the recurring measurements PhysiqueOS uses to understand how your plan is working.
            </p>
          </Card>

          <section className="space-y-3">
            <div className="space-y-1 px-1">
              <h2 className="text-xl font-extrabold text-[var(--text-primary)]">Current Tracking Routines</h2>
              <p className="text-sm font-medium leading-6 text-[var(--text-secondary)]">
                These measurements help PI evaluate progress against your current plan.
              </p>
            </div>
            {morningWeighIn ? <MorningWeighInCard model={morningWeighIn} /> : (
              <Card><p className="text-sm font-semibold text-[var(--text-secondary)]">Morning Weigh-In Support is not currently configured.</p></Card>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function MorningWeighInCard({ model }) {
  return (
    <Card className="space-y-4">
      <div>
        <h3 className="text-lg font-extrabold text-[var(--text-primary)]">Morning Weigh-In</h3>
        <p className="mt-1 text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-muted)]">Purpose</p>
        <p className="mt-1 text-sm font-medium leading-6 text-[var(--text-secondary)]">
          Track daily body-weight trends so PI can evaluate progress and energy strategy against the current goal.
        </p>
      </div>
      <TrackingDetail label="Current Support" value={model.supportSummary} />
      <TrackingDetail label="Completion" value="Automatically satisfied when today's valid weight is recorded." />
      <Link className="flex min-h-12 items-center justify-center rounded-2xl bg-[var(--primary)] px-4 text-sm font-extrabold text-white" href="/profile/operating-plan/tracking/morning-weigh-in">
        Edit Support
      </Link>
    </Card>
  );
}

function TrackingDetail({ label, value }) {
  return (
    <div className="rounded-[12px] bg-[var(--surface-muted)] p-3">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-sm font-extrabold leading-5 text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

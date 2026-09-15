import Link from "next/link";
import { Activity, ArrowLeft, Dumbbell, Syringe } from "lucide-react";
import Card from "../components/ui/Card";
import IconBadge from "../components/ui/IconBadge";
import {
  buildStrategyDomainModel,
  STRATEGY_DOMAIN_PRESENTATION,
} from "../domain/services/StrategyDomainReadService";

const DOMAIN_PRESENTATION = Object.freeze({
  recovery: {
    ...STRATEGY_DOMAIN_PRESENTATION.recovery,
    icon: Activity,
  },
  peptide: {
    ...STRATEGY_DOMAIN_PRESENTATION.peptide,
    icon: Syringe,
  },
  supplement: {
    ...STRATEGY_DOMAIN_PRESENTATION.supplement,
    icon: Dumbbell,
  },
});

export default function StrategyDomainScreen({
  category,
  executionItems = [],
  goals = [],
  localDate,
  protocols = [],
  versions = [],
}) {
  const model = buildStrategyDomainModel({
    category,
    executionItems,
    goals,
    localDate,
    protocols,
    versions,
  });
  const presentation = DOMAIN_PRESENTATION[category];
  const Icon = presentation.icon;

  return (
    <main className="app-surface min-h-screen">
      <div className="mx-auto max-w-[393px] px-4 pb-28 pt-10">
        <Link
          className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]"
          href="/profile/operating-plan"
        >
          <ArrowLeft size={18} />
          Operating Plan
        </Link>

        <header className="mb-6 space-y-3">
          <div className="flex items-start gap-3">
            <IconBadge className="rounded-full" color={presentation.tone} icon={Icon} size="lg" />
            <div className="min-w-0">
              <h1 className="text-3xl font-extrabold leading-tight text-[var(--text-primary)]">
                {presentation.title}
              </h1>
            </div>
          </div>
        </header>

        <div className="space-y-5">
          <Card className="space-y-2" variant="accent">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--primary)]">
              Purpose
            </p>
            <p className="text-sm font-semibold leading-6 text-[var(--text-primary)]">
              {model.purpose}
            </p>
            {model.supportingLine && (
              <p className="text-xs font-semibold text-[var(--text-secondary)]">
                {model.supportingLine}
              </p>
            )}
          </Card>

          <section className="space-y-3">
            <div className="space-y-1 px-1">
              <h2 className="text-xl font-extrabold text-[var(--text-primary)]">
                {presentation.collectionTitle}
              </h2>
              <p className="text-sm font-medium leading-6 text-[var(--text-secondary)]">
                {model.helperCopy}
              </p>
            </div>

            {model.methods.length ? (
              model.methods.map((method) => (
                <SupportMethodCard category={category} key={method.id} method={method} />
              ))
            ) : (
              <Card>
                <p className="text-sm font-semibold text-[var(--text-secondary)]">
                  No support methods are currently included in this strategy.
                </p>
              </Card>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function SupportMethodCard({ category, method }) {
  return (
    <Card className="space-y-4">
      <div>
        <h3 className="text-lg font-extrabold text-[var(--text-primary)]">{method.name}</h3>
        <p className="mt-1 text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--text-muted)]">
          {category === "peptide" ? "Strategic role" : "Purpose"}
        </p>
        <p className="mt-1 text-sm font-medium leading-6 text-[var(--text-secondary)]">
          {method.purpose}
        </p>
      </div>

      <SupportDetail label="Current support summary" value={method.supportSummary} />

      {category === "peptide" && (
        <div className="grid grid-cols-2 gap-2">
          <SupportDetail label="Current dose" value={method.currentDose} />
          <SupportDetail label="Current schedule" value={method.currentSchedule} />
        </div>
      )}

      <Link
        className="flex min-h-12 items-center justify-center rounded-2xl bg-[var(--primary)] px-4 text-sm font-extrabold text-white"
        href={method.editSupportHref}
      >
        Edit Support
      </Link>
    </Card>
  );
}

function SupportDetail({ label, value }) {
  return (
    <div className="rounded-[12px] bg-[var(--surface-muted)] p-3">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-1 text-sm font-extrabold leading-5 text-[var(--text-primary)]">
        {value}
      </p>
    </div>
  );
}

export { buildStrategyDomainModel };

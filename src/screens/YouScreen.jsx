import Link from "next/link";
import {
  CalendarDays,
  ChevronRight,
  Database,
  LockKeyhole,
  PlugZap,
  ShieldCheck,
  Syringe,
  Target,
  UserRound,
} from "lucide-react";
import Card from "../components/ui/Card";
import IconBadge from "../components/ui/IconBadge";

export default function YouScreen({ profile }) {
  return (
    <main className="app-surface min-h-screen">
      <div className="mx-auto max-w-[393px] px-4 pt-10 pb-28">
        <header className="mb-6 space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--primary)]">
            You
          </p>
          <h1 className="text-3xl font-extrabold leading-tight text-[var(--text-primary)]">
            What PhysiqueOS knows.
          </h1>
          <p className="text-sm font-medium leading-6 text-[var(--text-secondary)]">
            Your operating profile, evidence sources, protocols, and preferences in one place.
          </p>
        </header>

        <div className="space-y-4">
          <OperatingStatus status={profile.operatingStatus} />
          <DoorwaySection
            detail={`${profile.goals.supporting.length + (profile.goals.primary ? 1 : 0)} active`}
            href={`${profile.goals.href}?from=you`}
            icon={Target}
            title="Goals"
          />
          <DoorwaySection
            detail={profile.operatingPlan.summary}
            href={profile.operatingPlan.href}
            icon={CalendarDays}
            title="Operating Plan"
          />
          <DoorwaySection
            detail={`${profile.protocols.active.length} active`}
            href={profile.protocols.href}
            icon={Syringe}
            title="Protocols"
          />
          <DoorwaySection
            detail={`${profile.evidenceSources.length} sources`}
            href="/progress?from=you"
            icon={Database}
            title="Evidence Sources"
          />
          <DoorwaySection
            detail={`${profile.integrations.filter((item) => item.status === "Connected").length} connected`}
            href={null}
            icon={PlugZap}
            title="Integrations"
          />
          <DoorwaySection
            detail="Theme, notifications, units, voice"
            href={null}
            icon={ShieldCheck}
            title="Preferences"
          />
          <DoorwaySection
            detail="Height, body source, default context"
            href={null}
            icon={UserRound}
            title="About You"
          />
          <DoorwaySection
            detail="Ownership, export, permissions"
            href={null}
            icon={LockKeyhole}
            title="Privacy & Data"
          />
        </div>
      </div>
    </main>
  );
}

function OperatingStatus({ status }) {
  const facts = [
    { label: "Goals", value: `${status.goals} Active` },
    { label: "Evidence Sources", value: status.evidenceSources },
    { label: "Active Protocols", value: status.activeProtocols },
    { label: "Integrations", value: status.connectedIntegrations },
  ];

  return (
    <Card className="space-y-4" variant="accent">
      <div className="flex items-start gap-3">
        <IconBadge className="rounded-full" color="primary" icon={UserRound} size="lg" />
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--primary)]">
            Operating Status
          </p>
          <h2 className="mt-1 text-xl font-extrabold leading-tight text-[var(--text-primary)]">
            {status.title}
          </h2>
          <p className="mt-2 text-sm font-medium leading-6 text-[var(--text-secondary)]">
            {status.summary}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {facts.map((fact) => (
          <div key={fact.label} className="rounded-[12px] bg-[var(--surface-elevated)] p-3">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--text-muted)]">
              {fact.label}
            </p>
            <p className="mt-1 text-sm font-extrabold leading-tight text-[var(--text-primary)]">
              {fact.value}
            </p>
          </div>
        ))}
      </div>

    </Card>
  );
}

function DoorwaySection({ detail, href, icon, title }) {
  const Wrapper = href ? Link : "section";
  const wrapperProps = href ? { href } : {};

  return (
    <Card as={Wrapper} className="flex items-center justify-between gap-3" {...wrapperProps}>
      <div className="flex min-w-0 items-center gap-3">
        <IconBadge className="rounded-full" color="primary" icon={icon} size="sm" />
        <div className="min-w-0">
          <h2 className="text-base font-extrabold leading-tight text-[var(--text-primary)]">
            {title}
          </h2>
          <p className="mt-0.5 truncate text-xs font-semibold text-[var(--text-secondary)]">
            {detail}
          </p>
        </div>
      </div>
      <ChevronRight className="shrink-0 text-[var(--text-muted)]" size={18} />
    </Card>
  );
}

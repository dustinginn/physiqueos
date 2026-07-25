import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Dumbbell,
  FlaskConical,
  LineChart,
  Pencil,
  Syringe,
  Target,
} from "lucide-react";
import Card from "../components/ui/Card";
import IconBadge from "../components/ui/IconBadge";
import { formatGoalStartDate } from "../domain/utils/goalStartDate";

export default function ProtocolDetailScreen({ from, goals, lifecycleAction, protocol, version }) {
  if (!protocol) {
    const backHref = "/profile/operating-plan";
    return <main className="app-surface min-h-screen"><div className="mx-auto max-w-[393px] px-4 pb-28 pt-10"><Link className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]" href={backHref}><ArrowLeft size={18}/>{from === "operating-plan" ? "Operating Plan" : "Protocols"}</Link><Card className="space-y-2"><h1 className="text-2xl font-extrabold text-[var(--text-primary)]">Supplement unavailable</h1><p className="text-sm font-semibold leading-6 text-[var(--text-secondary)]">This supplement strategy could not be found. Return to your Operating Plan to review the latest supplements.</p></Card></div></main>;
  }
  if (["peptide", "recovery", "supplement"].includes(protocol.category)) {
    return <StrategyProtocolDetail from={from} goals={goals} lifecycleAction={lifecycleAction} protocol={protocol} version={version}/>;
  }
  const supportedGoals = goals.filter((goal) =>
    protocol.relatedGoalIds?.includes(goal.id)
  );
  const currentPhase = getCurrentPhase(protocol);
  const backHref = "/profile/operating-plan";
  const backLabel = "Operating Plan";

  return (
    <main className="app-surface min-h-screen">
      <div className="mx-auto max-w-[393px] px-4 pt-10 pb-28">
        <Link
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]"
          href={backHref}
        >
          <ArrowLeft size={18} />
          {backLabel}
        </Link>

        <header className="mb-6 space-y-3">
          <div className="flex items-start gap-3">
            <IconBadge
              className="rounded-full"
              color={protocol.category === "supplement" ? "success" : "effort"}
              icon={protocol.category === "supplement" ? Dumbbell : Syringe}
              size="lg"
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--primary)]">
                Protocol
              </p>
              <h1 className="mt-1 text-3xl font-extrabold leading-tight text-[var(--text-primary)]">
                {protocol.name}
              </h1>
              <p className="mt-2 text-sm font-medium leading-6 text-[var(--text-secondary)]">
                Contextual evidence that helps PhysiqueOS interpret trajectory, appetite, recovery, and goal progress.
              </p>
            </div>
          </div>
        </header>

        <div className="space-y-4">
          <ProtocolPurpose protocol={protocol} />
          <ProtocolSection icon={CalendarDays} title="Current Schedule">
            <DetailGrid
              items={[
                { label: "Frequency", value: formatSchedule(protocol) },
                { label: "Timing", value: formatTiming(protocol) },
                { label: "Dose", value: formatDose(protocol.dose, protocol.doseUnit) },
                { label: "Status", value: formatLabel(protocol.status) },
              ]}
            />
          </ProtocolSection>
          <CurrentPhase currentPhase={currentPhase} protocol={protocol} />
          <ProtocolSection icon={Target} title="Goals Supported">
            <div className="space-y-2">
              {supportedGoals.length > 0 ? (
                supportedGoals.map((goal) => (
                  <Link
                    className="flex items-center justify-between gap-3 rounded-[12px] bg-[var(--surface-muted)] p-3"
                    href={getGoalHref(goal.id)}
                    key={goal.id}
                  >
                    <div>
                      <p className="text-sm font-extrabold text-[var(--text-primary)]">
                        {normalizeGoalTitle(goal.title)}
                      </p>
                      <p className="mt-0.5 text-xs font-semibold text-[var(--text-secondary)]">
                        {goal.primary ? "Primary goal" : "Supporting goal"}
                      </p>
                    </div>
                    <ChevronRight className="shrink-0 text-[var(--text-muted)]" size={16} />
                  </Link>
                ))
              ) : (
                <p className="text-sm font-semibold leading-6 text-[var(--text-secondary)]">
                  No related goals are attached yet.
                </p>
              )}
            </div>
          </ProtocolSection>
          <ProtocolSection icon={ClipboardList} title="Evidence Role">
            <EvidenceInfluenced protocol={protocol} />
          </ProtocolSection>
          <ProtocolSection icon={FlaskConical} title="Research Summary">
            <ResearchSummary protocol={protocol} />
          </ProtocolSection>
          <EditEntry />
        </div>
      </div>
    </main>
  );
}

function StrategyProtocolDetail({ from, goals, lifecycleAction, protocol, version }) {
  const isRecovery = protocol.category === "recovery";
  const isPeptide = protocol.category === "peptide";
  const Icon = isRecovery ? Activity : isPeptide ? Syringe : Dumbbell;
  const activeGoal = goals.find((goal) =>
    goal.primary === true &&
    goal.status === "active" &&
    protocol.relatedGoalIds?.includes(goal.id)
  );
  const started = isPeptide ? formatGoalStartDate(protocol.startDate) : formatGoalStartDate(activeGoal?.timeline?.startDate);
  const backHref = "/profile/operating-plan";
  const backLabel = "Operating Plan";
  const strategy = version?.supplementStrategy;
  const purpose = strategy?.purpose ? { title: strategy.purpose, detail: strategy.role } : getProtocolPurpose(protocol);
  return <main className="app-surface min-h-screen"><div className="mx-auto max-w-[393px] px-4 pb-28 pt-10">
    <Link className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]" href={backHref}><ArrowLeft size={18}/>{backLabel}</Link>
    <header className="mb-6"><div className="flex items-start gap-3"><IconBadge className="rounded-full" color={isPeptide?"effort":"success"} icon={Icon} size="lg"/><div><p className="text-sm font-semibold uppercase tracking-[.12em] text-[var(--primary)]">{isRecovery ? "Recovery Strategy" : isPeptide ? "Peptide Strategy" : "Supplement Strategy"}</p><h1 className="mt-1 text-3xl font-extrabold text-[var(--text-primary)]">{protocol.name}</h1></div></div></header>
    <div className="space-y-4">
      <Card className="space-y-2" variant="accent"><p className="text-[10px] font-extrabold uppercase tracking-[.1em] text-[var(--primary)]">Purpose</p><h2 className="text-xl font-extrabold text-[var(--text-primary)]">{purpose.title}</h2><p className="text-sm leading-6 text-[var(--text-secondary)]">{purpose.detail}</p></Card>
      <Card className="space-y-2"><h2 className="font-extrabold text-[var(--text-primary)]">Current Strategy</h2><p className="text-sm font-semibold text-[var(--text-secondary)]">{strategy?.role ?? (isRecovery ? "Active recovery support" : isPeptide ? "Active peptide strategy supporting the current Goal." : protocol.notes || "Active supplement support")}</p></Card>
      <Card className="space-y-2"><h2 className="font-extrabold text-[var(--text-primary)]">Goal Supported</h2><p className="text-sm font-semibold text-[var(--text-secondary)]">{activeGoal?.title ?? "No current Goal is attached."}</p></Card>
      {started&&<Card className="space-y-2"><h2 className="font-extrabold text-[var(--text-primary)]">Started</h2><p className="text-sm font-semibold text-[var(--text-secondary)]">{started}</p></Card>}
      <Card className="space-y-2"><h2 className="font-extrabold text-[var(--text-primary)]">Status</h2><p className="text-sm font-semibold text-[var(--text-secondary)]">{formatLabel(protocol.status)}</p></Card>
      {!isRecovery&&!isPeptide&&protocol.status==="active"&&<Link className="flex min-h-12 items-center justify-center rounded-2xl bg-[var(--primary)] px-4 text-sm font-extrabold text-white" href={`/profile/operating-plan/supplements/${encodeURIComponent(protocol.id)}/edit`}>Edit Strategy</Link>}
      {isPeptide&&<span aria-disabled="true" className="flex min-h-12 items-center justify-center rounded-2xl border border-[var(--divider)] bg-[var(--surface-muted)] px-4 text-sm font-extrabold text-[var(--text-muted)]">Edit Strategy</span>}
      {!isRecovery&&!isPeptide&&lifecycleAction&&<form action={lifecycleAction}><button className="min-h-12 w-full rounded-2xl border border-[var(--divider)] bg-[var(--surface-elevated)] px-4 text-sm font-extrabold text-[var(--text-primary)]" type="submit">{protocol.status==="paused"?"Restore Supplement":"Pause Supplement"}</button></form>}
    </div>
  </div></main>;
}

function ProtocolPurpose({ protocol }) {
  const purpose = getProtocolPurpose(protocol);

  return (
    <Card className="space-y-4" variant="accent">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[var(--primary)]">
            Purpose
          </p>
          <h2 className="mt-1 text-xl font-extrabold leading-tight text-[var(--text-primary)]">
            {purpose.title}
          </h2>
          <p className="mt-2 text-sm font-medium leading-6 text-[var(--text-secondary)]">
            {purpose.detail}
          </p>
        </div>
        <span className="rounded-full bg-[var(--surface-elevated)] px-3 py-1 text-xs font-extrabold uppercase tracking-[0.06em] text-[var(--text-muted)]">
          {formatLabel(protocol.category)}
        </span>
      </div>
    </Card>
  );
}

function CurrentPhase({ currentPhase, protocol }) {
  return (
    <ProtocolSection icon={LineChart} title="Current Phase">
      <DetailGrid
        items={[
          { label: "Phase", value: currentPhase?.title ?? "Active" },
          { label: "Started", value: formatDate(protocol.startDate) },
          { label: "Current Dose", value: formatDose(protocol.dose, protocol.doseUnit) },
          { label: "Window", value: currentPhase?.window ?? "Ongoing" },
        ]}
      />
      <p className="text-sm font-medium leading-6 text-[var(--text-secondary)]">
        {currentPhase?.detail ?? "No phase history has been recorded yet."}
      </p>
    </ProtocolSection>
  );
}

function EvidenceInfluenced({ protocol }) {
  const items = getEvidenceInfluenced(protocol);

  return (
    <div className="space-y-3">
      <div className="grid gap-2">
        {items.map((item) => (
          <div key={item.label} className="rounded-[12px] bg-[var(--surface-muted)] p-3">
            <p className="text-sm font-extrabold text-[var(--text-primary)]">
              {item.label}
            </p>
            <p className="mt-1 text-xs font-semibold leading-5 text-[var(--text-secondary)]">
              {item.detail}
            </p>
          </div>
        ))}
      </div>
      <p className="text-sm font-medium leading-6 text-[var(--text-secondary)]">
        Protocols provide educational and interpretation context. They do not overwrite measured evidence or directly change body-composition calculations.
      </p>
    </div>
  );
}

function ResearchSummary({ protocol }) {
  const summary = getResearchSummary(protocol);

  return (
    <div className="space-y-2">
      {summary.map((item) => (
        <div key={item.label} className="rounded-[12px] bg-[var(--surface-muted)] p-3">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            {item.label}
          </p>
          <p className="mt-1 text-sm font-semibold leading-6 text-[var(--text-secondary)]">
            {item.detail}
          </p>
        </div>
      ))}
      <p className="text-xs font-semibold leading-5 text-[var(--text-muted)]">
        Educational context only. Not medical advice.
      </p>
    </div>
  );
}

function ProtocolSection({ children, icon, title }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-3">
        <IconBadge className="rounded-full" color="primary" icon={icon} size="sm" />
        <h2 className="text-base font-extrabold text-[var(--text-primary)]">
          {title}
        </h2>
      </div>
      {children}
    </Card>
  );
}

function DetailGrid({ items }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-[12px] bg-[var(--surface-muted)] p-3">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            {item.label}
          </p>
          <p className="mt-1 text-sm font-extrabold leading-tight text-[var(--text-primary)]">
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function EditEntry() {
  return (
    <Card className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <IconBadge className="rounded-full" color="primary" icon={Pencil} size="sm" />
        <div>
          <p className="text-sm font-extrabold">Edit Protocol</p>
          <p className="mt-0.5 text-xs font-semibold text-[var(--text-secondary)]">
            Future editing will support onboarding, voice, and manual updates.
          </p>
        </div>
      </div>
    </Card>
  );
}

function getCurrentPhase(protocol) {
  const activePhase = protocol.doseHistory?.find((entry) => entry.status === "active");

  if (!activePhase) return null;

  return {
    title: `Week ${activePhase.week}`,
    window: `${formatDate(activePhase.startDate)} - ${formatDate(activePhase.endDate)}`,
    detail: `${activePhase.dose} ${activePhase.doseUnit} from ${formatDate(activePhase.startDate)} to ${formatDate(activePhase.endDate)}.`,
  };
}

function getProtocolPurpose(protocol) {
  if (protocol.name === "Retatrutide") {
    return {
      title: "Support fat-loss execution.",
      detail:
        "Retatrutide is tracked as context for appetite, nutrition adherence, weight trend, and body-fat trajectory during the cut.",
    };
  }

  if (protocol.name === "Tesamorelin") {
    return {
      title: "Support lean-mass preservation context.",
      detail:
        "Tesamorelin is tracked as context for recovery, lean-mass confidence, DEXA interpretation, and visual evidence.",
    };
  }

  if (protocol.category === "supplement") {
    return {
      title: "Support the operating plan.",
      detail:
        "This supplement is tracked as contextual evidence for adherence, recovery, training, or nutrition interpretation.",
    };
  }

  return {
    title: "Provide interpretation context.",
    detail:
      "This protocol helps PhysiqueOS understand what the user is doing while observed evidence remains the source of truth.",
  };
}

function getEvidenceInfluenced(protocol) {
  if (protocol.name === "Retatrutide") {
    return [
      { label: "Nutrition Adherence", detail: "May affect appetite and ability to stay inside the current calorie range." },
      { label: "Weight Trend", detail: "Provides context for the pace and consistency of scale movement." },
      { label: "Body Fat", detail: "Helps interpret DEXA and visual changes without replacing measured evidence." },
    ];
  }

  if (protocol.name === "Tesamorelin") {
    return [
      { label: "Lean Mass", detail: "Provides context for lean-mass preservation while DEXA remains authoritative." },
      { label: "DEXA", detail: "May be relevant when interpreting future lean-tissue and VAT changes." },
      { label: "Progress Photos", detail: "Can support visual context but should not replace scan evidence." },
    ];
  }

  if (protocol.category === "supplement") {
    return [
      { label: "Training", detail: "May provide context for strength, effort, or workout quality." },
      { label: "Recovery", detail: "May provide context for fatigue, sleep, or readiness notes." },
    ];
  }

  return [
    { label: "Context", detail: "May influence interpretation depending on future evidence." },
  ];
}

function getResearchSummary(protocol) {
  if (protocol.name === "Retatrutide") {
    return [
      { label: "Mechanism", detail: "Tracked as a peptide protocol with appetite and body-composition context." },
      { label: "Expected Effects", detail: "Relevant to nutrition adherence, weight trend, and body-fat interpretation." },
      { label: "Evidence Quality", detail: "Founder-reported protocol data is high confidence; outcome effects still require observed evidence." },
      { label: "Considerations", detail: "Recommendations should remain conservative and evidence-backed." },
    ];
  }

  if (protocol.name === "Tesamorelin") {
    return [
      { label: "Mechanism", detail: "Tracked as a peptide protocol with lean-mass, recovery, and DEXA context." },
      { label: "Expected Effects", detail: "Relevant to lean-mass preservation interpretation during the cut." },
      { label: "Evidence Quality", detail: "Protocol schedule is high confidence; lean-mass conclusions require DEXA confirmation." },
      { label: "Considerations", detail: "Photos may support confidence but should not replace scan evidence." },
    ];
  }

  return [
    { label: "Mechanism", detail: "Research summary pending." },
    { label: "Expected Effects", detail: "Future onboarding can add concise educational context." },
    { label: "Evidence Quality", detail: "Tracked as contextual evidence only." },
    { label: "Considerations", detail: "Do not overstate effects without supporting evidence." },
  ];
}

function formatSchedule(protocol) {
  const schedule = protocol.schedule ?? {};

  if (schedule.frequency === "weekly_days" && schedule.daysOfWeek?.length) {
    return schedule.daysOfWeek.map(formatLabel).join(", ");
  }

  if (schedule.dayOfWeek) return formatLabel(schedule.dayOfWeek);

  return formatLabel(schedule.frequency ?? protocol.frequency?.unit ?? "Pending");
}

function formatTiming(protocol) {
  const timing = protocol.schedule?.timeOfDay
    ? formatLabel(protocol.schedule.timeOfDay)
    : "Timing pending";
  const context = protocol.schedule?.timingContext
    ? formatLabel(protocol.schedule.timingContext)
    : null;

  return context ? `${timing} / ${context}` : timing;
}

function formatDose(dose, fallbackUnit) {
  if (!dose?.value) return "Pending";

  return `${dose.value} ${dose.unit ?? fallbackUnit ?? ""}`.trim();
}

function formatDate(value) {
  if (!value) return "Pending";

  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  const date =
    year && month && day ? new Date(year, month - 1, day) : new Date(value);

  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function getGoalHref(goalId) {
  if (goalId === "goal_visible_abs_at_rest") return "/goals/visible-abs";
  if (goalId === "goal_maintain_8_9_body_fat") return "/goals/maintenance";
  if (goalId === "goal_preserve_lean_mass") return "/goals/lean-mass";

  return "/goals";
}

function normalizeGoalTitle(title) {
  if (!title) return "Pending";

  return String(title)
    .replace("Visible abs at rest", "Visible Abs at Rest")
    .replace("Maintain 8-9% body fat", "Maintain 8-9%")
    .replace("Preserve lean mass", "Preserve Lean Mass");
}

function formatLabel(value) {
  return String(value ?? "")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

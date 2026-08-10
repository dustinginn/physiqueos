import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Camera,
  CheckCircle2,
  Dumbbell,
  Gauge,
  Scale,
  ScanLine,
  Sparkles,
  Target,
  Trophy,
  Zap,
} from "lucide-react";
import BriefingConfidenceAnchor from "../components/briefings/BriefingConfidenceAnchor";
import MonthlyEnergyEvolution from "../components/monthly/MonthlyEnergyEvolution";
import IconBadge from "../components/ui/IconBadge";

const sectionIcons = {
  baseline: ScanLine,
  completion: Trophy,
  energy: Zap,
  photos: Camera,
  training: Dumbbell,
  weight: Scale,
};

export default function MonthlyBriefingScreen({ presentation, reconciliation = null }) {
  return (
    <main className="app-surface min-h-screen overflow-x-hidden">
      <div className="mx-auto max-w-[393px] px-4 pb-32 pt-8">
        {presentation.preview && <PreviewChrome preview={presentation.preview} />}
        <Link
          className="mb-6 mt-5 inline-flex items-center gap-2 text-sm font-bold text-[var(--text-secondary)]"
          href="/briefings/review"
        >
          <ArrowLeft size={18} />Briefing History
        </Link>
        <Hero hero={presentation.hero} />
        {reconciliation?.visible && reconciliation.state !== "current" && (
          <aside className="mb-3 rounded-2xl border border-[var(--divider)] bg-[var(--surface-accent)] p-4">
            <p className="text-sm font-extrabold text-[var(--text-primary)]">
              {reconciliation.state === "updating"
                ? "Updating with recently confirmed evidenceâ€¦"
                : "This briefing update needs another try"}
            </p>
            <p className="mt-1 text-xs font-semibold leading-5 text-[var(--text-secondary)]">
              {reconciliation.message}
            </p>
          </aside>
        )}
        {presentation.milestone && <GoalMilestone milestone={presentation.milestone} />}
        {presentation.training && <TrainingProgress training={presentation.training} />}
        {presentation.energy && <MonthlyEnergyEvolution model={presentation.energy} />}
        <div className="space-y-3">
          {presentation.newBaseline && <NewBaseline model={presentation.newBaseline} />}
          {presentation.changes && <WhatChanged model={presentation.changes} />}
          {presentation.moments && <DefiningMoments model={presentation.moments} />}
          {presentation.monthAhead && <MonthAhead model={presentation.monthAhead} />}
        </div>
      </div>
    </main>
  );
}

function PreviewChrome({ preview }) {
  return (
    <aside className="rounded-2xl border border-dashed border-violet-300 bg-violet-50/80 p-3 dark:border-violet-300/25 dark:bg-violet-300/[.07]">
      <p className="text-[10px] font-black uppercase tracking-[.12em] text-violet-700 dark:text-violet-300">Preview only</p>
      {preview.disclosure && (
        <p className="mt-1 text-xs font-bold leading-5 text-slate-700 dark:text-slate-200">
          {preview.disclosure}
        </p>
      )}
      <Link className="mt-2 inline-flex items-center gap-1 text-[10px] font-extrabold text-violet-700 underline dark:text-violet-300" href={preview.inspectorHref}>
        Editorial Decision Inspector <ArrowUpRight size={12} />
      </Link>
    </aside>
  );
}

function Hero({ hero }) {
  return (
    <section
      className="mb-3 space-y-4 rounded-[28px] border border-violet-200 bg-gradient-to-br from-white via-violet-50/35 to-sky-50/60 p-5 shadow-[0_28px_72px_-32px_rgba(79,70,229,.62)] dark:border-violet-200/25 dark:from-slate-800 dark:via-slate-800 dark:to-indigo-950/80"
      data-testid="monthly-hero"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <IconBadge color="primary" icon={BookOpen} size="md" />
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-indigo-600 dark:text-indigo-300">{hero.eyebrow}</p>
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-300">{hero.period}</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-white/75 px-2.5 py-1 text-[9px] font-black uppercase tracking-[.08em] text-violet-700 dark:border-violet-300/20 dark:bg-white/10 dark:text-violet-200">
          <Target size={12} />{hero.goal}
        </span>
      </div>
      <BriefingConfidenceAnchor confidence={hero.confidence} testId="monthly-confidence" />
      <h1 className="text-[30px] font-extrabold leading-[1.12] text-slate-950 dark:text-white">{hero.title}</h1>
      <p className="text-[15px] font-semibold leading-7 text-slate-700 dark:text-slate-100">{hero.thesis}</p>
      <div className="grid grid-cols-2 gap-2">
        {hero.highlights.map((item) => <Highlight item={item} key={item.label} />)}
      </div>
    </section>
  );
}

function GoalMilestone({ milestone }) {
  return (
    <section
      className="relative mb-3 overflow-hidden rounded-[20px] border border-emerald-300 bg-gradient-to-br from-emerald-50 via-white to-amber-50 p-4 shadow-[0_20px_44px_-30px_rgba(16,185,129,.8)] dark:border-emerald-300/30 dark:from-emerald-950/65 dark:via-slate-900 dark:to-amber-950/35"
      data-testid="monthly-goal-milestone"
    >
      <Sparkles className="absolute right-4 top-4 text-amber-400/70" size={28} />
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/20">
          <Trophy size={22} />
        </span>
        <div className="min-w-0 flex-1 pr-8">
          <Eyebrow className="text-emerald-700 dark:text-emerald-300">{milestone.eyebrow}</Eyebrow>
          <h2 className="mt-1 text-lg font-extrabold text-slate-950 dark:text-white">{milestone.label} · {milestone.goalName}</h2>
          <div className="mt-2 flex flex-wrap gap-2 text-xs font-extrabold">
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-800 dark:bg-emerald-300/15 dark:text-emerald-200">{milestone.result}</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700 dark:bg-white/10 dark:text-slate-200">{formatDate(milestone.date)}</span>
          </div>
          <Link className="mt-3 inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-700 underline dark:text-emerald-300" href={milestone.href}>
            View Goal Completion <ArrowUpRight size={12} />
          </Link>
        </div>
      </div>
    </section>
  );
}

function TrainingProgress({ training }) {
  return (
    <section
      className="mb-3 overflow-hidden rounded-[22px] border border-amber-300/80 bg-gradient-to-br from-amber-50 via-white to-orange-50/60 shadow-[0_22px_54px_-36px_rgba(245,158,11,.9)] dark:border-amber-300/25 dark:from-amber-950/35 dark:via-slate-900 dark:to-orange-950/20"
      data-testid="monthly-training-progress"
    >
      <div className="border-b border-amber-200/80 p-4 dark:border-amber-300/15">
        <SectionLead icon={Dumbbell} label={training.eyebrow} tone="amber" />
        <h2 className="mt-3 text-[23px] font-extrabold leading-7 text-slate-950 dark:text-white">{training.title}</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-700 dark:text-slate-100">{training.summary}</p>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-2 gap-2">
          {training.stats.map((stat, index) => (
            <section className={`rounded-2xl border border-amber-200 bg-white/80 p-3.5 dark:border-amber-300/15 dark:bg-white/[.07] ${index === 0 ? "col-span-2" : ""}`} key={stat.label}>
              <p className="text-[9px] font-black uppercase tracking-[.08em] text-amber-700 dark:text-amber-300">{stat.label}</p>
              <p className="mt-1.5 text-base font-black leading-5 text-slate-950 dark:text-white">{stat.value}</p>
              <p className="mt-1 text-[10px] font-semibold leading-4 text-slate-600 dark:text-slate-300">{stat.detail}</p>
            </section>
          ))}
        </div>
        <div className="mt-3 rounded-2xl border-l-4 border-amber-500 bg-amber-100/70 p-4 dark:bg-amber-300/[.09]">
          <p className="text-[10px] font-black uppercase tracking-[.1em] text-amber-800 dark:text-amber-300">{training.callout}</p>
          <p className="mt-2 text-sm font-extrabold leading-6 text-slate-900 dark:text-white">{training.interpretation}</p>
        </div>
        <p className="mt-3 flex gap-2 text-xs font-bold leading-5 text-slate-700 dark:text-slate-200">
          <ArrowUpRight className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-300" size={15} />{training.next}
        </p>
      </div>
    </section>
  );
}

function NewBaseline({ model }) {
  return (
    <EditorialSection
      className="border-sky-300/70 bg-gradient-to-br from-sky-50 via-white to-blue-50/50 dark:border-sky-300/20 dark:from-sky-950/35 dark:via-slate-900 dark:to-blue-950/20"
      icon={ScanLine}
      label={model.eyebrow}
      tone="sky"
    >
      <h2 className="mt-3 text-xl font-extrabold leading-7 text-slate-950 dark:text-white">{model.title}</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-700 dark:text-slate-100">{model.summary}</p>
      <div className="mt-4 grid grid-cols-2 gap-2">{model.facts.map((fact) => <Fact fact={fact} key={fact.label} />)}</div>
      <div className="mt-3 flex gap-3 rounded-2xl bg-sky-100/80 p-4 dark:bg-sky-300/[.09]">
        <Gauge className="mt-0.5 shrink-0 text-sky-700 dark:text-sky-300" size={18} />
        <p className="text-xs font-extrabold leading-5 text-slate-800 dark:text-slate-100">{model.callout}</p>
      </div>
    </EditorialSection>
  );
}

function WhatChanged({ model }) {
  return (
    <EditorialSection icon={Sparkles} label={model.eyebrow} tone="violet">
      <h2 className="mt-3 text-xl font-extrabold text-slate-950 dark:text-white">{model.title}</h2>
      <div className="mt-3 space-y-2">{model.themes.map((theme) => <Theme key={theme.title} theme={theme} />)}</div>
    </EditorialSection>
  );
}

function DefiningMoments({ model }) {
  return (
    <EditorialSection
      className="border-violet-300/60 bg-gradient-to-br from-white to-violet-50/70 dark:border-violet-300/20 dark:from-slate-900 dark:to-violet-950/25"
      icon={CalendarDays}
      label={model.eyebrow}
      tone="violet"
    >
      <h2 className="mt-3 text-xl font-extrabold text-slate-950 dark:text-white">{model.title}</h2>
      <Timeline moments={model.moments} />
    </EditorialSection>
  );
}

function MonthAhead({ model }) {
  return (
    <EditorialSection
      className="relative overflow-hidden border-violet-400/60 bg-gradient-to-br from-violet-100 via-white to-fuchsia-50 shadow-[0_26px_64px_-40px_rgba(124,58,237,.9)] dark:border-violet-300/30 dark:from-violet-950/55 dark:via-slate-900 dark:to-fuchsia-950/25"
      icon={Target}
      label={model.eyebrow}
      tone="violet"
    >
      <Sparkles className="absolute right-5 top-5 text-violet-400/40" size={36} />
      <h2 className="mt-3 max-w-[300px] text-[24px] font-extrabold leading-8 text-slate-950 dark:text-white">{model.title}</h2>
      <p className="mt-2 text-sm font-extrabold leading-6 text-slate-800 dark:text-slate-100">{model.thesis}</p>
      <div className="mt-4 grid grid-cols-2 gap-2">{model.guidance.map((item) => <Guidance item={item} key={item.label} />)}</div>
    </EditorialSection>
  );
}

function Timeline({ moments }) {
  return (
    <div className="relative mt-5 space-y-5 before:absolute before:bottom-2 before:left-[17px] before:top-3 before:w-px before:bg-violet-300/70">
      {moments.map((moment) => {
        const Icon = sectionIcons[moment.tone] ?? Sparkles;
        return (
          <section className="relative grid grid-cols-[36px_1fr] gap-3" key={`${moment.date}-${moment.label}`}>
            <span className="z-10 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-violet-600 text-white shadow-md dark:border-slate-900">
              <Icon size={16} />
            </span>
            <div className="pt-0.5">
              <p className="text-[10px] font-black uppercase tracking-[.08em] text-violet-700 dark:text-violet-300">{formatDate(moment.date)}</p>
              <h3 className="mt-1 text-sm font-extrabold text-slate-950 dark:text-white">{moment.label}</h3>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-700 dark:text-slate-200">{moment.body}</p>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function EditorialSection({ icon, label, tone, children, className = "" }) {
  return (
    <section className={`rounded-[20px] border border-[var(--divider)] bg-[var(--surface-elevated)] p-4 text-[var(--text-primary)] shadow-[var(--shadow-card)] ${className}`}>
      <SectionLead icon={icon} label={label} tone={tone} />
      {children}
    </section>
  );
}

function SectionLead({ icon: Icon, label, tone }) {
  const colors = {
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-300/15 dark:text-amber-300",
    sky: "bg-sky-100 text-sky-700 dark:bg-sky-300/15 dark:text-sky-300",
    violet: "bg-violet-100 text-violet-700 dark:bg-violet-300/15 dark:text-violet-300",
  };
  return (
    <div className="flex items-center gap-2.5">
      <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${colors[tone] ?? colors.violet}`}><Icon size={16} /></span>
      <Eyebrow>{label}</Eyebrow>
    </div>
  );
}

function Highlight({ item }) {
  const Icon = sectionIcons[item.icon] ?? CheckCircle2;
  const tone = {
    transformation: "border-amber-200 bg-amber-50/90 dark:border-amber-300/20 dark:bg-amber-300/[.08]",
    confirmation: "border-sky-200 bg-sky-50/90 dark:border-sky-300/20 dark:bg-sky-300/[.08]",
    finish: "border-emerald-200 bg-emerald-50/90 dark:border-emerald-300/20 dark:bg-emerald-300/[.08]",
  }[item.tone] ?? "border-violet-100 bg-violet-50";
  return (
    <section className={`flex min-h-28 flex-col rounded-2xl border p-3 ${tone}`}>
      <div className="flex items-center gap-2 text-violet-700 dark:text-violet-200"><Icon size={14} /><p className="text-[9px] font-extrabold uppercase tracking-[.08em]">{item.label}</p></div>
      <p className="mt-3 text-sm font-black leading-5 text-slate-950 dark:text-white">{item.value}</p>
      <p className="mt-auto pt-2 text-[10px] font-bold leading-4 text-slate-600 dark:text-slate-200">{item.detail}</p>
    </section>
  );
}

function Guidance({ item }) {
  const Icon = sectionIcons[item.tone] ?? Target;
  return (
    <section className="rounded-2xl border border-violet-200/70 bg-white/80 p-3 shadow-sm dark:border-violet-300/15 dark:bg-white/[.07]">
      <div className="flex items-center gap-2 text-violet-700 dark:text-violet-300"><Icon size={14} /><p className="text-[9px] font-extrabold uppercase tracking-[.08em]">{item.label}</p></div>
      <p className="mt-2 text-xs font-black leading-5 text-slate-950 dark:text-white">{item.value}</p>
      <p className="mt-1 text-[10px] font-semibold leading-4 text-slate-700 dark:text-slate-200">{item.detail}</p>
    </section>
  );
}

function Fact({ fact }) {
  return (
    <section className="rounded-2xl border border-sky-200/70 bg-white/80 p-3 dark:border-sky-300/15 dark:bg-white/[.07]">
      <p className="text-[9px] font-extrabold uppercase tracking-[.08em] text-sky-700 dark:text-sky-300">{fact.label}</p>
      <p className="mt-1 text-sm font-extrabold leading-5 text-slate-950 dark:text-white">{fact.value}</p>
    </section>
  );
}

function Theme({ theme }) {
  const Icon = sectionIcons[theme.tone] ?? Sparkles;
  const colors = {
    energy: "border-l-sky-500 bg-sky-50/80 dark:bg-sky-300/[.07]",
    training: "border-l-amber-500 bg-amber-50/80 dark:bg-amber-300/[.07]",
    weight: "border-l-violet-500 bg-violet-50/80 dark:bg-violet-300/[.07]",
  };
  return (
    <section className={`rounded-r-2xl border-l-4 p-4 ${colors[theme.tone]}`}>
      <div className="flex items-center gap-2 text-violet-700 dark:text-violet-300"><Icon size={15} /><p className="text-[9px] font-black uppercase tracking-[.08em]">{theme.label}</p></div>
      <h3 className="mt-2 text-sm font-extrabold text-slate-950 dark:text-white">{theme.title}</h3>
      <p className="mt-1 text-xs font-semibold leading-5 text-slate-700 dark:text-slate-200">{theme.body}</p>
    </section>
  );
}

function Eyebrow({ children, className = "" }) {
  return <p className={`text-[10px] font-extrabold uppercase tracking-[.1em] text-[var(--primary)] ${className}`}>{children}</p>;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${String(value).slice(0, 10)}T12:00:00Z`));
}

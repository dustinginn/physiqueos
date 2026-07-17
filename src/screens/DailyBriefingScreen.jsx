"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Brain,
  ChartNoAxesCombined,
  CheckCircle2,
  Dna,
  Scale,
  Sparkles,
} from "lucide-react";
import ActionButton from "../components/ui/ActionButton";
import ProgressLineChart from "../components/progress/ProgressLineChart";
import Card from "../components/ui/Card";
import ConfidenceRing from "../components/ui/ConfidenceRing";
import IconBadge from "../components/ui/IconBadge";

export default function DailyBriefingScreen({
  backHref = "/",
  backLabel = "Home",
  briefing,
  eyebrow = null,
}) {
  return (
    <main className="app-surface min-h-screen">
      <div className="mx-auto max-w-[393px] px-4 pt-10 pb-10">
        <Link
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-500"
          href={backHref}
        >
          <ArrowLeft size={18} />
          {backLabel}
        </Link>

        <section className="mb-5 space-y-3">
          <div className="flex items-center gap-3">
            <IconBadge icon={Sparkles} color="warning" size="md" />
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-indigo-600">
              {eyebrow ?? (briefing.artifactType === "event" ? "Event Briefing" : "Daily Briefing")}
            </p>
          </div>
          {briefing.evidenceWindow?.date && (
            <p className="text-xs font-semibold text-slate-500">
              Evidence through {formatBriefingDate(briefing.evidenceWindow.date)}
            </p>
          )}
        </section>

        <div className="space-y-4">
          <HeroConfidenceSection
            hero={briefing.hero}
            reasons={briefing.confidenceReasons ?? []}
          />
          <CurrentSnapshotSection items={briefing.currentSnapshot ?? []} />
          <ProgressStorySection
            dexaProgress={briefing.dexaProgress}
            weightProgress={briefing.weightProgress}
          />
          <InterpretationSection items={briefing.interpretation ?? []} />
          <CoachInsightSection view={briefing.coachInsightView} fallback={briefing.coachInsight} />

          <ActionButton href={backHref}>Back to {backLabel}</ActionButton>
        </div>
      </div>
    </main>
  );
}

function CurrentSnapshotSection({ items }) {
  if (items.length === 0) return null;

  return (
    <Card className="space-y-3">
      <SectionHeading icon={Scale} title="Current Snapshot" />
      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-[14px] bg-[var(--surface-muted)] p-3"
          >
            <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
              {item.label}
            </p>
            <p className="mt-1 text-base font-extrabold leading-tight text-slate-950">
              {item.value}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ProgressStorySection({ dexaProgress, weightProgress }) {
  const hasWeight = weightProgress?.points?.length > 0;
  const hasDexa = dexaProgress?.rows?.length > 0;

  if (!hasWeight && !hasDexa) return null;

  return (
    <Card className="space-y-4">
      <SectionHeading icon={ChartNoAxesCombined} title="Progress" />
      {hasWeight && <WeightProgressBlock progress={weightProgress} />}
      {hasDexa && <DexaProgressBlock progress={dexaProgress} />}
    </Card>
  );
}

function WeightProgressBlock({ progress }) {
  return (
    <div className="rounded-[14px] border border-[var(--divider)] bg-[var(--surface-muted)] p-3">
      <div className="flex items-center gap-2">
        <IconBadge icon={Scale} color="success" size="xs" className="rounded-full" />
        <h3 className="text-base font-extrabold leading-tight text-slate-950">
          Weight Trend
        </h3>
      </div>
      <p className="mt-2 text-sm font-medium leading-5 text-slate-600">
        {progress.summary}
      </p>
      <div className="mt-3">
        <ProgressLineChart
          ariaLabel="Weight trend"
          metricLabel="Weight"
          points={progress.points}
          suffix={` ${progress.points.at(-1)?.unit ?? "lb"}`}
        />
      </div>
      {progress.weeklyMomentum?.length > 0 && (
        <details className="mt-3 rounded-[12px] bg-[var(--surface-elevated)] p-3">
          <summary className="cursor-pointer text-xs font-extrabold uppercase tracking-[0.08em] text-slate-500">
            Weekly averages
          </summary>
          <div className="mt-3 space-y-2">
            {progress.weeklyMomentum.map((row) => (
              <div
                key={`${row.label}-${row.period}`}
                className="grid grid-cols-[1fr_0.8fr_0.8fr] gap-2 text-xs"
              >
                <div>
                  <p className="font-extrabold text-slate-900">{row.label}</p>
                  <p className="text-[10px] font-semibold text-slate-400">{row.period}</p>
                </div>
                <p className="text-right font-bold text-slate-700">
                  {row.average.toFixed(1)} {row.unit}
                </p>
                <p className={`text-right font-extrabold ${row.change < 0 ? "text-[#15803D]" : "text-slate-500"}`}>
                  {row.change === null ? "Base" : `${row.change > 0 ? "+" : ""}${row.change.toFixed(1)} ${row.unit}`}
                </p>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function DexaProgressBlock({ progress }) {
  return (
    <div className="rounded-[14px] border border-[var(--divider)] bg-[var(--surface-muted)] p-3">
      <div className="flex items-center gap-2">
        <IconBadge icon={Dna} color="evidence" size="xs" className="rounded-full" />
        <h3 className="text-base font-extrabold leading-tight text-slate-950">
          DEXA Progress
        </h3>
      </div>
      <div className="mt-3 overflow-hidden rounded-[12px] bg-[var(--surface-elevated)]">
        <div className="grid grid-cols-[0.9fr_0.8fr_0.8fr_0.8fr_0.8fr] gap-1 border-b border-[var(--divider)] px-2 py-2 text-[9px] font-extrabold uppercase tracking-[0.05em] text-slate-400">
          <span>Date</span>
          <span className="text-right">Weight</span>
          <span className="text-right">Lean</span>
          <span className="text-right">Fat</span>
          <span className="text-right">BF%</span>
        </div>
        {progress.rows.map((row) => (
          <div
            key={row.date}
            className="grid grid-cols-[0.9fr_0.8fr_0.8fr_0.8fr_0.8fr] gap-1 border-b border-[var(--divider)] px-2 py-2 text-[11px] font-bold last:border-b-0"
          >
            <span className="text-slate-900">{row.label}</span>
            <span className="text-right text-slate-600">{formatTableValue(row.weight)}</span>
            <span className="text-right text-slate-600">{formatTableValue(row.lean)}</span>
            <span className="text-right text-slate-600">{formatTableValue(row.fat)}</span>
            <span className="text-right text-slate-900">{formatPercentValue(row.bodyFat)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InterpretationSection({ items }) {
  if (items.length === 0) return null;

  return (
    <Card className="space-y-3">
      <SectionHeading icon={Brain} title="Interpretation" />
      <div className="space-y-3 rounded-[14px] bg-[color-mix(in_srgb,var(--primary)_6%,var(--surface-muted))] p-3">
        {items.map((item) => (
          <p
            key={item}
            className="text-sm font-semibold leading-6 text-slate-700"
          >
            {item}
          </p>
        ))}
      </div>
    </Card>
  );
}

function formatBriefingDate(value) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function HeroConfidenceSection({ hero, reasons }) {
  return (
    <Card className="overflow-hidden border-[var(--divider)] bg-gradient-to-br from-[color-mix(in_srgb,var(--primary)_10%,var(--surface-elevated))] via-[var(--surface-elevated)] to-[var(--surface-muted)] motion-safe:animate-[briefing-card-enter_420ms_ease-out]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Badge tone="primary">{hero.primaryGoal}</Badge>
          {hero.currentChapter && (
            <p className="mt-2 text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
              {hero.currentChapter.replaceAll("_", " ")}
            </p>
          )}
          <h2 className="mt-3 text-2xl font-extrabold leading-tight text-slate-950">
            {hero.title}
          </h2>
          <p className="mt-2 text-sm font-medium leading-5 text-slate-600">
            {hero.summary}
          </p>
        </div>
        <ConfidenceRing
          label={hero.confidenceLabel}
          size={88}
          value={hero.confidence}
        />
      </div>

      {reasons.length > 0 && <div className="mt-4 grid gap-2">
        {reasons.slice(0, 3).map((reason, index) => (
          <div
            key={reason.label}
            className="flex items-center gap-2 rounded-[12px] bg-[color-mix(in_srgb,var(--surface-elevated)_84%,transparent)] px-3 py-2 text-sm font-bold text-slate-800 motion-safe:animate-[briefing-card-enter_360ms_ease-out_both] transition duration-500 ease-out"
            style={{ animationDelay: `${index * 80}ms` }}
          >
            <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${getReasonClass(reason.tone)}`}>
              <CheckCircle2 size={13} />
            </span>
            {reason.label}
          </div>
        ))}
      </div>}
    </Card>
  );
}

function CalloutSection({ icon, title, heading, detail, tone = "effort" }) {
  const toneClass =
    tone === "primary"
      ? "border-[#C7D2FE] bg-[#F8FAFF]"
      : "border-[#FED7AA] bg-[#FFFBF5]";

  return (
    <Card className={`space-y-3 ${toneClass}`}>
      <SectionHeading icon={icon} title={title} />
      <div>
        <h2 className="text-lg font-extrabold leading-tight text-slate-950">
          {heading}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
      </div>
    </Card>
  );
}

function CoachInsightSection({ view, fallback }) {
  if (!view) {
    return <CalloutSection icon={Brain} title="Coach's Insight" heading="What to understand today" detail={fallback} tone="primary" />;
  }

  return (
    <Card className="space-y-4 border-[#C7D2FE] bg-[#F8FAFF]">
      <SectionHeading icon={Brain} title="Coach's Insight" />
      {view.intro && <p className="text-sm leading-6 text-slate-600">{view.intro}</p>}
      {view.currentFocusBody && (
        <div className="space-y-2">
          <p className="text-sm font-extrabold text-slate-950">{view.currentFocusLabel ?? "Current Focus"}</p>
          <p className="text-sm leading-6 text-slate-600">{view.currentFocusBody}</p>
        </div>
      )}
    </Card>
  );
}

function ListSection({ eyebrow, icon, title, items = [] }) {
  if (items.length === 0) return null;
  const Icon = icon;

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        {Icon && <IconBadge icon={Icon} color="primary" size="xs" className="rounded-full" />}
        <div>
          {eyebrow && (
            <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-indigo-600">
              {eyebrow}
            </p>
          )}
          <h2 className="text-lg font-bold text-slate-950">{title}</h2>
        </div>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={`${title}-${item.title ?? item.label}`}
            className="flex items-start gap-2 rounded-[12px] bg-[var(--surface-muted)] p-3"
          >
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#4F46E5]" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900">
                {item.title ?? item.label}
              </p>
              <p className="mt-0.5 text-sm leading-5 text-slate-500">
                {item.detail}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Badge({ children, tone = "primary" }) {
  const tones = {
    primary: "bg-[#EEF2FF] text-[#4F46E5]",
    evidence: "bg-[#EFF6FF] text-[#0369A1]",
    success: "bg-[#ECFDF3] text-[#15803D]",
    effort: "bg-[#FFF7ED] text-[#C2410C]",
  };

  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] ${tones[tone] ?? tones.primary}`}>
      {children}
    </span>
  );
}

function getReasonClass(tone) {
  if (tone === "evidence") return "bg-[#EFF6FF] text-[#2563EB]";
  if (tone === "effort") return "bg-[#FFF7ED] text-[#C2410C]";

  return "bg-[#ECFDF3] text-[#15803D]";
}

function formatTableValue(value) {
  if (typeof value !== "number") return "—";

  return value.toFixed(1);
}

function formatPercentValue(value) {
  if (typeof value !== "number") return "—";

  return `${value.toFixed(1)}%`;
}

function SectionHeading({ icon, title }) {
  const color = title === "Why We Believe This" ? "success" : "primary";

  return (
    <div className="flex items-center gap-2">
      <IconBadge icon={icon} color={color} size="xs" className="rounded-full" />
      <h2 className="text-lg font-bold text-slate-950">{title}</h2>
    </div>
  );
}

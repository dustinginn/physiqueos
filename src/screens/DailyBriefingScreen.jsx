import Link from "next/link";
import {
  ArrowLeft,
  Brain,
  Camera,
  ChartNoAxesCombined,
  CheckCircle2,
  Dna,
  Layers,
  ListChecks,
  Scale,
  Sparkles,
} from "lucide-react";
import ActionButton from "../components/ui/ActionButton";
import ProgressLineChart from "../components/progress/ProgressLineChart";
import Card from "../components/ui/Card";
import ConfidenceRing from "../components/ui/ConfidenceRing";
import IconBadge from "../components/ui/IconBadge";

export default function DailyBriefingScreen({ briefing }) {
  return (
    <main className="app-surface min-h-screen">
      <div className="mx-auto max-w-[393px] px-4 pt-10 pb-10">
        <Link
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-500"
          href="/"
        >
          <ArrowLeft size={18} />
          Home
        </Link>

        <section className="mb-5 space-y-3">
          <div className="flex items-center gap-3">
            <IconBadge icon={Sparkles} color="warning" size="md" />
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-indigo-600">
              Daily Briefing
            </p>
          </div>
        </section>

        <div className="space-y-4">
          <HeroConfidenceSection
            hero={briefing.hero}
            reasons={briefing.confidenceReasons ?? []}
          />
          <ProgressEvidenceSection evidence={briefing.progressEvidence} />
          <SupportingContextSection items={briefing.evidenceUsed} />
          <ListSection
            eyebrow="Execution"
            icon={ListChecks}
            title="Today's Plan"
            items={briefing.todayPlan ?? []}
          />
          <CalloutSection
            icon={Brain}
            title="Coach's Insight"
            heading="What matters most"
            detail={briefing.coachInsight}
            tone="primary"
          />
          {briefing.watchItems?.length > 0 && (
            <ListSection title="Watch Items" items={briefing.watchItems} />
          )}
          {briefing.lookingAhead?.length > 0 && (
            <ListSection title="What should you expect next?" items={briefing.lookingAhead} />
          )}

          <ActionButton href="/">Back to Home</ActionButton>
        </div>
      </div>
    </main>
  );
}

function ProgressEvidenceSection({ evidence }) {
  if (!evidence) return null;

  return (
    <Card className="space-y-4">
      <SectionHeading icon={ChartNoAxesCombined} title="Journey Evidence" />
      <WeightEvidenceCard evidence={evidence.weights} />
      <DEXAEvidenceCard evidence={evidence.dexa} />
      <PhotoEvidenceCard evidence={evidence.photos} />
    </Card>
  );
}

function WeightEvidenceCard({ evidence }) {
  return (
    <div className="rounded-[14px] border border-[#DCFCE7] bg-[#F7FEFA] p-3">
      <EvidenceHeader
        badge={evidence.badge}
        icon={Scale}
        title={evidence.title}
        tone="success"
      />
      <p className="mt-2 text-sm font-medium leading-5 text-slate-600">
        {evidence.summary}
      </p>
      <WeightMiniTrend points={evidence.points} />
      <WeeklyMomentumTable rows={evidence.weeklyMomentum} />
    </div>
  );
}

function DEXAEvidenceCard({ evidence }) {
  return (
    <div className="rounded-[14px] border border-[#DBEAFE] bg-[#F8FBFF] p-3">
      <EvidenceHeader
        badge={evidence.badge}
        icon={Dna}
        title={evidence.title}
        tone="evidence"
      />
      <p className="mt-2 text-sm font-medium leading-5 text-slate-600">
        {evidence.summary}
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {evidence.scans.map((scan) => (
          <div key={scan.date} className="rounded-[12px] bg-[var(--surface-elevated)] p-2 text-center shadow-[0_1px_8px_rgba(15,23,42,0.04)]">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
              {scan.label}
            </p>
            <p className="mt-1 text-lg font-extrabold leading-none text-slate-950">
              {scan.bodyFat.toFixed(1)}%
            </p>
            <p className="mt-1 text-[10px] font-bold text-slate-500">
              {scan.fatMass?.toFixed(1) ?? "Pending"} {scan.unit} fat
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PhotoEvidenceCard({ evidence }) {
  return (
    <div className="rounded-[14px] border border-[#FED7AA] bg-[#FFFBF5] p-3">
      <EvidenceHeader
        badge={evidence.badge}
        icon={Camera}
        title={evidence.title}
        tone="effort"
      />
      <p className="mt-2 text-sm font-medium leading-5 text-slate-600">
        {evidence.summary}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <EvidencePill title="Strengths" items={evidence.strengths} />
        <EvidencePill title="Focus" items={evidence.focus} />
      </div>
    </div>
  );
}

function EvidencePill({ title, items }) {
  return (
    <div className="rounded-[12px] bg-[color-mix(in_srgb,var(--surface-elevated)_84%,transparent)] p-2">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
        {title}
      </p>
      <div className="mt-1 space-y-1">
        {items.map((item) => (
          <p key={item} className="text-xs font-bold leading-4 text-slate-700">
            {item}
          </p>
        ))}
      </div>
    </div>
  );
}

function EvidenceHeader({ badge, icon, title, tone }) {
  const Icon = icon;

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-2">
        <IconBadge icon={Icon} color={tone === "effort" ? "warning" : tone} size="xs" className="rounded-full" />
        <h3 className="text-base font-extrabold leading-tight text-slate-950">
          {title}
        </h3>
      </div>
      <Badge tone={tone}>{badge}</Badge>
    </div>
  );
}

function WeightMiniTrend({ points }) {
  if (!points?.length) return null;

  return (
    <div className="mt-3">
      <ProgressLineChart
        ariaLabel="Weight journey since start of cut"
        metricLabel="Weight"
        points={points.map((point) => ({
          ...point,
          id: point.id ?? point.date,
        }))}
        suffix={` ${points.at(-1).unit}`}
      />
      <div className="mt-1 flex justify-between text-[11px] font-bold text-slate-500">
        <span>{points[0].value.toFixed(1)} {points[0].unit}</span>
        <span className="text-[#15803D]">
          {points.at(-1).value.toFixed(1)} {points.at(-1).unit}
        </span>
      </div>
    </div>
  );
}

function WeeklyMomentumTable({ rows }) {
  if (!rows?.length) return null;

  return (
    <div className="mt-3 overflow-hidden rounded-[12px] bg-[var(--surface-elevated)]">
      <div className="grid grid-cols-[1.2fr_0.9fr_0.9fr] gap-2 border-b border-[#E2E8F0] px-3 py-2 text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
        <span>Period</span>
        <span className="text-right">Average</span>
        <span className="text-right">Change</span>
      </div>
      {rows.map((row) => (
        <div
          key={`${row.label}-${row.period}`}
          className="grid grid-cols-[1.2fr_0.9fr_0.9fr] gap-2 border-b border-[#F1F5F9] px-3 py-2 last:border-b-0"
        >
          <div>
            <p className="text-xs font-extrabold text-slate-900">{row.label}</p>
            <p className="text-[10px] font-semibold text-slate-400">{row.period}</p>
          </div>
          <p className="self-center text-right text-xs font-bold text-slate-700">
            {row.average.toFixed(1)} {row.unit}
          </p>
          <p className={`self-center text-right text-xs font-extrabold ${row.change < 0 ? "text-[#15803D]" : "text-slate-500"}`}>
            {row.change === null ? "Base" : `${row.change > 0 ? "+" : ""}${row.change.toFixed(1)} ${row.unit}`}
          </p>
        </div>
      ))}
    </div>
  );
}

function HeroConfidenceSection({ hero, reasons }) {
  return (
    <Card className="overflow-hidden border-[var(--divider)] bg-gradient-to-br from-[color-mix(in_srgb,var(--primary)_10%,var(--surface-elevated))] via-[var(--surface-elevated)] to-[var(--surface-muted)] motion-safe:animate-[briefing-card-enter_420ms_ease-out]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Badge tone="primary">{hero.primaryGoal}</Badge>
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

      <div className="mt-4 grid gap-2">
        {reasons.map((reason, index) => (
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
      </div>
    </Card>
  );
}

function SupportingContextSection({ items }) {
  const supportingItems = items.filter((item) =>
    ["Journal", "Nutrition trend", "Protocol context", "Recovery"].includes(item.label)
  );

  if (supportingItems.length === 0) return null;

  return (
    <Card className="space-y-3">
      <SectionHeading icon={Layers} title="Context Used" />
      <div className="space-y-2">
        {supportingItems.map((item) => (
          <div
            key={item.label}
            className="rounded-[12px] border border-[var(--divider)] bg-[var(--surface-muted)] p-3"
          >
            <div className="flex items-start gap-2">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#EFF6FF] text-[#2563EB]">
                <CheckCircle2 size={14} />
              </span>
              <div>
                <p className="text-sm font-bold leading-tight text-slate-950">
                  {item.label}
                </p>
                <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
                  {item.detail}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
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

function SectionHeading({ icon, title }) {
  const color = title === "Why We Believe This" ? "success" : "primary";

  return (
    <div className="flex items-center gap-2">
      <IconBadge icon={icon} color={color} size="xs" className="rounded-full" />
      <h2 className="text-lg font-bold text-slate-950">{title}</h2>
    </div>
  );
}

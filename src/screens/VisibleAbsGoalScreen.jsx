import Link from "next/link";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Dumbbell,
  Flag,
  Salad,
  ShieldCheck,
  Sparkles,
  Syringe,
  Target,
  TrendingDown,
} from "lucide-react";
import Card from "../components/ui/Card";
import ConfidenceRing from "../components/ui/ConfidenceRing";
import IconBadge from "../components/ui/IconBadge";
import { FounderRepositories } from "../data/repositories/founderRepositories";
import { GoalEvaluationService } from "../domain/services/GoalEvaluationService";
import { GoalIntelligenceService } from "../domain/services/GoalIntelligenceService";
import { orderWeeklyAveragesNewestFirst } from "../domain/utils/weeklyAverageOrdering";

const VISIBLE_ABS_GOAL_ID = "goal_visible_abs_at_rest";

export default async function VisibleAbsGoalScreen({ from } = {}) {
  const dossier = await getVisibleAbsDossier();
  const fromYou = from === "you";

  return (
    <main className="app-surface min-h-screen">
      <div className="mx-auto max-w-[393px] px-4 pt-10 pb-12">
        <Link
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-500"
          href={fromYou ? "/goals?from=you" : "/"}
        >
          <ArrowLeft size={18} />
          {fromYou ? "Goals" : "Home"}
        </Link>

        <div className="space-y-4">
          <GoalHero dossier={dossier} from={from} />
          <GoalSection />
          <SuccessCriteria items={dossier.successCriteria} />
          <GoalConfidence dossier={dossier} />
          <EvidenceJourney evidence={dossier.evidence} />
          <SupportingProtocols protocols={dossier.protocols} />
          <GoalJourney items={dossier.timeline} />
          <CoachPerspective />
        </div>
      </div>
    </main>
  );
}

async function getVisibleAbsDossier() {
  const user = await FounderRepositories.users.getCurrentUser();
  const userId = user?.id;
  const [
    goals,
    activeGoal,
    weights,
    dexaScans,
    progressPhotos,
    protocols,
    nutritionContext,
  ] = await Promise.all([
    FounderRepositories.goals.listGoals(userId),
    FounderRepositories.goals.getActiveGoal(userId),
    FounderRepositories.weights.listWeightEntries(userId),
    FounderRepositories.dexaScans.listDEXAScans(userId),
    FounderRepositories.progressPhotos.listPhotos(userId),
    FounderRepositories.protocols.listActiveProtocols(userId),
    FounderRepositories.nutritionContext.getNutritionContext(userId),
  ]);
  const sortedWeights = sortByDate(weights, "measuredAt");
  const sortedDEXA = sortByDate(dexaScans, "measuredAt");
  const sortedPhotos = sortByDate(progressPhotos, "date");
  const evaluations = GoalEvaluationService.getGoalEvaluations({
    goals,
    dexaScans: sortedDEXA,
    weightEntries: sortedWeights,
    progressPhotos: sortedPhotos,
    protocols,
    nutritionContext,
  });
  const intelligence = GoalIntelligenceService.getGoalIntelligence({
    evaluations,
    activeGoal,
  });
  const evaluation =
    evaluations.find((item) => item.goalId === VISIBLE_ABS_GOAL_ID) ??
    evaluations[0];
  const weightStats = getWeightStats(sortedWeights);

  return {
    progress: evaluation?.progress ?? 0,
    confidence: evaluation?.goalConfidence?.value ?? evaluation?.confidence ?? 0,
    confidenceLabel:
      evaluation?.goalConfidence?.label ??
      getConfidenceLabel(evaluation?.confidence ?? 0),
    projectedFinish: intelligence.trajectory.projectedFinish,
    daysRemaining: intelligence.trajectory.daysRemaining,
    heroSentence: getHeroSentence({ evaluation, weightStats, sortedPhotos }),
    successCriteria: getSuccessCriteria(evaluation),
    confidenceReasons: getConfidenceReasons(evaluation),
    uncertainty: "Lower abs remain the final visual milestone.",
    evidence: getEvidenceJourney({
      sortedWeights,
      sortedDEXA,
      weightStats,
    }),
    protocols: getSupportingProtocols({ protocols, nutritionContext }),
    timeline: getGoalJourney({ sortedWeights, sortedDEXA, sortedPhotos, protocols }),
  };
}

function GoalHero({ dossier, from }) {
  return (
    <Card className="overflow-hidden border-[var(--divider)] bg-gradient-to-br from-[color-mix(in_srgb,var(--primary)_10%,var(--surface-elevated))] via-[var(--surface-elevated)] to-[var(--surface-muted)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <span className="inline-flex rounded-full bg-[#EEF2FF] px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#4F46E5]">
            Goal
          </span>
          <h1 className="mt-3 text-3xl font-extrabold leading-tight text-slate-950">
            Visible Abs at Rest
          </h1>
          <p className="mt-2 text-sm font-semibold leading-5 text-slate-600">
            {dossier.heroSentence}
          </p>
        </div>
        <ConfidenceRing
          label={dossier.confidenceLabel}
          size={88}
          value={dossier.confidence}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <GoalMetric label="Estimated" value={dossier.daysRemaining} />
        <GoalMetric label="Finish" value={dossier.projectedFinish} />
      </div>

      <Link
        className="mt-3 inline-flex text-xs font-extrabold uppercase tracking-[0.08em] text-[#4F46E5]"
        href={from === "you" ? "/goals?from=you" : "/goals"}
      >
        View all goals
      </Link>
    </Card>
  );
}

function GoalMetric({ label, value }) {
  return (
    <div className="rounded-[12px] bg-[color-mix(in_srgb,var(--surface-elevated)_84%,transparent)] p-3">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-lg font-extrabold leading-tight text-slate-950">
        {value}
      </p>
    </div>
  );
}

function GoalSection() {
  return (
    <Card className="space-y-2">
      <SectionHeading icon={Target} title="Goal" />
      <p className="text-sm font-medium leading-6 text-slate-600">
        Achieve visible abs at rest while preserving as much lean mass as
        possible.
      </p>
    </Card>
  );
}

function SuccessCriteria({ items }) {
  return (
    <Card className="space-y-3">
      <SectionHeading icon={CheckCircle2} title="Success Criteria" />
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between gap-3 rounded-[12px] bg-[var(--surface-muted)] p-3"
          >
            <div className="flex items-center gap-2">
              <span className={`grid h-6 w-6 place-items-center rounded-full ${item.className}`}>
                {item.symbol}
              </span>
              <p className="text-sm font-bold text-slate-900">{item.label}</p>
            </div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
              {item.status}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function GoalConfidence({ dossier }) {
  return (
    <Card className="space-y-3">
      <SectionHeading icon={ShieldCheck} title="Goal Confidence" />
      <div className="rounded-[12px] bg-[#EEF2FF] p-3">
        <p className="text-2xl font-extrabold leading-none text-[#4F46E5]">
          {dossier.confidence}%
        </p>
        <p className="mt-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-500">
          {dossier.confidenceLabel} Confidence
        </p>
      </div>
      <div className="space-y-2">
        {dossier.confidenceReasons.map((reason) => (
          <p key={reason} className="text-sm font-semibold leading-5 text-slate-700">
            ✓ {reason}
          </p>
        ))}
      </div>
      <div className="rounded-[12px] bg-[#FFF7ED] p-3">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#C2410C]">
          Remaining uncertainty
        </p>
        <p className="mt-1 text-sm font-medium leading-5 text-slate-600">
          {dossier.uncertainty}
        </p>
      </div>
    </Card>
  );
}

function EvidenceJourney({ evidence }) {
  return (
    <Card className="space-y-4">
      <SectionHeading icon={TrendingDown} title="Evidence Journey" />
      <WeightJourney evidence={evidence.weight} />
      <DEXAJourney evidence={evidence.dexa} />
      <VisualJourney evidence={evidence.visual} />
    </Card>
  );
}

function WeightJourney({ evidence }) {
  return (
    <JourneyCard tone="success" icon={TrendingDown} title="Weight">
      <p className="text-sm font-medium leading-5 text-slate-600">
        {evidence.summary}
      </p>
      <WeightGraph points={evidence.points} />
      <WeeklyMomentum rows={evidence.weeklyMomentum} />
    </JourneyCard>
  );
}

function DEXAJourney({ evidence }) {
  return (
    <JourneyCard tone="evidence" icon={ShieldCheck} title="DEXA">
      <p className="text-sm font-medium leading-5 text-slate-600">
        {evidence.summary}
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {evidence.scans.map((scan) => (
          <div key={scan.date} className="rounded-[12px] bg-[var(--surface-elevated)] p-2 text-center">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
              {scan.label}
            </p>
            <p className="mt-1 text-lg font-extrabold leading-none text-slate-950">
              {scan.bodyFat.toFixed(1)}%
            </p>
            <p className="mt-1 text-[10px] font-bold text-slate-500">
              {scan.fatMass.toFixed(1)} lb fat
            </p>
          </div>
        ))}
      </div>
    </JourneyCard>
  );
}

function VisualJourney({ evidence }) {
  return (
    <JourneyCard tone="effort" icon={Camera} title="Progress Photos">
      <p className="text-sm font-medium leading-5 text-slate-600">
        {evidence.summary}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <EvidenceList title="Strengths" items={evidence.strengths} />
        <EvidenceList title="Focus" items={evidence.focus} />
      </div>
    </JourneyCard>
  );
}

function JourneyCard({ children, icon, title, tone }) {
  const toneClass = {
    success: "border-[#DCFCE7] bg-[#F7FEFA]",
    evidence: "border-[#DBEAFE] bg-[#F8FBFF]",
    effort: "border-[#FED7AA] bg-[#FFFBF5]",
  }[tone];

  return (
    <div className={`rounded-[14px] border p-3 ${toneClass}`}>
      <div className="flex items-center gap-2">
        <IconBadge icon={icon} color={tone} size="xs" className="rounded-full" />
        <h3 className="text-base font-extrabold leading-tight text-slate-950">
          {title}
        </h3>
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function SupportingProtocols({ protocols }) {
  return (
    <Card className="space-y-3">
      <SectionHeading icon={Syringe} title="Supporting Protocols" />
      <div className="space-y-2">
        {protocols.map((protocol) => (
          <div key={protocol.name} className="rounded-[12px] bg-[var(--surface-muted)] p-3">
            <div className="flex items-start gap-2">
              <IconBadge
                className="rounded-full"
                color={protocol.color}
                icon={protocol.icon}
                size="xs"
              />
              <div>
                <p className="text-sm font-extrabold text-slate-950">
                  {protocol.name}
                </p>
                <p className="mt-1 text-sm font-medium leading-5 text-slate-600">
                  {protocol.reason}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function GoalJourney({ items }) {
  return (
    <Card className="space-y-3">
      <SectionHeading icon={Flag} title="Goal Journey" />
      <div className="space-y-0">
        {items.map((item, index) => (
          <div key={`${item.date}-${item.title}`} className="relative flex gap-3 pb-4 last:pb-0">
            {index < items.length - 1 && (
              <span className="absolute left-[13px] top-7 h-[calc(100%-28px)] w-px bg-[#E5E7EB]" />
            )}
            <span className="relative z-10 mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#EEF2FF] text-[12px] font-extrabold text-[#4F46E5]">
              {index + 1}
            </span>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
                {item.date}
              </p>
              <p className="text-sm font-extrabold text-slate-950">{item.title}</p>
              <p className="mt-0.5 text-xs font-medium leading-5 text-slate-500">
                {item.detail}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function CoachPerspective() {
  return (
    <Card className="space-y-3 border-[#C7D2FE] bg-[#F8FAFF]">
      <SectionHeading icon={Sparkles} title="Coach's Perspective" />
      <p className="text-sm font-medium leading-6 text-slate-600">
        The strongest evidence continues to point toward successful completion
        of this goal. Weight has declined consistently throughout the cut, DEXA
        confirms meaningful body-fat reduction, and recent photos show improving
        upper-ab definition while preserving a strong V-taper. The remaining
        challenge is concentrated almost entirely in the lower abs and lower
        back, making continued consistency more valuable than increasing
        aggressiveness.
      </p>
    </Card>
  );
}

function WeightGraph({ points }) {
  const width = 320;
  const height = 112;
  const paddingX = 14;
  const paddingY = 18;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const coordinates = points.map((point, index) => ({
    ...point,
    x: paddingX + (points.length === 1 ? 0 : (index / (points.length - 1)) * (width - paddingX * 2)),
    y: paddingY + ((max - point.value) / range) * (height - paddingY * 2),
  }));
  const path = coordinates
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");

  return (
    <div className="mt-3 rounded-[12px] bg-[var(--surface-elevated)] p-2">
      <svg aria-label="Visible abs weight journey" className="h-[112px] w-full" role="img" viewBox={`0 0 ${width} ${height}`}>
        <line x1={paddingX} x2={width - paddingX} y1={height - paddingY} y2={height - paddingY} stroke="#E2E8F0" strokeWidth="1" />
        <path d={path} fill="none" stroke="#16A34A" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
        {coordinates.map((point, index) => (
          <circle
            key={point.date}
            cx={point.x}
            cy={point.y}
            fill={point.isLatest ? "#16A34A" : index === 0 ? "#F59E0B" : "var(--surface-elevated)"}
            r={point.isLatest || index === 0 ? 4.5 : 2.6}
            stroke="#16A34A"
            strokeWidth="2"
          />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] font-bold text-slate-500">
        <span>{points[0].value.toFixed(1)} {points[0].unit}</span>
        <span className="text-[#15803D]">
          {points.at(-1).value.toFixed(1)} {points.at(-1).unit}
        </span>
      </div>
    </div>
  );
}

function WeeklyMomentum({ rows }) {
  return (
    <div className="mt-3 overflow-hidden rounded-[12px] bg-[var(--surface-elevated)]">
      <div className="grid grid-cols-[1.2fr_0.9fr_0.9fr] gap-2 border-b border-[#E2E8F0] px-3 py-2 text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
        <span>Period</span>
        <span className="text-right">Average</span>
        <span className="text-right">Change</span>
      </div>
      {rows.map((row) => (
        <div key={`${row.label}-${row.period}`} className="grid grid-cols-[1.2fr_0.9fr_0.9fr] gap-2 border-b border-[#F1F5F9] px-3 py-2 last:border-b-0">
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

function EvidenceList({ items, title }) {
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

function SectionHeading({ icon, title }) {
  return (
    <div className="flex items-center gap-2">
      <IconBadge icon={icon} color="primary" size="xs" className="rounded-full" />
      <h2 className="text-lg font-bold text-slate-950">{title}</h2>
    </div>
  );
}

function getWeightStats(weights) {
  const first = weights[0] ?? null;
  const latest = weights.at(-1) ?? null;

  return {
    totalLost:
      first && latest
        ? Number((first.weight.value - latest.weight.value).toFixed(1))
        : null,
  };
}

function getHeroSentence({ evaluation, weightStats, sortedPhotos }) {
  if (sortedPhotos.length > 0 && weightStats.totalLost >= 10) {
    return "Visual progress is now leading scale progress.";
  }

  return evaluation?.summary ?? "The current protocol continues outperforming expectations.";
}

function getSuccessCriteria(evaluation) {
  const leanMassPreserved = evaluation?.findings?.some(
    (finding) => finding.id === "lean_mass_preserved" && finding.status === "positive"
  );

  return [
    {
      label: "Upper abs consistently visible",
      status: "Achieved",
      symbol: "✓",
      className: "bg-[#ECFDF3] text-[#15803D]",
    },
    {
      label: "Lower abs visible at rest",
      status: "In progress",
      symbol: "○",
      className: "bg-[#FFF7ED] text-[#C2410C]",
    },
    {
      label: "Lean mass preserved",
      status: leanMassPreserved ? "On track" : "Monitor",
      symbol: leanMassPreserved ? "✓" : "○",
      className: leanMassPreserved ? "bg-[#ECFDF3] text-[#15803D]" : "bg-[#FFF7ED] text-[#C2410C]",
    },
    {
      label: "Maintain training performance",
      status: "On track",
      symbol: "✓",
      className: "bg-[#ECFDF3] text-[#15803D]",
    },
  ];
}

function getConfidenceReasons(evaluation) {
  const positives =
    evaluation?.findings
      ?.filter((finding) => finding.status === "positive")
      .map((finding) => finding.text) ?? [];

  return [
    "Weight trend remains consistent.",
    "Progress photos increased confidence.",
    "Latest DEXA supports the body-fat estimate.",
    "Nutrition remains within target range.",
    ...positives.slice(0, 1),
  ].slice(0, 5);
}

function getEvidenceJourney({ sortedWeights, sortedDEXA, weightStats }) {
  const weightPoints = sortedWeights.map((entry) => ({
    date: entry.measuredAt,
    label: formatShortDate(entry.measuredAt),
    value: entry.weight.value,
    unit: entry.weight.unit,
    isLatest: entry === sortedWeights.at(-1),
  }));
  const weeklyMomentum = getWeeklyMomentum(sortedWeights);
  const dexaScans = sortedDEXA.slice(-3).map((scan) => ({
    date: scan.measuredAt,
    label: formatShortDate(scan.measuredAt),
    bodyFat: scan.bodyFatPercentage,
    fatMass: scan.fatMass?.value ?? 0,
  }));

  return {
    weight: {
      summary:
        weightStats.totalLost !== null
          ? `Weight has moved down ${weightStats.totalLost.toFixed(1)} lb across the cut, with weekly averages showing the goal is still advancing.`
          : "Weight history is still building.",
      points: weightPoints,
      weeklyMomentum,
    },
    dexa: {
      summary:
        "DEXA confirms meaningful body-fat reduction since 5/24. Lean mass remains the key metric to protect, but the scan trend supports the current body-fat trajectory.",
      scans: dexaScans,
    },
    visual: {
      summary:
        "Recent photos show visible upper-ab definition, strong oblique separation, and improving back definition. Remaining work is concentrated in lower abs and lower back, which is expected at this stage of the cut.",
      strengths: [
        "Excellent V-taper",
        "Upper abs consistently visible",
        "Obliques well-developed",
        "Back definition improving",
        "Strong muscle-retention appearance",
      ],
      focus: ["Lower abs", "Lower back"],
    },
  };
}

function getSupportingProtocols({ protocols, nutritionContext }) {
  const items = protocols
    .filter((protocol) => protocol.relatedGoalIds?.includes(VISIBLE_ABS_GOAL_ID))
    .map((protocol) => ({
      color: protocol.category === "peptide" ? "effort" : "primary",
      icon: protocol.category === "peptide" ? Syringe : Target,
      name: protocol.name,
      reason:
        protocol.name === "Retatrutide"
          ? "Supports nutritional adherence during the cut."
          : "Supports lean-mass preservation during the cut.",
    }));

  if (nutritionContext?.estimatedDailyCaloricIntake) {
    items.push({
      color: "success",
      icon: Salad,
      name: "Nutrition",
      reason: "Current intake range supports the planned deficit.",
    });
  }

  items.push({
    color: "evidence",
    icon: Dumbbell,
    name: "Training",
    reason: "Resistance work and daily activity support the goal without replacing direct evidence.",
  });

  return items;
}

function getGoalJourney({ sortedWeights, sortedDEXA, sortedPhotos, protocols }) {
  const firstWeight = sortedWeights[0];
  const firstPhoto = sortedPhotos[0];
  const retatrutide = protocols.find((protocol) => protocol.name === "Retatrutide");
  const tesamorelin = protocols.find((protocol) => protocol.name === "Tesamorelin");
  const latestDEXA = sortedDEXA.at(-1);

  return [
    firstWeight && {
      date: formatShortDate(firstWeight.measuredAt),
      title: "Started cut",
      detail: `${firstWeight.weight.value.toFixed(1)} ${firstWeight.weight.unit} starting evidence.`,
    },
    firstPhoto && {
      date: formatShortDate(firstPhoto.date),
      title: "First progress photos",
      detail: "Visual evidence began under comparable conditions.",
    },
    retatrutide && {
      date: formatShortDate(retatrutide.startDate),
      title: "Started Retatrutide",
      detail: "Nutrition-adherence context entered the operating plan.",
    },
    tesamorelin && {
      date: formatShortDate(tesamorelin.startDate),
      title: "Started Tesamorelin",
      detail: "Lean-mass preservation context entered the operating plan.",
    },
    latestDEXA && {
      date: formatShortDate(latestDEXA.measuredAt),
      title: "DEXA confirmed 10.7%",
      detail: "High-confidence body-composition calibration.",
    },
    {
      date: "Today",
      title: "Current Goal Status",
      detail: "Lower abs and lower back remain the final focus.",
    },
  ].filter(Boolean);
}

function getWeeklyMomentum(weights) {
  const first = weights[0];
  const latest = weights.at(-1);

  if (!first || !latest) return [];

  const weeks = [];
  const start = parseDateKey(first.measuredAt);
  const latestDate = parseDateKey(latest.measuredAt);
  let cursor = start;
  let previousAverage = null;
  let weekNumber = 1;

  while (cursor <= latestDate) {
    const end = addDays(cursor, 6);
    const entries = weights.filter((entry) =>
      isWithinRange(parseDateKey(entry.measuredAt), cursor, end)
    );

    if (entries.length > 0 && end <= latestDate) {
      const average = averageWeight(entries);

      weeks.push({
        label: `Week ${weekNumber}`,
        period: `${formatShortDate(toDateKey(cursor))}-${formatShortDate(toDateKey(end))}`,
        sortDate: toDateKey(cursor),
        average,
        change:
          previousAverage === null
            ? null
            : Number((average - previousAverage).toFixed(1)),
        unit: entries.at(-1)?.weight?.unit ?? "lb",
      });
      previousAverage = average;
    }

    cursor = addDays(cursor, 7);
    weekNumber += 1;
  }

  const rollingEnd = latestDate;
  const rollingStart = addDays(rollingEnd, -6);
  const previousRollingStart = addDays(rollingStart, -7);
  const previousRollingEnd = addDays(rollingStart, -1);
  const rollingEntries = weights.filter((entry) =>
    isWithinRange(parseDateKey(entry.measuredAt), rollingStart, rollingEnd)
  );
  const previousRollingEntries = weights.filter((entry) =>
    isWithinRange(parseDateKey(entry.measuredAt), previousRollingStart, previousRollingEnd)
  );
  const rollingAverage = averageWeight(rollingEntries);
  const previousRollingAverage = averageWeight(previousRollingEntries);

  if (rollingEntries.length > 0) {
    weeks.push({
      label: "Current Rolling 7 Days",
      period: `${formatShortDate(toDateKey(rollingStart))}-${formatShortDate(toDateKey(rollingEnd))}`,
      sortDate: toDateKey(rollingStart),
      average: rollingAverage,
      change:
        previousRollingAverage === null
          ? null
          : Number((rollingAverage - previousRollingAverage).toFixed(1)),
      unit: rollingEntries.at(-1)?.weight?.unit ?? "lb",
    });
  }

  return orderWeeklyAveragesNewestFirst(weeks.slice(-6));
}

function averageWeight(weights) {
  if (weights.length === 0) return null;

  return Number((weights.reduce((sum, entry) => sum + entry.weight.value, 0) / weights.length).toFixed(1));
}

function sortByDate(records, field) {
  return [...records].sort((a, b) => String(a[field]).localeCompare(String(b[field])));
}

function parseDateKey(value) {
  const [year, month, day] = String(value).split("-").map(Number);

  return new Date(year, month - 1, day);
}

function addDays(date, days) {
  const next = new Date(date);

  next.setDate(next.getDate() + days);

  return next;
}

function isWithinRange(date, start, end) {
  return date >= start && date <= end;
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatShortDate(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  const date =
    year && month && day
      ? new Date(year, month - 1, day)
      : new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function getConfidenceLabel(confidence) {
  if (confidence >= 90) return "Very High";
  if (confidence >= 80) return "High";
  if (confidence >= 55) return "Moderate";

  return "Building";
}

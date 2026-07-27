import Link from "next/link";
import {
  ArrowLeft,
  Camera,
  Dumbbell,
  Flame,
  Scale,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Card from "../components/ui/Card";
import EvidenceImage from "../components/progress/EvidenceImage";
import BriefingConfidenceAnchor from "../components/briefings/BriefingConfidenceAnchor";
import EnergyBalanceChart from "../components/briefings/EnergyBalanceChart";
import {
  TrainingPerformanceHighlights,
} from "../components/briefings/TrainingPerformanceHighlights";
import {
  BriefingFeatureCard,
  BriefingSectionHeading,
  CadenceBriefingHero,
} from "../components/briefings/CadenceBriefingPrimitives";
import { createWeeklyBriefingScreenPresentation } from "../domain/services/WeeklyBriefingScreenPresentationService";

export default function WeeklyBriefingScreen({ narrative }) {
  const presentation = createWeeklyBriefingScreenPresentation(narrative);
  return <main className="app-surface min-h-screen overflow-x-hidden">
    <div className="mx-auto max-w-[393px] px-4 pb-32 pt-10">
      <Link
        className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]"
        href={presentation.navigation.backHref}
      >
        <ArrowLeft size={18}/>
        {presentation.navigation.backLabel}
      </Link>

      <CadenceBriefingHero
        body={presentation.hero.body}
        confidence={presentation.hero.confidence && <BriefingConfidenceAnchor
          confidence={presentation.hero.confidence}
          testId="weekly-confidence"
        />}
        context={presentation.hero.goalLabel && <p className="mt-5 text-xs font-extrabold text-[var(--primary)]">
          {presentation.hero.goalLabel}
        </p>}
        icon={Sparkles}
        label={presentation.hero.eyebrow}
        meta={<p className="whitespace-pre-line text-right text-[10px] font-bold text-[var(--text-secondary)]">
          {presentation.hero.periodLabel}
        </p>}
        testId="weekly-hero"
        title={presentation.hero.headline}
      >
        <WeeklyStrategyContext hero={presentation.hero}/>
      </CadenceBriefingHero>

      <div className="mt-3 space-y-3">
        {presentation.energy && <WeeklyEnergy energy={presentation.energy}/>}
        {presentation.weight && <WeeklyWeight weight={presentation.weight}/>}
        {presentation.photos && <WeeklyPhotos photos={presentation.photos}/>}
        {presentation.training.available && <WeeklyTraining training={presentation.training}/>}
        {presentation.bodyComposition && <WeeklyBodyComposition body={presentation.bodyComposition}/>}
        <WeeklyCoachTake insight={presentation.coachInsight}/>
      </div>
    </div>
  </main>;
}

function WeeklyStrategyContext({ hero }) {
  if (!hero.goalLabel && !hero.strategy) return null;
  return <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--divider)] pt-3 text-[10px] font-bold text-[var(--text-secondary)]">
    {hero.strategy?.name && <span>Current strategy: {hero.strategy.name}</span>}
    {hero.strategy?.weekLabel && <span>{hero.strategy.weekLabel}</span>}
    {hero.strategy?.reviewLabel && <span>Next: {hero.strategy.reviewLabel}</span>}
  </div>;
}

function WeeklyEnergy({ energy }) {
  return <BriefingFeatureCard
    icon={Flame}
    label="Energy Balance"
    tone="effort"
    title={energy.title || "Intake remained below estimated expenditure"}
    testId="weekly-energy-balance"
  >
    <p className="text-[26px] font-black leading-8 text-[var(--chart-1)]">
      {balanceHeadline(energy.averageBalance)}
    </p>
    {energy.narrative && <p className="mt-3 text-sm font-semibold leading-6 text-[var(--text-secondary)]">
      {energy.narrative}
    </p>}
    <div className="mt-4 grid grid-cols-3 gap-2 border-y border-[var(--divider)] py-3">
      <EnergyMetric color="var(--chart-3)" label="Avg intake" value={kcal(energy.averageIntake)}/>
      <EnergyMetric color="var(--chart-2)" label="Avg expenditure" value={kcal(energy.averageExpenditure)}/>
      <EnergyMetric color="var(--chart-1)" label="Avg balance" value={signedKcal(energy.averageBalance)}/>
    </div>
    <EnergyBalanceChart cadence="weekly" chart={energy.chart}/>
  </BriefingFeatureCard>;
}

function WeeklyWeight({ weight }) {
  return <Card>
    <BriefingSectionHeading icon={Scale}>Weight Context</BriefingSectionHeading>
    <p className="mt-2 text-2xl font-black text-[var(--text-primary)]">
      {metric(weight.weeklyAverage, " lb")}
    </p>
    <p className="text-[10px] font-bold text-[var(--text-muted)]">
      Completed-week average{Number.isFinite(weight.change) && ` · ${signedWeight(weight.change)} first to last`}
    </p>
    {weight.narrative && <p className="mt-3 text-sm font-semibold leading-6 text-[var(--text-secondary)]">
      {weight.narrative}
    </p>}
  </Card>;
}

function WeeklyPhotos({ photos }) {
  return <BriefingFeatureCard
    icon={Camera}
    label="Progress Photos"
    tone="evidence"
    title={photos.title}
    testId="weekly-progress-photos"
  >
    <div className={photos.thumbnailHref ? "grid grid-cols-[76px_1fr] gap-3" : ""}>
      {photos.thumbnailHref && <EvidenceImage
        alt="Weekly Progress Photos"
        className="aspect-[3/4] w-[76px] rounded-xl object-cover"
        src={photos.thumbnailHref}
      />}
      <div>
        <p className="text-sm font-semibold leading-6 text-[var(--text-secondary)]">
          {photos.narrative || photos.summary}
        </p>
        {photos.href && <Link
          className="mt-2 inline-flex text-xs font-extrabold text-[var(--primary)]"
          href={photos.href}
        >
          Open Photo Event →
        </Link>}
      </div>
    </div>
  </BriefingFeatureCard>;
}

function WeeklyTraining({ training }) {
  return <BriefingFeatureCard
    icon={Dumbbell}
    label="Training Response"
    tone="primary"
    title={training.title}
    testId="weekly-training-response"
  >
    {training.conclusion && <p className="text-sm font-semibold leading-6 text-[var(--text-secondary)]">
      {training.conclusion}
    </p>}
    <p className="mt-3 text-[10px] font-bold text-[var(--text-muted)]">
      6 training days · {training.comparableCategoryCount} reviewed categories · {training.status.improving} improving · {training.status.plateauing} plateauing · {training.insufficientCount} insufficient
    </p>
    <TrainingPerformanceHighlights items={training.highlights.slice(0, 3)}/>
    {training.priorityCategories.length > 0 && <div className="mt-5">
      <p className="text-[10px] font-black uppercase tracking-[.08em] text-[var(--text-muted)]">
        🎯 Priority Muscle Groups
      </p>
      <div className="mt-2 grid gap-2">
        {training.priorityCategories.map((category) => <div
          className="rounded-xl bg-[var(--surface-muted)] p-3"
          key={category.id}
        >
          <p className="flex items-center gap-2 text-xs font-black text-[var(--text-primary)]">
            <span
              aria-label={category.status}
              className={statusIndicatorClass(category.statusTone)}
              data-status-tone={category.statusTone}
            >●</span>
            {category.label}
          </p>
          <p className="mt-1 text-[10px] font-bold leading-4 text-[var(--text-secondary)]">
            {category.statusLabel} across {category.comparableExerciseCount} exercise{category.comparableExerciseCount === 1 ? "" : "s"}.
          </p>
        </div>)}
      </div>
    </div>}
  </BriefingFeatureCard>;
}

function statusIndicatorClass(tone) {
  if (tone === "success") return "text-[var(--chart-1)]";
  if (tone === "warning") return "text-[var(--chart-3)]";
  if (tone === "danger") return "text-[var(--destructive)]";
  if (tone === "neutral") return "text-[var(--chart-2)]";
  return "text-[var(--chart-5)]";
}

function WeeklyBodyComposition({ body }) {
  return <BriefingFeatureCard
    icon={ShieldCheck}
    label="Body Composition"
    tone="evidence"
    title="Current Baseline"
    testId="weekly-body-composition"
  >
    <div className="grid grid-cols-2 gap-2">
      <BodyMetric label="Body fat" value={metric(body.bodyFat, "%")}/>
      <BodyMetric label="Lean mass" value={metric(body.leanMass, " lb")}/>
      <BodyMetric label="Fat mass" value={metric(body.fatMass, " lb")}/>
      <BodyMetric label="DEXA date" value={longDate(body.date)}/>
    </div>
    {body.narrative && <p className="mt-3 text-sm font-semibold leading-6 text-[var(--text-secondary)]">
      {body.narrative}
    </p>}
    {body.objective && <p className="mt-3 text-xs font-extrabold text-[var(--text-primary)]">
      Current objective: {body.objective}
    </p>}
  </BriefingFeatureCard>;
}

function WeeklyCoachTake({ insight }) {
  const actions = insight.actionItems.length
    ? insight.actionItems
    : [insight.keepBuilding, insight.watchNextWeek].filter(Boolean);
  return <section
    className="coach-take-card rounded-[24px] border border-white/10 bg-[color-mix(in_srgb,var(--primary)_82%,#171225)] p-5 text-white shadow-[0_18px_48px_rgba(12,8,28,.18)]"
    data-testid="weekly-coach-take"
  >
    <p className="text-[10px] font-black uppercase tracking-[.12em] text-white/65">
      Coach&apos;s Take
    </p>
    <CoachPoint emoji="💡" label="Biggest Takeaway" testId="weekly-biggest-takeaway">
      {insight.biggestWin}
    </CoachPoint>
    <CoachPoint emoji="🧠" label="My Recommendation" separated testId="weekly-recommendation">
      {insight.keepBuilding}
    </CoachPoint>
    <div className="mt-7 border-t border-white/10 pt-5">
      <p className="text-[10px] font-black uppercase tracking-[.08em]">
        <span aria-hidden>🎯</span>{" "}
        <span className="text-white/70">Into Next Week</span>
      </p>
      <ol className="mt-3 space-y-3">
        {actions.map((action, index) => <li
          className="grid grid-cols-[1.25rem_1fr] items-start gap-2 text-sm font-semibold leading-6 text-white/90"
          data-testid="weekly-next-action"
          key={`${index}-${action}`}
        >
          <span className="pt-px text-center font-black text-white/50">{index + 1}</span>
          <span>{action}</span>
        </li>)}
      </ol>
    </div>
  </section>;
}

function CoachPoint({ emoji, label, children, separated = false, testId }) {
  return <div className={separated ? "mt-7 border-t border-white/10 pt-5" : "mt-5"}>
    <p className="text-[10px] font-black uppercase tracking-[.08em]">
      <span aria-hidden>{emoji}</span>{" "}
      <span className="text-white/70">{label}</span>
    </p>
    <p className="mt-2 text-sm font-semibold leading-6 text-white/90" data-testid={testId}>{children}</p>
  </div>;
}

function EnergyMetric({ color, label, value }) {
  return <div className="min-w-0 px-1">
    <p className="text-[8px] font-extrabold uppercase tracking-[.06em]" style={{ color }}>{label}</p>
    <p className="mt-1 break-words text-[11px] font-black leading-4 text-[var(--text-primary)]">{value}</p>
  </div>;
}

function BodyMetric({ label, value }) {
  return <div className="min-w-0 rounded-xl bg-[var(--surface-muted)] p-3">
    <p className="text-[9px] font-extrabold uppercase tracking-[.07em] text-[var(--text-muted)]">{label}</p>
    <p className="mt-1 break-words text-xs font-black leading-5 text-[var(--text-primary)]">{value}</p>
  </div>;
}

function balanceHeadline(value) {
  if (!Number.isFinite(value)) return "Weekly estimate unavailable";
  if (Math.abs(value) < 25) return "About even day to day";
  return `${Math.abs(Math.round(value)).toLocaleString("en-US")} kcal/day ${value < 0 ? "below" : "above"}`;
}

function metric(value, suffix) {
  return Number.isFinite(value)
    ? `${Number(value).toLocaleString("en-US", { maximumFractionDigits: 1 })}${suffix}`
    : "Unavailable";
}

function longDate(value) {
  return value
    ? new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${value}T12:00:00Z`))
    : "Unavailable";
}

function kcal(value) {
  return Number.isFinite(value)
    ? `${Math.round(value).toLocaleString("en-US")} kcal`
    : "Unavailable";
}

function signedKcal(value) {
  if (!Number.isFinite(value)) return "Unavailable";
  return `${value > 0 ? "+" : "−"}${Math.abs(Math.round(value)).toLocaleString("en-US")} kcal`;
}

function signedWeight(value) {
  return `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(1)} lb`;
}

import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  ChevronRight,
  Dumbbell,
  MessageCircle,
  Salad,
  Scale,
  Syringe,
} from "lucide-react";
import Card from "../components/ui/Card";
import IconBadge from "../components/ui/IconBadge";
import {
  buildEnergyStrategyPlanItem as buildApplicationEnergyStrategyPlanItem,
  buildOperatingPlan as buildApplicationOperatingPlan,
  buildTrainingPlanItem as buildApplicationTrainingPlanItem,
} from "../application/plan/OperatingPlanReadService";

export default function OperatingPlanScreen({
  activityActivated = false,
  nutritionContext,
  protocols,
  reminders = [],
  trainingActivated = false,
  trainingProtocol,
  energyActivated = false,
  energyStrategy,
  executionItems = [],
  planSections = null,
}) {
  const plan = planSections ?? buildOperatingPlan({ energyStrategy, executionItems, nutritionContext, protocols, reminders, trainingProtocol });

  return (
    <main className="app-surface min-h-screen">
      <div className="mx-auto max-w-[393px] px-4 pt-10 pb-28">
        <Link
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]"
          href="/profile"
        >
          <ArrowLeft size={18} />
          You
        </Link>

        <header className="mb-6 space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--primary)]">
            Operating Plan
          </p>
          <h1 className="text-3xl font-extrabold leading-tight text-[var(--text-primary)]">
            What PhysiqueOS expects.
          </h1>
          <p className="text-sm font-medium leading-6 text-[var(--text-secondary)]">
            Scheduled evidence, recurring actions, and daily expectations that shape the operating loop.
          </p>
        </header>

        {activityActivated && (
          <Card className="mb-4 space-y-2 border border-[var(--primary)]">
            <h2 className="text-base font-extrabold text-[var(--text-primary)]">
              Activity is now part of your Operating Plan.
            </h2>
            <p className="text-sm font-semibold leading-6 text-[var(--text-secondary)]">
              PhysiqueOS will now follow your daily Activity against the weekly plan and use this strategy in future coaching.
            </p>
            <Link className="inline-flex min-h-11 items-center text-sm font-extrabold text-[var(--primary)]" href="/profile/operating-plan">
              Return to Operating Plan
            </Link>
          </Card>
        )}
        {trainingActivated && (
          <Card className="mb-4 space-y-2 border border-[var(--primary)]">
            <h2 className="text-base font-extrabold text-[var(--text-primary)]">Training is now part of your Operating Plan.</h2>
            <p className="text-sm font-semibold leading-6 text-[var(--text-secondary)]">PhysiqueOS will use this strategy to understand your weekly training rhythm and shape future coaching.</p>
            <Link className="inline-flex min-h-11 items-center text-sm font-extrabold text-[var(--primary)]" href="/profile/operating-plan">Return to Operating Plan</Link>
          </Card>
        )}
        {energyActivated && <Card className="mb-4 space-y-2 border border-[var(--primary)]"><h2 className="text-base font-extrabold">Activity and Nutrition are now part of your Operating Plan.</h2><p className="text-sm font-semibold text-[var(--text-secondary)]">PhysiqueOS will use them together as your Cut Energy Strategy.</p></Card>}

        <div className="space-y-4">
          {plan.map((section) => (
            <PlanSection key={section.title} section={section} />
          ))}
        </div>
      </div>
    </main>
  );
}

function PlanSection({ section }) {
  const icon = PLAN_ICONS[section.iconKey] ?? Activity;
  if (section.supplements) return <Card className="space-y-3"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><IconBadge className="rounded-full" color={section.tone} icon={icon} size="sm"/><div><h2 className="text-base font-extrabold">{section.title}</h2><p className="text-xs font-semibold text-[var(--text-secondary)]">{section.subtitle}</p></div></div><Link className="inline-flex min-h-11 items-center text-xs font-extrabold text-[var(--primary)]" href="/profile/operating-plan/supplements/new">Add Supplement</Link></div><div className="space-y-2">{section.items.map((item)=><PlanRow item={item} key={item.id}/>)}</div></Card>;
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <IconBadge className="rounded-full" color={section.tone} icon={icon} size="sm" />
          <div>
            <h2 className="text-base font-extrabold text-[var(--text-primary)]">
              {section.title}
            </h2>
            <p className="text-xs font-semibold text-[var(--text-secondary)]">
              {section.subtitle}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {section.items.map((item) => (
          <PlanRow item={item} key={item.id} />
        ))}
      </div>
    </Card>
  );
}

function PlanRow({ item }) {
  const Wrapper = item.href ? Link : "div";
  const wrapperProps = item.href ? { href: item.href } : {};

  return (
    <Wrapper
      className="flex items-center justify-between gap-3 rounded-[12px] bg-[var(--surface-muted)] p-3"
      {...wrapperProps}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-extrabold text-[var(--text-primary)]">
          {item.title}
        </p>
        <p className="mt-0.5 truncate text-xs font-semibold text-[var(--text-secondary)]">
          {item.detail}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="rounded-full bg-[var(--surface-elevated)] px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.06em] text-[var(--text-muted)]">
          {item.status}
        </span>
        {item.href && <ChevronRight className="text-[var(--text-muted)]" size={16} />}
      </div>
    </Wrapper>
  );
}

export function buildOperatingPlan({ energyStrategy, executionItems, nutritionContext, protocols, reminders = [], trainingProtocol }) {
  return buildApplicationOperatingPlan({ energyStrategy, executionItems, nutritionContext, protocols, reminders, trainingProtocol });
}

const PLAN_ICONS = Object.freeze({ energy: Activity, nutrition: Salad, training: Dumbbell, recovery: Activity, peptide: Syringe, supplement: Dumbbell, tracking: Scale, coaching: MessageCircle });

export function isConcreteExecutionItem(item) {
  const id = String(item?.id ?? "");
  return ![
    "_commitment_nutrition_daily_",
    "_commitment_training_weekly_",
    "_commitment_activity_weekly_",
    "_commitment_energy_weekly_",
    "_commitment_briefings_weekly_",
  ].some((marker) => id.includes(marker));
}

export function deriveAuthoritativeRecurringExecutionItems({
  executionItems = [],
  protocols = [],
} = {}) {
  const activeProtocolIds = new Set(
    protocols
      .filter((protocol) => protocol.status === "active")
      .map((protocol) => protocol.id)
  );

  return executionItems.filter((item) => {
    if (item.active !== true || item.status && item.status !== "active") return false;
    if (!isConcreteExecutionItem(item)) return false;
    if (item.cadence?.type === "scheduled_date" || item.completedAt) return false;
    const protocolId = item.protocolRootId ?? item.linkedProtocolId;
    if (["supplement", "peptide", "protocol"].includes(item.type)) {
      return Boolean(protocolId) && activeProtocolIds.has(protocolId);
    }
    return !protocolId || activeProtocolIds.has(protocolId);
  }).sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

export function formatExecutionSchedule(item) { const schedule=item.preferredSchedule??{}; const time=formatExecutionTime(schedule.timeOfDay); if(item.cadence?.type==="daily")return schedule.timeOfDay==="morning"?"Every morning":joinSummary("Daily",time);if(item.cadence?.type==="scheduled_date")return schedule.date?joinSummary(new Date(`${schedule.date}T12:00:00`).toLocaleDateString("en-US",{month:"short",day:"numeric"}),time):"Not scheduled";if(schedule.daysOfWeek?.length)return joinSummary(formatDayRange(schedule.daysOfWeek),time || daypart(schedule.timeOfDay));return formatPersistence(item.cadence?.type)||"Not scheduled"; }
function formatExecutionTime(value){if(!value)return"";if(/^\d{2}:\d{2}$/.test(value)){const [hour,minute]=value.split(":").map(Number);return new Date(2000,0,1,hour,minute).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});}return formatPersistence(value);}
function formatDayRange(days){const names=days.map(formatPersistence);if(names.join(",").toLowerCase()==="sunday,monday,tuesday,wednesday,thursday")return"Sun–Thu";return names.length===1?names[0]:names.join(", ");}
function joinSummary(cadence,time){return [cadence,time].filter(Boolean).join(" · ");}
function daypart(value){return ["morning","afternoon","evening","night"].includes(value) ? value.toLowerCase() : "";}

export function buildEnergyStrategyPlanItem(link) {
  return buildApplicationEnergyStrategyPlanItem(link);
}

export function buildActivityPlanItem(version) {
  const daily = version?.expectations?.find((item) => item.cadence === "daily");
  const weekly = version?.evaluationWindows?.find((item) => item.cadence === "weekly");

  if (!daily || !weekly) {
    return {
      id: "activity-protocol-create",
      title: "Activity",
      detail: "Sustain the activity level supporting the cut",
      href: "/profile/operating-plan/activity/new",
      status: "Create Protocol",
    };
  }

  return {
    id: "activity-protocol-active",
    title: `Approximately ${Number(daily.target).toLocaleString("en-US")} active calories daily`,
    detail: `${Number(weekly.target).toLocaleString("en-US")} weekly trajectory`,
    href: null,
    status: "Active",
  };
}

export function buildTrainingPlanItem(version) {
  return buildApplicationTrainingPlanItem(version);
}

export function formatCalorieRange(nutritionContext) {
  const range = nutritionContext?.estimatedDailyCaloricIntake;

  if (nutritionContext?.calibrationStrategy) {
    const strategy = nutritionContext.calibrationStrategy;
    return strategy.proteinBasis === "body_weight" && Number(strategy.proteinRatio) === 1
      ? "1 g per lb of body weight · intake adjusted gradually"
      : "Intake adjusted gradually from weekly signals";
  }
  if (!range?.min || !range?.max) return "Range pending";

  return `${range.min}-${range.max} ${range.unit}`;
}

function formatPersistence(value) {
  return String(value || "")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

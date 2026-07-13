import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  ChevronRight,
  Dumbbell,
  Salad,
  Scale,
} from "lucide-react";
import Card from "../components/ui/Card";
import IconBadge from "../components/ui/IconBadge";
import OperatingPlanDrawer from "../components/operating-plan/OperatingPlanDrawer";

export default function OperatingPlanScreen({
  activityActivated = false,
  nutritionContext,
  protocols,
  trainingActivated = false,
  trainingProtocol,
  energyActivated = false,
  energyStrategy,
  executionItems = [],
}) {
  const plan = buildOperatingPlan({ energyStrategy, executionItems, nutritionContext, protocols, trainingProtocol });

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
  if (section.drawer) return <Card className="space-y-3"><div className="flex items-center gap-3"><IconBadge className="rounded-full" color={section.tone} icon={section.icon} size="sm"/><div><h2 className="text-base font-extrabold">{section.title}</h2><p className="text-xs font-semibold text-[var(--text-secondary)]">{section.subtitle}</p></div></div><OperatingPlanDrawer description={section.subtitle} preview={section.preview} title={section.title}>{section.items.map((item)=><PlanRow hideStatus item={item} key={item.id}/>)}</OperatingPlanDrawer></Card>;
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <IconBadge className="rounded-full" color={section.tone} icon={section.icon} size="sm" />
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

function PlanRow({ hideStatus = false, item }) {
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
        {!hideStatus && <span className="rounded-full bg-[var(--surface-elevated)] px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.06em] text-[var(--text-muted)]">
          {item.status}
        </span>}
        {item.href && <ChevronRight className="text-[var(--text-muted)]" size={16} />}
      </div>
    </Wrapper>
  );
}

export function buildOperatingPlan({ energyStrategy, executionItems, nutritionContext, protocols, trainingProtocol }) {
  const supplements = protocols.filter((protocol) => protocol.category === "supplement");

  return [
    {
      icon: Activity,
      title: "Energy Strategy",
      subtitle: energyStrategy ? "Active" : "Not configured",
      tone: "primary",
      items: [buildEnergyStrategyPlanItem(energyStrategy)],
    },
    {
      icon: Dumbbell,
      title: "Training",
      subtitle: trainingProtocol ? "Active protocol" : "Protocol not defined",
      tone: "effort",
      items: [buildTrainingPlanItem(trainingProtocol)],
    },
    { icon: Scale, title: "Execution", subtitle: `${executionItems.filter((item) => item.active).length} recurring commitments`, tone: "evidence", drawer: true, preview: executionItems.filter((item)=>item.active).slice(0,3).map((item)=>item.id==="execution_dexa"?"DEXA Scan":item.title).join("\n")+`\n+${Math.max(0,executionItems.filter((item)=>item.active).length-3)} more`, items: executionItems.filter((item) => item.active).map(buildExecutionPlanItem) },
    {
      icon: Dumbbell,
      title: "Supplements",
      subtitle: `${supplements.length} active protocols`,
      tone: "success",
      drawer: true,
      preview: supplements.slice(0,3).map((item)=>item.name).join("\n")+`\n+${Math.max(0,supplements.length-3)} more`,
      items: supplements.map((protocol) => ({
        id: protocol.id,
        title: protocol.name,
        detail: formatProtocolSchedule(protocol),
        href: `/profile/protocols/${protocol.id}?from=operating-plan`,
        status: formatPersistence(protocol.status),
      })),
    },
    {
      icon: Salad,
      title: "Nutrition",
      subtitle: "Manual context",
      tone: "primary",
      items: [
        {
          id: "nutrition-calorie-range",
          title: "Calorie Range",
          detail: formatCalorieRange(nutritionContext),
          href: "/progress/nutrition",
          status: "Context",
        },
        {
          id: "nutrition-hydration",
          title: "Hydration",
          detail: "Future expectation",
          href: null,
          status: "Future",
        },
      ],
    },
    { icon: Activity, title: "Recovery", subtitle: "Strategy coming soon", tone: "success", items: [{ id:"recovery-coming-soon", title:"Recovery", detail:"A dedicated recovery strategy will complete this layer", href:null, status:"Coming Soon" }] },
  ].filter((section) => section.items.length > 0).sort((a,b)=>["Energy Strategy","Nutrition","Training","Recovery","Execution","Supplements"].indexOf(a.title)-["Energy Strategy","Nutrition","Training","Recovery","Execution","Supplements"].indexOf(b.title));
}

function buildExecutionPlanItem(item) { return { id: item.id, title: item.id === "execution_dexa" ? "DEXA Scan" : item.title, detail: `${formatExecutionSchedule(item)} · ${formatExecutionSupport(item)}`, href: `/profile/operating-plan/execution/${item.id}`, status: "Execution" }; }
function formatExecutionSchedule(item) { const schedule=item.preferredSchedule??{}; const time=formatExecutionTime(schedule.timeOfDay); if(item.cadence?.type==="daily")return schedule.timeOfDay==="morning"?"Every morning":`Daily${time?` at ${time}`:""}`;if(item.cadence?.type==="scheduled_date")return schedule.date?`${new Date(`${schedule.date}T12:00:00`).toLocaleDateString("en-US",{month:"long",day:"numeric"})}${time?` at ${time}`:""}`:"Date pending";if(schedule.daysOfWeek?.length)return `${formatDayRange(schedule.daysOfWeek)}${time?(/^\d/.test(schedule.timeOfDay)?` at ${time}`:` ${time.toLowerCase()}`):""}`;return formatPersistence(item.cadence?.type); }
function formatExecutionTime(value){if(!value)return"";if(/^\d{2}:\d{2}$/.test(value)){const [hour,minute]=value.split(":").map(Number);return new Date(2000,0,1,hour,minute).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});}return formatPersistence(value);}
function formatDayRange(days){const names=days.map(formatPersistence);if(names.join(",").toLowerCase()==="sunday,monday,tuesday,wednesday,thursday")return"Sunday–Thursday";return names.length===1?names[0]:names.join(", ");}
function formatExecutionSupport(item) { const strategy=item.linkedStrategyIds?.[0]; if(strategy?.includes("energy"))return "Supports Energy Strategy";if(strategy?.includes("training"))return "Supports Training Strategy";if(strategy==="recovery")return "Supports Recovery";return "Supports Goal Progress"; }

export function buildEnergyStrategyPlanItem(link) {
  if (!link) return { id: "energy-strategy-create", title: "Energy Strategy", detail: "Activity and Nutrition work together to define the cut", href: "/profile/operating-plan/energy/new", status: "Build Strategy" };
  return { id: "energy-strategy-active", title: `${formatPersistence(link.selectedPace)} cut`, detail: "Activity and Nutrition linked", href: null, status: "Active" };
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
  const strategy = version?.trainingStrategy;
  if (!strategy) {
    return {
      id: "training-protocol-create",
      title: "Training",
      detail: "Define weekly frequency and progression strategy",
      href: "/profile/operating-plan/training/new",
      status: "Create Protocol",
    };
  }

  const weeklySessions = Object.values(strategy.weeklyFrequencies ?? {}).reduce((sum, value) => sum + Number(value), 0);
  return {
    id: "training-protocol-active",
    title: "Maintenance Training Strategy",
    detail: `${weeklySessions} weekly area sessions · ${formatPersistence(strategy.progression?.pace)} progression`,
    href: null,
    status: "Active",
  };
}

function formatProtocolSchedule(protocol) {
  const schedule = protocol.schedule ?? {};
  const time = schedule.timeOfDay ? formatPersistence(schedule.timeOfDay) : "Timing pending";
  const dose = protocol.dose?.value
    ? `${protocol.dose.value} ${protocol.dose.unit ?? protocol.doseUnit ?? ""}`.trim()
    : "Dose pending";

  return `${dose} / ${time}`;
}

function formatCalorieRange(nutritionContext) {
  const range = nutritionContext?.estimatedDailyCaloricIntake;

  if (!range?.min || !range?.max) return "Range pending";

  return `${range.min}-${range.max} ${range.unit}`;
}

function formatPersistence(value) {
  return String(value || "")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

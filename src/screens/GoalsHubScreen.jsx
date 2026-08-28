import Link from "next/link";
import {
  ArrowLeft,
  ChevronRight,
  Compass,
  Plus,
  Target,
  Trophy,
} from "lucide-react";
import Card from "../components/ui/Card";
import IconBadge from "../components/ui/IconBadge";
import { createInactiveLegacyWebContext } from "../application/auth/legacyWebContext";
import { getProductionApplicationComposition } from "../application/composition/productionApplicationComposition";
import {
  createGoalsHubReadService,
  mapGoalSummary as mapApplicationGoalSummary,
} from "../application/goals/GoalsHubReadService";

const VISIBLE_ABS_GOAL_ID = "goal_visible_abs_at_rest";

export default async function GoalsHubScreen({ from } = {}) {
  const hub = await getGoalsHub();
  const fromYou = from === "you";

  return (
    <main className="app-surface min-h-screen overflow-x-hidden">
      <div className="mx-auto max-w-[393px] px-4 pb-12 pt-10">
        <Link
          className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-500"
          href={fromYou ? "/profile" : "/"}
        >
          <ArrowLeft size={18} />
          {fromYou ? "You" : "Home"}
        </Link>

        <section className="mb-6 space-y-2">
          <h1 className="text-3xl font-extrabold leading-tight text-slate-950">
            Your Goals
          </h1>
          <p className="text-sm font-medium leading-6 text-slate-600">
            Every goal is continuously evaluated using the best available
            evidence.
          </p>
        </section>

        <div className="space-y-6">
          <ActiveGoals from={from} goals={hub.activeGoals} />
          <CompletedGoals from={from} goals={hub.completedGoals} />
          <AddGoalEntry transitionEntry={hub.transitionEntry} />
        </div>
      </div>
    </main>
  );
}

export async function getGoalsHub() {
  const composition = await getProductionApplicationComposition();
  const { principal } = await createInactiveLegacyWebContext({ repositories: composition.repositories });
  const hub = await createGoalsHubReadService({ repositories: composition.repositories, readRuntimeStore: composition.readRuntimeStore ?? (() => composition.runtime) }).getGoalsHub({ principal });
  for (const goal of hub.activeGoals.filter((item) => !item.navigation.available)) {
    console.warn("[GoalNavigation] Goal detail route unavailable.", { goalId: goal.id ?? null, goalType: goal.goalType ?? null, lifecycle: goal.lifecycleState ?? goal.status ?? null, resolverCode: goal.navigation.code });
  }
  return { ...hub, activeGoals: hub.activeGoals.map(withWebGoalVisual) };
}

function ActiveGoals({ from, goals }) {
  const primaryGoal = goals.find((goal) => goal.primary);

  return (
    <>
      {primaryGoal && (
        <section className="space-y-3">
          <SectionHeading title="Primary Goal" />
          <GoalNavigationCard from={from} goal={primaryGoal} primary />
        </section>
      )}

    </>
  );
}

function CompletedGoals({ from, goals }) {
  if (goals.length === 0) return null;
  return <section className="space-y-3"><SectionHeading title="Completed Goals"/><div className="space-y-2">{goals.map((goal)=><Link aria-label={`Open completed goal ${goal.title}`} className="group block min-h-11 rounded-[22px] border border-amber-200/80 bg-gradient-to-br from-amber-50/90 via-[var(--surface-elevated)] to-emerald-50/60 p-4 shadow-[0_18px_42px_-34px_rgba(180,83,9,.55)] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] dark:border-amber-300/15 dark:from-amber-300/[.08] dark:to-emerald-300/[.04]" href={withReturnContext(goal.href, from)} key={goal.id}><div className="flex min-w-0 items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-300/10 dark:text-amber-300"><Trophy aria-hidden size={19}/></span><div className="min-w-0 flex-1"><p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-amber-700 dark:text-amber-300">Completed Goal</p><h2 className="mt-1 text-lg font-extrabold leading-tight text-[var(--text-primary)]">{goal.title}</h2><p className="mt-2 text-sm font-bold leading-5 text-[var(--text-secondary)]"><span>{goal.status}</span><span aria-hidden> · </span><span>{goal.dates}</span></p><p className="mt-1 text-sm font-extrabold text-emerald-700 dark:text-emerald-300">{goal.achievement}</p></div><ChevronRight aria-hidden className="mt-5 shrink-0 text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5" size={20}/></div></Link>)}</div></section>;
}

export function GoalNavigationCard({ from, goal, primary = false }) {
  const className = `group block min-h-11 rounded-[22px] border p-4 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F46E5] ${
    primary
      ? "border-violet-200 bg-gradient-to-br from-violet-50/90 via-[var(--surface-elevated)] to-emerald-50/60 shadow-[0_18px_42px_-34px_rgba(79,70,229,.8)] dark:border-violet-300/20 dark:from-violet-300/[.08] dark:to-emerald-300/[.04]"
      : "border-[var(--divider)] bg-[var(--surface-elevated)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)]"
  }`;

  if (!goal.navigation.available) {
    return (
      <article
        className={className}
        data-navigation-code={goal.navigation.code}
        data-navigation-unavailable="true"
      >
        <GoalNavigationCardContent goal={goal} primary={primary} showChevron={false} />
      </article>
    );
  }

  return (
    <Link
      aria-label={`Open ${goal.title}`}
      className={className}
      href={withReturnContext(goal.navigation.href, from)}
    >
      <GoalNavigationCardContent goal={goal} primary={primary} />
    </Link>
  );
}

function GoalNavigationCardContent({ goal, primary, showChevron = true }) {
  return (
    <div className="flex items-start gap-3">
        <IconBadge
          className="mt-0.5 shrink-0 rounded-full"
          color={goal.color}
          icon={goal.icon}
          size={primary ? "md" : "sm"}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#4F46E5]">
            {primary ? "Primary Goal" : "Supporting Goal"}
          </p>
          <h2
            className={`${primary ? "text-xl" : "text-lg"} mt-1 font-extrabold leading-tight text-slate-950`}
          >
            {goal.title}
          </h2>
          <p className="mt-2 text-sm font-bold leading-5 text-slate-600">
            <span>{goal.statusLabel}</span>
            <span aria-hidden="true"> • </span>
            <span className="tabular-nums text-slate-500">
              {formatConfidence(goal.confidence)}
            </span>
          </p>
          {goal.phase && (
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
              {goal.phase.name} · {goal.phase.reviewState === "due" ? "Review due" : `Planned review ${formatDate(goal.phase.plannedReviewAt)}`}
            </p>
          )}
        </div>
        {showChevron && (
          <ChevronRight
            aria-hidden="true"
            className="mt-5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5"
            size={20}
          />
        )}
    </div>
  );
}

function AddGoalEntry({ transitionEntry }) {
  if (!transitionEntry) {
    return (
      <Card className="border-dashed border-[#C7D2FE] bg-[#F8FAFF]">
        <div className="flex items-center gap-3">
          <IconBadge className="rounded-full" color="primary" icon={Plus} size="md" />
          <div>
            <h2 className="text-base font-extrabold text-slate-950">Add Goal</h2>
            <p className="mt-1 text-sm font-medium leading-5 text-slate-600">
              A new primary goal is not available right now.
            </p>
          </div>
        </div>
      </Card>
    );
  }
  return (
    <Card className="border-dashed border-[#C7D2FE] bg-[#F8FAFF]">
      <div className="flex items-center gap-3">
        <IconBadge className="rounded-full" color="primary" icon={Plus} size="md" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-extrabold text-slate-950">Add Goal</h2>
          <p className="mt-1 text-sm font-medium leading-5 text-slate-600">
            {transitionEntry.copy}
          </p>
        </div>
      </div>
      <Link
        className="mt-4 flex min-h-12 w-full items-center justify-between rounded-[14px] bg-[var(--primary)] px-4 text-sm font-extrabold text-white shadow-[0_12px_28px_rgba(79,70,229,0.18)] transition hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
        href={transitionEntry.href}
      >
        {transitionEntry.label}
        <ChevronRight aria-hidden="true" size={19} />
      </Link>
    </Card>
  );
}

function SectionHeading({ title }) {
  return (
    <h2 className="text-lg font-extrabold leading-tight text-slate-950">
      {title}
    </h2>
  );
}

export function mapGoalSummary(summary, evaluation, sourceGoal, canonicalConfidence) {
  return withWebGoalVisual(mapApplicationGoalSummary(summary, evaluation, sourceGoal, canonicalConfidence));
}

function withWebGoalVisual(goal) {
  const visual = getVisualIdentity(goal);
  return { ...goal, icon: visual.icon, color: visual.color };
}

function formatConfidence(confidence) {
  if (!Number.isFinite(confidence?.value)) return "Confidence unavailable";
  return `${confidence.value}% confidence`;
}

function formatDate(value) {
  if (!value) return "not scheduled";
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T12:00:00Z`));
}

function getVisualIdentity(goal) {
  if (goal.id === VISIBLE_ABS_GOAL_ID) {
    return { icon: Target, color: "primary" };
  }

  return { icon: Compass, color: "evidence" };
}

function withReturnContext(href, from) {
  if (!href || from !== "you") return href;

  return `${href}?from=you`;
}

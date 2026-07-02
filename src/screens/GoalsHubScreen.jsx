import Link from "next/link";
import {
  ArrowLeft,
  Compass,
  Dumbbell,
  Plus,
  ShieldCheck,
  Target,
} from "lucide-react";
import Card from "../components/ui/Card";
import EditGoalButton from "../components/goals/EditGoalButton";
import IconBadge from "../components/ui/IconBadge";
import ProgressBar from "../components/ui/ProgressBar";
import { FounderRepositories } from "../data/repositories/founderRepositories";
import { GoalEvaluationService } from "../domain/services/GoalEvaluationService";
import { GoalIntelligenceService } from "../domain/services/GoalIntelligenceService";

const VISIBLE_ABS_GOAL_ID = "goal_visible_abs_at_rest";

export default async function GoalsHubScreen({ from } = {}) {
  const hub = await getGoalsHub();
  const fromYou = from === "you";

  return (
    <main className="app-surface min-h-screen">
      <div className="mx-auto max-w-[393px] px-4 pt-10 pb-12">
        <Link
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-500"
          href={fromYou ? "/profile" : "/"}
        >
          <ArrowLeft size={18} />
          {fromYou ? "You" : "Home"}
        </Link>

        <section className="mb-5 space-y-2">
          <h1 className="text-3xl font-extrabold leading-tight text-slate-950">
            Your Goals
          </h1>
          <p className="text-sm font-medium leading-6 text-slate-600">
            Every goal is continuously evaluated using the best available
            evidence.
          </p>
        </section>

        <div className="space-y-4">
          <ActiveGoals from={from} goals={hub.activeGoals} />
          <GoalRelationships relationships={hub.relationships} />
          <CompletedGoals goals={hub.completedGoals} />
          <FutureGoals goals={hub.futureGoals} />
          <AddGoalEntry />
        </div>
      </div>
    </main>
  );
}

async function getGoalsHub() {
  const user = await FounderRepositories.users.getCurrentUser();
  const userId = user?.id;
  const [
    goals,
    activeGoal,
    dexaScans,
    weightEntries,
    progressPhotos,
    protocols,
    nutritionContext,
  ] = await Promise.all([
    FounderRepositories.goals.listGoals(userId),
    FounderRepositories.goals.getActiveGoal(userId),
    FounderRepositories.dexaScans.listDEXAScans(userId),
    FounderRepositories.weights.listWeightEntries(userId),
    FounderRepositories.progressPhotos.listPhotos(userId),
    FounderRepositories.protocols.listActiveProtocols(userId),
    FounderRepositories.nutritionContext.getNutritionContext(userId),
  ]);
  const evaluations = GoalEvaluationService.getGoalEvaluations({
    goals,
    dexaScans,
    weightEntries,
    progressPhotos,
    protocols,
    nutritionContext,
  });
  const intelligence = GoalIntelligenceService.getGoalIntelligence({
    evaluations,
    activeGoal,
  });
  const summaries = intelligence.goals.map((summary) =>
    mapGoalSummary(summary, evaluations.find((item) => item.goalId === summary.id))
  );

  return {
    activeGoals: summaries.filter((goal) => goal.status === "active"),
    completedGoals: [
      "Lose 25 lb",
      "Reach 12% Body Fat",
    ],
    futureGoals: [
      "Build Lean Mass",
      "Improve VO2 Max",
      "Complete First Triathlon",
    ],
    relationships: getRelationships(summaries),
  };
}

function ActiveGoals({ from, goals }) {
  return (
    <section className="space-y-3">
      <SectionHeading title="Active Goals" />
      <div className="space-y-3">
        {goals.map((goal) => (
          <GoalPreviewCard from={from} goal={goal} key={goal.id} />
        ))}
      </div>
    </section>
  );
}

function GoalPreviewCard({ from, goal }) {
  const GoalContentLink = goal.href ? Link : "div";
  const linkProps = goal.href
    ? { href: withReturnContext(goal.href, from), "aria-label": `Open ${goal.title}` }
    : {};

  return (
    <Card className="space-y-3 transition hover:border-[var(--border-strong)] hover:bg-[color-mix(in_srgb,var(--surface-muted)_72%,var(--surface-elevated))]">
      <div className="flex items-start gap-3">
        <GoalContentLink
          className="flex min-w-0 flex-1 items-start justify-between gap-3 rounded-[12px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F46E5]"
          {...linkProps}
        >
          <div className="flex min-w-0 items-start gap-3">
            <IconBadge
              className="rounded-full"
              color={goal.color}
              icon={goal.icon}
              size="md"
            />
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#4F46E5]">
                {goal.primary ? "Primary Goal" : "Supporting Goal"}
              </p>
              <h2 className="mt-1 text-lg font-extrabold leading-tight text-slate-950">
                {goal.title}
              </h2>
              <p className="mt-1 text-sm font-medium leading-5 text-slate-600">
                {goal.description}
              </p>
            </div>
          </div>
          <div className="min-w-[70px] text-right">
            <p className="text-sm font-extrabold text-slate-950">{goal.statusLabel}</p>
            <p className="mt-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
              {goal.confidenceLabel}
            </p>
          </div>
        </GoalContentLink>

        <EditGoalButton goalTitle={goal.title} />
      </div>

      {goal.richness === "progress" ? (
        <GoalContentLink className="block space-y-2 rounded-[12px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F46E5]" {...linkProps}>
          <ProgressBar color={goal.progressColor} label={`${goal.title} progress`} value={goal.progress} />
          <div className="flex justify-between text-xs font-bold text-slate-500">
            <span>{goal.estimatedCompletion}</span>
            <span style={{ color: goal.progressColor }}>{goal.progress}%</span>
          </div>
        </GoalContentLink>
      ) : (
        <GoalContentLink className="block rounded-[12px] bg-[var(--surface-muted)] p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F46E5]" {...linkProps}>
          <p className="text-sm font-extrabold text-slate-950">
            {goal.presentation.status}
          </p>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
            {goal.presentation.detail}
          </p>
        </GoalContentLink>
      )}
    </Card>
  );
}

function GoalRelationships({ relationships }) {
  return (
    <Card className="space-y-3">
      <SectionHeading title="Goal Relationships" />
      {relationships.map((relationship) => (
        <div key={relationship.parent.id} className="rounded-[14px] bg-[var(--surface-muted)] p-3">
          <div className="flex items-center gap-2">
            <IconBadge className="rounded-full" color="primary" icon={Target} size="sm" />
            <div>
              <p className="text-sm font-extrabold text-slate-950">
                {relationship.parent.title}
              </p>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">
                Supported by
              </p>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {relationship.supporting.map((goal) => (
              <div key={goal.id} className="flex items-center gap-2 rounded-[12px] bg-[var(--surface-elevated)] p-2">
                <IconBadge className="rounded-full" color={goal.color} icon={goal.icon} size="xs" />
                <span className="text-sm font-bold text-slate-800">{goal.title}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </Card>
  );
}

function CompletedGoals({ goals }) {
  return (
    <Card className="space-y-3">
      <SectionHeading title="Completed Goals" />
      <div className="space-y-2">
        {goals.map((goal) => (
          <p key={goal} className="rounded-[12px] bg-[#ECFDF3] p-3 text-sm font-bold text-[#15803D]">
            ✓ {goal}
          </p>
        ))}
      </div>
    </Card>
  );
}

function FutureGoals({ goals }) {
  return (
    <Card className="space-y-3">
      <SectionHeading title="Future Goals" />
      <div className="space-y-2">
        {goals.map((goal) => (
          <p key={goal} className="rounded-[12px] bg-[var(--surface-muted)] p-3 text-sm font-bold text-slate-700">
            {goal}
          </p>
        ))}
      </div>
    </Card>
  );
}

function AddGoalEntry() {
  return (
    <Card className="border-dashed border-[#C7D2FE] bg-[#F8FAFF]">
      <div className="flex items-center gap-3">
        <IconBadge className="rounded-full" color="primary" icon={Plus} size="md" />
        <div>
          <h2 className="text-base font-extrabold text-slate-950">Add Goal</h2>
          <p className="mt-1 text-sm font-medium leading-5 text-slate-600">
            Future flow: start with what you are trying to accomplish.
          </p>
        </div>
      </div>
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

function mapGoalSummary(summary, evaluation) {
  const visual = getVisualIdentity(summary);

  return {
    ...summary,
    status: "active",
    title: normalizeGoalTitle(summary.title),
    description: getGoalDescription(summary.id),
    confidenceLabel: `${summary.confidence ?? evaluation?.confidence ?? 0}% confidence`,
    estimatedCompletion:
      summary.id === VISIBLE_ABS_GOAL_ID
        ? evaluation?.projection?.daysRemaining ?? "Estimate pending"
        : "Status-based",
    href: getGoalHref(summary.id),
    richness: summary.primary ? "progress" : "status",
    statusLabel: summary.primary
      ? "On Track"
      : summary.presentation?.status ?? summary.current,
    icon: visual.icon,
    color: visual.color,
    progressColor: visual.progressColor,
  };
}

function getGoalHref(goalId) {
  if (goalId === VISIBLE_ABS_GOAL_ID) return "/goals/visible-abs";
  if (goalId === "goal_maintain_8_9_body_fat") return "/goals/maintenance";
  if (goalId === "goal_preserve_lean_mass") return "/goals/lean-mass";

  return null;
}

function getGoalDescription(goalId) {
  if (goalId === VISIBLE_ABS_GOAL_ID) {
    return "Achieve visible abs at rest while preserving lean mass.";
  }

  if (goalId === "goal_maintain_8_9_body_fat") {
    return "Enter and sustain the target body-fat range.";
  }

  if (goalId === "goal_preserve_lean_mass") {
    return "Protect muscle while finishing the cut.";
  }

  return "Continuously evaluated from available evidence.";
}

function getRelationships(goals) {
  const primary = goals.find((goal) => goal.id === VISIBLE_ABS_GOAL_ID);
  const supporting = goals.filter((goal) => goal.id !== VISIBLE_ABS_GOAL_ID);

  if (!primary || supporting.length === 0) return [];

  return [{ parent: primary, supporting }];
}

function getVisualIdentity(goal) {
  if (goal.id === VISIBLE_ABS_GOAL_ID) {
    return { icon: Target, color: "primary", progressColor: "#4F46E5" };
  }

  if (goal.id === "goal_maintain_8_9_body_fat") {
    return { icon: ShieldCheck, color: "success", progressColor: "#16A34A" };
  }

  if (goal.id === "goal_preserve_lean_mass") {
    return { icon: Dumbbell, color: "effort", progressColor: "#F59E0B" };
  }

  return { icon: Compass, color: "evidence", progressColor: "#0EA5E9" };
}

function normalizeGoalTitle(title) {
  if (title === "Visible Abs") return "Visible Abs at Rest";
  if (title === "Maintenance") return "Maintain 8-9%";
  if (title === "Lean Mass") return "Preserve Lean Mass";

  return title;
}

function withReturnContext(href, from) {
  if (from !== "you") return href;

  return `${href}?from=you`;
}

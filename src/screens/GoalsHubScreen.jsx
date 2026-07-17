import Link from "next/link";
import {
  ArrowLeft,
  ChevronRight,
  Compass,
  Dumbbell,
  Plus,
  ShieldCheck,
  Target,
} from "lucide-react";
import Card from "../components/ui/Card";
import IconBadge from "../components/ui/IconBadge";
import { FounderRepositories } from "../data/repositories/founderRepositories";
import { GoalEvaluationService } from "../domain/services/GoalEvaluationService";
import { GoalIntelligenceService } from "../domain/services/GoalIntelligenceService";
import { createTrainingPerformanceIntelligenceReport } from "../domain/services/TrainingPerformanceIntelligenceService";

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
          <GoalRelationships relationships={hub.relationships} />
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
    analyses,
    canonicalEvidence,
  ] = await Promise.all([
    FounderRepositories.goals.listGoals(userId),
    FounderRepositories.goals.getActiveGoal(userId),
    FounderRepositories.dexaScans.listDEXAScans(userId),
    FounderRepositories.weights.listWeightEntries(userId),
    FounderRepositories.progressPhotos.listPhotos(userId),
    FounderRepositories.protocols.listActiveProtocols(userId),
    FounderRepositories.nutritionContext.getNutritionContext(userId),
    FounderRepositories.analyses.listAnalyses(),
    FounderRepositories.canonicalEvidence.listCanonicalEvidenceObjects(userId),
  ]);
  const trainingPerformance = createTrainingPerformanceIntelligenceReport({
    canonicalObjects: canonicalEvidence,
  });
  const evaluations = GoalEvaluationService.getGoalEvaluations({
    goals,
    dexaScans,
    weightEntries,
    progressPhotos,
    protocols,
    nutritionContext,
    photoAnalyses: analyses,
    trainingPerformance,
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
    relationships: getRelationships(summaries),
  };
}

function ActiveGoals({ from, goals }) {
  const primaryGoal = goals.find((goal) => goal.primary);
  const supportingGoals = goals.filter((goal) => !goal.primary);

  return (
    <>
      {primaryGoal && (
        <section className="space-y-3">
          <SectionHeading title="Primary Goal" />
          <GoalNavigationCard from={from} goal={primaryGoal} primary />
        </section>
      )}

      {supportingGoals.length > 0 && (
        <section className="space-y-3">
          <SectionHeading title="Supporting Goals" />
          <div className="space-y-2">
            {supportingGoals.map((goal) => (
              <GoalNavigationCard from={from} goal={goal} key={goal.id} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function GoalNavigationCard({ from, goal, primary = false }) {
  return (
    <Link
      aria-label={`Open ${goal.title}`}
      className={`group block min-h-11 rounded-[22px] border p-4 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F46E5] ${
        primary
          ? "border-violet-200 bg-gradient-to-br from-violet-50/90 via-[var(--surface-elevated)] to-emerald-50/60 shadow-[0_18px_42px_-34px_rgba(79,70,229,.8)] dark:border-violet-300/20 dark:from-violet-300/[.08] dark:to-emerald-300/[.04]"
          : "border-[var(--divider)] bg-[var(--surface-elevated)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-muted)]"
      }`}
      href={withReturnContext(goal.href, from)}
    >
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
              {goal.confidence}% confidence
            </span>
          </p>
        </div>
        <ChevronRight
          aria-hidden="true"
          className="mt-5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5"
          size={20}
        />
      </div>
    </Link>
  );
}

function GoalRelationships({ relationships }) {
  return (
    <section className="space-y-3 rounded-[22px] border border-[var(--divider)] bg-[var(--surface-elevated)] p-4">
      <SectionHeading title="Goal Relationships" />
      {relationships.map((relationship) => (
        <div key={relationship.parent.id}>
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
          <div className="ml-4 mt-3 space-y-2 border-l border-[var(--divider)] pl-4">
            {relationship.supporting.map((goal) => (
              <div className="flex items-center gap-2 py-1" key={goal.id}>
                <IconBadge
                  className="rounded-full"
                  color={goal.color}
                  icon={goal.icon}
                  size="xs"
                />
                <span className="text-sm font-bold text-slate-800">{goal.title}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
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
            Start with what you are trying to accomplish.
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
    confidence: summary.confidence ?? evaluation?.confidence ?? 0,
    href: getGoalHref(summary.id),
    statusLabel: normalizeJourneyState(
      summary.primary
        ? evaluation?.projection?.completionStageLabel ?? "On Track"
        : summary.presentation?.status ?? summary.current
    ),
    icon: visual.icon,
    color: visual.color,
  };
}

function getGoalHref(goalId) {
  if (goalId === VISIBLE_ABS_GOAL_ID) return "/goals/visible-abs";
  if (goalId === "goal_maintain_8_9_body_fat") return "/goals/maintenance";
  if (goalId === "goal_preserve_lean_mass") return "/goals/lean-mass";

  return null;
}

function getRelationships(goals) {
  const primary = goals.find((goal) => goal.id === VISIBLE_ABS_GOAL_ID);
  const supporting = goals.filter((goal) => goal.id !== VISIBLE_ABS_GOAL_ID);

  if (!primary || supporting.length === 0) return [];

  return [{ parent: primary, supporting }];
}

function getVisualIdentity(goal) {
  if (goal.id === VISIBLE_ABS_GOAL_ID) {
    return { icon: Target, color: "primary" };
  }

  if (goal.id === "goal_maintain_8_9_body_fat") {
    return { icon: ShieldCheck, color: "success" };
  }

  if (goal.id === "goal_preserve_lean_mass") {
    return { icon: Dumbbell, color: "effort" };
  }

  return { icon: Compass, color: "evidence" };
}

function normalizeGoalTitle(title) {
  if (title === "Visible Abs") return "Visible Abs at Rest";
  if (title === "Maintenance") return "Maintain 8-9%";
  if (title === "Lean Mass") return "Preserve Lean Mass";

  return title;
}

function normalizeJourneyState(state) {
  const approvedLabels = {
    "Visual confirmation developing": "Visual Confirmation Developing",
    "Entering target range": "Entering Target Range",
    "Entering Target Range": "Entering Target Range",
    Stable: "Stable",
    "Final Stage": "Final Stage",
  };

  return approvedLabels[state] ?? state;
}

function withReturnContext(href, from) {
  if (from !== "you") return href;

  return `${href}?from=you`;
}

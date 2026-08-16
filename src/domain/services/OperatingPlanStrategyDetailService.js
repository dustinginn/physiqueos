import { formatGoalStartDate } from "../utils/goalStartDate";
import { nutritionStrategy } from "./StrategyEditorService";
import { resolveCoachingUpdatesReadModel } from "./CoachingUpdatesReadService";

export function createOperatingPlanStrategyDetailService({ repositories }) {
  return {
    async getDetail({ strategyId, strategyType, userId }) {
      const [protocols, goals, nutritionContext] = await Promise.all([
        repositories.protocols.listProtocols(userId),
        repositories.goals.listGoals(userId),
        repositories.nutritionContext.getNutritionContext(userId),
      ]);
      const protocol = protocols.find((item) =>
        item.id === strategyId &&
        item.userId === userId &&
        item.status === "active" &&
        (item.protocolType === strategyType || item.category === strategyType)
      );
      if (!protocol) return null;
      const version = protocol.currentVersionId
        ? await repositories.protocolVersions.getVersionById(protocol.currentVersionId)
        : null;
      return composeOperatingPlanStrategyDetail({
        goals, nutritionContext, protocol, strategyType, version,
      });
    },
  };
}

export function composeOperatingPlanStrategyDetail({ goals = [], nutritionContext, protocol, strategyType, version }) {
  if (!protocol || !["briefings", "energy", "nutrition", "training"].includes(strategyType)) return null;
  const strategy = strategyType === "nutrition"
    ? nutritionStrategy(protocol, version)
    : protocol.effectiveStrategy ?? nutritionContext?.calibrationStrategy ?? {};
  const goalId = protocol.currentGoalIds?.[0] ?? protocol.relatedGoalIds?.[0] ?? version?.goalLinks?.[0]?.goalId;
  const goal = goals.find((item) => item.id === goalId);
  const currentPhase = goal?.phases?.find((item) => item.id ===
    (goal.currentPhaseId ?? goal.timeline?.currentPhaseId)) ?? null;
  const coachingUpdates = strategyType === "briefings"
    ? resolveCoachingUpdatesReadModel({
      protocol,
      version: version ?? {
        id: `${protocol.id}_legacy`,
        protocolId: protocol.id,
        effectiveAt: goal?.timeline?.startDate ?? "",
        change: { reviewedChanges: protocol.effectiveStrategy },
      },
      goal,
    })
    : null;
  const common = {
    goal: goal?.title ? `Your ${goalLabel(goal.title)}` : null,
    startedDate: formatGoalStartDate(version?.effectiveAt ?? protocol.activatedAt ?? goal?.timeline?.startDate),
    status: "Active",
    editHref: ["briefings", "nutrition", "training"].includes(strategyType)
      ? `${getOperatingPlanStrategyHref(strategyType, protocol.id)}/edit`
      : null,
    editLabel: strategyType === "briefings" ? "Edit Coaching Updates" : "Edit Strategy",
  };
  if (strategyType === "energy") return {
    ...common,
    eyebrow: "Energy Strategy",
    title: strategy.mode ?? protocol.name,
    purpose: strategy.mode === "Phase Execution"
      ? `Apply the user-authorized intake and activity targets for the current Goal phase while monitoring response and Guardrails.`
      : `Set caloric intake and activity together so energy availability can be calibrated for ${goalReference(goal)}.`,
    sections: [
      field("Current Energy Phase", energyPhase(strategy.mode)),
      field("Caloric Intake", targetLabel(strategy.caloricIntakeTarget) ?? label(strategy.calorieStrategy)),
      field("Activity Target", targetLabel(strategy.activityExpenditureTarget) ?? label(strategy.activityStrategy)),
      ...(strategy.mode === "Phase Execution" ? [
        field("Evidence Monitoring", monitoringCadence(strategy)),
        field("Strategic Review", strategicReviewCadence(strategy)),
        field("Strategy Changes", "User authorized"),
      ] : [field("Calibration Approach", calibrationApproach(strategy))]),
    ],
  };
  if (strategyType === "nutrition") return {
    ...common,
    eyebrow: "Nutrition Strategy",
    title: "Macro Strategy",
    purpose: `Define how daily intake is composed across protein, carbohydrates, and fats to support ${goalReference(goal)}.`,
    sections: [
      field("Protein Target", proteinRule(strategy)),
      field("Carbohydrate Approach", label(strategy.carbohydrateStrategy)),
      field("Fat Approach", label(strategy.fatStrategy)),
      field("Macro Philosophy", macroPhilosophy(strategy)),
    ],
  };
  if (strategyType === "briefings") return {
    ...common,
    eyebrow: "Coaching Updates",
    title: "Wednesday and Sunday Coaching",
    purpose: "Turn current evidence into timely coaching without returning to routine daily briefings.",
    sections: [
      field("Midweek Calibration", cadenceSurface(coachingUpdates?.midweek)),
      field("Weekly Synthesis", cadenceSurface(coachingUpdates?.weekly)),
      field("Routine Daily Briefings", coachingUpdates?.daily?.enabled ? "On" : "Off"),
      field("Notifications", notificationLabel(coachingUpdates?.notificationPreference)),
      field("Event Briefings", "Photo and DEXA remain active when eligible"),
    ],
  };
  const training = version?.trainingStrategy;
  if (!training) return null;
  const weekly = Object.values(training.weeklyFrequencies ?? {}).reduce((sum, value) => sum + Number(value || 0), 0);
  return {
    ...common,
    eyebrow: "Training Strategy",
    title: goal?.title ? `${goal.title} Training` : "Current Training Strategy",
    purpose: `Build the weekly structure, training focus, and progression needed to support ${goalReference(goal)}.`,
    sections: [
      field("Weekly Structure", weekly ? `${weekly} area sessions` : null),
      field("Training Focus", list(training.physiquePriorities)),
      field("Progression", label(training.progression?.pace)),
      field("Current Goal Phase", currentPhase?.name ?? null),
      field("Training Context", "Goal-level strategy"),
    ].filter(Boolean),
  };
}

export function getOperatingPlanStrategyHref(strategyType, strategyId) {
  return strategyId
    ? `/profile/operating-plan/strategy/${strategyType}/${encodeURIComponent(strategyId)}`
    : null;
}

function field(labelText, value) { return value ? { label: labelText, value } : null; }
function list(values) { return values?.length ? values.map(label).join(", ") : null; }
function label(value) { return value ? String(value).replace(/[_-]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : null; }
function goalLabel(title) {
  const value = String(title ?? "").trim().replace(/\s+goal$/i, "");
  return value ? `${value} goal` : "current goal";
}
function goalReference(goal) {
  return goal?.title ? `your ${goalLabel(goal.title)}` : "your current strategy";
}
function energyPhase(mode) {
  const value = String(mode ?? "").toLowerCase();
  const phases = new Map([["cut", "Cut"], ["cutting", "Cut"], ["bulk", "Bulk"],
    ["bulking", "Bulk"], ["gain", "Bulk"], ["maintenance", "Maintain"],
    ["maintain", "Maintain"], ["maintenance calibration", "Maintain"],
    ["phase execution", "Phase execution"]]);
  if (phases.has(value)) return phases.get(value);
  return label(mode);
}
function calibrationApproach(strategy) {
  const cadence = label(strategy.evaluationCadence);
  const adjustment = strategy.adjustmentSize ? `${label(strategy.adjustmentSize)} adjustments` :
    strategy.adjustmentMethod ? label(strategy.adjustmentMethod) : null;
  return [cadence, adjustment].filter(Boolean).join(" \u00B7 ") || null;
}
function targetLabel(value){return Number.isFinite(Number(value?.value))?`${Number(value.value).toLocaleString("en-US")} ${value.unit}`:null}
function monitoringCadence(strategy) {
  const cadence = label(strategy.monitoringCadence ?? "weekly");
  return cadence ? `${cadence} evidence review` : null;
}
function strategicReviewCadence(strategy) {
  const cadence = label(strategy.strategicReviewCadence ?? strategy.evaluationCadence);
  const anchor = strategy.strategicReviewAnchor === "dexa_body_composition"
    ? "DEXA and body composition aligned" : label(strategy.strategicReviewAnchor);
  return [cadence, anchor].filter(Boolean).join(" · ") || null;
}

function macroPhilosophy(strategy) {
  if (strategy.trainingDayFlexibility && strategy.restDayFlexibility) {
    return "Flexible across training and rest days";
  }
  if (strategy.trainingDayFlexibility) return "Flexible on training days";
  if (strategy.restDayFlexibility) return "Flexible on rest days";
  return "Consistent daily macro structure";
}
function proteinRule(strategy) {
  if (strategy.proteinBasis === "body_weight" && Number(strategy.proteinRatio) === 1) {
    return "1 g per lb of body weight";
  }
  return Number.isFinite(Number(strategy.proteinTarget))
    ? `${Number(strategy.proteinTarget)} g protein`
    : null;
}
function cadenceSurface(surface) {
  if (!surface?.enabled) return "Off";
  const day = label(surface.day);
  if (!surface.localTime || surface.localTime === "00:00") return day;
  const [hour, minute] = surface.localTime.split(":").map(Number);
  return `${day} · ${new Date(2000, 0, 1, hour, minute).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}
function notificationLabel(preference) {
  return preference === "notify_when_ready"
    ? "Notify when ready"
    : "Available without notification";
}

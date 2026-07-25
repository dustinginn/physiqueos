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
        ? await repositories.protocolVersions.getCurrentVersion(protocol.id)
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
    goal: goal?.title ?? null,
    startedDate: formatGoalStartDate(goal?.timeline?.startDate),
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
    purpose: "Coordinate intake and activity while maintenance is calibrated.",
    sections: [
      field("Current Approach", label(strategy.mode)),
      field("Intake Approach", label(strategy.calorieStrategy)),
      field("Activity Approach", label(strategy.activityStrategy)),
      field("Weekly Calibration", label(strategy.evaluationCadence)),
    ],
  };
  if (strategyType === "nutrition") return {
    ...common,
    eyebrow: "Nutrition Strategy",
    title: "Maintenance Calibration Nutrition",
    purpose: "Support the current Goal while intake is adjusted gradually.",
    sections: [
      field("Daily Target", proteinRule(strategy)),
      field("Intake Approach", label(strategy.calorieStrategy)),
      field("Carbohydrate Approach", label(strategy.carbohydrateStrategy)),
      field("Fat Approach", label(strategy.fatStrategy)),
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
    title: protocol.name,
    purpose: version?.intent?.summary ?? "Follow the active weekly training plan.",
    sections: [
      field("Weekly Structure", weekly ? `${weekly} area sessions` : null),
      field("Training Focus", list(training.physiquePriorities)),
      field("Progression", label(training.progression?.pace)),
      field("Current Phase", label(training.nutritionPhase ?? version?.phaseContext?.label)),
    ],
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

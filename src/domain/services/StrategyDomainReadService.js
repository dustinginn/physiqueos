import {
  formatPeptideDose,
  formatPeptideExecutionSummary,
  resolvePeptideDose,
} from "./ExecutionPhaseResolver.js";
import { formatSupplementSupportSummary } from "./SupplementSupportManagementService.js";

export const STRATEGY_DOMAIN_PRESENTATION = Object.freeze({
  recovery: Object.freeze({
    title: "Recovery Strategy",
    collectionTitle: "Current Recovery Methods",
    helperCopy: "Your current recovery strategy is supported by the following methods.",
    tone: "success",
  }),
  peptide: Object.freeze({
    title: "Peptide Strategy",
    collectionTitle: "Current Peptides",
    helperCopy: "The following peptides currently support this strategy.",
    tone: "effort",
  }),
  supplement: Object.freeze({
    title: "Supplement Strategy",
    collectionTitle: "Current Supplements",
    helperCopy: "The following supplements currently support this strategy.",
    tone: "success",
  }),
});

/// Canonical protocol-domain roll-up shared by Web and Native. It selects
/// active, owner-scoped protocol roots, their current execution/version
/// state, and presentation-ready support summaries without exposing the
/// underlying runtime collections to clients.
export function buildStrategyDomainModel({
  category,
  executionItems = [],
  goals = [],
  localDate,
  protocols = [],
  versions = [],
  includePaused = false,
} = {}) {
  const presentation = STRATEGY_DOMAIN_PRESENTATION[category];
  if (!presentation) return null;

  const activeProtocols = protocols.filter(
    (protocol) => protocol.category === category &&
      (protocol.status === "active" || (includePaused && protocol.status === "paused"))
  );
  const linkedActiveGoals = goals.filter(
    (goal) => goal.status === "active" && activeProtocols.some((protocol) => protocol.relatedGoalIds?.includes(goal.id))
  );
  const activeGoal = linkedActiveGoals.find((goal) => goal.primary === true)
    ?? goals.find((goal) => goal.status === "active" && goal.primary === true)
    ?? linkedActiveGoals[0]
    ?? null;
  const versionByProtocolId = new Map(versions.map((version) => [version?.protocolId, version]));
  const goalLabel = formatGoalLabel(activeGoal?.title);
  const goalReference = goalLabel ? `your ${goalLabel}` : "your current strategy";

  return Object.freeze({
    category,
    goalTitle: activeGoal?.title ?? null,
    helperCopy: presentation.helperCopy,
    purpose: strategyPurpose(category, goalReference),
    supportingLine: goalLabel ? `Supporting your ${goalLabel}.` : null,
    methods: Object.freeze(activeProtocols.map((protocol) => buildSupportMethod({
      category,
      executionItem: findExecutionItem({ category, executionItems, protocol }),
      goalReference,
      localDate,
      protocol,
      version: versionByProtocolId.get(protocol.id) ?? null,
    }))),
  });
}

function buildSupportMethod({ category, executionItem, goalReference, localDate, protocol, version }) {
  if (category === "peptide") {
    const current = resolvePeptideDose(executionItem, localDate).current;
    return Object.freeze({
      id: protocol.id,
      protocolId: protocol.id,
      lifecycleState: protocol.status,
      currentVersionId: protocol.currentVersionId ?? null,
      executionId: executionItem?.id ?? null,
      name: protocol.name,
      purpose: peptideStrategicRole(protocol, goalReference),
      supportSummary: formatPeptideExecutionSummary(executionItem, localDate),
      currentDose: current ? formatPeptideDose(current.dose) : "No active phase",
      currentSchedule: formatPeptideSchedule(executionItem, localDate),
      editSupportHref: `/profile/operating-plan/execution/peptides/${encodeURIComponent(protocol.id)}?edit=1`,
    });
  }

  if (category === "supplement") {
    return Object.freeze({
      id: protocol.id,
      protocolId: protocol.id,
      lifecycleState: protocol.status,
      currentVersionId: protocol.currentVersionId ?? null,
      executionId: executionItem?.id ?? null,
      name: protocol.name,
      purpose: supplementPurpose(protocol, version, goalReference),
      supportSummary: formatSupplementSupportSummary(executionItem),
      editSupportHref: `/profile/operating-plan/execution/supplements/${encodeURIComponent(protocol.id)}?edit=1`,
    });
  }

  return Object.freeze({
    id: protocol.id,
    protocolId: protocol.id,
    lifecycleState: protocol.status,
    currentVersionId: protocol.currentVersionId ?? null,
    executionId: executionItem?.id ?? null,
    name: protocol.name,
    purpose: recoveryMethodPurpose(protocol, goalReference),
    supportSummary: executionItem ? formatExecutionSchedule(executionItem) : "Not configured",
    editSupportHref: executionItem
      ? `/profile/operating-plan/execution/${encodeURIComponent(executionItem.id)}`
      : "/profile/operating-plan",
  });
}

function findExecutionItem({ category, executionItems, protocol }) {
  return executionItems.find((item) => {
    if (item.active !== true) return false;
    const linked = [item.protocolRootId, item.linkedProtocolId].includes(protocol.id);
    if (category === "peptide") return linked && ["peptide", "protocol"].includes(item.type);
    if (category === "supplement") return linked && item.type === "supplement";
    return linked && item.type === "recovery";
  }) ?? null;
}

export function formatExecutionSchedule(item) {
  const schedule = item.preferredSchedule ?? {};
  const time = formatExecutionTime(schedule.timeOfDay);
  if (item.cadence?.type === "daily") return schedule.timeOfDay === "morning" ? "Every morning" : joinSummary("Daily", time);
  if (item.cadence?.type === "scheduled_date") {
    return schedule.date
      ? joinSummary(new Date(`${schedule.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }), time)
      : "Not scheduled";
  }
  if (schedule.daysOfWeek?.length) return joinSummary(formatDayRange(schedule.daysOfWeek), time || daypart(schedule.timeOfDay));
  return formatPersistence(item.cadence?.type) || "Not scheduled";
}

function formatPeptideSchedule(item, localDate) {
  if (!item) return "Not configured";
  return formatPeptideExecutionSummary({ ...item, timeline: [] }, localDate);
}
function strategyPurpose(category, goalReference) {
  if (category === "recovery") return `Support consistent training and day-to-day readiness as you work toward ${goalReference}.`;
  if (category === "peptide") return `Coordinate the current peptide plan around the recovery, appetite, and body-composition needs of ${goalReference}.`;
  return `Provide consistent nutrition, hydration, training, and recovery support for ${goalReference}.`;
}
function peptideStrategicRole(protocol, goalReference) {
  if (protocol.name === "Retatrutide") return `Support nutrition consistency and body-composition direction as you work toward ${goalReference}.`;
  if (protocol.name === "Tesamorelin") return `Support recovery and training consistency as you work toward ${goalReference}.`;
  return `Provide targeted peptide support within ${goalReference}.`;
}
function recoveryMethodPurpose(protocol, goalReference) {
  if (protocol.name === "Foam Rolling") return `Support movement quality and readiness so training stays consistent with ${goalReference}.`;
  return `Support recovery quality and training readiness within ${goalReference}.`;
}
function supplementPurpose(protocol, version, goalReference) {
  const configured = version?.supplementStrategy?.purpose;
  const defaults = {
    Electrolytes: `Support hydration and electrolyte consistency across the training and recovery demands of ${goalReference}.`,
    "Fadogia Agrestis": `Support consistency in the supplement plan accompanying ${goalReference}.`,
    Multivitamin: `Provide foundational micronutrient coverage while you work toward ${goalReference}.`,
    "Tongkat Ali": `Support consistency in the supplement plan accompanying ${goalReference}.`,
  };
  return defaults[protocol.name]
    ?? (configured ? `${withoutTerminalPunctuation(configured)} as part of ${goalReference}.` : null)
    ?? `Provide targeted supplemental support within ${goalReference}.`;
}
function formatGoalLabel(title) {
  const value = String(title ?? "").trim();
  if (!value) return null;
  return `${value.replace(/\s+goal$/i, "")} goal`;
}
function formatExecutionTime(value) {
  if (!value) return "";
  if (/^\d{2}:\d{2}$/.test(value)) {
    const [hour, minute] = value.split(":").map(Number);
    return new Date(2000, 0, 1, hour, minute).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  return formatPersistence(value);
}
function formatDayRange(days) {
  const names = days.map(formatPersistence);
  if (names.join(",").toLowerCase() === "sunday,monday,tuesday,wednesday,thursday") return "Sun–Thu";
  return names.length === 1 ? names[0] : names.join(", ");
}
function joinSummary(cadence, time) { return [cadence, time].filter(Boolean).join(" · "); }
function daypart(value) { return ["morning", "afternoon", "evening", "night"].includes(value) ? value.toLowerCase() : ""; }
function formatPersistence(value) { return String(value || "").replace(/[_-]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function withoutTerminalPunctuation(value) { return String(value).trim().replace(/[.!?]+$/, ""); }

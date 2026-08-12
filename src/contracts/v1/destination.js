export const DestinationId = Object.freeze({
  HOME: "home",
  LOG: "log",
  CHECK_IN: "check-in",
  EVIDENCE_REVIEW: "evidence.review",
  EVIDENCE_DETAIL: "evidence.detail",
  GOAL_DETAIL: "goal.detail",
  GOALS: "goals",
  OPERATING_PLAN: "plan",
  OPERATING_PLAN_STRATEGY: "plan.strategy",
  OPERATING_PLAN_SUPPORT: "plan.support",
  PRIORITY_DETAIL: "priority.detail",
  BRIEFING_DETAIL: "briefing.detail",
  BRIEFING_LIST: "briefing.list",
  TRAINING_SESSION: "training.session",
  TRAINING_EXERCISE: "training.exercise",
  PHOTO_UPLOAD: "photo.upload",
  DEXA_UPLOAD: "dexa.upload",
  PROFILE: "profile",
  PROGRESS_STREAM: "progress.stream",
  GOAL_TRANSITION: "goal.transition",
  PLATFORM_STATUS: "platform.status",
  OPERATION_DETAIL: "operation.detail",
});

const DESTINATIONS = new Set(Object.values(DestinationId));
const REQUIRED_PARAMETERS = Object.freeze({
  [DestinationId.EVIDENCE_REVIEW]: ["reviewId"],
  [DestinationId.CHECK_IN]: ["checkInType"],
  [DestinationId.EVIDENCE_DETAIL]: ["evidenceId"],
  [DestinationId.GOAL_DETAIL]: ["goalId"],
  [DestinationId.OPERATING_PLAN_STRATEGY]: ["strategyType", "strategyId"],
  [DestinationId.OPERATING_PLAN_SUPPORT]: ["supportType", "supportId"],
  [DestinationId.PRIORITY_DETAIL]: ["priorityId"],
  [DestinationId.BRIEFING_DETAIL]: ["briefingId"],
  [DestinationId.TRAINING_SESSION]: ["sessionId"],
  [DestinationId.TRAINING_EXERCISE]: ["exerciseId"],
  [DestinationId.PROGRESS_STREAM]: ["streamId"],
  [DestinationId.OPERATION_DETAIL]: ["operationId"],
});

export function createDestination(id, parameters = {}) {
  if (!DESTINATIONS.has(id)) throw new Error(`Unsupported destination: ${id}`);
  const normalized = Object.fromEntries(Object.entries(parameters)
    .filter(([, value]) => value != null && String(value).trim())
    .map(([key, value]) => [key, String(value)]));
  for (const key of REQUIRED_PARAMETERS[id] ?? []) {
    if (!normalized[key]) throw new Error(`${id} destination requires ${key}.`);
  }
  return Object.freeze({ id, parameters: Object.freeze(normalized) });
}

export function isDestinationId(value) {
  return DESTINATIONS.has(value);
}

export function destinationFromWebHref(href) {
  const path = normalizeHref(href);
  if (!path) return null;
  if (path === "/") return createDestination(DestinationId.HOME);
  if (path === "/log" || path === "/log/training") return createDestination(DestinationId.LOG);
  if (path === "/goals") return createDestination(DestinationId.GOALS);
  if (path === "/briefings/review" || path === "/briefing/daily") return createDestination(DestinationId.BRIEFING_LIST);
  if (path === "/profile") return createDestination(DestinationId.PROFILE);
  if (path === "/profile/operating-plan") return createDestination(DestinationId.OPERATING_PLAN);
  if (path === "/goals/transition" || path.startsWith("/goals/transition/")) return createDestination(DestinationId.GOAL_TRANSITION);
  if (path === "/evidence/photos") return createDestination(DestinationId.PHOTO_UPLOAD);
  if (path === "/evidence/dexa") return createDestination(DestinationId.DEXA_UPLOAD);
  const protocol = path.match(/^\/profile\/protocols\/([^/]+)$/);
  if (protocol) return createDestination(DestinationId.OPERATING_PLAN_SUPPORT, { supportType: "protocol", supportId: decodeURIComponent(protocol[1]) });
  const support = path.match(/^\/profile\/operating-plan\/(?!strategy\/)([^/]+)(?:\/(.+))?$/);
  if (support) return createDestination(DestinationId.OPERATING_PLAN_SUPPORT, { supportType: decodeURIComponent(support[1]), supportId: decodePath(support[2] ?? "current") });
  const patterns = [
    [/^\/evidence\/review\/([^/]+)$/, DestinationId.EVIDENCE_REVIEW, "reviewId"],
    [/^\/evidence\/(?:detail\/)?([^/]+)$/, DestinationId.EVIDENCE_DETAIL, "evidenceId"],
    [/^\/check-in\/([^/]+)$/, DestinationId.CHECK_IN, "checkInType"],
    [/^\/goals\/([^/]+)$/, DestinationId.GOAL_DETAIL, "goalId"],
    [/^\/profile\/operating-plan\/strategy\/([^/]+)\/([^/]+)$/, DestinationId.OPERATING_PLAN_STRATEGY, ["strategyType", "strategyId"]],
    [/^\/priorities\/([^/]+)$/, DestinationId.PRIORITY_DETAIL, "priorityId"],
    [/^\/briefings\/review\/([^/]+)$/, DestinationId.BRIEFING_DETAIL, "briefingId"],
    [/^\/briefings\/(?:weekly|midweek|monthly|dexa|photo)(?:\/([^/]+))?$/, DestinationId.BRIEFING_DETAIL, "briefingId"],
    [/^\/progress\/training\/session\/([^/]+)$/, DestinationId.TRAINING_SESSION, "sessionId"],
    [/^\/progress\/training\/library\/(?:.*\/)?([^/]+)$/, DestinationId.TRAINING_EXERCISE, "exerciseId"],
    [/^\/progress(?:\/(.+))?$/, DestinationId.PROGRESS_STREAM, "streamId"],
  ];
  for (const [pattern, id, keys] of patterns) {
    const match = path.match(pattern);
    if (!match) continue;
    const names = Array.isArray(keys) ? keys : [keys];
    const parameters = Object.fromEntries(names.map((key, index) => [key, decodeURIComponent(match[index + 1] ?? defaultParameter(id, key, match))]));
    return createDestination(id, parameters);
  }
  return null;
}

export function destinationToWebHref(destination) {
  const { id, parameters } = createDestination(destination?.id, destination?.parameters);
  switch (id) {
    case DestinationId.HOME: return "/";
    case DestinationId.LOG: return "/log";
    case DestinationId.CHECK_IN: return `/check-in/${segment(parameters.checkInType)}`;
    case DestinationId.EVIDENCE_REVIEW: return `/evidence/review/${segment(parameters.reviewId)}`;
    case DestinationId.EVIDENCE_DETAIL: return `/evidence/${segment(parameters.evidenceId)}`;
    case DestinationId.GOAL_DETAIL: return `/goals/${segment(parameters.goalId)}`;
    case DestinationId.GOALS: return "/goals";
    case DestinationId.GOAL_TRANSITION: return "/goals/transition";
    case DestinationId.OPERATING_PLAN: return "/profile/operating-plan";
    case DestinationId.OPERATING_PLAN_STRATEGY: return `/profile/operating-plan/strategy/${segment(parameters.strategyType)}/${segment(parameters.strategyId)}`;
    case DestinationId.OPERATING_PLAN_SUPPORT:
      return parameters.supportType === "protocol"
        ? `/profile/protocols/${segment(parameters.supportId)}`
        : `/profile/operating-plan/${segment(parameters.supportType)}${parameters.supportId === "current" ? "" : `/${encodePath(parameters.supportId)}`}`;
    case DestinationId.PRIORITY_DETAIL: return `/priorities/${segment(parameters.priorityId)}`;
    case DestinationId.BRIEFING_DETAIL: return `/briefings/review/${segment(parameters.briefingId)}`;
    case DestinationId.BRIEFING_LIST: return "/briefings/review";
    case DestinationId.TRAINING_SESSION: return `/progress/training/session/${segment(parameters.sessionId)}`;
    case DestinationId.TRAINING_EXERCISE: return `/progress/training/library/${segment(parameters.exerciseId)}`;
    case DestinationId.PHOTO_UPLOAD: return "/evidence/photos";
    case DestinationId.DEXA_UPLOAD: return "/evidence/dexa";
    case DestinationId.PROFILE: return "/profile";
    case DestinationId.PROGRESS_STREAM: return parameters.streamId === "all" ? "/progress" : `/progress/${encodePath(parameters.streamId)}`;
    case DestinationId.PLATFORM_STATUS: return "/api/v1/platform";
    case DestinationId.OPERATION_DETAIL: return `/operations/${segment(parameters.operationId)}`;
    default: throw new Error(`Unsupported destination: ${id}`);
  }
}

function normalizeHref(value) {
  const text = String(value ?? "").trim();
  if (!text.startsWith("/")) return null;
  return text.split(/[?#]/, 1)[0].replace(/\/+$/g, "") || "/";
}

function defaultParameter(id, key, match = []) {
  if (id === DestinationId.PROGRESS_STREAM && key === "streamId") return "all";
  if (id === DestinationId.BRIEFING_DETAIL && key === "briefingId") return "latest";
  if (id === DestinationId.OPERATING_PLAN_STRATEGY && key === "strategyType") return "protocol";
  if (id === DestinationId.OPERATING_PLAN_STRATEGY && key === "strategyId") return match[1] ?? "current";
  if (id === DestinationId.OPERATING_PLAN_SUPPORT && key === "supportType") return "protocol";
  if (id === DestinationId.OPERATING_PLAN_SUPPORT && key === "supportId") return match[1] ?? "current";
  return "";
}

function segment(value) {
  return encodeURIComponent(String(value));
}

function encodePath(value) { return String(value).split("/").map(segment).join("/"); }
function decodePath(value) { return String(value).split("/").map(decodeURIComponent).join("/"); }

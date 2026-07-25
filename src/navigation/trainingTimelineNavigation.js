const TRAINING_ROOT = "/progress/training";
const CONTEXT_IDS = new Set(["build-lean-mass", "visible-abs", "all"]);

export function normalizeTrainingContextId(value) {
  return CONTEXT_IDS.has(value) ? value : "all";
}

export function getTrainingRootHref(contextId) {
  return CONTEXT_IDS.has(contextId)
    ? `${TRAINING_ROOT}?context=${contextId}`
    : TRAINING_ROOT;
}

export function withTrainingTimelineContext(
  href,
  contextId,
  { returnTo } = {}
) {
  if (!isInternalTrainingHref(href)) return href;

  const [pathAndQuery, hash = ""] = String(href).split("#", 2);
  const [path, query = ""] = pathAndQuery.split("?", 2);
  const params = new URLSearchParams(query);
  params.set("context", normalizeTrainingContextId(contextId));

  if (
    path.startsWith(`${TRAINING_ROOT}/session/`) &&
    isSafeTrainingReturnPath(returnTo)
  ) {
    params.set("returnTo", returnTo);
  }

  return `${path}?${params.toString()}${hash ? `#${hash}` : ""}`;
}

export function resolveTrainingReturnPath({ contextId, returnTo }) {
  if (
    isSafeTrainingReturnPath(returnTo) &&
    !returnTo.startsWith(`${TRAINING_ROOT}/session/`)
  ) {
    return withTrainingTimelineContext(returnTo, contextId);
  }

  return withTrainingTimelineContext(TRAINING_ROOT, contextId);
}

export function isSafeTrainingReturnPath(value) {
  if (typeof value !== "string" || !value.startsWith(TRAINING_ROOT)) {
    return false;
  }
  if (value.startsWith("//") || value.includes("\\") || value.includes("://")) {
    return false;
  }

  try {
    const parsed = new URL(value, "https://physiqueos.local");
    return (
      parsed.origin === "https://physiqueos.local" &&
      parsed.pathname.startsWith(TRAINING_ROOT)
    );
  } catch {
    return false;
  }
}

function isInternalTrainingHref(value) {
  return (
    typeof value === "string" &&
    (value === TRAINING_ROOT ||
      value.startsWith(`${TRAINING_ROOT}/`) ||
      value.startsWith(`${TRAINING_ROOT}?`) ||
      value.startsWith(`${TRAINING_ROOT}#`))
  );
}

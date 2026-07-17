export const EVIDENCE_HUB_USAGE_KEY = "physiqueos:evidence-hub-usage:v1";
export const EVIDENCE_HUB_USAGE_VERSION = 1;
export const EVIDENCE_HUB_CANONICAL_ORDER = [
  "training",
  "nutrition",
  "weight",
  "photos",
  "dexa",
  "activity",
  "protocols",
  "recovery",
  "health-metrics",
];

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_MS = 30 * DAY_MS;
const MAX_RECORDED_OPENS = 50;

export function createEmptyEvidenceHubUsage() {
  return { version: EVIDENCE_HUB_USAGE_VERSION, categories: {} };
}

export function parseEvidenceHubUsage(raw) {
  try {
    const candidate = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (
      !candidate ||
      candidate.version !== EVIDENCE_HUB_USAGE_VERSION ||
      !candidate.categories ||
      typeof candidate.categories !== "object" ||
      Array.isArray(candidate.categories)
    ) {
      return createEmptyEvidenceHubUsage();
    }

    const categories = {};
    for (const id of EVIDENCE_HUB_CANONICAL_ORDER) {
      const category = candidate.categories[id];
      if (!category || typeof category !== "object") continue;
      const recentOpens = Array.isArray(category.recentOpens)
        ? category.recentOpens.filter((value) => Number.isFinite(Date.parse(value))).slice(-MAX_RECORDED_OPENS)
        : [];
      if (!recentOpens.length) continue;
      categories[id] = {
        lastOpenedAt: Number.isFinite(Date.parse(category.lastOpenedAt))
          ? category.lastOpenedAt
          : recentOpens.at(-1),
        recentOpens,
      };
    }

    return { version: EVIDENCE_HUB_USAGE_VERSION, categories };
  } catch {
    return createEmptyEvidenceHubUsage();
  }
}

export function readEvidenceHubUsage(storage) {
  try {
    return parseEvidenceHubUsage(storage?.getItem(EVIDENCE_HUB_USAGE_KEY));
  } catch {
    return createEmptyEvidenceHubUsage();
  }
}

export function writeEvidenceHubUsage(storage, usage) {
  try {
    storage?.setItem(EVIDENCE_HUB_USAGE_KEY, JSON.stringify(parseEvidenceHubUsage(usage)));
    return Boolean(storage);
  } catch {
    return false;
  }
}

export function recordEvidenceHubVisit(usage, evidenceType, now = new Date()) {
  const current = parseEvidenceHubUsage(usage);
  if (!EVIDENCE_HUB_CANONICAL_ORDER.includes(evidenceType)) return current;
  const timestamp = new Date(now).toISOString();
  const cutoff = new Date(now).getTime() - WINDOW_MS;
  const previous = current.categories[evidenceType]?.recentOpens ?? [];
  const recentOpens = [...previous.filter((value) => Date.parse(value) >= cutoff), timestamp]
    .slice(-MAX_RECORDED_OPENS);

  return {
    version: EVIDENCE_HUB_USAGE_VERSION,
    categories: {
      ...current.categories,
      [evidenceType]: { lastOpenedAt: timestamp, recentOpens },
    },
  };
}

export function rankRecentlyUsedEvidence(usage, now = new Date(), limit = 3) {
  const current = parseEvidenceHubUsage(usage);
  const nowMs = new Date(now).getTime();
  const ranked = EVIDENCE_HUB_CANONICAL_ORDER.flatMap((id, canonicalIndex) => {
    const category = current.categories[id];
    if (!category) return [];
    const opens = category.recentOpens
      .map((value) => Date.parse(value))
      .filter((value) => Number.isFinite(value) && value <= nowMs && nowMs - value <= WINDOW_MS);
    if (!opens.length) return [];

    return [{
      id,
      canonicalIndex,
      lastOpenedAt: Math.max(...opens),
      score: opens.reduce((score, openedAt) => score + recencyWeight(nowMs - openedAt), 0),
    }];
  });

  return ranked
    .sort((left, right) =>
      right.score - left.score ||
      right.lastOpenedAt - left.lastOpenedAt ||
      left.canonicalIndex - right.canonicalIndex
    )
    .slice(0, Math.max(0, limit))
    .map((item) => item.id);
}

export function orderEvidenceStreams(streams = []) {
  const order = new Map(EVIDENCE_HUB_CANONICAL_ORDER.map((id, index) => [id, index]));
  return [...streams].sort((left, right) =>
    (order.get(left.id) ?? order.size) - (order.get(right.id) ?? order.size)
  );
}

function recencyWeight(ageMs) {
  if (ageMs <= DAY_MS) return 4;
  if (ageMs <= 7 * DAY_MS) return 3;
  if (ageMs <= 14 * DAY_MS) return 2;
  return 1;
}

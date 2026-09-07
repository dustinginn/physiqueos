const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function canonicalWeightDate(value) {
  const candidate = String(value ?? "").slice(0, 10);
  if (!CALENDAR_DATE.test(candidate)) return "";
  const [year, month, day] = candidate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === candidate
    ? candidate
    : "";
}

export function canonicalWeightEntryId(value) {
  const date = canonicalWeightDate(value);
  if (!date) throw new Error("Canonical Weight requires a valid measurement date.");
  return `weight_${date.replaceAll("-", "_")}`;
}

export function canonicalWeightDayLockKey(ownerUserId, value) {
  const owner = String(ownerUserId ?? "").trim();
  const date = canonicalWeightDate(value);
  if (!owner || !date) throw new Error("Canonical Weight requires an owner and measurement date.");
  return `physiqueos:weight:${owner}:${date}`;
}

export function canonicalWeightEntries(entries = []) {
  const byUserDay = new Map();
  for (const entry of entries) {
    const date = canonicalWeightDate(entry?.measuredAt);
    const userId = String(entry?.userId ?? "").trim();
    if (!date || !userId) continue;
    const key = `${userId}:${date}`;
    const current = byUserDay.get(key);
    if (!current || compareCanonicalWeightEntries(current, entry) < 0) {
      byUserDay.set(key, entry);
    }
  }
  return [...byUserDay.values()].sort(compareCanonicalWeightEntries);
}

export function compareCanonicalWeightEntries(left, right) {
  return compareText(canonicalWeightDate(left?.measuredAt), canonicalWeightDate(right?.measuredAt)) ||
    compareText(revisionTime(left), revisionTime(right)) ||
    compareText(String(left?.createdAt ?? ""), String(right?.createdAt ?? "")) ||
    compareText(String(left?.id ?? ""), String(right?.id ?? ""));
}

export function sameWeightValue(left, right) {
  return Number(left?.weight?.value) === Number(right?.weight?.value) &&
    String(left?.weight?.unit ?? "").toLowerCase() === String(right?.weight?.unit ?? "").toLowerCase();
}

export function prepareCanonicalWeightCorrection(entry, existingEntries = []) {
  const id = canonicalWeightEntryId(entry?.measuredAt);
  const matching = existingEntries.filter((item) =>
    String(item?.userId ?? "") === String(entry?.userId ?? "") &&
    canonicalWeightDate(item?.measuredAt) === canonicalWeightDate(entry?.measuredAt));
  const correctionHistory = [
    ...matching.flatMap((item) => item.correctionHistory ?? []),
    ...matching.filter((item) => !sameWeightValue(item, entry)).map((item) => ({
      correctedAt: entry.updatedAt ?? new Date().toISOString(),
      previousEntry: withoutCorrectionHistory(item),
      reason: "Same-day authoritative weight correction.",
    })),
  ];
  return {
    ...entry,
    id,
    ...(correctionHistory.length > 0 ? { correctionHistory } : {}),
  };
}

export function canonicalWeightWriteChanged(existingEntries = [], entry) {
  const canonicalId = canonicalWeightEntryId(entry?.measuredAt);
  return existingEntries.length !== 1 ||
    String(existingEntries[0]?.id ?? "") !== canonicalId ||
    String(existingEntries[0]?.userId ?? "") !== String(entry?.userId ?? "") ||
    canonicalWeightDate(existingEntries[0]?.measuredAt) !== canonicalWeightDate(entry?.measuredAt) ||
    !sameWeightValue(existingEntries[0], entry);
}

function revisionTime(entry) {
  return String(entry?.updatedAt ?? entry?.createdAt ?? "");
}

function compareText(left, right) {
  return left.localeCompare(right);
}

function withoutCorrectionHistory(entry) {
  const { correctionHistory: _history, ...snapshot } = structuredClone(entry);
  return snapshot;
}

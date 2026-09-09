import { resolveCanonicalEvidenceLocalDate } from "./CanonicalEvidenceDateService";

export function selectActiveCanonicalActivityDays(
  canonicalObjects = [],
  { date = null, userId = null } = {}
) {
  const groups = new Map();
  canonicalObjects
    .filter((record) => {
      const payload = record.payload ?? record;
      return payload.evidence_type === "activity_day" &&
        isActive(record) &&
        (!userId || !record.userId || record.userId === userId) &&
        (!date || resolveCanonicalEvidenceLocalDate(payload) === date);
    })
    .forEach((record) => {
      const key = getActivityDayLogicalKey(record);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(record);
    });
  const diagnostics = [];
  const records = [];
  for (const [logicalDayKey, candidates] of groups.entries()) {
    const ordered = [...candidates].sort(compareCanonicalActivityAuthority);
    records.push(ordered.at(-1));
    if (ordered.length > 1) {
      diagnostics.push(Object.freeze({
        code: "ACTIVITY_ACTIVE_DAY_DUPLICATE",
        logicalDayKey,
        canonicalIds: ordered.map((item) => item.canonicalId).sort(),
      }));
    }
  }
  return Object.freeze({
    diagnostics: Object.freeze(diagnostics),
    records: Object.freeze(records.sort((left, right) =>
      resolveCanonicalEvidenceLocalDate(left)
        .localeCompare(resolveCanonicalEvidenceLocalDate(right))
    )),
  });
}

function getActivityDayLogicalKey(value = {}) {
  const date = resolveCanonicalEvidenceLocalDate(value);
  return date ? `activity_day|${date}` : null;
}

function compareCanonicalActivityAuthority(left, right) {
  const revisionDelta = (left.activityRevision?.revision ?? 0) -
    (right.activityRevision?.revision ?? 0);
  if (revisionDelta) return revisionDelta;
  const timeDelta = String(left.updatedAt ?? left.createdAt ?? "")
    .localeCompare(String(right.updatedAt ?? right.createdAt ?? ""));
  if (timeDelta) return timeDelta;
  return String(left.canonicalId ?? "").localeCompare(String(right.canonicalId ?? ""));
}

function isActive(record) {
  return record.quality?.status !== "superseded" &&
    !record.quality?.supersededBy &&
    record.payload?.quality?.status !== "superseded";
}

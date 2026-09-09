import { createHash } from "node:crypto";
import { selectActiveCanonicalActivityDays } from "./CanonicalActivityDayReadModel";
import { resolveCanonicalEvidenceLocalDate } from "./CanonicalEvidenceDateService";

export { selectActiveCanonicalActivityDays } from "./CanonicalActivityDayReadModel";

export const ACTIVITY_DAY_REVISION_SCHEMA_VERSION =
  "canonical-activity-day-revision-v1";

export const ActivityCanonicalSourceClass = Object.freeze({
  HEALTH_PROVIDER: "health_provider",
  APPLE_FITNESS: "apple_fitness",
  MANUAL: "manual",
  VOICE: "voice",
  UNKNOWN: "unknown",
});

export class CanonicalActivityDayError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CanonicalActivityDayError";
    this.code = code;
  }
}

export function getActivityDayLogicalKey(value = {}) {
  const date = resolveCanonicalEvidenceLocalDate(value);
  return date ? `activity_day|${date}` : null;
}

export function getStableActivityDayCanonicalId(value = {}) {
  return getActivityDayLogicalKey(value);
}

export function getActivitySourceAuthority(value = {}) {
  const payload = value.payload ?? value;
  const source = `${payload.source?.application ?? ""} ${payload.source?.integration ?? ""} ${payload.source?.modality ?? ""}`.toLowerCase();
  if (/apple health|healthkit|direct/.test(source)) {
    return Object.freeze({ rank: 4, sourceClass: ActivityCanonicalSourceClass.HEALTH_PROVIDER });
  }
  if (/apple fitness/.test(source)) {
    return Object.freeze({ rank: 3, sourceClass: ActivityCanonicalSourceClass.APPLE_FITNESS });
  }
  if (/manual|correction|typed/.test(source)) {
    return Object.freeze({ rank: 2, sourceClass: ActivityCanonicalSourceClass.MANUAL });
  }
  if (/voice/.test(source)) {
    return Object.freeze({ rank: 1, sourceClass: ActivityCanonicalSourceClass.VOICE });
  }
  return Object.freeze({ rank: 0, sourceClass: ActivityCanonicalSourceClass.UNKNOWN });
}

export function createActivitySemanticFingerprint(payload = {}) {
  const semantic = {
    date: resolveCanonicalEvidenceLocalDate(payload),
    dailyActivity: semanticObject(payload.daily_activity),
  };
  return `sha256_${createHash("sha256").update(stable(semantic)).digest("hex")}`;
}

export function getCanonicalActivitySemanticFingerprint(record = {}) {
  return record.activityRevision?.semanticFingerprint ??
    createActivitySemanticFingerprint(record.payload ?? record);
}

export function prepareActivityEvidencePackageForReview({
  canonicalObjects = [],
  evidencePackage = {},
  reviewId = null,
} = {}) {
  return {
    ...evidencePackage,
    evidence_objects: (evidencePackage.evidence_objects ?? []).map((object) => {
      if (object.evidence_type !== "activity_day" || object.removed === true) {
        return object;
      }
      const date = resolveCanonicalEvidenceLocalDate(object);
      const selection = selectActiveCanonicalActivityDays(canonicalObjects, { date });
      const existing = selection.records[0] ?? null;
      return {
        ...object,
        reconciliation: {
          ...(object.reconciliation ?? {}),
          activity: {
            ...(object.reconciliation?.activity ?? {}),
            dispositionStatus: selection.diagnostics.length > 0
              ? "blocked_duplicate_active_days"
              : existing
                ? "update_existing_day"
                : "initial_day",
            expectedPriorSemanticFingerprint: existing
              ? getCanonicalActivitySemanticFingerprint(existing)
              : null,
            logicalDayKey: getActivityDayLogicalKey(object),
            sourceReviewId: reviewId,
            targetCanonicalId: existing?.canonicalId ?? null,
          },
        },
      };
    }),
    review_metadata: {
      ...(evidencePackage.review_metadata ?? {}),
      sourceReviewId: reviewId ?? evidencePackage.review_metadata?.sourceReviewId,
    },
  };
}

export function createCanonicalActivityDayRecord({
  canonicalId,
  canonicalProvenance,
  evidenceObject,
  evidencePackage,
  existingObject = null,
  goalPhaseAttribution = null,
  now = new Date().toISOString(),
  requireExpectedPriorFingerprint = false,
  userId,
} = {}) {
  const incoming = structuredClone(evidenceObject);
  const payload = existingObject
    ? mergeActivityDayPayload(existingObject.payload, incoming)
    : incoming;
  const date = resolveCanonicalEvidenceLocalDate(payload);
  if (!date) throw new TypeError("Canonical Activity Day requires an intended local date.");
  payload.observed_at = date;
  if (existingObject?.payload?.id) payload.id = existingObject.payload.id;

  if (existingObject && isExactAcceptedActivitySourceReplay({
    evidenceObject: incoming,
    evidencePackage,
    existingObject,
  })) return existingObject;

  if (existingObject && requireExpectedPriorFingerprint) {
    const expected = incoming.reconciliation?.activity
      ?.expectedPriorSemanticFingerprint;
    const actual = getCanonicalActivitySemanticFingerprint(existingObject);
    if (!expected || expected !== actual) {
      throw new CanonicalActivityDayError(
        "ACTIVITY_REVISION_STALE",
        "This Activity Day changed after the review opened. Refresh the review before saving."
      );
    }
  }

  const priorFingerprint = existingObject
    ? getCanonicalActivitySemanticFingerprint(existingObject)
    : null;
  const semanticFingerprint = createActivitySemanticFingerprint(payload);
  const semanticChanged = priorFingerprint !== semanticFingerprint;
  const priorRevision = existingObject?.activityRevision?.revision ??
    (existingObject ? 1 : 0);
  const revision = semanticChanged ? priorRevision + 1 : priorRevision || 1;
  const authority = getActivitySourceAuthority(payload);
  const history = [...(existingObject?.activityRevisionHistory ?? [])];
  if (existingObject && semanticChanged) history.push(createRevisionSnapshot(existingObject));
  const attribution = existingObject?.goalPhaseAttribution ?? goalPhaseAttribution ?? null;

  return {
    canonicalId: canonicalId ?? getStableActivityDayCanonicalId(payload),
    createdAt: existingObject?.createdAt ?? now,
    evidence_type: "activity_day",
    firstObservedAt: existingObject?.firstObservedAt ?? date,
    lastObservedAt: date,
    activityRevision: {
      schemaVersion: ACTIVITY_DAY_REVISION_SCHEMA_VERSION,
      logicalDayKey: getActivityDayLogicalKey(payload),
      revision,
      semanticFingerprint,
      priorSemanticFingerprint: semanticChanged ? priorFingerprint :
        existingObject?.activityRevision?.priorSemanticFingerprint ?? null,
      semanticChanged,
      sourceClass: authority.sourceClass,
      sourceAuthorityRank: authority.rank,
      sourceEvidencePackageId: evidencePackage?.package_id ?? evidencePackage?.id ?? null,
      sourceEvidenceObjectId: evidenceObject.id ?? null,
      sourceReviewId: evidencePackage?.review_metadata?.sourceReviewId ?? null,
      revisedAt: existingObject && semanticChanged ? now :
        existingObject?.activityRevision?.revisedAt ?? null,
    },
    activityRevisionHistory: history,
    ...(attribution ? {
      goalId: attribution.goalId,
      phaseId: attribution.phaseId,
      goalPhaseAttribution: attribution,
    } : {}),
    payload,
    provenance: canonicalProvenance,
    quality: { status: "active" },
    updatedAt: semanticChanged || !existingObject ? now : existingObject.updatedAt,
    userId,
  };
}

export function selectActivityDayPayloads(days = []) {
  const groups = new Map();
  for (const day of days) {
    const date = resolveCanonicalEvidenceLocalDate(day);
    if (!date) continue;
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date).push(day);
  }
  return [...groups.values()].map((candidates) =>
    [...candidates].sort(compareActivityPayloadAuthority).at(-1)
  );
}

export function activityRecordHasSemanticChange(record = {}, prior = null) {
  if (!prior) return true;
  return getCanonicalActivitySemanticFingerprint(record) !==
    getCanonicalActivitySemanticFingerprint(prior);
}

function isExactAcceptedActivitySourceReplay({ evidenceObject, evidencePackage, existingObject }) {
  const packageId = evidencePackage?.package_id ?? evidencePackage?.id;
  return Boolean(
    packageId &&
    (existingObject.provenance?.evidence_package_ids ?? []).includes(packageId) &&
    (existingObject.provenance?.contributing_evidence_object_ids ?? [])
      .includes(evidenceObject.id) &&
    createActivitySemanticFingerprint(mergeActivityDayPayload(
      existingObject.payload,
      evidenceObject
    )) === getCanonicalActivitySemanticFingerprint(existingObject)
  );
}

function mergeActivityDayPayload(existing = {}, incoming = {}) {
  const preferred = choosePreferred(existing, incoming);
  const secondary = preferred === incoming ? existing : incoming;
  return {
    ...secondary,
    ...preferred,
    metadata: { ...(secondary.metadata ?? {}), ...(preferred.metadata ?? {}) },
    daily_activity: mergeDailyActivity(
      secondary.daily_activity,
      preferred.daily_activity
    ),
    derived_metrics: {
      ...(secondary.derived_metrics ?? {}),
      ...(preferred.derived_metrics ?? {}),
    },
    references: {
      training_session_ids: unique([
        ...(secondary.references?.training_session_ids ?? []),
        ...(preferred.references?.training_session_ids ?? []),
      ]),
    },
    provenance: mergePayloadProvenance(secondary.provenance, preferred.provenance),
  };
}

function choosePreferred(left, right) {
  const leftAuthority = getActivitySourceAuthority(left);
  const rightAuthority = getActivitySourceAuthority(right);
  if (isExplicitCorrection(right) && rightAuthority.rank >= leftAuthority.rank) {
    return right;
  }
  if (leftAuthority.rank !== rightAuthority.rank) {
    return rightAuthority.rank > leftAuthority.rank ? right : left;
  }
  return evidenceRichness(right) >= evidenceRichness(left) ? right : left;
}

function isExplicitCorrection(value = {}) {
  return Boolean(
    value.correction ||
    value.correctsEvidenceId ||
    value.supersedesEvidenceId ||
    /correction/i.test(String(value.source?.modality ?? ""))
  );
}

function mergeDailyActivity(first = {}, second = {}) {
  const firstRing = first.ring_completion ?? {};
  const secondRing = second.ring_completion ?? {};
  return {
    ...first,
    ...withoutNullish(second),
    ring_completion: {
      ...firstRing,
      ...withoutNullish(secondRing),
    },
  };
}

function evidenceRichness(payload = {}) {
  return [
    payload.daily_activity?.move_calories,
    payload.daily_activity?.move_goal,
    payload.daily_activity?.exercise_minutes,
    payload.daily_activity?.exercise_goal,
    payload.daily_activity?.stand_hours,
    payload.daily_activity?.stand_goal,
    payload.daily_activity?.total_calories_burned,
    payload.daily_activity?.ring_completion?.move,
    payload.daily_activity?.ring_completion?.exercise,
    payload.daily_activity?.ring_completion?.stand,
  ].filter((value) => value !== null && value !== undefined && value !== "").length;
}

function createRevisionSnapshot(record) {
  return {
    revision: record.activityRevision?.revision ?? 1,
    semanticFingerprint: getCanonicalActivitySemanticFingerprint(record),
    acceptedAt: record.updatedAt ?? record.createdAt ?? null,
    payload: structuredClone(record.payload),
    provenance: structuredClone(record.provenance ?? {}),
    sourceEvidencePackageId: record.activityRevision?.sourceEvidencePackageId ?? null,
    sourceEvidenceObjectId: record.activityRevision?.sourceEvidenceObjectId ??
      record.payload?.id ?? null,
    sourceReviewId: record.activityRevision?.sourceReviewId ?? null,
  };
}

function compareActivityPayloadAuthority(left, right) {
  const revisionDelta = (left._canonicalActivityRevision?.revision ?? 0) -
    (right._canonicalActivityRevision?.revision ?? 0);
  if (revisionDelta) return revisionDelta;
  const timeDelta = String(left._canonicalUpdatedAt ?? "")
    .localeCompare(String(right._canonicalUpdatedAt ?? ""));
  if (timeDelta) return timeDelta;
  return String(left._canonicalId ?? left.id ?? "")
    .localeCompare(String(right._canonicalId ?? right.id ?? ""));
}

function mergePayloadProvenance(left = {}, right = {}) {
  return {
    ...left,
    ...right,
    source_artifact_refs: unique([
      ...(left.source_artifact_refs ?? []),
      ...(right.source_artifact_refs ?? []),
    ]),
  };
}

function semanticObject(value = {}) {
  return Object.fromEntries(Object.entries(value ?? {})
    .filter(([, item]) => item !== null && item !== undefined && item !== "")
    .map(([key, item]) => [key,
      item && typeof item === "object" && !Array.isArray(item)
        ? semanticObject(item)
        : finiteOrText(item)])
    .filter(([, item]) =>
      !item || typeof item !== "object" || Array.isArray(item) ||
      Object.keys(item).length > 0
    ));
}

function finiteOrText(value) {
  const number = Number(value);
  return value !== "" && Number.isFinite(number) ? number : value;
}

function withoutNullish(value = {}) {
  return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => item !== null && item !== undefined && item !== ""));
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}

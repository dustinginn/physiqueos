import { createHash } from "node:crypto";
import { getProgressPhotoCategoryId } from "../models/progressPhotoPoseVocabulary";

export const PHOTO_SESSION_REVISION_SCHEMA_VERSION =
  "canonical-photo-session-revision-v1";

export function getStablePhotoSessionId({ userId, captureDate } = {}) {
  const date = dateKey(captureDate);
  return userId && date ? `photo_session_${userId}_${date}` : null;
}

export function getPhotoSessionLogicalKey(value = {}, userId = null) {
  const payload = value.payload ?? value;
  return getStablePhotoSessionId({
    userId: userId ?? value.userId ?? payload.userId,
    captureDate: payload.captureDate ?? payload.observed_at ??
      value.lastObservedAt,
  });
}

export function selectActiveCanonicalPhotoSessions(
  canonicalObjects = [],
  { captureDate = null, userId = null } = {},
) {
  const groups = new Map();
  for (const record of canonicalObjects) {
    if (record.evidence_type !== "photo_session" || !isActive(record)) continue;
    if (userId && record.userId && record.userId !== userId) continue;
    const payload = record.payload ?? record;
    if (captureDate && dateKey(payload.captureDate ?? payload.observed_at) !==
        dateKey(captureDate)) continue;
    const key = getPhotoSessionLogicalKey(record, userId);
    if (!key) continue;
    const candidates = groups.get(key) ?? [];
    candidates.push(record);
    groups.set(key, candidates);
  }
  const diagnostics = [];
  const records = [];
  for (const [logicalSessionKey, candidates] of groups) {
    const ordered = [...candidates].sort(compareAuthority);
    records.push(ordered.at(-1));
    if (ordered.length > 1) {
      diagnostics.push(Object.freeze({
        code: "PHOTO_SESSION_ACTIVE_DUPLICATE",
        logicalSessionKey,
        canonicalIds: Object.freeze(
          ordered.map((item) => item.canonicalId).sort()),
      }));
    }
  }
  return Object.freeze({
    diagnostics: Object.freeze(diagnostics),
    records: Object.freeze(records.sort((left, right) =>
      String(left.lastObservedAt ?? left.payload?.captureDate).localeCompare(
        String(right.lastObservedAt ?? right.payload?.captureDate)) ||
      String(left.canonicalId).localeCompare(String(right.canonicalId)))),
  });
}

export function createPhotoSessionSemanticFingerprint(session = {}) {
  const semantic = {
    captureDate: dateKey(session.captureDate ?? session.observed_at),
    confirmationIntent: semanticObject(session.confirmationIntent),
    conditions: semanticObject(session.sessionConditions ?? session.conditions),
    photos: (session.photos ?? [])
      .map((photo) => ({
        active: photo.active !== false,
        canonicalPhotoId: photo.canonicalPhotoId ?? photo.id ?? null,
        conditions: semanticObject(photo.conditions),
        identityStatus: photo.identityStatus ?? null,
        mediaIdentity: (photo.sourceHashes ?? [photo.source_hash]).find(Boolean) ??
          photo.storage_path ?? photo.imagePath ?? photo.sourcePath ?? null,
        poseId: getProgressPhotoCategoryId(photo),
        status: photo.status ?? null,
        userConfirmedIdentity: photo.userConfirmedIdentity !== false,
      }))
      .sort((left, right) =>
        `${left.poseId}|${left.canonicalPhotoId}`.localeCompare(
          `${right.poseId}|${right.canonicalPhotoId}`)),
  };
  return `sha256_${createHash("sha256").update(stable(semantic)).digest("hex")}`;
}

export function createCanonicalPhotoSessionRecord({
  canonicalId,
  payload,
  existingObject = null,
  sourceObject = null,
  now = new Date().toISOString(),
  userId,
} = {}) {
  const hasCanonicalRevision = Boolean(existingObject?.photoSessionRevision);
  const semanticFingerprint = createPhotoSessionSemanticFingerprint(payload);
  const priorFingerprint = hasCanonicalRevision
    ? existingObject.photoSessionRevision.semanticFingerprint ??
      createPhotoSessionSemanticFingerprint(existingObject.payload)
    : null;
  const semanticChanged = !hasCanonicalRevision ||
    semanticFingerprint !== priorFingerprint;
  const priorRevision = hasCanonicalRevision
    ? existingObject.photoSessionRevision.revision ?? 1
    : 0;
  const revision = semanticChanged ? priorRevision + 1 : priorRevision || 1;
  const history = [...(existingObject?.photoSessionRevisionHistory ?? [])];
  if (hasCanonicalRevision && semanticChanged) {
    history.push(Object.freeze({
      revision: priorRevision || 1,
      semanticFingerprint: priorFingerprint,
      payload: structuredClone(existingObject.payload),
      provenance: structuredClone(existingObject.provenance ?? {}),
      updatedAt: existingObject.updatedAt ?? null,
    }));
  }
  const attribution = existingObject?.goalPhaseAttribution ??
    sourceObject?.goalPhaseAttribution ?? null;
  const provenance = mergeProvenance(existingObject?.provenance, sourceObject?.provenance);

  return {
    canonicalId,
    createdAt: existingObject?.createdAt ?? now,
    updatedAt: semanticChanged || !existingObject ? now : existingObject.updatedAt,
    evidence_type: "photo_session",
    firstObservedAt: existingObject?.firstObservedAt ?? payload.captureDate,
    lastObservedAt: payload.captureDate,
    photoSessionRevision: {
      schemaVersion: PHOTO_SESSION_REVISION_SCHEMA_VERSION,
      revision,
      semanticFingerprint: semanticChanged ? semanticFingerprint : priorFingerprint,
      priorSemanticFingerprint: semanticChanged ? priorFingerprint :
        existingObject?.photoSessionRevision?.priorSemanticFingerprint ?? null,
      revisedAt: existingObject && semanticChanged ? now :
        existingObject?.photoSessionRevision?.revisedAt ?? null,
    },
    photoSessionRevisionHistory: history,
    ...(attribution ? {
      goalId: attribution.goalId,
      phaseId: attribution.phaseId,
      goalPhaseAttribution: attribution,
    } : {}),
    payload,
    provenance,
    quality: { status: "active" },
    userId,
  };
}

function mergeProvenance(left = {}, right = {}) {
  const keys = new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})]);
  return Object.fromEntries([...keys].map((key) => {
    const a = left?.[key];
    const b = right?.[key];
    if (Array.isArray(a) || Array.isArray(b)) {
      return [key, [...new Set([...(a ?? []), ...(b ?? [])].filter(Boolean))]];
    }
    return [key, b ?? a];
  }));
}

function semanticObject(value) {
  if (!value || typeof value !== "object") return value ?? null;
  return JSON.parse(stable(value));
}

function stable(value) {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function dateKey(value) {
  return String(value ?? "").slice(0, 10);
}

function compareAuthority(left, right) {
  return Number(left.photoSessionRevision?.revision ?? left.version ?? 0) -
    Number(right.photoSessionRevision?.revision ?? right.version ?? 0) ||
    String(left.updatedAt ?? left.createdAt ?? "").localeCompare(
      String(right.updatedAt ?? right.createdAt ?? "")) ||
    String(left.canonicalId).localeCompare(String(right.canonicalId));
}

function isActive(record) {
  return record.quality?.status !== "superseded" &&
    !record.quality?.supersededBy &&
    record.canonicalLifecycleStatus !== "superseded";
}

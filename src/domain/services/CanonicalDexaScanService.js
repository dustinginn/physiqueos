import { createHash } from "node:crypto";
import { assertValidDexaScan } from "./DEXAContract";

export const DEXA_SCAN_REVISION_SCHEMA_VERSION =
  "canonical-dexa-scan-revision-v1";

const DEXA_TYPES = new Set(["dexa", "dexa_scan", "body_composition"]);

export function isDexaEvidence(value = {}) {
  return DEXA_TYPES.has((value.payload ?? value).evidence_type);
}

export function getDexaLogicalScanKey(value = {}) {
  const payload = value.payload ?? value;
  const owner = value.userId ?? payload.userId ?? "owner";
  const date = dexaDate(payload);
  return date ? `dexa_scan|${owner}|${date}` : null;
}

export function getStableDexaCanonicalId(value = {}, userId = null) {
  const payload = value.payload ?? value;
  const owner = userId ?? value.userId ?? payload.userId;
  const date = dexaDate(payload);
  return owner && date ? `dexa_scan|${owner}|${date}` : null;
}

export function createDexaSemanticFingerprint(value = {}) {
  const payload = value.payload ?? value;
  const semantic = Object.fromEntries(Object.entries(payload)
    .filter(([key]) => ![
      "id", "userId", "sourceFileId", "rawReportPath", "source",
      "provenance", "createdAt", "updatedAt", "captured_at",
      "reconciliation", "parser_confidence", "review_required",
      "goalId", "phaseId", "goalPhaseAttribution", "relatedGoalIds",
    ].includes(key)));
  semantic.evidence_type = "dexa_scan";
  semantic.observed_at = dexaDate(payload);
  semantic.measuredAt = dexaDate(payload);
  return `sha256_${createHash("sha256").update(stable(semantic)).digest("hex")}`;
}

export function getCanonicalDexaSemanticFingerprint(record = {}) {
  return record.dexaRevision?.semanticFingerprint ??
    createDexaSemanticFingerprint(record.payload ?? record);
}

export function dexaRecordHasSemanticChange(candidate = {}, existing = null) {
  if (!existing) return true;
  return getCanonicalDexaSemanticFingerprint(candidate) !==
    getCanonicalDexaSemanticFingerprint(existing);
}

export function selectActiveCanonicalDexaScans(
  canonicalObjects = [],
  { date = null, userId = null } = {},
) {
  const groups = new Map();
  for (const record of canonicalObjects) {
    const payload = record.payload ?? record;
    if (!isDexaEvidence(payload) || !isActive(record)) continue;
    if (userId && record.userId && record.userId !== userId) continue;
    if (date && dexaDate(payload) !== date) continue;
    const key = getDexaLogicalScanKey(record);
    if (!key) continue;
    const candidates = groups.get(key) ?? [];
    candidates.push(record);
    groups.set(key, candidates);
  }
  const diagnostics = [];
  const records = [];
  for (const [logicalScanKey, candidates] of groups) {
    const ordered = [...candidates].sort(compareAuthority);
    records.push(ordered.at(-1));
    if (ordered.length > 1) {
      diagnostics.push(Object.freeze({
        code: "DEXA_ACTIVE_SCAN_DUPLICATE",
        logicalScanKey,
        canonicalIds: Object.freeze(ordered.map((item) => item.canonicalId).sort()),
      }));
    }
  }
  return Object.freeze({
    diagnostics: Object.freeze(diagnostics),
    records: Object.freeze(records.sort((left, right) =>
      dexaDate(left.payload ?? left).localeCompare(dexaDate(right.payload ?? right)) ||
      String(left.canonicalId).localeCompare(String(right.canonicalId)))),
  });
}

export function createCanonicalDexaScanRecord({
  canonicalId,
  canonicalProvenance = {},
  evidenceObject = {},
  evidencePackage = {},
  existingObject = null,
  goalPhaseAttribution = null,
  now = new Date().toISOString(),
  userId,
} = {}) {
  assertValidDexaScan(evidenceObject, { production: true });
  const date = dexaDate(evidenceObject);
  if (!date) throw new TypeError("Canonical DEXA requires an intended scan date.");
  const payload = {
    ...structuredClone(evidenceObject),
    id: existingObject?.payload?.id ?? evidenceObject.id,
    evidence_type: "dexa_scan",
    measuredAt: date,
    observed_at: date,
  };
  const priorFingerprint = existingObject
    ? getCanonicalDexaSemanticFingerprint(existingObject)
    : null;
  const semanticFingerprint = createDexaSemanticFingerprint(payload);
  const semanticChanged = !existingObject || semanticFingerprint !== priorFingerprint;
  const priorRevision = existingObject?.dexaRevision?.revision ??
    (existingObject ? 1 : 0);
  const revision = semanticChanged ? priorRevision + 1 : priorRevision || 1;
  const history = [...(existingObject?.dexaRevisionHistory ?? [])];
  if (existingObject && semanticChanged) history.push(createRevisionSnapshot(existingObject));
  const attribution = existingObject?.goalPhaseAttribution ??
    goalPhaseAttribution ?? null;
  const sourceReviewId = evidencePackage?.review_metadata?.sourceReviewId ?? null;

  return {
    canonicalId,
    createdAt: existingObject?.createdAt ?? now,
    evidence_type: "dexa_scan",
    firstObservedAt: existingObject?.firstObservedAt ?? date,
    lastObservedAt: date,
    dexaRevision: {
      schemaVersion: DEXA_SCAN_REVISION_SCHEMA_VERSION,
      logicalScanKey: getDexaLogicalScanKey({ payload, userId }),
      revision,
      semanticFingerprint: semanticChanged ? semanticFingerprint : priorFingerprint,
      priorSemanticFingerprint: semanticChanged ? priorFingerprint :
        existingObject?.dexaRevision?.priorSemanticFingerprint ?? null,
      sourceEvidencePackageId: semanticChanged
        ? evidencePackage?.package_id ?? evidencePackage?.id ?? null
        : existingObject?.dexaRevision?.sourceEvidencePackageId ?? null,
      sourceEvidenceObjectId: semanticChanged
        ? evidenceObject.id ?? null
        : existingObject?.dexaRevision?.sourceEvidenceObjectId ?? null,
      sourceReviewId: semanticChanged
        ? sourceReviewId
        : existingObject?.dexaRevision?.sourceReviewId ?? null,
      revisedAt: existingObject && semanticChanged ? now :
        existingObject?.dexaRevision?.revisedAt ?? null,
    },
    dexaRevisionHistory: history,
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

function createRevisionSnapshot(record) {
  return Object.freeze({
    revision: record.dexaRevision?.revision ?? 1,
    semanticFingerprint: getCanonicalDexaSemanticFingerprint(record),
    payload: structuredClone(record.payload),
    provenance: structuredClone(record.provenance ?? {}),
    updatedAt: record.updatedAt ?? null,
  });
}

function compareAuthority(left, right) {
  return Number(left.dexaRevision?.revision ?? left.version ?? 0) -
    Number(right.dexaRevision?.revision ?? right.version ?? 0) ||
    String(left.updatedAt ?? left.createdAt ?? "").localeCompare(
      String(right.updatedAt ?? right.createdAt ?? "")) ||
    String(left.canonicalId).localeCompare(String(right.canonicalId));
}

function isActive(record) {
  return record.quality?.status !== "superseded" &&
    !record.quality?.supersededBy &&
    record.canonicalLifecycleStatus !== "superseded";
}

function dexaDate(value = {}) {
  return String(value.measuredAt ?? value.observed_at ?? value.date ?? "").slice(0, 10);
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

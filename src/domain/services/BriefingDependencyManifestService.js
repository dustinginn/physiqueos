import { createHash } from "node:crypto";
import {
  getBriefingOccurrenceIdentity,
  stableSerialize,
} from "../../data/repositories/DailyBriefingHistory";

export const BRIEFING_DEPENDENCY_MANIFEST_VERSION =
  "briefing_dependency_manifest_v1";
export const CANONICAL_EVIDENCE_DEPENDENCY_VERSION =
  "canonical_evidence_dependency_v1";

const SUPPORTED_EVIDENCE_TYPES = new Set([
  "activity_day",
  "body_composition",
  "dexa",
  "dexa_scan",
  "nutrition",
  "photo_session",
  "recovery_day",
  "training",
  "weight",
]);

export function createCanonicalEvidenceSemanticDescriptor(record = {}) {
  const payload = record.payload ?? record;
  const evidenceType = normalizeEvidenceType(
    payload.evidence_type ?? record.evidence_type ?? inferEvidenceType(payload)
  );
  if (!SUPPORTED_EVIDENCE_TYPES.has(evidenceType)) return null;
  const observedDate = evidenceDate(record, payload);
  if (!observedDate) return null;
  const nutritionRevision = evidenceType === "nutrition"
    ? record.nutritionRevision ?? payload.nutritionRevision ?? null
    : null;
  const canonicalObjectId = String(
    record.canonicalId ?? payload.canonicalId ?? payload.id ?? record.id ?? ""
  ).trim();
  const logicalIdentity = nutritionRevision?.logicalDayKey ??
    logicalIdentityFor({ canonicalObjectId, evidenceType, observedDate, payload });
  const semanticRevision = finiteInteger(
    nutritionRevision?.revision ?? record.semanticRevision ?? payload.semanticRevision
  );
  const semanticDigest = nutritionRevision?.semanticFingerprint ||
    digest(semanticPayloadFor(evidenceType, payload));

  return freeze({
    schemaVersion: CANONICAL_EVIDENCE_DEPENDENCY_VERSION,
    canonicalObjectId: canonicalObjectId || logicalIdentity,
    evidenceType,
    observedDate,
    logicalIdentity,
    semanticRevision,
    semanticDigest,
    semanticChangedAt: isoOrNull(
      nutritionRevision?.replacedAt ?? record.updatedAt ?? record.createdAt ??
      payload.updatedAt ?? payload.createdAt
    ),
    sourceLinkage: compact({
      commitId: record.commitId ?? payload.commitId ?? null,
      repositoryId: record.repositoryId ?? payload.repositoryId ?? null,
      sourceEvidencePackageId:
        record.sourceEvidencePackageId ?? payload.sourceEvidencePackageId ??
        nutritionRevision?.sourceEvidencePackageId ??
        latest(record.provenance?.evidence_package_ids) ?? null,
      sourceReviewId: record.sourceReviewId ?? payload.sourceReviewId ??
        nutritionRevision?.sourceReviewId ?? null,
    }),
  });
}

export function createBriefingDependencyManifest({
  publication,
  evidenceInputs = [],
  evidenceCutoff = null,
} = {}) {
  if (!publication?.id || !publication?.evidenceWindow?.id) {
    throw new Error("A publication root and evidence window are required.");
  }
  const window = publication.evidenceWindow;
  const dependencies = selectBriefingDependencyInputs(evidenceInputs, window)
    .map(createCanonicalEvidenceSemanticDescriptor)
    .filter(Boolean);
  const canonicalDependencies = selectAuthoritativeDependencies(dependencies);
  const identity = {
    publicationRootId: publication.id,
    briefingType: publication.cadence ?? window.cadence,
    occurrenceIdentity: getBriefingOccurrenceIdentity(publication),
    evidenceWindowId: window.id,
    evidenceWindowStart: window.startDate ?? String(window.start ?? "").slice(0, 10),
    evidenceWindowEnd: window.endDate ?? window.date ?? String(window.end ?? "").slice(0, 10),
    evidenceCutoff: evidenceCutoff ?? publication.evidenceCutoff ?? window.cutoff ??
      (window.endDate ? `${window.endDate}T23:59:59.999Z` : null),
    timeZone: publication.timeZone ?? window.timeZone ?? "America/Los_Angeles",
  };
  const fingerprint = digest({ ...identity, canonicalDependencies });
  return freeze({
    schemaVersion: BRIEFING_DEPENDENCY_MANIFEST_VERSION,
    ...identity,
    canonicalDependencies,
    fingerprint,
  });
}

export function attachBriefingDependencyManifest(
  publication,
  evidenceInputs = []
) {
  const artifact = structuredClone(publication);
  artifact.dependencyManifest = createBriefingDependencyManifest({
    publication: artifact,
    evidenceInputs,
  });
  artifact.publicationReconciliation = {
    ...(artifact.publicationReconciliation ?? {}),
    schemaVersion: "briefing_publication_reconciliation_v1",
    state: artifact.publicationReconciliation?.state === "current_after_revision"
      ? "current_after_revision"
      : "current",
    dependencyFingerprint: artifact.dependencyManifest.fingerprint,
  };
  return artifact;
}

export function compareBriefingDependencyManifests(published, current) {
  if (!published || published.schemaVersion !== BRIEFING_DEPENDENCY_MANIFEST_VERSION) {
    return freeze({
      stale: true,
      reason: "legacy_manifest_missing",
      added: current?.canonicalDependencies ?? [],
      removed: [],
      changed: [],
    });
  }
  const prior = new Map(
    (published.canonicalDependencies ?? []).map((item) => [item.logicalIdentity, item])
  );
  const next = new Map(
    (current?.canonicalDependencies ?? []).map((item) => [item.logicalIdentity, item])
  );
  const added = [...next.entries()]
    .filter(([key]) => !prior.has(key)).map(([, value]) => value);
  const removed = [...prior.entries()]
    .filter(([key]) => !next.has(key)).map(([, value]) => value);
  const changed = [...next.entries()]
    .filter(([key, value]) => prior.has(key) &&
      prior.get(key).semanticDigest !== value.semanticDigest)
    .map(([key, value]) => ({
      logicalIdentity: key,
      previous: prior.get(key),
      current: value,
    }));
  return freeze({
    stale: added.length > 0 || removed.length > 0 || changed.length > 0,
    reason: added.length || removed.length || changed.length
      ? "semantic_dependency_drift" : "current",
    added,
    removed,
    changed,
  });
}

export function selectBriefingDependencyInputs(inputs = [], window = {}) {
  const start = String(window.startDate ?? window.start ?? "").slice(0, 10);
  const end = String(window.endDate ?? window.date ?? window.end ?? "").slice(0, 10);
  return inputs.filter((record) => {
    const payload = record?.payload ?? record;
    const type = normalizeEvidenceType(
      payload?.evidence_type ?? record?.evidence_type ?? inferEvidenceType(payload)
    );
    const date = evidenceDate(record, payload);
    return SUPPORTED_EVIDENCE_TYPES.has(type) && date &&
      (!start || date >= start) && (!end || date <= end) &&
      record?.quality?.status !== "superseded" &&
      payload?.quality?.status !== "superseded";
  });
}

function selectAuthoritativeDependencies(dependencies) {
  const byIdentity = new Map();
  for (const dependency of dependencies) {
    const existing = byIdentity.get(dependency.logicalIdentity);
    if (!existing || compareDependencyAuthority(existing, dependency) < 0) {
      byIdentity.set(dependency.logicalIdentity, dependency);
    }
  }
  return [...byIdentity.values()].sort((left, right) =>
    left.logicalIdentity.localeCompare(right.logicalIdentity) ||
    left.semanticDigest.localeCompare(right.semanticDigest)
  );
}

function compareDependencyAuthority(left, right) {
  const revision = (left.semanticRevision ?? 0) - (right.semanticRevision ?? 0);
  if (revision) return revision;
  const changed = String(left.semanticChangedAt ?? "")
    .localeCompare(String(right.semanticChangedAt ?? ""));
  if (changed) return changed;
  return left.semanticDigest.localeCompare(right.semanticDigest);
}

function semanticPayloadFor(type, payload) {
  if (type === "nutrition") return {
    observed_at: evidenceDate(payload, payload),
    daily_totals: payload.daily_totals ?? payload.totals ?? null,
    meals: (payload.meals ?? []).map((meal) => ({
      name: meal.name ?? meal.id ?? null,
      totals: meal.totals ?? null,
      foods: (meal.foods ?? []).map((food) => ({
        name: food.name ?? null,
        amount: food.amount ?? food.quantity ?? null,
        calories: food.calories ?? null,
        macros: food.macros ?? null,
      })),
    })),
  };
  if (type === "training") return {
    observed_at: evidenceDate(payload, payload),
    duration: payload.metadata?.duration_seconds ?? payload.duration_seconds ?? null,
    activityType: payload.metadata?.activity_type ?? payload.activity_type ?? null,
    exercises: (payload.exercises ?? []).map((exercise) => ({
      name: exercise.canonicalExerciseId ?? exercise.name ?? exercise.id ?? null,
      variant: exercise.executionVariant ?? exercise.variant ?? null,
      sets: exercise.sets ?? [],
    })),
  };
  if (type === "activity_day") return {
    observed_at: evidenceDate(payload, payload),
    daily_activity: payload.daily_activity ?? payload.activity ?? null,
    workouts: payload.workouts ?? [],
  };
  if (type === "weight") return {
    observed_at: evidenceDate(payload, payload),
    weight: payload.weight ?? payload.value ?? payload.metadata?.value ?? null,
    unit: payload.unit ?? payload.metadata?.unit ?? null,
  };
  if (["dexa", "dexa_scan", "body_composition"].includes(type)) return {
    observed_at: evidenceDate(payload, payload),
    weight: payload.weight ?? null,
    bodyFatPercentage: payload.bodyFatPercentage ?? null,
    fatMass: payload.fatMass ?? null,
    leanMass: payload.leanMass ?? null,
    visceralAdiposeTissue: payload.visceralAdiposeTissue ?? null,
    restingMetabolicRate: payload.restingMetabolicRate ?? null,
  };
  if (type === "photo_session") return {
    observed_at: evidenceDate(payload, payload),
    photos: (payload.photos ?? []).map((photo) => ({
      id: photo.id ?? photo.source_artifact_ref ?? null,
      category: photo.category ?? photo.poseId ?? photo.pose ?? null,
      active: photo.active !== false,
    })),
  };
  return removeVolatile(payload);
}

function logicalIdentityFor({ canonicalObjectId, evidenceType, observedDate, payload }) {
  if (evidenceType === "activity_day") return `activity_day|${observedDate}`;
  if (evidenceType === "weight") return `weight|${observedDate}|${canonicalObjectId}`;
  if (evidenceType === "training") {
    return `training|${observedDate}|${canonicalObjectId || payload.id || "session"}`;
  }
  return `${evidenceType}|${observedDate}|${canonicalObjectId || payload.id || "evidence"}`;
}

function evidenceDate(record = {}, payload = record) {
  return String(
    payload?.observed_at ?? payload?.measuredAt ?? payload?.date ??
    payload?.evidenceDate ??
    payload?.metadata?.date ?? record?.lastObservedAt ?? record?.observedAt ?? ""
  ).slice(0, 10);
}

function inferEvidenceType(payload = {}) {
  if (payload.daily_totals || payload.meals) return "nutrition";
  if (payload.exercises) return "training";
  if (payload.daily_activity || payload.activeCalories != null) return "activity_day";
  if (payload.weight?.value != null || payload.weightValue != null) return "weight";
  if (payload.bodyFatPercentage != null || payload.leanMass != null) return "dexa_scan";
  if (payload.photos) return "photo_session";
  return "unknown";
}

function normalizeEvidenceType(value) {
  const type = String(value ?? "").trim().toLowerCase();
  if (type === "activity") return "activity_day";
  if (type === "morning_weight") return "weight";
  if (type === "nutrition_day") return "nutrition";
  if (type === "recovery") return "recovery_day";
  if (type === "training_session") return "training";
  if (type === "progress_photo" || type === "progress_photos") {
    return "photo_session";
  }
  return type;
}

function removeVolatile(value) {
  if (Array.isArray(value)) return value.map(removeVolatile);
  if (!value || typeof value !== "object") return value;
  const ignored = new Set([
    "captured_at", "confidence", "createdAt", "provenance", "quality",
    "reconciliation", "source", "updatedAt",
  ]);
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !ignored.has(key))
    .map(([key, child]) => [key, removeVolatile(child)]));
}

function finiteInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function isoOrNull(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function compact(value) {
  return Object.fromEntries(Object.entries(value)
    .filter(([, child]) => child !== null && child !== undefined && child !== ""));
}

function latest(value) {
  return Array.isArray(value) ? value.at(-1) : value ?? null;
}

function digest(value) {
  return `sha256_${createHash("sha256").update(stableSerialize(value)).digest("hex")}`;
}

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}

import { classifyBriefingCadence } from
  "../../data/repositories/DailyBriefingHistory";
import {
  BRIEFING_DEPENDENCY_MANIFEST_VERSION,
  createCanonicalEvidenceSemanticDescriptor,
} from "./BriefingDependencyManifestService";

export const BRIEFING_AFFECTED_PUBLICATION_PLANNER_VERSION =
  "briefing_affected_publication_planner_v1";

const CADENCE_TYPES = new Set(["weekly", "midweek", "monthly"]);

export function planAffectedBriefingPublications({
  evidenceChanges = [],
  publications = [],
  confirmedAt = null,
  automatic = true,
} = {}) {
  const descriptors = evidenceChanges
    .map((change) => normalizeChange(change, confirmedAt))
    .filter(Boolean);
  const currentCadenceRoots = selectCurrentCadenceRoots(publications);
  const plans = [];

  for (const publication of publications) {
    if (!isPublished(publication)) continue;
    const cadence = classifyBriefingCadence(publication);
    if (CADENCE_TYPES.has(cadence)) {
      if (currentCadenceRoots.get(cadence) !== publication) continue;
      const affected = descriptors.filter((change) =>
        cadenceChangeEligibility({ automatic, change, publication })
      );
      if (!affected.length) continue;
      const drift = dependencyDrift(publication.dependencyManifest, affected);
      if (!drift.stale) continue;
      plans.push(createPlan({ cadence, publication, affected, drift }));
      continue;
    }
    if (cadence === "event") {
      const affected = descriptors.filter((change) =>
        isPrimaryEventCorrection(publication, change)
      );
      if (!affected.length) continue;
      plans.push(createPlan({
        cadence: "event",
        publication,
        affected,
        drift: { stale: true, reason: "primary_event_semantic_revision" },
      }));
    }
  }

  return Object.freeze(plans.sort((left, right) =>
    left.publicationRootId.localeCompare(right.publicationRootId)
  ));
}

export function isWithinFollowingDayLatenessPolicy({
  evidenceDate,
  confirmedAt,
  timeZone = "America/Los_Angeles",
} = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(evidenceDate ?? ""))) return false;
  const confirmationDate = localDateKey(confirmedAt, timeZone);
  return confirmationDate === shiftDateKey(evidenceDate, 1);
}

function cadenceChangeEligibility({ automatic, change, publication }) {
  const window = publication.evidenceWindow ?? {};
  const start = String(window.startDate ?? window.start ?? "").slice(0, 10);
  const end = String(window.endDate ?? window.date ?? window.end ?? "").slice(0, 10);
  if (!start || !end || change.observedDate < start || change.observedDate > end) {
    return false;
  }
  const changedAt = change.semanticChangedAt ?? change.confirmedAt;
  if (Date.parse(changedAt) <= Date.parse(publication.generatedAt)) return false;
  if (!automatic) return true;
  return isWithinFollowingDayLatenessPolicy({
    evidenceDate: change.observedDate,
    confirmedAt: change.confirmedAt,
    timeZone: window.timeZone ?? publication.timeZone,
  });
}

function dependencyDrift(manifest, changes) {
  if (manifest?.schemaVersion !== BRIEFING_DEPENDENCY_MANIFEST_VERSION) {
    return { stale: true, reason: "legacy_manifest_missing" };
  }
  const prior = new Map((manifest.canonicalDependencies ?? [])
    .map((item) => [item.logicalIdentity, item]));
  const changed = changes.filter((item) =>
    !prior.has(item.logicalIdentity) ||
    prior.get(item.logicalIdentity).semanticDigest !== item.semanticDigest
  );
  return {
    stale: changed.length > 0,
    reason: changed.length ? "semantic_dependency_drift" : "current",
  };
}

function createPlan({ cadence, publication, affected, drift }) {
  return Object.freeze({
    schemaVersion: BRIEFING_AFFECTED_PUBLICATION_PLANNER_VERSION,
    publicationRootId: publication.id,
    occurrenceIdentity: publication.evidenceWindow?.id ?? publication.id,
    cadence,
    evidenceWindow: structuredClone(publication.evidenceWindow ?? null),
    currentDependencyFingerprint: publication.dependencyManifest?.fingerprint ?? null,
    reason: cadence === "event"
      ? "primary_event_semantic_revision"
      : "late_evidence_reconciliation",
    driftReason: drift.reason,
    affectedDependencies: Object.freeze([...affected].sort((left, right) =>
      left.logicalIdentity.localeCompare(right.logicalIdentity)
    )),
    eligible: true,
  });
}

function normalizeChange(change, confirmedAt) {
  const descriptor = change?.schemaVersion === "canonical_evidence_dependency_v1"
    ? change
    : createCanonicalEvidenceSemanticDescriptor(change);
  if (!descriptor) return null;
  const resolvedConfirmedAt = isoOrNull(
    change.confirmedAt ?? confirmedAt ?? descriptor.semanticChangedAt
  );
  if (!resolvedConfirmedAt) return null;
  return Object.freeze({
    ...descriptor,
    semanticChangedAt: descriptor.semanticChangedAt ?? resolvedConfirmedAt,
    confirmedAt: resolvedConfirmedAt,
  });
}

function selectCurrentCadenceRoots(publications) {
  const roots = new Map();
  for (const publication of publications.filter(isPublished)) {
    const cadence = classifyBriefingCadence(publication);
    if (!CADENCE_TYPES.has(cadence)) continue;
    const existing = roots.get(cadence);
    if (!existing || comparePublicationRecency(existing, publication) < 0) {
      roots.set(cadence, publication);
    }
  }
  return roots;
}

function comparePublicationRecency(left, right) {
  const window = String(left.evidenceWindow?.endDate ?? left.evidenceWindow?.date ?? "")
    .localeCompare(String(right.evidenceWindow?.endDate ?? right.evidenceWindow?.date ?? ""));
  if (window) return window;
  return String(left.generatedAt ?? "").localeCompare(String(right.generatedAt ?? ""));
}

function isPrimaryEventCorrection(publication, change) {
  const trigger = publication.trigger ?? {};
  const triggerType = normalizeType(trigger.evidenceType);
  return Boolean(
    triggerType && triggerType === normalizeType(change.evidenceType) &&
    [trigger.evidenceId, trigger.canonicalObjectId, publication.primaryEvidenceId]
      .filter(Boolean).includes(change.canonicalObjectId)
  );
}

function isPublished(publication) {
  return Boolean(publication?.briefing && publication.preview !== true &&
    publication.lifecycle?.generationStatus !== "in_progress" &&
    publication.lifecycle?.generationStatus !== "failed");
}

function normalizeType(value) {
  const type = String(value ?? "").toLowerCase();
  if (type === "dexa") return "dexa_scan";
  if (type === "progress_photo") return "photo_session";
  return type;
}

function localDateKey(value, timeZone) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone ?? "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function shiftDateKey(value, days) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isoOrNull(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

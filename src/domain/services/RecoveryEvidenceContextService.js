import {
  RECOVERY_EVIDENCE_WINDOW_LIMIT,
  listRecoveryEvidenceInWindow,
} from "../../data/repositories/CanonicalEvidenceRepository";

export const RECOVERY_EVIDENCE_CONTEXT_VERSION =
  "recovery_evidence_context_v1";

export async function createRecoveryEvidenceContext({
  records = null,
  canonicalEvidenceObjects = null,
  repository = null,
  userId,
  window,
  timezone,
  metrics = null,
  limit = RECOVERY_EVIDENCE_WINDOW_LIMIT,
} = {}) {
  const normalizedWindow = normalizeWindow(window);
  const loaded = records
    ? filterExplicitRecords(records, userId, normalizedWindow, metrics, limit)
    : canonicalEvidenceObjects
      ? listRecoveryEvidenceInWindow(
          canonicalEvidenceObjects,
          userId,
          normalizedWindow,
          { metrics, limit }
        )
      : repository
        ? await repository.listRecoveryEvidenceInWindow(
            userId,
            normalizedWindow,
            { metrics, limit }
          )
        : [];
  const ordered = loaded.map((item) => structuredClone(item));
  const datesWithEvidence = unique(ordered.map((item) => item.evidenceDate));
  const expectedDayCount = daysInclusive(
    normalizedWindow.startDate,
    normalizedWindow.endDate
  );
  const recordsByMetric = Object.fromEntries(
    unique(ordered.map((item) => item.metric)).map((metric) => [
      metric,
      ordered.filter((item) => item.metric === metric),
    ])
  );
  const sourceCoverage = Object.fromEntries(
    unique(ordered.map((item) => item.source.kind)).map((source) => [
      source,
      ordered.filter((item) => item.source.kind === source).length,
    ])
  );
  const metricCoverage = Object.fromEntries(
    Object.entries(recordsByMetric).map(([metric, values]) => [
      metric,
      {
        recordCount: values.length,
        coveredDayCount: unique(values.map((item) => item.evidenceDate)).length,
      },
    ])
  );
  return Object.freeze({
    schemaVersion: RECOVERY_EVIDENCE_CONTEXT_VERSION,
    window: normalizedWindow,
    timezone,
    records: ordered,
    recordsByMetric,
    datesWithEvidence,
    expectedDayCount,
    coveredDayCount: datesWithEvidence.length,
    missingDayCount: Math.max(0, expectedDayCount - datesWithEvidence.length),
    sourceCoverage,
    metricCoverage,
    evidenceIds: ordered.map((item) => item.id).sort(),
    limitations: [
      ...(ordered.length ? [] : ["recovery_evidence_unavailable"]),
      ...(datesWithEvidence.length < expectedDayCount
        ? ["recovery_evidence_coverage_partial"]
        : []),
    ],
    repositoryReads: repository && !records && !canonicalEvidenceObjects ? 1 : 0,
    interpretationPerformed: false,
  });
}

function filterExplicitRecords(records, userId, window, metrics, limit) {
  const metricSet = metrics ? new Set(metrics) : null;
  return records
    .filter((item) =>
      item.userId === userId &&
      item.evidenceDate >= window.startDate &&
      item.evidenceDate <= window.endDate &&
      item.status !== "invalid" &&
      item.status !== "superseded" &&
      !item.supersededByEvidenceId &&
      (!metricSet || metricSet.has(item.metric))
    )
    .sort((left, right) =>
      `${left.evidenceDate}|${left.metric}|${left.id}`.localeCompare(
        `${right.evidenceDate}|${right.metric}|${right.id}`
      )
    )
    .slice(0, limit);
}

function normalizeWindow(window) {
  if (!window?.startDate || !window?.endDate) {
    throw new Error("Recovery context requires a bounded evidence window.");
  }
  if (window.startDate > window.endDate) {
    throw new Error("Recovery context window is invalid.");
  }
  return Object.freeze({
    startDate: window.startDate,
    endDate: window.endDate,
  });
}
function daysInclusive(startDate, endDate) {
  return Math.round(
    (Date.parse(`${endDate}T12:00:00Z`) -
      Date.parse(`${startDate}T12:00:00Z`)) /
      86400000
  ) + 1;
}
function unique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

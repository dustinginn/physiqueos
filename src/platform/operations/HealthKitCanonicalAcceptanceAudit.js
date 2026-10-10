import {
  HealthKitCanonicalDomain,
  assessHealthKitCoexistence,
} from "../../domain/services/HealthKitCanonicalDayService.js";
import {
  assessHealthKitStrategicEvidenceEligibility,
  isHealthKitDerivedRecord,
} from "../../domain/services/HealthKitEvidenceEligibilityPolicy.js";
import { resolveHealthKitCanonicalActivationPolicy } from "../../domain/services/HealthKitObservationService.js";

const DAILY_TYPES = Object.freeze({
  activity_summary: HealthKitCanonicalDomain.ACTIVITY,
  nutrition_daily_total: HealthKitCanonicalDomain.NUTRITION,
});

/**
 * Pure, read-only acceptance summary for a HealthKit canonical proving window.
 * It only interprets records it is handed. `includeValues` controls whether
 * health values appear (local audit output) or only structure (handoff-safe).
 */
export function summarizeHealthKitCanonicalAcceptance({
  policyRecord = null,
  observations = [],
  canonicalDays = [],
  canonicalEvidenceObjects = [],
  startLocalDate,
  endLocalDate,
  includeValues = true,
} = {}) {
  const policy = resolveHealthKitCanonicalActivationPolicy(policyRecord);
  const inWindow = (date) => date >= startLocalDate && date <= endLocalDate;
  const windowObservations = observations.filter((record) => DAILY_TYPES[record.observationType] && inWindow(record.occurrenceDate));
  const allWindowObservations = observations.filter((record) => inWindow(record.occurrenceDate));
  const byState = {};
  for (const record of windowObservations) {
    const key = `${record.observationType}|${record.ingestionPurpose}|${record.reconciliation?.state}|${record.reconciliation?.reason ?? ""}`;
    byState[key] = (byState[key] ?? 0) + 1;
  }
  const days = canonicalDays.filter((record) => inWindow(record.localDate));
  const perDomainDate = new Map();
  for (const day of days) {
    const key = `${day.domain}|${day.localDate}`;
    perDomainDate.set(key, (perDomainDate.get(key) ?? 0) + 1);
  }
  const dayReports = days.map((day) => {
    const live = assessHealthKitCoexistence({
      domain: day.domain,
      localDate: day.localDate,
      healthKitDay: day,
      canonicalEvidenceObjects,
    });
    return {
      domain: day.domain,
      localDate: day.localDate,
      revision: day.revision,
      revisionHistoryCount: (day.revisionHistory ?? []).length,
      coverage: day.current?.coverage,
      sourceRevision: day.current?.sourceRevision,
      sourceObservationCount: (day.provenance?.sourceObservationIds ?? []).length,
      provenance: {
        application: day.provenance?.application,
        integration: day.provenance?.integration,
        bundleIdentifier: day.provenance?.bundleIdentifier,
        basis: day.provenance?.basis,
      },
      evidenceEligibility: day.evidenceEligibility?.state,
      strategicEligible: assessHealthKitStrategicEvidenceEligibility(day).eligible === true,
      storedCoexistenceState: day.coexistence?.state ?? null,
      liveCoexistence: {
        state: live.state,
        conflictingFields: live.conflictingFields ?? [],
        otherSource: live.otherSource ?? null,
      },
      mealObjects: day.domain === HealthKitCanonicalDomain.NUTRITION ? day.current?.values?.mealObjects ?? null : undefined,
      nutritionAssertion: day.domain === HealthKitCanonicalDomain.NUTRITION ? day.current?.values?.assertion ?? null : undefined,
      ...(includeValues ? { values: day.current?.values } : {}),
    };
  });
  const healthKitEvidence = canonicalEvidenceObjects.filter((record) => isHealthKitDerivedRecord(record));
  const healthKitEvidenceInWindow = healthKitEvidence.filter((record) => {
    const payload = record.payload ?? record;
    return inWindow(String(payload.observed_at ?? payload.date ?? "").slice(0, 10));
  });
  const canonicalEvidenceInWindow = canonicalEvidenceObjects.filter((record) => {
    const payload = record.payload ?? record;
    return ["nutrition", "activity_day", "training"].includes(payload.evidence_type) &&
      inWindow(String(payload.observed_at ?? payload.date ?? "").slice(0, 10));
  });
  return {
    window: { startLocalDate, endLocalDate },
    policy: {
      enabled: policy.enabled,
      domains: policy.domains,
      effectiveLocalDate: policy.effectiveLocalDate,
      endLocalDate: policy.endLocalDate,
      openEnded: policy.openEnded ?? false,
      strategicEvidenceEligibility: policyRecord?.strategicEvidenceEligibility ?? null,
      historicalBackfill: policyRecord?.historicalBackfill ?? null,
      invalidReason: policy.invalidReason,
    },
    observationsByState: byState,
    observationCoverage: summarizeCoverage(allWindowObservations, {
      type: (record) => record.observationType ?? "unknown",
      date: (record) => record.occurrenceDate,
      source: (record) => [
        record.source?.bundleIdentifier ?? "unknown_bundle",
        record.source?.sourceName ?? "unknown_source",
      ].join("|"),
    }),
    observationCoverageTotals: summarizeCoverage(allWindowObservations, {
      type: (record) => record.observationType ?? "unknown",
      date: (record) => record.occurrenceDate,
      source: () => "all_sources",
    }),
    canonicalDays: dayReports,
    duplicateCanonicalDays: [...perDomainDate].filter(([, count]) => count > 1).map(([key]) => key),
    strategic: {
      healthKitCanonicalDaysStrategicEligible: dayReports.filter((day) => day.strategicEligible).length,
      healthKitCanonicalDaysNotQuarantined: dayReports.filter((day) => day.evidenceEligibility !== "quarantined").length,
      healthKitActivityEligible: dayReports.filter((day) => day.domain === "activity" && day.strategicEligible).length,
      healthKitNutritionEligible: dayReports.filter((day) => day.domain === "nutrition" && day.strategicEligible).length,
      healthKitDerivedRecordsInStrategicEvidence: healthKitEvidence.length,
      healthKitDerivedRecordsInStrategicEvidenceWithinWindow: healthKitEvidenceInWindow.length,
    },
    canonicalEvidenceCoverage: summarizeCoverage(canonicalEvidenceInWindow, {
      type: (record) => (record.payload ?? record).evidence_type ?? "unknown",
      date: (record) => String((record.payload ?? record).observed_at ?? (record.payload ?? record).date ?? "").slice(0, 10),
      source: (record) => {
        const source = (record.payload ?? record).source ?? {};
        return [source.integration ?? "no_integration", source.application ?? "unknown_application", source.modality ?? "unknown_modality"].join("|");
      },
    }),
    canonicalEvidenceCoverageTotals: summarizeCoverage(canonicalEvidenceInWindow, {
      type: (record) => (record.payload ?? record).evidence_type ?? "unknown",
      date: (record) => String((record.payload ?? record).observed_at ?? (record.payload ?? record).date ?? "").slice(0, 10),
      source: () => "all_sources",
    }),
  };
}

function summarizeCoverage(records, { type, date, source }) {
  const groups = new Map();
  for (const record of records) {
    const typeKey = String(type(record));
    const dateKey = String(date(record));
    const sourceKey = String(source(record));
    const key = `${typeKey}\u0000${sourceKey}`;
    const group = groups.get(key) ?? { type: typeKey, source: sourceKey, records: 0, dates: new Set() };
    group.records += 1;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) group.dates.add(dateKey);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => {
      const dates = [...group.dates].sort();
      return {
        type: group.type,
        source: group.source,
        records: group.records,
        distinctDays: dates.length,
        firstLocalDate: dates[0] ?? null,
        lastLocalDate: dates.at(-1) ?? null,
      };
    })
    .sort((left, right) => left.type.localeCompare(right.type) || left.source.localeCompare(right.source));
}

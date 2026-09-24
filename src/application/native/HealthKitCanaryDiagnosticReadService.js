import { createHash } from "node:crypto";
import { ApplicationProblem } from "../../contracts/v1/problem.js";
import {
  HEALTHKIT_CANONICAL_ACTIVATION_POLICY_RECORD_ID,
  HealthKitIngestionPurpose,
  HealthKitObservationType,
} from "../../domain/services/HealthKitObservationService.js";
import { HEALTHKIT_CANONICAL_DAY_COLLECTION } from "../../domain/services/HealthKitEvidenceEligibilityPolicy.js";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const MAXIMUM_RANGE_DAYS = 31;
const SEPTEMBER_23 = "2026-09-23";
const SEPTEMBER_24 = "2026-09-24";
const SEPTEMBER_23_AUTOMATIC_EXTERNAL_ID = "activity-summary:automatic:2026-09-23";
const ACTIVITY_UNITS = Object.freeze({
  move_calories: "kcal",
  exercise_minutes: "min",
  stand_hours: "h",
  steps: "count",
  walking_running_distance: "m",
  flights_climbed: "count",
});

export function createHealthKitCanaryDiagnosticReadService({ records, ownerUserId, buildIdentity = null } = {}) {
  if (!records?.list || !ownerUserId) {
    throw new Error("HealthKit canary diagnostics require record storage and owner authority.");
  }
  return Object.freeze({
    async getActivityValidation({ startDate, endDate } = {}) {
      const range = boundedDateRange(startDate, endDate);
      const observations = await records.list({ ownerUserId, collection: "healthKitObservations" });
      const items = observations
        .filter((record) => record.observationType === HealthKitObservationType.ACTIVITY_SUMMARY)
        .filter((record) => record.ingestionPurpose === HealthKitIngestionPurpose.VALIDATION_ONLY)
        .filter((record) => record.occurrenceDate >= range.startDate && record.occurrenceDate <= range.endDate)
        .sort((left, right) => left.occurrenceDate.localeCompare(right.occurrenceDate) || left.id.localeCompare(right.id))
        .map(projectActivityValidationObservation);
      return Object.freeze({
        purpose: "founder_healthkit_activity_canary_validation",
        boundedRange: range,
        canonicalAuthority: "none",
        strategicAuthority: "none",
        items: Object.freeze(items),
      });
    },

    /// Read-only, hard-bound authority fence for the one September 23
    /// Activity repair. It deliberately accepts no caller-selected date or
    /// collection and returns no HealthKit values.
    async getSeptember23ActivityRepairPreflight({ authenticatedDeviceId } = {}) {
      const runtimeSHA = String(buildIdentity?.gitSha ?? "").trim();
      const deviceId = String(authenticatedDeviceId ?? "").trim();
      if (!/^[0-9a-f]{40}$/.test(runtimeSHA) || !deviceId) {
        throw unavailableRepairPreflight();
      }
      const [observations, canonicalDays, dailyPolicy] = await Promise.all([
        records.list({ ownerUserId, collection: "healthKitObservations" }),
        records.list({ ownerUserId, collection: HEALTHKIT_CANONICAL_DAY_COLLECTION }),
        records.get({
          ownerUserId,
          collection: "healthKitConfiguration",
          recordId: HEALTHKIT_CANONICAL_ACTIVATION_POLICY_RECORD_ID,
        }),
      ]);
      const september23Days = canonicalDays.filter((record) =>
        record.domain === "activity" && record.localDate === SEPTEMBER_23);
      const september24Days = canonicalDays.filter((record) =>
        record.domain === "activity" && record.localDate === SEPTEMBER_24);
      const sourceObservations = observations.filter((record) =>
        record.observationType === HealthKitObservationType.ACTIVITY_SUMMARY &&
        (record.occurrenceDate ?? record.occurrence?.localDate) === SEPTEMBER_23 &&
        (record.ingestionPurpose ?? HealthKitIngestionPurpose.OPERATIONAL) === HealthKitIngestionPurpose.OPERATIONAL &&
        record.externalId === SEPTEMBER_23_AUTOMATIC_EXTERNAL_ID &&
        record.ingestion?.deliveryDeviceId === deviceId);
      const canonical = september23Days.length === 1 ? september23Days[0] : null;
      return Object.freeze({
        contractVersion: "healthkit-sep23-activity-repair-preflight-v1",
        localDate: SEPTEMBER_23,
        authenticatedDeviceId: deviceId,
        runtimeSHA,
        dailyPolicyDigest: dailyPolicy ? fullDigest(stable(dailyPolicy)) : null,
        canonicalDayCount: september23Days.length,
        canonicalRevision: exactPositiveInteger(canonical?.revision),
        canonicalSourceRevision: exactPositiveInteger(canonical?.current?.sourceRevision),
        sourceObservationCount: sourceObservations.length,
        historyCount: Array.isArray(canonical?.revisionHistory) ? canonical.revisionHistory.length : 0,
        september24ActivityCanonicalDayCount: september24Days.length,
      });
    },
  });
}

export function projectActivityValidationObservation(record) {
  const daily = record.measurement?.dailyActivity ?? {};
  const metrics = Object.fromEntries(Object.entries(ACTIVITY_UNITS)
    .filter(([key]) => daily[key] != null)
    .map(([key, unit]) => [key, Object.freeze({ value: daily[key], unit })]));
  return Object.freeze({
    sourceObservationId: record.id,
    ingestionPurpose: record.ingestionPurpose,
    observationType: record.observationType,
    frozenLocalDate: record.occurrenceDate,
    occurrence: Object.freeze({
      startedAt: record.occurrence?.startedAt ?? null,
      endedAt: record.occurrence?.endedAt ?? null,
      timeZone: record.occurrence?.timeZone ?? null,
      utcOffsetSeconds: record.occurrence?.utcOffsetSeconds ?? null,
    }),
    activity: Object.freeze({
      metrics: Object.freeze(metrics),
      coverage: record.measurement?.coverage ?? null,
      sourceRevision: record.measurement?.sourceRevision ?? null,
      aggregationScope: record.measurement?.aggregationScope ?? null,
      workoutActiveCaloriesAdditive: false,
    }),
    source: Object.freeze({
      bundleIdentifier: record.source?.bundleIdentifier ?? null,
      sourceName: record.source?.sourceName ?? null,
      sourceRevision: record.source?.sourceRevision ?? null,
      productType: record.source?.productType ?? null,
      privacySafeDeviceProvenance: record.source?.privacySafeDeviceProvenance ?? null,
    }),
    deliveryDeviceId: record.ingestion?.deliveryDeviceId ?? null,
    reconciliation: Object.freeze({
      state: record.reconciliation?.state ?? null,
      reason: record.reconciliation?.reason ?? null,
      canonicalized: false,
      canonicalizationPermanentBar: record.reconciliation?.canonicalizationPermanentBar === true,
    }),
    evidenceEligibility: record.evidenceEligibility?.state ?? null,
  });
}

function boundedDateRange(startDate, endDate) {
  const start = dateKey(startDate, "startDate");
  const end = dateKey(endDate, "endDate");
  if (start > end) throw validation("endDate", "The validation end date must not precede the start date.");
  const days = Math.round((Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86400000) + 1;
  if (days > MAXIMUM_RANGE_DAYS) {
    throw validation("endDate", `The validation window must contain at most ${MAXIMUM_RANGE_DAYS} local dates.`);
  }
  return Object.freeze({ startDate: start, endDate: end, inclusive: true });
}

function dateKey(value, field) {
  const text = String(value ?? "").trim();
  if (!DATE_KEY.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00.000Z`))) {
    throw validation(field, `${field} must be an explicit YYYY-MM-DD local date.`);
  }
  return text;
}

function validation(field, detail) {
  return new ApplicationProblem({
    status: 400,
    code: "VALIDATION_FAILED",
    title: "The bounded HealthKit canary diagnostic request is invalid.",
    fieldErrors: [{ field, code: "invalid", detail }],
  });
}

function exactPositiveInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function fullDigest(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function unavailableRepairPreflight() {
  return new ApplicationProblem({
    status: 503,
    code: "HEALTHKIT_SEP23_REPAIR_PREFLIGHT_UNAVAILABLE",
    title: "The bounded HealthKit repair preflight is unavailable.",
  });
}

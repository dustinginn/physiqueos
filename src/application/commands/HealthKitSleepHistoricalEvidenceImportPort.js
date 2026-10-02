import { ApplicationProblem } from "../../contracts/v1/problem.js";
import {
  HEALTHKIT_SLEEP_HISTORICAL_EVIDENCE_DAY_COLLECTION,
  HEALTHKIT_SLEEP_HISTORICAL_EVIDENCE_SAMPLE_COLLECTION,
  HealthKitSleepIngestionPurpose,
  deriveHealthKitSleepDay,
  sleepDayWindowStartMs,
} from "../../domain/services/HealthKitSleepContract.js";
import { createHealthKitSleepIngestPort } from "./HealthKitSleepIngestPort.js";

// Reviewed one-time Evidence import. These constants are deliberately source
// controlled: this is not a generic backfill endpoint and cannot be widened by
// a client request or a mutable production policy.
export const HEALTHKIT_SLEEP_HISTORICAL_EVIDENCE_IMPORT = Object.freeze({
  runId: "sleep-evidence-2026-07-06-through-2026-10-06-v1",
  startSleepDay: "2026-07-06",
  endSleepDay: "2026-10-06",
  timeZone: "America/Los_Angeles",
  ingestionPurpose: HealthKitSleepIngestionPurpose.HISTORICAL_EVIDENCE_IMPORT,
});

export function createHealthKitSleepHistoricalEvidenceImportPort({ records, now = () => new Date() } = {}) {
  const authorization = HEALTHKIT_SLEEP_HISTORICAL_EVIDENCE_IMPORT;
  const ingest = createHealthKitSleepIngestPort({
    records,
    now,
    sampleCollection: HEALTHKIT_SLEEP_HISTORICAL_EVIDENCE_SAMPLE_COLLECTION,
    dayCollection: HEALTHKIT_SLEEP_HISTORICAL_EVIDENCE_DAY_COLLECTION,
    immutableIngestionPurpose: authorization.ingestionPurpose,
    // Historical Sleep is permanently sleep-canon-v2.
    pinnedAlgorithmVersion: "sleep-canon-v2",
    activationPolicy: Object.freeze({
      enabled: true,
      mode: authorization.ingestionPurpose,
      effectiveSleepDay: authorization.startSleepDay,
      endSleepDay: authorization.endSleepDay,
      openEnded: false,
      timeZone: authorization.timeZone,
      activationFloor: new Date(sleepDayWindowStartMs(authorization.startSleepDay, authorization.timeZone)).toISOString(),
      source: "source_controlled_historical_evidence_import",
    }),
  });
  return async function importHistoricalSleepEvidence(context) {
    const payload = context.payload ?? {};
    if (payload.runId !== authorization.runId) refuse("HEALTHKIT_SLEEP_HISTORICAL_IMPORT_NOT_AUTHORIZED", "The historical Sleep Evidence run is not authorized.");
    if (payload.deletions != null || payload.windowManifest != null) {
      refuse("HEALTHKIT_SLEEP_HISTORICAL_IMPORT_SAMPLES_ONLY", "Historical Sleep Evidence import accepts samples only.", 400);
    }
    for (const sample of payload.samples ?? []) {
      const sleepDay = deriveHealthKitSleepDay(sample?.endedAt, sample?.timeZone);
      if (!sleepDay || sleepDay < authorization.startSleepDay || sleepDay > authorization.endSleepDay) {
        refuse("HEALTHKIT_SLEEP_HISTORICAL_IMPORT_OUTSIDE_WINDOW", "A historical Sleep sample is outside the reviewed Evidence window.", 400);
      }
    }
    const result = await ingest({ ...context, payload: { ...payload, deletions: undefined, windowManifest: undefined } });
    return Object.freeze({
      ...result,
      result: Object.freeze({
        ...result.result,
        contractVersion: "healthkit-sleep-historical-evidence-v1",
        runId: authorization.runId,
        origin: authorization.ingestionPurpose,
        ingestionPurpose: authorization.ingestionPurpose,
        canonicalProductionHistory: false,
        strategicEvidenceEligibility: "permanently_quarantined",
        importWindow: Object.freeze({ startSleepDay: authorization.startSleepDay, endSleepDay: authorization.endSleepDay }),
      }),
    });
  };
}

function refuse(code, title, status = 409) {
  throw new ApplicationProblem({ status, code, title });
}

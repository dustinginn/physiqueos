import { vi } from "vitest";
import { createDailyBriefingRepository } from "../data/repositories/DailyBriefingRepository.js";
import { createInMemoryCanonicalRecordStore } from "../platform/database/Phase4CanonicalRecordStore.js";
import { createHealthKitGraduationReader } from "../platform/database/HealthKitGraduationReader.js";
import {
  HEALTHKIT_CANONICAL_DAY_COLLECTION,
  HEALTHKIT_GRADUATION_CONFIGURATION_COLLECTION,
  HEALTHKIT_GRADUATION_POLICY_RECORD_ID,
  HEALTHKIT_GRADUATION_POLICY_SCHEMA_VERSION,
} from "../domain/services/HealthKitGraduation.js";
import { createBriefingCadenceExecutor } from "../domain/services/BriefingCadenceExecutorService";
import { createBriefingCadenceSettlementGate } from "../domain/services/BriefingCadenceSettlementGate.js";
import { createMidweekBriefingService } from "../domain/services/MidweekBriefingService";
import { resolveBriefingDueInstant } from "../domain/services/BriefingScheduleAuthority.js";
import { DEFAULT_SETTLEMENT_POLICY } from "../domain/services/BriefingEvidenceSettlementPolicy.js";

// Shared test world for the evidence-settlement suites: REAL executor + REAL
// gate + REAL HealthKit graduation reader over an in-memory canonical store +
// the REAL Midweek generator over the REAL in-memory artifact repository.
// Time is fully controlled: `at(minutes)` is minutes after the Wednesday
// 2026-09-16 03:00-local earliest-publish instant of the Sun-Tue window.

export const OWNER = "user_founder_001";
export const TZ = "America/Los_Angeles";
export const DAILY_DATE = "2026-09-15";
export const MIDWEEK_DUE = resolveBriefingDueInstant({ localDate: "2026-09-16", timeZone: TZ });
export const at = (minutesAfterDue) => new Date(MIDWEEK_DUE.valueOf() + minutesAfterDue * 60_000).toISOString();
export const DEADLINE = DEFAULT_SETTLEMENT_POLICY.maximumWaitMinutes;

export const hkDay = (domain, coverage, revision = 1) => ({
  id: `healthkit_canonical_day_${domain}_${DAILY_DATE}`, domain, localDate: DAILY_DATE, userId: OWNER,
  revision, version: revision, semanticFingerprint: `s${revision}`,
  createdAt: "2026-09-16T05:00:00.000Z", updatedAt: "2026-09-16T05:00:00.000Z",
  current: { coverage, sourceRevision: revision, deliveryDeviceId: "d", basis: "b",
    canonicalRecordId: `canon_${domain}_${DAILY_DATE}`, revision, values: {} },
  provenance: { sourceObservationIds: ["obs"] },
});

export function hkRecords({ activity = "complete_day", nutrition = "complete_day", graduated = true } = {}) {
  const on = { enabled: true, domains: ["activity", "nutrition"], startLocalDate: "2026-09-13", endLocalDate: null };
  return createInMemoryCanonicalRecordStore({
    [HEALTHKIT_GRADUATION_CONFIGURATION_COLLECTION]: graduated ? [{
      id: HEALTHKIT_GRADUATION_POLICY_RECORD_ID, schemaVersion: HEALTHKIT_GRADUATION_POLICY_SCHEMA_VERSION,
      version: 1, historicalBriefingRegeneration: false, projection: { enabled: false }, evidenceEligibility: on,
    }] : [],
    [HEALTHKIT_CANONICAL_DAY_COLLECTION]: [
      ...(activity ? [hkDay("activity", activity)] : []),
      ...(nutrition ? [hkDay("nutrition", nutrition)] : []),
    ],
  });
}

// Wraps a canonical record store so its reads can be made to fail on demand
// (a transient database error), and counts reads.
export function flakyRecords(records) {
  const state = { failing: false, reads: 0, error: () => Object.assign(new Error("transient store failure host=db.internal"), { code: "ECONNRESET" }) };
  const guard = async (call) => {
    state.reads += 1;
    if (state.failing) throw state.error();
    return call();
  };
  return {
    state,
    setFailing(value) { state.failing = value; },
    records: { ...records, get: (...args) => guard(() => records.get(...args)), list: (...args) => guard(() => records.list(...args)) },
  };
}

export function repositoriesFor(artifactRecords) {
  const user = { id: OWNER, timeZone: TZ };
  const protocol = { id: "briefings", protocolType: "briefings", currentVersionId: "briefings-v1" };
  return {
    users: { getCurrentUser: vi.fn(async () => user), getUserById: vi.fn(async () => user) },
    protocols: { listActiveProtocols: vi.fn(async () => [protocol]) },
    protocolVersions: {
      getCurrentVersion: vi.fn(async () => ({
        id: "briefings-v1", protocolId: "briefings", effectiveAt: "2026-07-01",
        coachingUpdates: {
          schemaVersion: "coaching_updates_schedule_v1", timeZone: TZ,
          midweek: { enabled: true, day: "wednesday", localTime: "00:00" },
          weekly: { enabled: true, day: "sunday", localTime: "00:00" },
          daily: { enabled: false }, notificationPreference: "available_without_notification",
        },
      })),
    },
    dailyBriefings: createDailyBriefingRepository(artifactRecords),
    canonicalEvidence: { listCanonicalEvidenceObjects: vi.fn(async () => []) },
    weights: { listWeightEntries: vi.fn(async () => []) },
    dexaScans: { listDEXAScans: vi.fn(async () => []) },
    goals: { getActiveGoal: vi.fn(async () => ({ id: "goal-build", title: "Build Lean Mass", phases: [] })) },
  };
}

// One worker process: its own reader, gate, executor, logger and clock over
// SHARED artifact records and a SHARED HealthKit store. `logs` records every
// logger call in order with its level.
export function createWorker({
  name = "worker", artifactRecords, hk, lock = null, generatorWrap = null, executionStore = null,
  readerHk = null, logs = [],
} = {}) {
  const repositories = repositoriesFor(artifactRecords);
  let clock = new Date(at(5));
  const midweekService = createMidweekBriefingService({ repositories, now: () => clock });
  const inner = (input) => midweekService.generateForCurrentWindow(input);
  const generate = vi.fn(generatorWrap ? (input) => generatorWrap(inner, input) : inner);
  const generators = {
    midweek: { generateForCurrentWindow: generate },
    weekly: { generateForCurrentWindow: vi.fn(async () => ({ state: "not_eligible", reason: "not_weekly_day" })) },
    monthly: { generateForCurrentWindow: vi.fn(async () => ({ state: "not_eligible", reason: "before_monthly_eligibility" })) },
  };
  const reader = createHealthKitGraduationReader({ records: readerHk ?? hk, ownerUserId: OWNER });
  const executionRecords = [];
  const logger = {
    info: (event, fields) => logs.push({ level: "info", event, fields, worker: name }),
    warn: (event, fields) => logs.push({ level: "warn", event, fields, worker: name }),
    error: (event, fields) => logs.push({ level: "error", event, fields, worker: name }),
  };
  const executor = createBriefingCadenceExecutor({
    repositories, generators, logger,
    settlementGate: createBriefingCadenceSettlementGate({ healthKitGraduationReader: reader }),
    executionStore: executionStore ?? {
      createExecutionId: () => `${name}-run-${executionRecords.length}`,
      async record(record) { executionRecords.push(record); },
      async getRetryState() {
        return { terminalFailure: false, consecutiveTransientFailures: 0, lastFailureAt: null, lastFailureCategory: null };
      },
    },
    executionLock: lock ?? { async acquire() { return { acquired: true, async release() {} }; } },
    source: `${name}-test`,
  });
  return {
    name, repositories, generate, generators, reader, executionRecords, logs, logger,
    get midweekService() { return midweekService; },
    setClock(iso) { clock = new Date(iso); },
    async execute(iso) {
      clock = new Date(iso);
      return executor.execute({ asOf: clock });
    },
    async run(iso) {
      const result = await this.execute(iso);
      return result.outcomes.find((outcome) => outcome.cadenceKey === "midweek");
    },
    events(prefix = "briefing_settlement.") {
      return logs.filter((entry) => entry.worker === name && entry.event.startsWith(prefix)).map((entry) => entry.event);
    },
  };
}

// Single-worker convenience world (the Blocker 1 / Blocker 3 / observability suites).
export function createSettlementWorld({ hk = hkRecords(), readerHk = null, lock = null, generatorWrap = null } = {}) {
  const artifactRecords = [];
  const logs = [];
  const worker = createWorker({ artifactRecords, hk, readerHk, lock, generatorWrap, logs });
  return Object.assign(worker, { hk, artifactRecords });
}

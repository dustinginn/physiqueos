import { beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ runtime: null }));

vi.mock("../../platform/auth/nativeProductionContractRuntime.js", () => ({
  getProductionNativeContractRuntime: vi.fn(async () => holder.runtime),
}));

import { POST as commandRoute } from "../../app/api/v1/native/commands/route.js";
import { createUuidV7 } from "../../contracts/v1/identifiers.js";
import { createCanonicalPersistenceCommandPorts } from "../commands/CanonicalPersistenceCommandPorts.js";
import { createPhase3CommandService, Phase3Command } from "../commands/Phase3CommandService.js";
import { createInMemoryFoundationTransactionStore } from "../../platform/commands/InMemoryFoundationTransactionStore.js";
import { createInMemoryCanonicalRecordStore } from "../../platform/database/Phase4CanonicalRecordStore.js";
import { createNativeProductionContractService } from "./NativeProductionContractService.js";
import { createHealthKitSleepCapabilityReadService } from "./HealthKitSleepCapabilityReadService.js";
import { nativeProductionContractManifest } from "./nativeProductionContractManifest.js";
import {
  HEALTHKIT_SLEEP_INGEST_MAXIMUM_REQUEST_BYTES,
  computeHealthKitSleepIngestMaximumRequestBytes,
  resolveNativeCommandMaximumRequestBytes,
} from "./nativeCommandRequestBounds.js";
import { HEALTHKIT_SLEEP_ACTIVATION_POLICY_RECORD_ID } from "../../domain/services/HealthKitSleepPolicies.js";
import { createPairedCalibrationFixtures } from "../../fixtures/confidenceNarrativeV3CalibrationFixtures.js";
import { createCanonicalEvidenceObservationsV3 } from "../../domain/intelligence/ProductionConfidenceNarrativeV3Adapter.js";
import { activationPolicy, uuid, wire } from "../../testSupport/healthKitSleepSynthetic.js";

const OWNER = "user_founder_001";
const PRINCIPAL = { userId: OWNER, deviceId: "founder-iphone", sessionId: "native-session" };
const KEY = "healthkit_sleep_partition_0f3b7c1a9d2e4f6081726354a5b6c7d8";
const STRATEGIC_COLLECTIONS = [
  "goals", "phaseStrategies", "goalConfidenceSnapshots", "goalConfidenceHistory", "analyses",
  "dailyBriefings", "briefingReconciliationWorkItems", "phaseReviewDecisions",
  "phaseLifecycleReadModels", "operatingPlan", "protocols", "canonicalEvidenceObjects", "healthKitObservations",
];

let records;
let transactions;

function compose(configuration = []) {
  records = createInMemoryCanonicalRecordStore({
    user: [{ id: OWNER, version: 1 }],
    healthKitConfiguration: configuration,
    healthKitSleepSamples: [],
    ...Object.fromEntries(STRATEGIC_COLLECTIONS.map((name) => [name, [{ id: `${name}-sentinel`, version: 1 }]])),
  });
  transactions = createInMemoryFoundationTransactionStore();
  const service = createPhase3CommandService({
    transactionRunner: transactions,
    ports: createCanonicalPersistenceCommandPorts({ records, now: () => new Date("2026-09-11T20:00:00.000Z") }),
  });
  holder.runtime = { command: ({ commandType, metadata, payload }) => service.execute({ commandType, principal: PRINCIPAL, metadata, payload }) };
}

function post(payload) {
  return commandRoute(new Request("https://physiqueos.example/api/v1/native/commands", {
    method: "POST",
    headers: { authorization: `Bearer ${"x".repeat(43)}`, "content-type": "application/json", "idempotency-key": KEY },
    body: JSON.stringify({ commandType: Phase3Command.INGEST_HEALTHKIT_SLEEP, metadata: { commandId: createUuidV7(), idempotencyKey: KEY }, payload }),
  }));
}

const night = () => wire({ id: uuid(1), source: "watch", stage: "core", start: "2026-09-10T23:00:00-07:00", end: "2026-09-11T07:00:00-07:00" });

beforeEach(() => compose());

describe("HealthKit Sleep through the Native command route", () => {
  it("dormant by default: 409, no receipt, no Sleep or strategic writes", async () => {
    const before = records.snapshot();
    const response = await post({ batchId: "sleep-b1", samples: [night()] });
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("HEALTHKIT_SLEEP_INGESTION_NOT_ENABLED");
    expect(records.snapshot()).toEqual(before);
    // A retry after enablement is not blocked by a stored receipt.
    compose([{ ...activationPolicy(), id: HEALTHKIT_SLEEP_ACTIVATION_POLICY_RECORD_ID }]);
    expect((await post({ batchId: "sleep-b1", samples: [night()] })).status).toBe(200);
  });

  it("enabled: stores only Sleep collections and leaves every strategic collection untouched", async () => {
    compose([{ ...activationPolicy(), id: HEALTHKIT_SLEEP_ACTIVATION_POLICY_RECORD_ID }]);
    const before = records.snapshot();
    const response = await post({ batchId: "sleep-b1", samples: [night()] });
    expect(response.status).toBe(200);
    const after = records.snapshot();
    expect(after.healthKitSleepSamples).toHaveLength(1);
    expect(after.healthKitSleepDays).toHaveLength(1);
    for (const collection of STRATEGIC_COLLECTIONS) expect(after[collection]).toEqual(before[collection]);
  });

  it("V3 evidence adapters see nothing from canonical Sleep", async () => {
    compose([{ ...activationPolicy(), id: HEALTHKIT_SLEEP_ACTIVATION_POLICY_RECORD_ID }]);
    await post({ batchId: "sleep-b1", samples: [night()] });
    const store = records.snapshot();
    const fixture = createPairedCalibrationFixtures().dexa;
    expect(createCanonicalEvidenceObservationsV3({
      goalContract: fixture.goalContract,
      goal: { id: fixture.goalContract.goalId },
      phase: { id: fixture.goalContract.phase.phaseId },
      store: { healthKitSleepSamples: store.healthKitSleepSamples, healthKitSleepDays: store.healthKitSleepDays },
      evidenceCutoff: fixture.evaluationContext.evidenceCutoff,
    })).toEqual([]);
  });
});

describe("Native manifest Sleep capability", () => {
  function manifestService(readers) {
    return createNativeProductionContractService({
      authenticate: async () => ({ ...PRINCIPAL, scopes: ["founder:read", "founder:write"] }),
      ownerUserId: OWNER,
      readers,
      executeCommand: vi.fn(),
    });
  }

  it("the static manifest advertises Sleep disabled", () => {
    expect(nativeProductionContractManifest.healthKitSleepIngestion).toMatchObject({
      commandType: "healthkit.sleep.ingest.v1", contractVersion: "healthkit-sleep-ingestion-v1", enabled: false, activationFloor: null,
    });
  });

  it("serves enabled only from an enabled Server-owned policy; absent, malformed or failing readers stay disabled", async () => {
    const request = new Request("https://physiqueos.example/api/v1/native/contracts");
    const disabled = await manifestService({}).manifest({ request });
    expect(disabled.healthKitSleepIngestion.enabled).toBe(false);

    const absent = createHealthKitSleepCapabilityReadService({ records: createInMemoryCanonicalRecordStore({ healthKitConfiguration: [] }), ownerUserId: OWNER });
    expect((await manifestService({ healthKitSleep: absent }).manifest({ request })).healthKitSleepIngestion.enabled).toBe(false);

    const failing = { getCapability: async () => { throw new Error("database unavailable"); } };
    expect((await manifestService({ healthKitSleep: failing }).manifest({ request })).healthKitSleepIngestion.enabled).toBe(false);

    const malformed = createHealthKitSleepCapabilityReadService({
      records: createInMemoryCanonicalRecordStore({ healthKitConfiguration: [{ ...activationPolicy({ mode: "strategic" }), id: HEALTHKIT_SLEEP_ACTIVATION_POLICY_RECORD_ID }] }),
      ownerUserId: OWNER,
    });
    expect((await manifestService({ healthKitSleep: malformed }).manifest({ request })).healthKitSleepIngestion.enabled).toBe(false);

    const enabled = createHealthKitSleepCapabilityReadService({
      records: createInMemoryCanonicalRecordStore({ healthKitConfiguration: [{ ...activationPolicy(), id: HEALTHKIT_SLEEP_ACTIVATION_POLICY_RECORD_ID }] }),
      ownerUserId: OWNER,
    });
    const served = await manifestService({ healthKitSleep: enabled }).manifest({ request });
    expect(served.healthKitSleepIngestion).toMatchObject({
      enabled: true, mode: "operational", effectiveSleepDay: "2026-09-10", activationFloor: "2026-09-10T01:00:00.000Z",
    });
    // Everything else in the manifest is unchanged.
    const { healthKitSleepIngestion: _served, healthKitSleepHistoricalEvidence: _servedHistorical, ...rest } = served;
    const { healthKitSleepIngestion: _static, healthKitSleepHistoricalEvidence: _staticHistorical, ...staticRest } = nativeProductionContractManifest;
    expect(rest).toEqual(staticRest);
  });
});

describe("Sleep request-body bound", () => {
  it("covers the largest valid Sleep request without silent loosening", () => {
    const derived = computeHealthKitSleepIngestMaximumRequestBytes();
    expect(HEALTHKIT_SLEEP_INGEST_MAXIMUM_REQUEST_BYTES).toBeGreaterThanOrEqual(derived);
    expect(HEALTHKIT_SLEEP_INGEST_MAXIMUM_REQUEST_BYTES).toBeLessThanOrEqual(Math.ceil(derived * 1.15));
    expect(resolveNativeCommandMaximumRequestBytes(Phase3Command.INGEST_HEALTHKIT_SLEEP)).toBe(HEALTHKIT_SLEEP_INGEST_MAXIMUM_REQUEST_BYTES);
  });
});

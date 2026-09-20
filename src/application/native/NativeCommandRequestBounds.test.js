import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ runtime: null }));

vi.mock("../../platform/auth/nativeProductionContractRuntime.js", () => ({
  getProductionNativeContractRuntime: vi.fn(async () => holder.runtime),
}));

import { POST as commandRoute } from "../../app/api/v1/native/commands/route.js";
import { readBoundedJsonRequest } from "../../platform/http/readBoundedJsonRequest.js";
import { createUuidV7 } from "../../contracts/v1/identifiers.js";
import { createPairedCalibrationFixtures } from "../../fixtures/confidenceNarrativeV3CalibrationFixtures.js";
import { createCanonicalEvidenceObservationsV3 } from "../../domain/intelligence/ProductionConfidenceNarrativeV3Adapter.js";
import { selectStrategicallyEligibleEvidenceV3 } from "../../domain/intelligence/v3/EvidenceEligibilityV3.js";
import {
  HEALTHKIT_MAX_DAILY_ACTIVITY_KEY_LENGTH,
  HEALTHKIT_MAX_DAILY_ACTIVITY_METRICS,
  HEALTHKIT_MAX_NUMERIC_TEXT_LENGTH,
  HEALTHKIT_MAX_OBSERVATIONS_PER_BATCH,
  HEALTHKIT_MAX_RING_COMPLETION_METRICS,
  HEALTHKIT_MAX_TEXT_LENGTH,
  HEALTHKIT_MAX_TIMESTAMP_LENGTH,
  normalizeHealthKitObservationBatch,
} from "../../domain/services/HealthKitObservationService.js";
import { createCanonicalPersistenceCommandPorts } from "../commands/CanonicalPersistenceCommandPorts.js";
import { createPhase3CommandService, Phase3Command } from "../commands/Phase3CommandService.js";
import { createInMemoryFoundationTransactionStore } from "../../platform/commands/InMemoryFoundationTransactionStore.js";
import { createInMemoryCanonicalRecordStore } from "../../platform/database/Phase4CanonicalRecordStore.js";
import { nativeProductionContractManifest } from "./nativeProductionContractManifest.js";
import {
  HEALTHKIT_INGEST_MAXIMUM_REQUEST_BYTES,
  HEALTHKIT_OBSERVATION_WIRE_FIELDS,
  NATIVE_COMMAND_DEFAULT_MAXIMUM_REQUEST_BYTES,
  NATIVE_COMMAND_MAXIMUM_REQUEST_CEILING_BYTES,
  computeHealthKitIngestMaximumRequestBytes,
  nativeCommandRequestMaximumBytes,
  resolveNativeCommandMaximumRequestBytes,
} from "./nativeCommandRequestBounds.js";

const OWNER = "user_founder_001";
const PRINCIPAL = { userId: OWNER, deviceId: "founder-iphone", sessionId: "native-session" };
const HEALTHKIT = "healthkit.observations.ingest.v1";
const PARTITION = "healthkit_partition_b99457e1d1c34d7e9c1bb6c1a3b3a5f0";
const STRATEGIC_COLLECTIONS = [
  "goals", "phaseStrategies", "goalConfidenceSnapshots", "goalConfidenceHistory", "analyses",
  "dailyBriefings", "briefingReconciliationWorkItems", "phaseReviewDecisions",
  "phaseLifecycleReadModels", "operatingPlan", "protocols",
];

let records;
let runtimeCommand;

beforeEach(() => {
  records = createInMemoryCanonicalRecordStore({
    user: [{ id: OWNER, version: 1 }],
    healthKitObservations: [],
    healthKitConfiguration: [],
    canonicalEvidenceObjects: [],
    ...Object.fromEntries(STRATEGIC_COLLECTIONS.map((name) => [name, [{ id: `${name}-sentinel`, version: 1 }]])),
  });
  const service = createPhase3CommandService({
    transactionRunner: createInMemoryFoundationTransactionStore(),
    ports: createCanonicalPersistenceCommandPorts({
      records,
      now: () => new Date("2026-09-19T23:52:27.000Z"),
    }),
  });
  runtimeCommand = vi.fn(({ commandType, metadata, payload }) =>
    service.execute({ commandType, principal: PRINCIPAL, metadata, payload }));
  holder.runtime = { command: runtimeCommand };
});

describe("Founder canary failure boundary: the old 4 KiB body limit", () => {
  it("reproduces the production 413 for eight Activity summaries under the generic default", async () => {
    const body = encodeCommand(healthKitEnvelope(eightFounderSummaries()));
    expect(bytes(body)).toBeGreaterThan(NATIVE_COMMAND_DEFAULT_MAXIMUM_REQUEST_BYTES);
    await expect(readBoundedJsonRequest(jsonRequest(body))).rejects.toMatchObject({
      status: 413,
      code: "REQUEST_TOO_LARGE",
    });
  });

  it("delivers the same eight-summary batch through the route into normal command handling", async () => {
    const body = encodeCommand(healthKitEnvelope(eightFounderSummaries()));
    expect(bytes(body)).toBeGreaterThan(NATIVE_COMMAND_DEFAULT_MAXIMUM_REQUEST_BYTES);

    const response = await post(body);
    expect(response.status).toBe(200);
    expect(runtimeCommand).toHaveBeenCalledTimes(1);
    const result = (await response.json()).receipt.result;
    expect(result).toMatchObject({
      status: "accepted",
      batchId: PARTITION,
      acceptedCount: 8,
      createdCount: 8,
      matchedCount: 0,
      activityDayCanonicalizedCount: 0,
      validationOnlyAcceptedCount: 8,
      cursorResponsibility: "device",
    });
    expect(records.snapshot().healthKitObservations).toHaveLength(8);
  });

  it("keeps validation-only Activity raw, noncanonical and nonstrategic", async () => {
    const before = records.snapshot();
    expect((await post(encodeCommand(healthKitEnvelope(eightFounderSummaries())))).status).toBe(200);
    const after = records.snapshot();

    expect(after.healthKitObservations).toHaveLength(8);
    for (const record of after.healthKitObservations) {
      expect(record).toMatchObject({
        ingestionPurpose: "validation_only",
        evidenceEligibility: { state: "not_assessed", decidedBy: null },
        reconciliation: {
          state: "activity_validation_only",
          canonicalizationPermitted: false,
          canonicalizationPermanentBar: true,
        },
      });
    }
    expect(after.canonicalEvidenceObjects).toEqual(before.canonicalEvidenceObjects);
    for (const collection of STRATEGIC_COLLECTIONS) expect(after[collection]).toEqual(before[collection]);

    const fixture = createPairedCalibrationFixtures().dexa;
    const observations = createCanonicalEvidenceObservationsV3({
      goalContract: fixture.goalContract,
      goal: { id: fixture.goalContract.goalId },
      phase: { id: fixture.goalContract.phase.phaseId },
      store: { healthKitObservations: after.healthKitObservations },
      evidenceCutoff: fixture.evaluationContext.evidenceCutoff,
    });
    expect(observations).toEqual([]);
    expect(selectStrategicallyEligibleEvidenceV3({
      goalContract: fixture.goalContract,
      observations,
      evidenceCutoff: fixture.evaluationContext.evidenceCutoff,
    }).eligibleObservations).toEqual([]);
  });

  it("without an activation policy, operational Activity stays raw and never canonicalizes", async () => {
    const operational = eightFounderSummaries().map(({ ingestionPurpose: _omitted, ...rest }) => rest);
    expect((await post(encodeCommand(healthKitEnvelope(operational)))).status).toBe(200);
    const snapshot = records.snapshot();
    expect(snapshot.canonicalEvidenceObjects).toEqual([]);
    for (const record of snapshot.healthKitObservations) {
      expect(record.ingestionPurpose).toBe("operational");
      expect(record.reconciliation).toMatchObject({
        state: "activity_canonicalization_deferred",
        reason: "activity_activation_not_configured",
        canonicalizationPermitted: false,
      });
    }
  });

  it("never places a raw HealthKit workout in canonicalEvidenceObjects", async () => {
    const workouts = [workoutObservation(1), workoutObservation(2)];
    expect((await post(encodeCommand(healthKitEnvelope(workouts)))).status).toBe(200);
    const snapshot = records.snapshot();
    expect(snapshot.canonicalEvidenceObjects).toEqual([]);
    expect(snapshot.healthKitObservations.map((item) => item.reconciliation.state))
      .toEqual(["workout_canonicalization_deferred", "workout_canonicalization_deferred"]);
  });
});

describe("healthkit-ingestion-v1 request bound", () => {
  it("accepts a valid maximum-size 100-observation request that is nearly the derived worst case", async () => {
    const observations = Array.from({ length: HEALTHKIT_MAX_OBSERVATIONS_PER_BATCH }, (_, index) => maximalObservation(index));
    const body = encodeCommand(healthKitEnvelope(observations));
    const derived = computeHealthKitIngestMaximumRequestBytes();

    // A real, contract-valid request occupies almost all of the derivation
    // (the remainder is the one-byte ASCII of enum values and the envelope
    // slack), so the derivation is not a paper number, and it fits the bound.
    expect(bytes(body)).toBeGreaterThan(derived * 0.95);
    expect(bytes(body)).toBeLessThanOrEqual(derived);
    expect(bytes(body)).toBeLessThanOrEqual(HEALTHKIT_INGEST_MAXIMUM_REQUEST_BYTES);
    expect(bytes(body)).toBeGreaterThan(1024 * 1024);

    const response = await post(body);
    expect(response.status).toBe(200);
    expect((await response.json()).receipt.result).toMatchObject({
      status: "accepted",
      acceptedCount: 100,
      createdCount: 100,
      validationOnlyAcceptedCount: 100,
    });
    expect(records.snapshot().healthKitObservations).toHaveLength(100);
  });

  it("accepts a realistic 100-observation Activity batch far below the bound", async () => {
    const observations = Array.from({ length: 100 }, (_, index) =>
      summary({ localDate: dateOffset(index), externalId: `activity-summary:${dateOffset(index)}`, revision: 1 }));
    const body = encodeCommand(healthKitEnvelope(observations));
    expect(bytes(body)).toBeLessThan(HEALTHKIT_INGEST_MAXIMUM_REQUEST_BYTES / 10);
    const response = await post(body);
    expect(response.status).toBe(200);
    expect((await response.json()).receipt.result.acceptedCount).toBe(100);
  });

  it("rejects 101 observations at the batch-count contract, not the HTTP size gate", async () => {
    const maximal = Array.from({ length: HEALTHKIT_MAX_OBSERVATIONS_PER_BATCH + 1 }, (_, index) => maximalObservation(index));
    const maximalBody = encodeCommand(healthKitEnvelope(maximal));
    expect(bytes(maximalBody)).toBeLessThanOrEqual(HEALTHKIT_INGEST_MAXIMUM_REQUEST_BYTES);
    const response = await post(maximalBody);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "HEALTHKIT_CONTRACT_INVALID",
      fieldErrors: [{ field: "observations" }],
    });
    expect(runtimeCommand).toHaveBeenCalledTimes(1);

    const realistic = Array.from({ length: 101 }, (_, index) =>
      summary({ localDate: dateOffset(index), externalId: `activity-summary:${dateOffset(index)}`, revision: 1 }));
    const realisticResponse = await post(encodeCommand(healthKitEnvelope(realistic)));
    expect(realisticResponse.status).toBe(400);
    expect((await realisticResponse.json()).code).toBe("HEALTHKIT_CONTRACT_INVALID");
    expect(records.snapshot().healthKitObservations).toEqual([]);
  });

  it("returns 413 for a request over the explicit bound and never reaches command handling", async () => {
    const body = padToBytes(healthKitEnvelope([summary()]), HEALTHKIT_INGEST_MAXIMUM_REQUEST_BYTES + 1);
    expect(bytes(body)).toBe(HEALTHKIT_INGEST_MAXIMUM_REQUEST_BYTES + 1);
    const response = await post(body);
    expect(response.status).toBe(413);
    expect((await response.json()).code).toBe("REQUEST_TOO_LARGE");
    expect(runtimeCommand).not.toHaveBeenCalled();
    expect(records.snapshot().healthKitObservations).toEqual([]);
  });

  it("accepts a body exactly at the bound", async () => {
    const body = padToBytes(healthKitEnvelope([summary()]), HEALTHKIT_INGEST_MAXIMUM_REQUEST_BYTES);
    expect(bytes(body)).toBe(HEALTHKIT_INGEST_MAXIMUM_REQUEST_BYTES);
    expect((await post(body)).status).toBe(200);
  });

  it("refuses a declared Content-Length above the ceiling without buffering", async () => {
    const response = await post(encodeCommand(healthKitEnvelope([summary()])), {
      "content-length": String(NATIVE_COMMAND_MAXIMUM_REQUEST_CEILING_BYTES + 1),
    });
    expect(response.status).toBe(413);
    expect(runtimeCommand).not.toHaveBeenCalled();
  });

  it("keeps the frozen bound synchronized with the maximum encoded contract", () => {
    const derived = computeHealthKitIngestMaximumRequestBytes();
    // Too small would reject a legitimate batch; too large is silent loosening.
    expect(HEALTHKIT_INGEST_MAXIMUM_REQUEST_BYTES).toBeGreaterThanOrEqual(derived);
    expect(HEALTHKIT_INGEST_MAXIMUM_REQUEST_BYTES).toBeLessThanOrEqual(Math.ceil(derived * 1.15));
    expect(derived).toBeGreaterThan(bytes(encodeCommand(healthKitEnvelope(eightFounderSummaries()))));
    expect(HEALTHKIT_MAX_OBSERVATIONS_PER_BATCH).toBe(100);
    expect(nativeProductionContractManifest.healthKitIngestion.maximumBatchSize)
      .toBe(HEALTHKIT_MAX_OBSERVATIONS_PER_BATCH);
    expect(nativeProductionContractManifest.healthKitIngestion.commandType).toBe(HEALTHKIT);
    expect(nativeProductionContractManifest.healthKitIngestion.contractVersion).toBe("healthkit-ingestion-v1");
  });
});

describe("the derivation tracks what the normalizer actually accepts", () => {
  it("lists exactly the properties normalizeHealthKitObservationBatch reads", () => {
    const reads = new Set();
    // Records every property the normalizer reads, including absent ones, so a
    // newly read field is caught even though no fixture supplies it.
    const record = (target, path) => new Proxy(target, {
      get(object, key, receiver) {
        const value = Reflect.get(object, key, receiver);
        if (typeof key !== "string" || path.endsWith("dailyActivity")) return value;
        const next = path ? `${path}.${key}` : key;
        reads.add(next);
        return value !== null && typeof value === "object" ? record(value, next) : value;
      },
    });
    const full = (observation) => ({
      ...observation,
      source: {
        bundleIdentifier: "com.apple.health.7A1B", sourceName: "n", sourceRevision: "1", productType: "p",
        deviceModel: "d", operatingSystemVersion: "1", privacySafeDeviceProvenance: "x",
      },
      occurrence: {
        localDate: "2026-09-19", timeZone: "America/Los_Angeles", utcOffsetSeconds: -25200,
        startedAt: "2026-09-19T15:10:00Z", endedAt: "2026-09-19T15:45:00Z",
      },
    });
    for (const observation of [full(summary()), full(workoutObservation(1)), full(quantityObservation())]) {
      normalizeHealthKitObservationBatch({
        batchId: PARTITION, observations: [record(observation, "")], principalDeviceId: "founder-iphone",
      });
    }

    const fields = HEALTHKIT_OBSERVATION_WIRE_FIELDS;
    const sections = ["source", "occurrence", "activitySummary", "workout", "quantitySample"];
    const expected = new Set([
      ...Object.keys(fields.observation),
      ...sections,
      ...sections.flatMap((section) => Object.keys(fields[section]).map((name) => `${section}.${name}`)),
    ]);
    // A property read but not listed would be missing from the derivation, and a
    // listed property never read would silently inflate it.
    expect([...reads].filter((path) => !expected.has(path)).sort()).toEqual([]);
    expect([...expected].filter((path) => !reads.has(path)).sort()).toEqual([]);
  });

  it("keeps the escaping assumptions the derivation relies on true", () => {
    const control = "";
    expect(JSON.stringify(control).length).toBe(2 + 6);
    expect(JSON.stringify("").length).toBe(2 + 6);
    // A numeric field bounded as a string encodes larger than any canonical number.
    expect(JSON.stringify(-Number.MAX_VALUE).length).toBe(24);
    expect(JSON.stringify(control.repeat(HEALTHKIT_MAX_NUMERIC_TEXT_LENGTH)).length).toBeGreaterThan(24);
  });
});

describe("unrelated Native commands and malformed input", () => {
  it("keeps every other command on the historical 4 KiB bound", async () => {
    runtimeCommand.mockResolvedValue({ outcome: "committed" });
    expect(NATIVE_COMMAND_DEFAULT_MAXIMUM_REQUEST_BYTES).toBe(4096);
    for (const commandType of ["priority.complete.v1", "weight.submit.v1", "not-a-command.v1", "__proto__", "constructor"]) {
      expect(resolveNativeCommandMaximumRequestBytes(commandType)).toBe(4096);
      expect(nativeCommandRequestMaximumBytes({ commandType })).toBe(4096);
    }
    expect(nativeCommandRequestMaximumBytes(undefined)).toBe(4096);
    expect(nativeCommandRequestMaximumBytes({ commandType: { toString: () => HEALTHKIT } })).toBe(4096);

    const atLimit = padToBytes({ commandType: "priority.complete.v1", payload: { priorityId: "p-1", occurrenceDate: "2026-09-19" } }, 4096);
    expect((await post(atLimit)).status).toBe(200);
    const over = padToBytes({ commandType: "priority.complete.v1", payload: { priorityId: "p-1", occurrenceDate: "2026-09-19" } }, 4097);
    const rejected = await post(over);
    expect(rejected.status).toBe(413);
    expect((await rejected.json()).code).toBe("REQUEST_TOO_LARGE");
    expect(runtimeCommand).toHaveBeenCalledTimes(1);
  });

  it("does not let an ordinary command borrow the HealthKit allowance", async () => {
    const large = padToBytes({ commandType: "weight.submit.v1", payload: { value: 200 } }, 512 * 1024);
    expect((await post(large)).status).toBe(413);
    const unknown = padToBytes({ commandType: "no.such.command.v1", payload: {} }, 64 * 1024);
    expect((await post(unknown)).status).toBe(413);
    const missing = padToBytes({ payload: {} }, 64 * 1024);
    expect((await post(missing)).status).toBe(413);
    expect(runtimeCommand).not.toHaveBeenCalled();
  });

  it("passes an ordinary small command through unchanged", async () => {
    runtimeCommand.mockResolvedValue({ outcome: "committed" });
    const response = await post(JSON.stringify({
      commandType: "priority.complete.v1",
      payload: { priorityId: "priority-1", occurrenceDate: "2026-09-19" },
    }), { "if-match": '"7"' });
    expect(response.status).toBe(200);
    expect(runtimeCommand).toHaveBeenCalledWith(expect.objectContaining({
      commandType: "priority.complete.v1",
      metadata: expect.objectContaining({ idempotencyKey: PARTITION, expectedVersion: "7" }),
    }));
  });

  it("fails malformed JSON closed, with size judged before validity exactly as before", async () => {
    const small = await post("{\"commandType\":");
    expect(small.status).toBe(400);
    expect((await small.json()).code).toBe("REQUEST_INVALID");

    const malformedOrdinaryOver4KiB = await post(`{"commandType":"weight.submit.v1","payload":${"x".repeat(6000)}`);
    expect(malformedOrdinaryOver4KiB.status).toBe(413);

    // A truncated HealthKit-looking body cannot be recognized as HealthKit, so
    // it never receives the larger allowance and never reaches a handler.
    const truncatedHealthKit = await post(`{"commandType":"${HEALTHKIT}","payload":{"batchId":"x","observations":[${"{".repeat(200_000)}`);
    expect(truncatedHealthKit.status).toBe(413);

    const malformedWithinBound = await post(`{"commandType":"${HEALTHKIT}",` );
    expect(malformedWithinBound.status).toBe(400);

    for (const nonObject of ["[]", "null", "42", "\"text\"", `[${"1,".repeat(3000)}1]`]) {
      const response = await post(nonObject);
      expect(response.status).toBe(nonObject.length > 4096 ? 413 : 400);
    }
    expect(runtimeCommand).not.toHaveBeenCalled();
  });

  it("aborts an over-ceiling body without a Content-Length before reading all of it", async () => {
    let pulled = 0;
    let cancelled = false;
    const chunk = new Uint8Array(1024 * 1024).fill(0x20);
    const stream = new ReadableStream({
      pull(controller) {
        pulled += 1;
        controller.enqueue(chunk);
        if (pulled >= 64) controller.close();
      },
      cancel() { cancelled = true; },
    });
    const response = await commandRoute(new Request("https://physiqueos.example/api/v1/native/commands", {
      method: "POST",
      headers: { authorization: `Bearer ${"x".repeat(43)}`, "content-type": "application/json", "idempotency-key": PARTITION },
      body: stream,
      duplex: "half",
    }));
    expect(response.status).toBe(413);
    expect(cancelled).toBe(true);
    expect(pulled).toBeLessThan(64);
    expect(runtimeCommand).not.toHaveBeenCalled();
  });

  it("fails closed when a per-request bound resolver returns something unusable", async () => {
    for (const bad of [undefined, Number.NaN, -1, "4096"]) {
      await expect(readBoundedJsonRequest(jsonRequest("{\"a\":1}"), { maximumBytesFor: () => bad }))
        .rejects.toBeInstanceOf(TypeError);
    }
    await expect(readBoundedJsonRequest(jsonRequest("{\"a\":1}"), { maximumBytesFor: () => 4096 }))
      .resolves.toEqual({ a: 1 });
  });

  it("still requires a JSON content type", async () => {
    const response = await commandRoute(new Request("https://physiqueos.example/api/v1/native/commands", {
      method: "POST",
      headers: { authorization: `Bearer ${"x".repeat(43)}`, "content-type": "text/plain", "idempotency-key": PARTITION },
      body: encodeCommand(healthKitEnvelope([summary()])),
    }));
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("CONTENT_TYPE_REQUIRED");
  });
});

describe("idempotency and identity are unchanged", () => {
  it("still accepts any parseable clientOccurredAt for the server receipt time", async () => {
    const envelope = healthKitEnvelope([summary()]);
    envelope.metadata.clientOccurredAt = `Sep 19 2026 16:52:27 GMT(${"c".repeat(200)})`;
    const response = await post(encodeCommand(envelope));
    expect(response.status).toBe(200);
    expect(records.snapshot().healthKitObservations[0].ingestion.firstReceivedAt).toBe("2026-09-19T16:52:27.000Z");
  });

  it("replays an identical retry from the command receipt and rejects payload drift", async () => {
    const body = encodeCommand(healthKitEnvelope(eightFounderSummaries()));
    const first = await post(body);
    const replay = await post(body);
    expect((await first.json()).outcome).toBe("committed");
    expect((await replay.json()).outcome).toBe("replayed");
    expect(records.snapshot().healthKitObservations).toHaveLength(8);

    const drifted = eightFounderSummaries();
    drifted[0].activitySummary.dailyActivity.move_calories = 999;
    const rejected = await post(encodeCommand(healthKitEnvelope(drifted)));
    expect(rejected.status).toBe(409);
    expect((await rejected.json()).code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(records.snapshot().healthKitObservations).toHaveLength(8);
  });

  it("matches existing observations under a different delivery key instead of duplicating them", async () => {
    await post(encodeCommand(healthKitEnvelope(eightFounderSummaries())));
    const second = await post(
      encodeCommand(healthKitEnvelope(eightFounderSummaries(), "healthkit_partition_second_delivery_batch")),
      { "idempotency-key": "healthkit-second-delivery-key" }
    );
    expect((await second.json()).receipt.result).toMatchObject({ status: "matched", createdCount: 0, matchedCount: 8 });
    expect(records.snapshot().healthKitObservations).toHaveLength(8);
  });

  it("keeps V1 NUL-separated, device-scoped observation identity byte-for-byte", async () => {
    await post(encodeCommand(healthKitEnvelope(eightFounderSummaries())));
    const ids = records.snapshot().healthKitObservations.map((item) => item.id).sort();
    const independent = Array.from({ length: 8 }, (_, index) => `healthkit_observation_${createHash("sha256").update(
      ["com.apple.Health", "activity_summary", `activity-summary:${dateOffset(index)}`, "founder-iphone", "1"].join(" ")
    ).digest("hex")}`).sort();
    expect(ids).toEqual(independent);
    // Pinned from the unmodified 3b9934e implementation.
    expect(ids).toContain("healthkit_observation_edd0a650113dcb13b2f56ae4548764a26a1ad30c71d2278f74b36bdfa44e7f47");
    expect(ids).toContain("healthkit_observation_22224559fce2a57b4a9bab0ba21c5f346c8fc669ef6b9996bc0010afcca3ee1b");
  });
});

describe("healthkit-ingestion-v1 field bounds are compatible tightenings", () => {
  const normalize = (observations) => normalizeHealthKitObservationBatch({
    batchId: PARTITION, observations, principalDeviceId: "founder-iphone",
  });

  it("produces the pre-tightening identity and semantic fingerprint for the Founder batch", () => {
    const [first, , , , , , , last] = normalize(eightFounderSummaries()).observations;
    // Pinned from the unmodified 3b9934e implementation on identical input.
    expect(first.id).toBe("healthkit_observation_edd0a650113dcb13b2f56ae4548764a26a1ad30c71d2278f74b36bdfa44e7f47");
    expect(first.semanticFingerprint).toBe("sha256_d3ea8ea8de1f9fc5202adb4a5016a328115371629f2f44c6691c72f1b73f66ac");
    expect(last.id).toBe("healthkit_observation_22224559fce2a57b4a9bab0ba21c5f346c8fc669ef6b9996bc0010afcca3ee1b");
    expect(last.semanticFingerprint).toBe("sha256_9d7e6aae3cbc9563167e902c17668750c6f8424348f71521b9fb72254c4f7929");
  });

  it("accepts every field exactly at its bound", () => {
    expect(normalize([maximalObservation(0)]).observations).toHaveLength(1);
  });

  it.each([
    ["optional source text", (o) => { o.source.sourceName = "x".repeat(HEALTHKIT_MAX_TEXT_LENGTH + 1); }, "observations[0].source.sourceName"],
    ["optional device text", (o) => { o.source.privacySafeDeviceProvenance = "x".repeat(HEALTHKIT_MAX_TEXT_LENGTH + 1); }, "observations[0].source.privacySafeDeviceProvenance"],
    ["padded required text", (o) => { o.externalId = ` ${"x".repeat(HEALTHKIT_MAX_TEXT_LENGTH)}`; }, "observations[0].externalId"],
    ["timestamp with unbounded comment", (o) => { o.occurrence.startedAt = `Sep 12 2026 10:00:00 GMT(${"c".repeat(5000)})`; }, "observations[0].occurrence.startedAt"],
    ["numeric text", (o) => { o.activitySummary.sourceRevision = `${"0".repeat(HEALTHKIT_MAX_NUMERIC_TEXT_LENGTH)}1`; }, "observations[0].activitySummary.sourceRevision"],
    ["too many metrics", (o) => {
      for (let index = 0; index <= HEALTHKIT_MAX_DAILY_ACTIVITY_METRICS; index += 1) o.activitySummary.dailyActivity[`m${index}`] = 1;
    }, "observations[0].activitySummary.dailyActivity"],
    ["metric name too long", (o) => {
      o.activitySummary.dailyActivity["k".repeat(HEALTHKIT_MAX_DAILY_ACTIVITY_KEY_LENGTH + 1)] = 1;
    }, "observations[0].activitySummary.dailyActivity"],
    ["nested ring_completion", (o) => {
      o.activitySummary.dailyActivity.ring_completion = { move: 1, ring_completion: { move: 1 } };
    }, "observations[0].activitySummary.dailyActivity.ring_completion.ring_completion"],
    ["too many ring metrics", (o) => {
      o.activitySummary.dailyActivity.ring_completion = Object.fromEntries(
        Array.from({ length: HEALTHKIT_MAX_RING_COMPLETION_METRICS + 1 }, (_, index) => [`r${index}`, 1])
      );
    }, "observations[0].activitySummary.dailyActivity.ring_completion"],
  ])("rejects %s with a field-scoped contract error", (_name, mutate, field) => {
    const observation = summary();
    mutate(observation);
    expect(() => normalize([observation])).toThrowError(expect.objectContaining({
      code: "HEALTHKIT_CONTRACT_INVALID", field,
    }));
  });

  it("bounds optional workout and quantity text too", () => {
    const tooLong = "x".repeat(HEALTHKIT_MAX_TEXT_LENGTH + 1);
    const workout = workoutObservation(1);
    workout.workout.distanceUnit = tooLong;
    expect(() => normalize([workout])).toThrowError(expect.objectContaining({ field: "observations[0].workout.distanceUnit" }));
    const quantity = quantityObservation();
    quantity.quantitySample.workoutExternalId = tooLong;
    expect(() => normalize([quantity])).toThrowError(expect.objectContaining({ field: "observations[0].quantitySample.workoutExternalId" }));
  });

  it("accepts realistic workout, quantity and ring-completion payloads unchanged", () => {
    const withRing = summary();
    withRing.activitySummary.dailyActivity.ring_completion = { move: 0.83, exercise: 1.2, stand: 1 };
    const batch = normalize([withRing, workoutObservation(1), quantityObservation()]);
    expect(batch.observations.map((item) => item.observationType))
      .toEqual(["activity_summary", "workout", "quantity_sample"]);
    expect(batch.observations[0].measurement.dailyActivity.ring_completion).toEqual({ move: 0.83, exercise: 1.2, stand: 1 });
  });
});

function jsonRequest(body, headers = {}) {
  return new Request("https://physiqueos.example/api/v1/native/commands", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

async function post(body, headers = {}) {
  return commandRoute(new Request("https://physiqueos.example/api/v1/native/commands", {
    method: "POST",
    headers: {
      authorization: `Bearer ${"x".repeat(43)}`,
      "content-type": "application/json",
      "idempotency-key": PARTITION,
      ...headers,
    },
    body,
  }));
}

function healthKitEnvelope(observations, batchId = PARTITION) {
  return {
    commandType: HEALTHKIT,
    metadata: { commandId: createUuidV7(), idempotencyKey: PARTITION },
    payload: { batchId, observations },
  };
}

function encodeCommand(envelope) {
  return JSON.stringify(envelope);
}

function bytes(value) {
  return Buffer.byteLength(value, "utf8");
}

// Pads an otherwise valid envelope with an ignored metadata property so the
// encoded body is exactly `targetBytes` long.
function padToBytes(envelope, targetBytes) {
  const base = bytes(JSON.stringify({ ...envelope, metadata: { ...(envelope.metadata ?? {}), padding: "" } }));
  return JSON.stringify({
    ...envelope,
    metadata: { ...(envelope.metadata ?? {}), padding: "p".repeat(targetBytes - base) },
  });
}

function dateOffset(index) {
  return new Date(Date.UTC(2026, 8, 12 + index)).toISOString().slice(0, 10);
}

function eightFounderSummaries() {
  return Array.from({ length: 8 }, (_, index) => summary({
    localDate: dateOffset(index),
    externalId: `activity-summary:${dateOffset(index)}`,
    revision: 1,
    partial: index === 7,
  }));
}

// The exact wire shape Native's HealthKitS1WireMapper produces for a
// validation-only Activity summary, with the full-precision Doubles Swift emits.
function summary({
  localDate = "2026-09-12",
  externalId = `activity-summary:${localDate}`,
  revision = 1,
  partial = false,
} = {}) {
  return {
    observationType: "activity_summary",
    externalId,
    ingestionPurpose: "validation_only",
    source: { bundleIdentifier: "com.apple.Health", sourceName: "Apple Health" },
    occurrence: { localDate, timeZone: "America/Los_Angeles", utcOffsetSeconds: -25200 },
    activitySummary: {
      aggregationScope: "daily_total_including_workouts",
      coverage: partial ? "partial_day" : "complete_day",
      sourceRevision: revision,
      dailyActivity: {
        move_calories: 312.45999999999998,
        exercise_minutes: 47.000000000000014,
        stand_hours: 12,
        steps: 6821,
        walking_running_distance: 5203.4,
        flights_climbed: 7,
      },
    },
  };
}

function workoutObservation(index) {
  return {
    observationType: "workout",
    externalId: `3f2504e0-4f89-11d3-9a0c-0305e82c330${index}`,
    source: {
      bundleIdentifier: "com.apple.health.7A1B", sourceName: "Apple Watch", sourceRevision: "11.6",
      productType: "Watch7,5", deviceModel: "Watch", operatingSystemVersion: "11.6",
      privacySafeDeviceProvenance: "apple-watch",
    },
    occurrence: {
      localDate: "2026-09-19", timeZone: "America/Los_Angeles", utcOffsetSeconds: -25200,
      startedAt: "2026-09-19T15:10:00.000Z", endedAt: "2026-09-19T15:45:12Z",
    },
    workout: {
      activityType: "Outdoor Walk", durationSeconds: 2112.4, activeCalories: 141.2,
      totalCalories: 160.7, distance: 2.31, distanceUnit: "mi", averageHeartRate: 104.3,
    },
  };
}

function quantityObservation() {
  return {
    observationType: "quantity_sample",
    externalId: "quantity-sample-1",
    source: { bundleIdentifier: "com.apple.health.7A1B" },
    occurrence: { localDate: "2026-09-19", timeZone: "America/Los_Angeles", startedAt: "2026-09-19T15:10:00Z" },
    quantitySample: { sampleType: "HKQuantityTypeIdentifierHeartRate", value: 96, unit: "count/min", workoutExternalId: "wk-1" },
  };
}

// The largest contract-valid Activity observation: every bounded string and
// name at its maximum length, encoded at the worst-case six bytes per code unit
// (control characters, and vertical-tab padding that trim() removes).
function maximalObservation(index) {
  const control = (units) => "".repeat(units);
  const padded = (value, total = HEALTHKIT_MAX_TEXT_LENGTH) => "".repeat(total - value.length) + value;
  const numeric = (value = "1") => padded(value, HEALTHKIT_MAX_NUMERIC_TEXT_LENGTH);
  const metricName = (n) => `${String(n).padStart(2, "0")}${control(HEALTHKIT_MAX_DAILY_ACTIVITY_KEY_LENGTH - 2)}`;
  // Date.parse ignores parenthesized text, so this is a valid 64-unit timestamp.
  const head = "Sep 12 2026 10:00:00 GMT(";
  const timestamp = `${head}${control(HEALTHKIT_MAX_TIMESTAMP_LENGTH - head.length - 1)})`;
  const dailyActivity = { move_calories: numeric("700") };
  for (let n = 0; n < HEALTHKIT_MAX_DAILY_ACTIVITY_METRICS - 2; n += 1) dailyActivity[metricName(n)] = numeric();
  dailyActivity.ring_completion = Object.fromEntries(
    Array.from({ length: HEALTHKIT_MAX_RING_COMPLETION_METRICS }, (_, n) => [metricName(n), numeric()])
  );
  return {
    observationType: padded("activity_summary"),
    externalId: `${control(HEALTHKIT_MAX_TEXT_LENGTH - String(index).length)}${index}`,
    ingestionPurpose: padded("validation_only"),
    source: {
      bundleIdentifier: control(HEALTHKIT_MAX_TEXT_LENGTH),
      sourceName: control(HEALTHKIT_MAX_TEXT_LENGTH),
      sourceRevision: control(HEALTHKIT_MAX_TEXT_LENGTH),
      productType: control(HEALTHKIT_MAX_TEXT_LENGTH),
      deviceModel: control(HEALTHKIT_MAX_TEXT_LENGTH),
      operatingSystemVersion: control(HEALTHKIT_MAX_TEXT_LENGTH),
      privacySafeDeviceProvenance: control(HEALTHKIT_MAX_TEXT_LENGTH),
    },
    occurrence: {
      localDate: padded("2026-09-12"),
      timeZone: padded("America/Los_Angeles"),
      utcOffsetSeconds: numeric("-25200"),
      startedAt: timestamp,
      endedAt: timestamp,
    },
    activitySummary: {
      aggregationScope: "daily_total_including_workouts", // exact match; never trimmed
      coverage: padded("complete_day"),
      sourceRevision: numeric("1"),
      dailyActivity,
    },
  };
}

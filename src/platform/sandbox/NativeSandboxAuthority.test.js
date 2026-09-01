import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createAuthenticationPrincipal } from "../../application/auth/principal.js";
import { createNativeSandboxWeightCandidateService } from "../../application/evidence/NativeSandboxWeightCandidateService.js";
import {
  createAuthorityScopedObjectProvider,
  createNativeSandboxAuthorityBoundary,
  readNativeSandboxAuthorityConfig,
} from "./NativeSandboxAuthority.js";
import { createInMemoryNativeSandboxWeightStore } from "./InMemoryNativeSandboxWeightStore.js";
import {
  createNativeSandboxContinuationHandler,
  createNativeSandboxProjectionPublisher,
} from "./NativeSandboxContinuationBoundary.js";
import {
  createNativeSandboxWorkerComposition,
  inspectNativeSandboxIntelligenceIsolation,
} from "./NativeSandboxWorkerComposition.js";

describe("Native sandbox authority", () => {
  it("requires a physically separate database, owner, and credential pepper", () => {
    expect(() => readNativeSandboxAuthorityConfig(environment({
      PHYSIQUEOS_NATIVE_SANDBOX_DATABASE_URL: "postgresql://sandbox:secret@db/physiqueos_production",
    }))).toThrowError(expect.objectContaining({ code: "NATIVE_SANDBOX_CONFIGURATION_INVALID" }));
    expect(() => readNativeSandboxAuthorityConfig(environment({
      PHYSIQUEOS_NATIVE_SANDBOX_OWNER_USER_ID: "user_founder_001",
      PHYSIQUEOS_CANONICAL_OWNER_USER_ID: "user_founder_001",
    }))).toThrowError(expect.objectContaining({ code: "NATIVE_SANDBOX_CONFIGURATION_INVALID" }));
    expect(() => readNativeSandboxAuthorityConfig(environment({
      PHYSIQUEOS_NATIVE_SANDBOX_CREDENTIAL_PEPPER: "p".repeat(40),
      PHYSIQUEOS_CREDENTIAL_PEPPER: "p".repeat(40),
    }))).toThrowError(expect.objectContaining({ code: "NATIVE_SANDBOX_CONFIGURATION_INVALID" }));
  });

  it("binds principals, media, and outbox work to one noncanonical authority", async () => {
    const config = readNativeSandboxAuthorityConfig(environment());
    const authority = createNativeSandboxAuthorityBoundary(config);
    const principal = authPrincipal(config.ownerUserId);
    expect(authority.requirePrincipal(principal, "founder:write").userId).toBe(config.ownerUserId);
    expect(() => authority.requirePrincipal(authPrincipal("user_founder_001"), "founder:read"))
      .toThrowError(expect.objectContaining({ code: "RESOURCE_NOT_FOUND" }));

    const provider = objectProvider(config.ownerUserId);
    const scoped = createAuthorityScopedObjectProvider({ provider, config });
    await expect(scoped.beginMultipartUpload({ ownerUserId: config.ownerUserId, objectId: "asset" }))
      .resolves.toMatchObject({ objectKey: `${config.mediaPrefix}asset/original` });
    expect(() => scoped.authorizeRead({ objectKey: "private/user_founder_001/asset/original" }))
      .toThrowError(expect.objectContaining({ code: "NATIVE_SANDBOX_AUTHORITY_VIOLATION" }));

    const message = authority.envelopeOutbox({ topic: "native.sandbox.weight.confirmed", dedupeKey: "one", payload: { reviewId: "review" } });
    expect(authority.assertOutboxMessage(message).payload.sandboxAuthority).toEqual(authority.descriptor);
    expect(() => authority.assertOutboxMessage({ ...message, userId: "user_founder_001" }))
      .toThrowError(expect.objectContaining({ code: "NATIVE_SANDBOX_AUTHORITY_VIOLATION" }));
  });

  it("runs worker, PI, Confidence, Briefing, and Event delegates only inside the sandbox database", async () => {
    const config = readNativeSandboxAuthorityConfig(environment());
    const authority = createNativeSandboxAuthorityBoundary(config);
    const databaseAuthority = { assertDatabase: vi.fn(async () => ({ outcome: "verified" })) };
    const handle = vi.fn(async (_message, context) => ({
      userId: context.ownerUserId,
      kind: "sandbox-pi-briefing-event-projection",
      sandboxAuthority: context.sandboxAuthority,
    }));
    const continuation = createNativeSandboxContinuationHandler({ authority, databaseAuthority, handle });
    const message = authority.envelopeOutbox({ topic: "native.sandbox.weight.confirmed", dedupeKey: "weight-one" });
    const result = await continuation(message);
    expect(result).toMatchObject({ userId: config.ownerUserId, sandboxAuthority: authority.descriptor });
    expect(handle.mock.calls[0][1]).toMatchObject({ noncanonical: true, ownerUserId: config.ownerUserId });

    const publish = vi.fn(async ({ record }) => record);
    const publisher = createNativeSandboxProjectionPublisher({ authority, databaseAuthority, publish });
    await expect(publisher.publish({ record: result, projectionType: "briefing" })).resolves.toEqual(result);
    await expect(publisher.publish({ record: { ...result, userId: "user_founder_001" }, projectionType: "confidence" }))
      .rejects.toMatchObject({ code: "NATIVE_SANDBOX_AUTHORITY_VIOLATION" });
  });

  it("binds the existing worker capacity to only sandbox Weight continuations", async () => {
    const config = readNativeSandboxAuthorityConfig(environment());
    const authority = createNativeSandboxAuthorityBoundary(config);
    const queries = [];
    const pool = workerPool(config, queries);
    const databaseAuthority = { assertDatabase: vi.fn(async () => ({ databaseName: config.databaseName })) };
    const worker = createNativeSandboxWorkerComposition({
      composition: { pool, authority, databaseAuthority },
      buildId: "sandbox-build",
      workerId: "provider-worker-native-sandbox",
    });
    expect(worker.allowedTopics).toEqual(["native.sandbox.weight.confirmed"]);
    await expect(worker.runOnce()).resolves.toMatchObject({ outcome: "idle" });
    expect(queries.some(({ sql, values }) => sql.includes("topic = ANY") &&
      values?.[3]?.[0] === "native.sandbox.weight.confirmed")).toBe(true);
  });

  it("proves PI, Confidence, Briefing, Event, Goal, and Home inputs resolve in the sandbox database", async () => {
    const config = readNativeSandboxAuthorityConfig(environment());
    const authority = createNativeSandboxAuthorityBoundary(config);
    const pool = { query: vi.fn(async () => ({ rows: [{
      confidence_count: 0, briefing_count: 0, event_count: 0,
      goal_count: 0, checkin_count: 0,
    }] })) };
    const result = await inspectNativeSandboxIntelligenceIsolation({
      pool,
      authority,
      databaseAuthority: { assertDatabase: vi.fn(async () => ({ databaseName: config.databaseName })) },
    });
    expect(result).toMatchObject({
      outcome: "sandbox-intelligence-stores-isolated",
      databaseName: config.databaseName,
      ownerUserId: config.ownerUserId,
      cadenceScheduled: false,
    });
    expect(pool.query.mock.calls[0][1]).toEqual([config.ownerUserId]);
  });
});

describe("Native sandbox Weight fast path", () => {
  it("records secret-free validation, media, review-ready, and confirmation stage timing", async () => {
    const logger = { info: vi.fn() };
    const fixture = serviceFixture({ logger });
    const review = await fixture.service.submit({
      principal: fixture.principal, submission: fixture.submission, asset: fixture.asset, requestId: "request-one",
    });
    await fixture.service.confirm({
      principal: fixture.principal, reviewId: review.id, expectedVersion: 1, requestId: "request-one",
    });
    expect(logger.info.mock.calls.map(([event]) => event)).toEqual([
      "native.sandbox.weight_candidate.validated",
      "native.sandbox.weight_candidate.media_stored",
      "native.sandbox.weight_candidate.evidence_review_ready",
      "native.sandbox.weight_review.canonical_commit_and_outbox_enqueued",
    ]);
    const serialized = JSON.stringify(logger.info.mock.calls);
    expect(serialized).not.toContain(fixture.submission.assetSha256);
    expect(serialized).not.toContain("real submitted screenshot bytes");
  });

  it("stages real asset-backed candidate data, confirms sandbox-only, and enqueues authority context", async () => {
    const fixture = serviceFixture();
    const review = await fixture.service.submit({ principal: fixture.principal, submission: fixture.submission, asset: fixture.asset });
    expect(review).toMatchObject({
      status: "pending",
      occurrenceDate: "2026-08-31",
      candidate: { value: 168.4, unit: "lb", disposition: "deterministic_review_ready" },
      interpretedEvidence: { evidence_objects: [{ evidence_type: "weight", value: 168.4, unit: "lb" }] },
    });
    expect(fixture.media.store).toHaveBeenCalledOnce();

    const result = await fixture.service.confirm({ principal: fixture.principal, reviewId: review.id, expectedVersion: 1 });
    expect(result.weightEntry).toMatchObject({ userId: fixture.config.ownerUserId, measuredAt: "2026-08-31", weight: { value: 168.4, unit: "lb" } });
    expect(fixture.store.state.outbox).toHaveLength(1);
    expect(fixture.store.state.outbox[0].payload.sandboxAuthority.authorityId).toBe(fixture.config.authorityId);
    expect([...fixture.store.state.weightEntries.values()].some((entry) => entry.userId === "user_founder_001")).toBe(false);
  });

  it("is idempotent, preserves Pacific date-only semantics, and never substitutes fixture values", async () => {
    const fixture = serviceFixture();
    const first = await fixture.service.submit({ principal: fixture.principal, submission: fixture.submission, asset: fixture.asset });
    const second = await fixture.service.submit({ principal: fixture.principal, submission: fixture.submission, asset: fixture.asset });
    expect(second).toEqual(first);
    expect(fixture.media.store).toHaveBeenCalledOnce();
    expect(second.candidate.measurementDate).toBe("2026-08-31");
    expect(second.candidate.value).toBe(fixture.submission.value);
  });

  it("uses an honest interpretation-required state below deterministic confidence", async () => {
    const fixture = serviceFixture({ confidence: 0.72 });
    const review = await fixture.service.submit({ principal: fixture.principal, submission: fixture.submission, asset: fixture.asset });
    expect(review.status).toBe("interpretation_required");
    await expect(fixture.service.confirm({ principal: fixture.principal, reviewId: review.id, expectedVersion: 1 }))
      .rejects.toMatchObject({ code: "NATIVE_SANDBOX_WEIGHT_REVIEW_CONFLICT" });
  });

  it("discards pending sandbox review without touching another authority", async () => {
    const fixture = serviceFixture();
    const review = await fixture.service.submit({ principal: fixture.principal, submission: fixture.submission, asset: fixture.asset });
    await expect(fixture.service.discard({ principal: fixture.principal, reviewId: review.id, expectedVersion: 1 }))
      .resolves.toEqual({ discarded: true, reviewId: review.id });
    expect(fixture.store.state.reviews.size).toBe(0);
    expect(fixture.store.state.weightEntries.size).toBe(0);
    expect(fixture.store.state.outbox).toHaveLength(0);
  });

  it("rejects a byte/checksum mismatch before any media write", async () => {
    const fixture = serviceFixture();
    await expect(fixture.service.submit({
      principal: fixture.principal,
      submission: { ...fixture.submission, assetSha256: "f".repeat(64) },
      asset: fixture.asset,
    })).rejects.toMatchObject({ code: "NATIVE_SANDBOX_WEIGHT_CANDIDATE_INVALID" });
    expect(fixture.media.store).not.toHaveBeenCalled();
  });
});

function serviceFixture(overrides = {}) {
  const config = readNativeSandboxAuthorityConfig(environment());
  const authority = createNativeSandboxAuthorityBoundary(config);
  const store = createInMemoryNativeSandboxWeightStore({ authority });
  const bytes = Buffer.from("real submitted screenshot bytes");
  const media = { store: vi.fn(async ({ contentType }) => Object.freeze({
    objectId: "object-sandbox-1", reference: "media://object-sandbox-1", contentType,
    byteLength: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"),
  })) };
  const submission = {
    submissionIdentity: "018f0f6f-8f4c-7e4d-8a6c-3d831df41000",
    idempotencyKey: "native-weight-acceptance-1",
    candidateType: "weight",
    measurementDate: "2026-08-31",
    value: 168.4,
    unit: "lb",
    confidence: overrides.confidence ?? 0.97,
    localParserVersion: "ios-vision-weight-v1",
    assetSha256: createHash("sha256").update(bytes).digest("hex"),
    fieldProvenance: { value: { source: "native_local_extraction", regions: [{ page: 1, text: "168.4 lb" }] } },
  };
  return {
    config,
    authority,
    store,
    media,
    principal: authPrincipal(config.ownerUserId),
    submission,
    asset: { bytes, contentType: "image/png", filename: "weight.png" },
    service: createNativeSandboxWeightCandidateService({
      authority,
      store,
      media,
      clock: () => new Date("2026-09-01T15:00:00.000Z"),
      performanceClock: (() => { let value = 0; return () => ++value; })(),
      logger: overrides.logger ?? null,
    }),
  };
}

function authPrincipal(userId) {
  return createAuthenticationPrincipal({
    userId, deviceId: "device-ios", sessionId: "session-ios",
    scopes: ["founder:read", "founder:write"], authenticatedAt: "2026-09-01T14:00:00.000Z",
  });
}
function environment(overrides = {}) {
  return {
    PHYSIQUEOS_NATIVE_SANDBOX_ENABLED: "1",
    PHYSIQUEOS_NATIVE_SANDBOX_AUTHORITY_ID: "native-sandbox-founder-acceptance",
    PHYSIQUEOS_NATIVE_SANDBOX_OWNER_USER_ID: "user_native_sandbox_founder_acceptance",
    PHYSIQUEOS_NATIVE_SANDBOX_DATABASE_URL: "postgresql://sandbox:secret@db/physiqueos_native_sandbox_founder_acceptance",
    PHYSIQUEOS_DATABASE_URL: "postgresql://production:secret@db/physiqueos_production",
    PHYSIQUEOS_NATIVE_SANDBOX_CREDENTIAL_PEPPER: "sandbox-pepper-".padEnd(40, "s"),
    PHYSIQUEOS_CREDENTIAL_PEPPER: "production-pepper-".padEnd(40, "p"),
    PHYSIQUEOS_CANONICAL_OWNER_USER_ID: "user_founder_001",
    ...overrides,
  };
}
function objectProvider(ownerUserId) {
  return {
    beginMultipartUpload: vi.fn(async ({ objectId }) => ({ objectKey: `private/${ownerUserId}/${objectId}/original` })),
    authorizeUploadPart: vi.fn(), completeMultipartUpload: vi.fn(), abortMultipartUpload: vi.fn(),
    deleteObject: vi.fn(), inspectObject: vi.fn(), downloadObjectToFile: vi.fn(),
    authorizeRead: vi.fn(async () => ({})), healthCheck: vi.fn(), close: vi.fn(),
  };
}

function workerPool(config, queries) {
  const rows = [];
  const query = vi.fn(async (sql, values) => {
    queries.push({ sql, values });
    if (sql.includes("INSERT INTO physiqueos.worker_heartbeats")) return { rows: [{ worker_id: values[0] }], rowCount: 1 };
    if (sql.includes("WITH candidate")) return { rows, rowCount: rows.length };
    if (sql.includes("SELECT current_database")) return { rows: [{ database: config.databaseName }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  return { query, connect: vi.fn(async () => ({ query, release: vi.fn() })) };
}

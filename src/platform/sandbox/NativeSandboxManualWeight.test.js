import { describe, expect, it, vi } from "vitest";
import { createAuthenticationPrincipal } from "../../application/auth/principal.js";
import { createNativeSandboxManualWeightService } from "../../application/evidence/NativeSandboxManualWeightService.js";
import {
  createNativeSandboxAuthorityBoundary,
  readNativeSandboxAuthorityConfig,
} from "./NativeSandboxAuthority.js";
import { createInMemoryNativeSandboxWeightStore } from "./InMemoryNativeSandboxWeightStore.js";
import { createNativeSandboxContinuationHandler } from "./NativeSandboxContinuationBoundary.js";

describe("Native sandbox manual Weight", () => {
  it("writes canonical Weight directly with no asset, no OCR provenance, and no review", async () => {
    const fixture = serviceFixture();
    const result = await fixture.service.submit({ principal: fixture.principal, submission: fixture.submission });

    expect(result).toMatchObject({
      status: "confirmed",
      measurementDate: "2026-08-31",
      value: 168.4,
      unit: "lb",
    });
    // The submission carries only measurementDate/value/unit/identity - no
    // asset, assetSha256, fieldProvenance, or confidence field exists at all.
    expect(fixture.submission.asset).toBeUndefined();
    expect(fixture.submission.assetSha256).toBeUndefined();
    expect(fixture.submission.fieldProvenance).toBeUndefined();
    expect(fixture.store.state.reviews.size).toBe(0);
    expect(fixture.store.state.weightEntries.get(result.id)).toMatchObject({
      userId: fixture.config.ownerUserId,
      measuredAt: "2026-08-31",
      weight: { value: 168.4, unit: "lb" },
      source: { type: "manual" },
    });
  });

  it("rejects a value outside the production Weight bounds", async () => {
    const fixture = serviceFixture();
    await expect(fixture.service.submit({
      principal: fixture.principal,
      submission: { ...fixture.submission, value: 1_200 },
    })).rejects.toMatchObject({ code: "NATIVE_SANDBOX_WEIGHT_MANUAL_INVALID" });
    expect(fixture.store.state.weightEntries.size).toBe(0);
  });

  it("rejects a unit that is not lb or kg", async () => {
    const fixture = serviceFixture();
    await expect(fixture.service.submit({
      principal: fixture.principal,
      submission: { ...fixture.submission, unit: "stone" },
    })).rejects.toMatchObject({ code: "NATIVE_SANDBOX_WEIGHT_MANUAL_INVALID" });
  });

  it("preserves date-only semantics without shifting through UTC midnight", async () => {
    const fixture = serviceFixture();
    const result = await fixture.service.submit({
      principal: fixture.principal,
      submission: { ...fixture.submission, measurementDate: "2026-01-01" },
    });
    expect(result.measurementDate).toBe("2026-01-01");
    await expect(fixture.service.submit({
      principal: fixture.principal,
      submission: { ...fixture.submission, measurementDate: "2026-02-30" },
    })).rejects.toMatchObject({ code: "NATIVE_SANDBOX_WEIGHT_MANUAL_INVALID" });
  });

  it("requires the sandbox authority and rejects the Founder production owner", async () => {
    const fixture = serviceFixture();
    const founderPrincipal = authPrincipal("user_founder_001");
    await expect(fixture.service.submit({ principal: founderPrincipal, submission: fixture.submission }))
      .rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    expect(fixture.store.state.weightEntries.size).toBe(0);
  });

  it("is idempotent on exact request replay and never double-enqueues the outbox", async () => {
    const fixture = serviceFixture();
    const first = await fixture.service.submit({ principal: fixture.principal, submission: fixture.submission });
    const second = await fixture.service.submit({ principal: fixture.principal, submission: fixture.submission });
    expect(second).toEqual(first);
    expect(fixture.store.state.outbox).toHaveLength(1);
  });

  it("corrects the same day's canonical Weight when a second distinct value is submitted", async () => {
    const fixture = serviceFixture();
    await fixture.service.submit({ principal: fixture.principal, submission: fixture.submission });
    const corrected = await fixture.service.submit({
      principal: fixture.principal,
      submission: { ...fixture.submission, idempotencyKey: "native-weight-manual-acceptance-2", value: 169.1 },
    });
    expect(corrected.value).toBe(169.1);
    expect(fixture.store.state.weightEntries.size).toBe(1);
    expect(fixture.store.state.outbox).toHaveLength(2);
  });

  it("does not write a second time when the same value is resubmitted under a new idempotency key", async () => {
    const fixture = serviceFixture();
    await fixture.service.submit({ principal: fixture.principal, submission: fixture.submission });
    await fixture.service.submit({
      principal: fixture.principal,
      submission: { ...fixture.submission, idempotencyKey: "native-weight-manual-acceptance-2" },
    });
    expect(fixture.store.state.weightEntries.size).toBe(1);
    expect(fixture.store.state.outbox).toHaveLength(1);
  });

  it("rejects a reused idempotency key submitted under a different submission identity", async () => {
    const fixture = serviceFixture();
    await fixture.service.submit({ principal: fixture.principal, submission: fixture.submission });
    await expect(fixture.service.submit({
      principal: fixture.principal,
      submission: { ...fixture.submission, submissionIdentity: "018f0f6f-8f4c-7e4d-8a6c-3d831df41999" },
    })).rejects.toMatchObject({ code: "NATIVE_SANDBOX_WEIGHT_REVIEW_CONFLICT" });
  });

  it("does not synthesize success when the store rejects the write", async () => {
    const fixture = serviceFixture();
    const failingStore = { writeManual: vi.fn(async () => { throw new Error("boom"); }) };
    const service = createNativeSandboxManualWeightService({ authority: fixture.authority, store: failingStore });
    await expect(service.submit({ principal: fixture.principal, submission: fixture.submission }))
      .rejects.toThrow("boom");
  });

  it("tags the outbox continuation with the sandbox authority and no reviewId, and the existing worker accepts it", async () => {
    const fixture = serviceFixture();
    const result = await fixture.service.submit({ principal: fixture.principal, submission: fixture.submission });
    const message = fixture.store.state.outbox[0];
    expect(message.topic).toBe("native.sandbox.weight.confirmed");
    expect(message.payload.reviewId).toBeUndefined();
    expect(message.payload.sandboxAuthority.authorityId).toBe(fixture.config.authorityId);

    const databaseAuthority = { assertDatabase: vi.fn(async () => ({ outcome: "verified" })) };
    const continuation = createNativeSandboxContinuationHandler({
      authority: fixture.authority,
      databaseAuthority,
      handle: async (verified) => Object.freeze({ outcome: "sandbox-weight-visible-to-pi", weightEntryId: verified.payload.weightEntryId }),
    });
    await expect(continuation(message)).resolves.toMatchObject({ outcome: "sandbox-weight-visible-to-pi", weightEntryId: result.id });
  });
});

function serviceFixture() {
  const config = readNativeSandboxAuthorityConfig(environment());
  const authority = createNativeSandboxAuthorityBoundary(config);
  const store = createInMemoryNativeSandboxWeightStore({ authority });
  const submission = {
    submissionIdentity: "018f0f6f-8f4c-7e4d-8a6c-3d831df41001",
    idempotencyKey: "native-weight-manual-acceptance-1",
    measurementDate: "2026-08-31",
    value: 168.4,
    unit: "lb",
  };
  return {
    config,
    authority,
    store,
    principal: authPrincipal(config.ownerUserId),
    submission,
    service: createNativeSandboxManualWeightService({
      authority,
      store,
      clock: () => new Date("2026-09-01T15:00:00.000Z"),
      performanceClock: (() => { let value = 0; return () => ++value; })(),
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

import { describe, expect, it, vi } from "vitest";
import { createDurableOutboxWorker } from "../jobs/DurableOutboxWorker.js";
import { createNativeSandboxContinuationHandler } from "./NativeSandboxContinuationBoundary.js";
import {
  createNativeSandboxAuthorityBoundary,
  readNativeSandboxAuthorityConfig,
  NATIVE_SANDBOX_WEIGHT_CONTINUATION_TOPIC,
} from "./NativeSandboxAuthority.js";

// Regression coverage for a real defect: DurableOutboxWorker previously
// built the object it hands to topic handlers without a `userId` field,
// while NativeSandboxContinuationBoundary's assertOutboxMessage requires
// message.userId to match the sandbox owner. NativeSandboxManualWeight.test.js
// and NativeSandboxAuthority.test.js only ever called the continuation
// handler directly with the pre-worker envelope object (which does carry
// userId), so no test exercised the actual row -> DurableOutboxWorker ->
// handler shape a real worker claim produces. This test wires the real
// createDurableOutboxWorker to the real createNativeSandboxContinuationHandler
// against a store whose claimNext returns a Postgres-row-shaped message
// (snake_case user_id, no top-level userId) to prove the chain now works.
describe("Native sandbox worker to continuation boundary message shape", () => {
  it("delivers userId from the claimed outbox row through to the sandbox authority boundary", async () => {
    const config = readNativeSandboxAuthorityConfig(environment());
    const authority = createNativeSandboxAuthorityBoundary(config);
    const databaseAuthority = { assertDatabase: vi.fn(async () => ({ outcome: "verified" })) };
    const handle = vi.fn(async (verified) => Object.freeze({
      outcome: "sandbox-weight-visible-to-pi",
      weightEntryId: verified.payload.weightEntryId,
    }));
    const continuation = createNativeSandboxContinuationHandler({ authority, databaseAuthority, handle });

    const row = {
      id: "outbox-message-1",
      user_id: config.ownerUserId,
      topic: NATIVE_SANDBOX_WEIGHT_CONTINUATION_TOPIC,
      payload_version: "1",
      payload: {
        weightEntryId: "native_sandbox_weight_manual_2026_08_31",
        sandboxAuthority: authority.descriptor,
      },
      operation_id: null,
      due_at: new Date("2026-08-31T00:00:00.000Z"),
      claim_expires_at: null,
      status: "pending",
      attempt_count: 0,
    };
    const store = {
      async claimNext() { return { ...row, status: "processing", claimed_by: "worker-1", attempt_count: 1 }; },
      async acknowledge() { return { ...row, status: "succeeded" }; },
      async fail() { return { ...row, status: "pending" }; },
      async heartbeat() {},
    };
    const worker = createDurableOutboxWorker({
      store,
      handlers: { [NATIVE_SANDBOX_WEIGHT_CONTINUATION_TOPIC]: continuation },
      workerId: "worker-1",
      buildId: "build-1",
      clock: () => new Date("2026-08-31T00:00:01.000Z"),
    });

    const result = await worker.runOnce();

    expect(result).toMatchObject({ outcome: "succeeded", messageId: "outbox-message-1" });
    expect(handle).toHaveBeenCalledOnce();
    const [verifiedMessage] = handle.mock.calls[0];
    expect(verifiedMessage.userId).toBe(config.ownerUserId);
  });
});

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

import { describe, expect, it, vi } from "vitest";
import { createCommandMetadata } from "../../contracts/v1/command";
import { createUuidV7 } from "../../contracts/v1/identifiers";
import { createAuthenticationPrincipal } from "../auth/principal";
import { executeIdempotentCommand } from "./executeIdempotentCommand";
import { createInMemoryFoundationTransactionStore } from "../../platform/commands/InMemoryFoundationTransactionStore";
import { createOccurrenceGenerationKey, createSourceIdentity } from "../../platform/commands/stableIdentity";

const principal = createAuthenticationPrincipal({ userId: "synthetic-user", deviceId: "synthetic-device", sessionId: "synthetic-session" });

describe("idempotent command foundation", () => {
  it("commits once and replays the original receipt", async () => {
    const store = createInMemoryFoundationTransactionStore();
    const handler = vi.fn(async () => ({ result: { resourceId: "synthetic-resource", version: "2" }, outbox: [{ id: createUuidV7(), topic: "synthetic.changed", dedupeKey: "synthetic-resource:2", payloadVersion: "1", payload: {} }] }));
    const metadata = createCommandMetadata({ idempotencyKey: "synthetic-command-0001" });
    const input = { transactionRunner: store, principal, metadata, commandType: "synthetic.update", payload: { value: 1 }, handler };

    expect((await executeIdempotentCommand(input)).outcome).toBe("committed");
    const replay = await executeIdempotentCommand(input);
    expect(replay.outcome).toBe("replayed");
    expect(replay.receipt.result).toEqual({ resourceId: "synthetic-resource", version: "2" });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(store.inspect().outbox.size).toBe(1);
  });

  it("rejects the same key with a different canonical payload", async () => {
    const store = createInMemoryFoundationTransactionStore();
    const metadata = createCommandMetadata({ idempotencyKey: "synthetic-command-0002" });
    const base = { transactionRunner: store, principal, metadata, commandType: "synthetic.update", handler: async () => ({ result: { ok: true } }) };
    await executeIdempotentCommand({ ...base, payload: { value: 1 } });
    await expect(executeIdempotentCommand({ ...base, payload: { value: 2 } })).rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("rolls back the receipt when outbox insertion fails", async () => {
    const store = createInMemoryFoundationTransactionStore({ outbox: [{ id: "existing", topic: "synthetic.changed", dedupeKey: "same", payload: {} }] });
    const metadata = createCommandMetadata({ idempotencyKey: "synthetic-command-0003" });
    await expect(executeIdempotentCommand({
      transactionRunner: store, principal, metadata, commandType: "synthetic.update", payload: {},
      handler: async () => ({ outbox: [{ id: "new", topic: "synthetic.changed", dedupeKey: "same", payload: {} }] }),
    })).rejects.toThrow("Duplicate outbox dedupe key");
    expect(store.inspect().commandReceipts.size).toBe(0);
    expect(store.inspect().outbox.size).toBe(1);
  });

  it("creates stable occurrence and source identities", () => {
    const occurrence = { ownerUserId: "u", sourceType: "protocol", sourceId: "p", sourceVersion: "2", localDate: "2026-08-10", slotKey: "morning" };
    expect(createOccurrenceGenerationKey(occurrence)).toBe(createOccurrenceGenerationKey({ ...occurrence }));
    expect(createSourceIdentity({ ownerUserId: "u", namespace: "healthkit", sourceId: "sample" }).key).toMatch(/^[a-f0-9]{64}$/);
  });
});

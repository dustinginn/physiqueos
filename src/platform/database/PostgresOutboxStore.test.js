import { describe, expect, it, vi } from "vitest";
import { createPostgresOutboxStore } from "./PostgresOutboxStore.js";

describe("Postgres outbox topic filtering", () => {
  it("adds an exact SQL topic filter only when an allowlist is supplied", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const store = createPostgresOutboxStore({ query });
    const now = new Date("2026-08-28T00:00:00.000Z");
    await store.claimNext({
      workerId: "worker",
      now,
      leaseExpiresAt: new Date("2026-08-28T00:01:00.000Z"),
      allowedTopics: ["operations.simplified-provider-migration"],
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("topic = ANY($4::text[])"), [
      "worker",
      new Date("2026-08-28T00:01:00.000Z"),
      now,
      ["operations.simplified-provider-migration"],
    ]);
  });

  it("uses the existing unrestricted claim contract only when no filter is requested", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const store = createPostgresOutboxStore({ query });
    const now = new Date("2026-08-28T00:00:00.000Z");
    await store.claimNext({ workerId: "worker", now, leaseExpiresAt: now });
    expect(query.mock.calls[0][1][3]).toBeNull();
  });

  it("rejects empty, duplicate, or whitespace-mutated filters", async () => {
    const store = createPostgresOutboxStore({ query: vi.fn() });
    const base = { workerId: "worker", now: new Date(), leaseExpiresAt: new Date() };
    await expect(store.claimNext({ ...base, allowedTopics: [] })).rejects.toThrow(/non-empty array/);
    await expect(store.claimNext({ ...base, allowedTopics: ["same", "same"] })).rejects.toThrow(/unique non-empty exact identities/);
    await expect(store.claimNext({ ...base, allowedTopics: [" topic"] })).rejects.toThrow(/unique non-empty exact identities/);
  });

  it("acknowledges and fails only while the durable lease is still owned", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const store = createPostgresOutboxStore({ query });
    const at = new Date("2026-08-30T20:00:30.000Z");
    await store.acknowledge({ id: "message", workerId: "worker", at });
    await store.fail({ id: "message", workerId: "worker", at,
      dueAt: at, errorCode: "FAILED", errorDetail: "protected", terminal: false });
    expect(query.mock.calls[0][0]).toContain("claim_expires_at > $3");
    expect(query.mock.calls[1][0]).toContain("claim_expires_at > $3");
  });
});

import { describe, expect, it, vi } from "vitest";
import { createPostgresIdentityStore } from "./PostgresIdentityStore.js";

describe("Postgres sender-constrained refresh persistence", () => {
  it("locks access use and refresh/exchange state before classification", async () => {
    const query = vi.fn(async () => ({ rows: [{}], rowCount: 1 }));
    const store = createPostgresIdentityStore({ query });
    await store.findAccessCredentialForAuthentication("access-hash");
    await store.lockRefreshCredential("refresh-hash");
    await store.lockRefreshExchangeByPredecessor("refresh-a");
    await store.lockRefreshExchangeAccessCredentials("exchange");
    const sql = query.mock.calls.map(([text]) => text).join("\n");
    expect(sql).toContain("FOR UPDATE OF access_credentials");
    expect(sql).toContain("FOR UPDATE OF refresh_credentials");
    expect(sql).toContain("FOR UPDATE OF access_credentials");
    expect(sql).toContain("installation_signing_keys");
  });

  it("records first use once and consumes a nonce with one unique proof identity", async () => {
    const query = vi.fn(async () => ({ rows: [{}], rowCount: 1 }));
    const store = createPostgresIdentityStore({ query });
    await store.markAccessCredentialUsed({ id: "access", at: new Date() });
    await store.consumeRefreshProofChallenge({ id: "challenge", proofIdDigest: "a".repeat(64), at: new Date() });
    expect(query.mock.calls[0][0]).toContain("first_used_at = COALESCE(first_used_at, $2)");
    expect(query.mock.calls[1][0]).toContain("consumed_at IS NULL");
    expect(query.mock.calls[1][0]).toContain("proof_id_digest = $2");
  });

  it("revokes all prior exchange access before linking a replacement", async () => {
    const query = vi.fn(async () => ({ rows: [{}], rowCount: 1 }));
    const store = createPostgresIdentityStore({ query });
    await store.revokeRefreshExchangeAccessCredentials({ exchangeId: "exchange", at: new Date() });
    await store.linkRefreshExchangeAccessCredential({ exchangeId: "exchange", accessCredentialId: "replacement" });
    expect(query.mock.calls[0][0]).toContain("refresh_exchange_access_credentials");
    expect(query.mock.calls[0][0]).toContain("revoked_at = COALESCE");
    expect(query.mock.calls[1][0]).toContain("INSERT INTO physiqueos.refresh_exchange_access_credentials");
  });
});

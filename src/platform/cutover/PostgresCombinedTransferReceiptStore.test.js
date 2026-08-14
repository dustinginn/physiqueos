import { describe, expect, it, vi } from "vitest";
import { createPostgresCombinedTransferReceiptStore } from "./PostgresCombinedTransferReceiptStore.js";

const digest = (character) => character.repeat(64);

describe("PostgreSQL combined transfer receipts", () => {
  it("rejects a manifest that is not bound to the declared package", async () => {
    const query = vi.fn();
    const store = createPostgresCombinedTransferReceiptStore({ pool: { query, connect: vi.fn() } });
    await expect(store.declare(declaration({ manifest: { packageDigest: digest("f"), files: [] } })))
      .rejects.toMatchObject({ code: "TRANSFER_MANIFEST_MISMATCH" });
    expect(query).not.toHaveBeenCalled();
  });

  it("records an idempotent exact declaration", async () => {
    const input = declaration();
    const databaseRow = {
      migration_operation_id: input.migrationOperationId,
      authorization_fingerprint: input.authorizationFingerprint,
      fence_id: input.fenceId,
      package_digest: input.packageDigest,
      runtime_sha256: input.runtimeSha256,
      media_inventory_sha256: input.mediaInventorySha256,
      migration_control_sha256: input.migrationControlSha256,
      status: "declared",
      manifest: input.manifest,
      receipt: null,
      provider_deployment_id: input.providerDeploymentId,
    };
    let inserted = false;
    const query = vi.fn(async (sql) => {
      if (sql.startsWith("INSERT")) { if (inserted) return { rows: [] }; inserted = true; return { rows: [databaseRow] }; }
      if (sql.startsWith("SELECT")) return { rows: [databaseRow] };
      throw new Error("unexpected SQL");
    });
    const store = createPostgresCombinedTransferReceiptStore({ pool: { query, connect: vi.fn() } });
    expect((await store.declare(input)).outcome).toBe("declared");
    expect((await store.declare(input)).outcome).toBe("idempotent-replay");
  });
});

function declaration(overrides = {}) {
  const packageDigest = digest("a");
  return {
    migrationOperationId: "combined-op-1",
    authorizationFingerprint: digest("b"),
    fenceId: "fence-1",
    packageDigest,
    runtimeSha256: digest("c"),
    mediaInventorySha256: digest("d"),
    migrationControlSha256: digest("e"),
    providerDeploymentId: "deployment-1",
    manifest: { packageDigest, files: [{ path: "canonical-runtime.json", byteLength: 10, sha256: digest("f") }] },
    ...overrides,
  };
}

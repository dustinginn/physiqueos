import { describe, expect, it } from "vitest";
import { createInMemoryCombinedCutoverTransferStaging, sha256Of } from "./combinedCutoverTransferStaging.js";
import { createTransferStagingKey, deriveTransferPackageId } from "./combinedCutoverTransferContract.js";

const operationId = "combined-op-0001";
const packageId = deriveTransferPackageId("canonical-runtime.json");

describe("in-memory combined cutover transfer staging", () => {
  it("round-trips staged bytes by key", async () => {
    const staging = createInMemoryCombinedCutoverTransferStaging();
    const key = createTransferStagingKey({ operationId, packageId, chunkIndex: 0 });
    const bytes = Buffer.from("hello staged bytes");
    await staging.put({ key, bytes });
    const read = await staging.read({ key });
    expect(read.equals(bytes)).toBe(true);
    expect(sha256Of(read)).toBe(sha256Of(bytes));
  });

  it("rejects a key outside the cutover-transfer namespace on put and read", async () => {
    const staging = createInMemoryCombinedCutoverTransferStaging();
    await expect(staging.put({ key: "private/owner/object/original", bytes: Buffer.from("x") })).rejects.toMatchObject({ code: "TRANSFER_STAGING_KEY_FORBIDDEN" });
    await expect(staging.read({ key: "private/owner/object/original" })).rejects.toMatchObject({ code: "TRANSFER_STAGING_KEY_FORBIDDEN" });
  });

  it("reports unavailable for a key that was never staged", async () => {
    const staging = createInMemoryCombinedCutoverTransferStaging();
    const key = createTransferStagingKey({ operationId, packageId, chunkIndex: 5 });
    await expect(staging.read({ key })).rejects.toMatchObject({ code: "TRANSFER_STAGING_UNAVAILABLE" });
  });

  it("removes a staged object", async () => {
    const staging = createInMemoryCombinedCutoverTransferStaging();
    const key = createTransferStagingKey({ operationId, packageId, chunkIndex: 1 });
    await staging.put({ key, bytes: Buffer.from("x") });
    await staging.remove({ key });
    await expect(staging.read({ key })).rejects.toMatchObject({ code: "TRANSFER_STAGING_UNAVAILABLE" });
  });

  it("exposes a retryable substrate fault for a bounded number of put attempts (test-only failure injection)", async () => {
    const staging = createInMemoryCombinedCutoverTransferStaging({ failNextPut: 1 });
    const key = createTransferStagingKey({ operationId, packageId, chunkIndex: 2 });
    await expect(staging.put({ key, bytes: Buffer.from("x") })).rejects.toMatchObject({ code: "TRANSFER_STAGING_UNAVAILABLE", retryable: true });
    await expect(staging.put({ key, bytes: Buffer.from("x") })).resolves.toMatchObject({ key });
  });
});

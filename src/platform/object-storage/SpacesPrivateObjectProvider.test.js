import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createPrivateObjectKey, createSpacesPrivateObjectProvider } from "./SpacesPrivateObjectProvider";
import { readSpacesConfig } from "./spacesConfig";

const CONFIG = { enabled: true, region: "sfo3", endpoint: "https://sfo3.digitaloceanspaces.com", bucket: "synthetic-private", accessKeyId: "synthetic", secretAccessKey: "synthetic-secret" };
const OBJECT_ID = "media-1fadfe2c43970a9c6268b3b9f3ef4c3f-62a670131e57";

describe("DigitalOcean Spaces private provider", () => {
  it("fails closed when provider configuration is enabled but incomplete", () => {
    expect(() => readSpacesConfig({ PHYSIQUEOS_OBJECT_STORAGE_ENABLED: "1" })).toThrow("is required");
    expect(readSpacesConfig({}).enabled).toBe(false);
  });

  it("creates only opaque owner-scoped private keys", () => {
    expect(createPrivateObjectKey("user-1", OBJECT_ID)).toBe(`private/user-1/${OBJECT_ID}/original`);
    expect(() => createPrivateObjectKey("../owner", OBJECT_ID)).toThrow("identity is invalid");
    expect(() => createPrivateObjectKey("owner", "private/owner/object/original")).toThrow("identity is invalid");
  });

  it("initiates multipart uploads without a public ACL", async () => {
    const send = vi.fn().mockResolvedValue({ UploadId: "provider-upload" });
    const provider = createSpacesPrivateObjectProvider(CONFIG, { client: { send, destroy: vi.fn() }, sign: vi.fn() });
    const result = await provider.beginMultipartUpload({ ownerUserId: "user", objectId: OBJECT_ID, contentType: "image/jpeg", expectedSha256: "a".repeat(64) });
    expect(result).toMatchObject({ objectKey: `private/user/${OBJECT_ID}/original`, providerUploadId: "provider-upload" });
    expect(send.mock.calls[0][0].input).not.toHaveProperty("ACL");
  });

  it("caps authorized reads at five minutes and upload parts at fifteen", async () => {
    const sign = vi.fn().mockResolvedValue("https://temporary.invalid/signed");
    const provider = createSpacesPrivateObjectProvider(CONFIG, { client: { send: vi.fn(), destroy: vi.fn() }, sign });
    await expect(provider.authorizeRead({ objectKey: "private/user/object/original", expiresInSeconds: 999 })).resolves.toMatchObject({ expiresInSeconds: 300 });
    await expect(provider.authorizeUploadPart({ objectKey: "private/user/object/original", providerUploadId: "upload", partNumber: 1, expiresInSeconds: 9999 })).resolves.toMatchObject({ expiresInSeconds: 900 });
  });

  it("rejects malformed multipart receipts", async () => {
    const provider = createSpacesPrivateObjectProvider(CONFIG, { client: { send: vi.fn(), destroy: vi.fn() }, sign: vi.fn() });
    await expect(provider.completeMultipartUpload({ objectKey: "private/user/object/original", providerUploadId: "upload", parts: [{ partNumber: 2, etag: "etag" }] })).rejects.toThrow("malformed");
  });

  it("hashes retrieved bytes instead of trusting upload metadata", async () => {
    const send = vi.fn()
      .mockResolvedValueOnce({ ContentLength: 3, ContentType: "image/jpeg", Metadata: { "physiqueos-sha256": "f".repeat(64) }, ETag: '"etag"', VersionId: "version" })
      .mockResolvedValueOnce({ Body: { async *[Symbol.asyncIterator]() { yield Buffer.from("abc"); } } });
    const provider = createSpacesPrivateObjectProvider(CONFIG, { client: { send, destroy: vi.fn() }, sign: vi.fn() });
    await expect(provider.inspectObject({ objectKey: "private/user/object/original" })).resolves.toMatchObject({ sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" });
  });

  it("bounds and aborts only the health request", async () => {
    const send = vi.fn((_command, { abortSignal } = {}) => new Promise((_resolve, reject) => {
      abortSignal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
    }));
    const provider = createSpacesPrivateObjectProvider(CONFIG, { client: { send, destroy: vi.fn() }, sign: vi.fn() });

    await expect(provider.healthCheck({ timeoutMs: 100 })).rejects.toMatchObject({ code: "OBJECT_STORAGE_HEALTH_TIMEOUT" });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][1].abortSignal.aborted).toBe(true);
  });

  it("honors a caller abort and does not apply health deadlines to normal object operations", async () => {
    const controller = new AbortController();
    const send = vi.fn((_command, options = {}) => {
      if (!options.abortSignal) return Promise.resolve({ UploadId: "normal-upload" });
      return new Promise((_resolve, reject) => {
        options.abortSignal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
      });
    });
    const provider = createSpacesPrivateObjectProvider(CONFIG, { client: { send, destroy: vi.fn() }, sign: vi.fn() });

    const health = provider.healthCheck({ signal: controller.signal, timeoutMs: 1000 });
    controller.abort();
    await expect(health).rejects.toMatchObject({ code: "OBJECT_STORAGE_HEALTH_ABORTED" });
    await expect(provider.beginMultipartUpload({ ownerUserId: "user", objectId: OBJECT_ID, contentType: "image/jpeg" })).resolves.toMatchObject({ providerUploadId: "normal-upload" });
    expect(send.mock.calls[1][1]).toBeUndefined();
  });

  it("isolates the single-attempt health client from normal object-operation retry behavior", async () => {
    const operationClient = { send: vi.fn().mockResolvedValue({ UploadId: "normal-upload" }), destroy: vi.fn() };
    const healthClient = { send: vi.fn().mockResolvedValue({}), destroy: vi.fn() };
    const provider = createSpacesPrivateObjectProvider(CONFIG, { client: operationClient, healthClient, sign: vi.fn() });

    await expect(provider.healthCheck()).resolves.toEqual({ reachable: true });
    await expect(provider.beginMultipartUpload({ ownerUserId: "user", objectId: OBJECT_ID, contentType: "image/jpeg" })).resolves.toMatchObject({ providerUploadId: "normal-upload" });
    expect(healthClient.send).toHaveBeenCalledTimes(1);
    expect(operationClient.send).toHaveBeenCalledTimes(1);
    provider.close();
    expect(healthClient.destroy).toHaveBeenCalledTimes(1);
    expect(operationClient.destroy).toHaveBeenCalledTimes(1);

    const source = fs.readFileSync(new URL("./SpacesPrivateObjectProvider.js", import.meta.url), "utf8");
    expect(source).toContain("maxAttempts: 1");
  });
});

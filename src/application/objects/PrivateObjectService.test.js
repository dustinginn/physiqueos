import { describe, expect, it, vi } from "vitest";
import { createPrivateObjectService } from "./PrivateObjectService";
import { createPayloadHash } from "../../contracts/v1/canonicalJson";

const PRINCIPAL = { userId: "user-a", deviceId: "device", sessionId: "session", scopes: [] };

describe("private object application service", () => {
  it("does not reveal another owner's object", async () => {
    const { service, provider } = setup({ findObjectForOwner: vi.fn().mockResolvedValue(null) });
    await expect(service.authorizeRead({ principal: PRINCIPAL, objectId: "object-b" })).rejects.toMatchObject({ code: "PRIVATE_OBJECT_NOT_FOUND" });
    expect(provider.authorizeRead).not.toHaveBeenCalled();
  });

  it("rejects an upload completion whose size does not match the canonical intent", async () => {
    const { service, objects, provider } = setup({
      findIntentForOwner: vi.fn().mockResolvedValue({ id: "upload", object_id: "object", user_id: "user-a", state: "uploading", expires_at: "2026-08-12T00:00:00Z", provider_upload_id: "provider" }),
      findObjectForOwner: vi.fn().mockResolvedValue({ id: "object", user_id: "user-a", state: "uploading", object_key: "private/user-a/object/original", content_type: "image/jpeg", byte_length: 10, sha256: "a".repeat(64) }),
    }, { inspectObject: vi.fn().mockResolvedValue({ byteLength: 9, contentType: "image/jpeg", sha256: "a".repeat(64) }) });
    await expect(service.completeUpload({ principal: PRINCIPAL, uploadId: "upload", parts: [{ partNumber: 1, etag: "etag" }] })).rejects.toMatchObject({ code: "OBJECT_LENGTH_MISMATCH" });
    expect(objects.completeVerified).not.toHaveBeenCalled();
    expect(provider.deleteObject).toHaveBeenCalledWith({ objectKey: "private/user-a/object/original", providerVersion: "v1" });
    expect(objects.failCompletion).toHaveBeenCalledOnce();
  });

  it("replays only an identical completion receipt", async () => {
    const parts = [{ partNumber: 1, etag: "etag" }];
    const { service, objects } = setup({ findIntentForOwner: vi.fn().mockResolvedValue({ id: "upload", object_id: "object", state: "completed", completion_receipt_hash: "mismatch" }) });
    await expect(service.completeUpload({ principal: PRINCIPAL, uploadId: "upload", parts })).rejects.toMatchObject({ code: "UPLOAD_RECEIPT_REUSED" });
    expect(objects.completeVerified).not.toHaveBeenCalled();
  });

  it("replays an identical completion receipt without contacting the provider", async () => {
    const parts = [{ partNumber: 1, etag: "etag" }];
    const receiptHash = createPayloadHash({ uploadId: "upload", parts });
    const { service, provider } = setup({ findIntentForOwner: vi.fn().mockResolvedValue({ id: "upload", object_id: "object", state: "completed", completion_receipt_hash: receiptHash }) });
    await expect(service.completeUpload({ principal: PRINCIPAL, uploadId: "upload", parts })).resolves.toEqual({ outcome: "replayed", objectId: "object" });
    expect(provider.completeMultipartUpload).not.toHaveBeenCalled();
  });

  it("rejects upload completion without owner scope", async () => {
    const { service, provider } = setup({ findIntentForOwner: vi.fn().mockResolvedValue(null) });
    await expect(service.completeUpload({ principal: PRINCIPAL, uploadId: "not-owned", parts: [{ partNumber: 1, etag: "etag" }] })).rejects.toMatchObject({ code: "PRIVATE_OBJECT_NOT_FOUND" });
    expect(provider.completeMultipartUpload).not.toHaveBeenCalled();
  });

  it("aborts an interrupted owner-scoped multipart upload", async () => {
    const { service, objects, provider } = setup({
      findIntentForOwner: vi.fn().mockResolvedValue({ id: "upload", object_id: "object", user_id: "user-a", state: "uploading", provider_upload_id: "provider" }),
      findObjectForOwner: vi.fn().mockResolvedValue({ id: "object", user_id: "user-a", object_key: "private/user-a/object/original" }),
    });
    await expect(service.abortUpload({ principal: PRINCIPAL, uploadId: "upload" })).resolves.toEqual({ uploadId: "upload", outcome: "aborted" });
    expect(provider.abortMultipartUpload).toHaveBeenCalledWith({ objectKey: "private/user-a/object/original", providerUploadId: "provider" });
    expect(objects.abort).toHaveBeenCalledOnce();
  });

  it("does not run a duplicate provider completion while another claim is live", async () => {
    const { service, provider } = setup({ findIntentForOwner: vi.fn().mockResolvedValue({ id: "upload", object_id: "object", state: "completing", updated_at: "2026-08-10T23:59:00Z", expires_at: "2026-08-12T00:00:00Z" }) });
    await expect(service.completeUpload({ principal: PRINCIPAL, uploadId: "upload", parts: [{ partNumber: 1, etag: "etag" }] })).resolves.toEqual({ outcome: "pending", uploadId: "upload" });
    expect(provider.completeMultipartUpload).not.toHaveBeenCalled();
  });

  it("returns only a short-lived authorized read", async () => {
    const { service } = setup({ findObjectForOwner: vi.fn().mockResolvedValue({ id: "object", user_id: "user-a", state: "verified", object_key: "private/user-a/object/original", provider_version: "v1", content_type: "image/jpeg", byte_length: 10, sha256: "a".repeat(64) }) });
    const result = await service.authorizeRead({ principal: PRINCIPAL, objectId: "object" });
    expect(result).toMatchObject({ objectId: "object", expiresInSeconds: 300 });
    expect(result.readUrl).toContain("temporary.invalid");
    expect(result).not.toHaveProperty("objectKey");
  });
});

function setup(objectOverrides = {}, providerOverrides = {}) {
  const objects = {
    createObjectAndIntent: vi.fn(), findIntentForOwner: vi.fn(), findObjectForOwner: vi.fn(), markUploading: vi.fn(),
    claimCompletion: vi.fn().mockResolvedValue({ id: "upload", object_id: "object", state: "completing", provider_upload_id: "provider" }),
    releaseCompletionClaim: vi.fn(), failCompletion: vi.fn(), abort: vi.fn(), completeVerified: vi.fn(), tombstone: vi.fn(), ...objectOverrides,
  };
  const provider = {
    beginMultipartUpload: vi.fn(), abortMultipartUpload: vi.fn(), authorizeUploadPart: vi.fn(),
    completeMultipartUpload: vi.fn().mockResolvedValue({ etag: "etag", providerVersion: "v1" }),
    deleteObject: vi.fn(),
    inspectObject: vi.fn().mockResolvedValue({ byteLength: 10, contentType: "image/jpeg", sha256: "a".repeat(64), etag: "etag", providerVersion: "v1" }),
    authorizeRead: vi.fn().mockResolvedValue({ url: "https://temporary.invalid/read", expiresInSeconds: 300 }), ...providerOverrides,
  };
  const service = createPrivateObjectService({ transactionRunner: { run: async (work) => work({ objects }) }, provider, clock: () => new Date("2026-08-11T00:00:00Z"), createId: () => "0198f000-0000-7000-8000-000000000001" });
  return { service, objects, provider };
}

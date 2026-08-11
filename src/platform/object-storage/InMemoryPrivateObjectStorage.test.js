import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAuthenticationPrincipal } from "../../application/auth/principal";
import { createUuidV7 } from "../../contracts/v1/identifiers";
import { createInMemoryPrivateObjectStorage } from "./InMemoryPrivateObjectStorage";

const owner = createAuthenticationPrincipal({ userId: "owner", deviceId: "owner-device", sessionId: "owner-session" });
const stranger = createAuthenticationPrincipal({ userId: "stranger", deviceId: "stranger-device", sessionId: "stranger-session" });

describe("private object storage abstraction", () => {
  it("verifies bytes and returns only a short-lived authorized handle", () => {
    const now = new Date("2026-08-10T12:00:00Z");
    const storage = createInMemoryPrivateObjectStorage({ clock: () => now, createUuid: createUuidV7 });
    const bytes = Buffer.from("synthetic evidence bytes");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const upload = storage.createUpload(owner, { ownerUserId: "owner", contentType: "application/pdf", expectedSize: bytes.length, expectedSha256: sha256, provenance: { source: "synthetic-test" } });
    const completed = storage.completeUpload(owner, upload.uploadId, bytes);
    const read = storage.authorizeRead(owner, completed.objectId);
    expect(read).toMatchObject({ objectId: completed.objectId, ownerUserId: "owner", sha256, expiresAt: "2026-08-10T12:05:00.000Z" });
    expect(read).not.toHaveProperty("url");
    expect(read.accessHandle).toMatch(/^memory-object:/);
  });

  it("rejects cross-owner access without revealing object existence", () => {
    const storage = createInMemoryPrivateObjectStorage({ createUuid: createUuidV7 });
    const bytes = Buffer.from("synthetic");
    const upload = storage.createUpload(owner, { ownerUserId: "owner", contentType: "image/jpeg", expectedSize: bytes.length });
    const object = storage.completeUpload(owner, upload.uploadId, bytes);
    expect(() => storage.authorizeRead(stranger, object.objectId)).toThrow(/unavailable/);
    expect(() => storage.tombstone(stranger, object.objectId)).toThrow(/unavailable/);
  });

  it("quarantines content that does not match its receipt", () => {
    const storage = createInMemoryPrivateObjectStorage({ createUuid: createUuidV7 });
    const upload = storage.createUpload(owner, { ownerUserId: "owner", contentType: "image/png", expectedSize: 50 });
    expect(() => storage.completeUpload(owner, upload.uploadId, Buffer.from("short"))).toThrow(/did not match/);
  });
});

import { describe, expect, it, vi } from "vitest";
import { createProviderCanonicalUploadService } from "./ProviderCanonicalUploadService.js";

describe("provider canonical uploads", () => {
  it("verifies private bytes before atomically claiming authority and cataloging canonical media", async () => {
    const database = fakeDatabase();
    const objectProvider = fakeObjectProvider();
    const claimCanonicalWriteBoundary = vi.fn(async () => ({ outcome: "recorded" }));
    const service = createProviderCanonicalUploadService({
      pool: database.pool,
      objectProvider,
      authorityStore: { claimCanonicalWriteBoundary },
      migrationOperationId: "combined-operation",
      compatibilityMode: false,
      fetchImpl: async () => new Response(null, { status: 200, headers: { etag: '"etag"' } }),
      now: () => new Date("2026-08-14T02:00:00.000Z"),
    });
    const result = await service.store({
      ownerUserId: "phase5-synthetic-user",
      bytes: Buffer.from("verified-private-media"),
      contentType: "image/jpeg",
      originalFilename: "front.jpg",
      category: "progressPhotos",
      relationshipId: "session-1",
      artifactId: "artifact-1",
    });
    expect(result.reference).toMatch(/^media:\/\//);
    expect(claimCanonicalWriteBoundary).toHaveBeenCalledWith(expect.objectContaining({
      client: database.client,
      migrationOperationId: "combined-operation",
      commandId: expect.stringMatching(/^media:/),
    }));
    expect(database.canonicalMedia).toHaveLength(1);
    expect(database.outbox).toHaveLength(0);
    expect(objectProvider.deleteObject).not.toHaveBeenCalled();
  });

  it("compensating-deletes the new Spaces version when the canonical catalog transaction fails", async () => {
    const database = fakeDatabase({ failCatalog: true });
    const objectProvider = fakeObjectProvider();
    const service = createProviderCanonicalUploadService({
      pool: database.pool,
      objectProvider,
      authorityStore: { claimCanonicalWriteBoundary: vi.fn(async () => ({ outcome: "recorded" })) },
      migrationOperationId: "combined-operation",
      fetchImpl: async () => new Response(null, { status: 200, headers: { etag: '"etag"' } }),
    });
    await expect(service.store({
      ownerUserId: "phase5-synthetic-user",
      bytes: Buffer.from("verified-private-media"),
      contentType: "image/jpeg",
      originalFilename: "front.jpg",
      category: "progressPhotos",
      relationshipId: "session-1",
    })).rejects.toThrow(/catalog failed/);
    expect(objectProvider.deleteObject).toHaveBeenCalledWith({ objectKey: expect.any(String), providerVersion: "version-1" });
  });

  it("rejects compatibility authority drift before creating an object or upload row", async () => {
    const database = fakeDatabase();
    const objectProvider = fakeObjectProvider();
    const service = createProviderCanonicalUploadService({
      pool: database.pool,
      objectProvider,
      compatibilityMode: true,
      requireCompatibilityAuthority: true,
      authorityStore: {
        assertCompatibilityAccess: vi.fn(async () => {
          throw Object.assign(new Error("authority drift"), { code: "RUNTIME_AUTHORITY_COMPATIBILITY_REJECTED" });
        }),
      },
    });
    await expect(service.store({
      ownerUserId: "phase5-synthetic-user",
      bytes: Buffer.from("verified-private-media"),
      contentType: "image/jpeg",
      originalFilename: "front.jpg",
      category: "progressPhotos",
      relationshipId: "session-1",
    })).rejects.toMatchObject({ code: "RUNTIME_AUTHORITY_COMPATIBILITY_REJECTED" });
    expect(objectProvider.beginMultipartUpload).not.toHaveBeenCalled();
    expect(database.canonicalMedia).toHaveLength(0);
  });

  it("commits a verified upload under an explicitly accepted compatibility authority", async () => {
    const database = fakeDatabase();
    const objectProvider = fakeObjectProvider();
    const assertCompatibilityAccess = vi.fn(async () => ({ outcome: "accepted" }));
    const service = createProviderCanonicalUploadService({
      pool: database.pool,
      objectProvider,
      compatibilityMode: true,
      requireCompatibilityAuthority: true,
      authorityStore: { assertCompatibilityAccess },
      fetchImpl: async () => new Response(null, { status: 200, headers: { etag: '"etag"' } }),
      now: () => new Date("2026-08-14T02:00:00.000Z"),
    });

    await expect(service.store({
      ownerUserId: "phase5-synthetic-user",
      bytes: Buffer.from("verified-private-media"),
      contentType: "image/jpeg",
      originalFilename: "compatibility.jpg",
      category: "progressPhotos",
      relationshipId: "session-1",
    })).resolves.toMatchObject({ reference: expect.stringMatching(/^media:\/\//) });

    expect(assertCompatibilityAccess).toHaveBeenCalledTimes(2);
    expect(database.canonicalMedia).toHaveLength(1);
    expect(database.outbox).toHaveLength(0);
    expect(objectProvider.deleteObject).not.toHaveBeenCalled();
  });
});

function fakeObjectProvider() {
  return {
    beginMultipartUpload: vi.fn(async ({ ownerUserId, objectId }) => ({ bucket: "private-bucket", objectKey: `private/${ownerUserId}/${objectId}/original`, providerUploadId: "upload-1" })),
    authorizeUploadPart: vi.fn(async () => ({ url: "https://upload.invalid", partNumber: 1 })),
    completeMultipartUpload: vi.fn(async () => ({ etag: "etag", providerVersion: "version-1" })),
    inspectObject: vi.fn(async () => ({ byteLength: 22, sha256: "cbcf76c4e1f4427c8f7c411704c36f8aa323467ac33d3a9d6b5c1ba7c0301f9a", contentType: "image/jpeg" })),
    abortMultipartUpload: vi.fn(async () => undefined),
    deleteObject: vi.fn(async () => undefined),
  };
}

function fakeDatabase({ failCatalog = false } = {}) {
  const canonicalMedia = [];
  const outbox = [];
  let objectId = null;
  const query = vi.fn(async (sql, values = []) => {
    const normalized = String(sql).replace(/\s+/g, " ").trim();
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(normalized) || normalized.includes("pg_advisory_xact_lock")) return { rows: [], rowCount: 0 };
    if (normalized === "SELECT current_database() AS database") return { rows: [{ database: "physiqueos_phase5_test_provider_20260811" }], rowCount: 1 };
    if (normalized.startsWith("INSERT INTO physiqueos.stored_objects")) {
      objectId = values[0];
      return { rows: [{ id: objectId, user_id: values[1], state: "created", version: 1 }], rowCount: 1 };
    }
    if (normalized.startsWith("INSERT INTO physiqueos.upload_intents")) {
      return { rows: [{ id: values[0], user_id: values[1], object_id: objectId, state: "created" }], rowCount: 1 };
    }
    if (normalized.includes("SET state = 'uploading'")) return { rows: [{ id: values[0], object_id: objectId, state: "uploading" }], rowCount: 1 };
    if (normalized.includes("SET state = 'completing'")) return { rows: [{ id: values[0], object_id: objectId, state: "completing" }], rowCount: 1 };
    if (normalized.includes("SET state = 'completed'")) return { rows: [{ id: values[0], object_id: objectId, state: "completed" }], rowCount: 1 };
    if (normalized.startsWith("UPDATE physiqueos.stored_objects SET state = 'verified'")) return { rows: [{ id: objectId, state: "verified", version: 2 }], rowCount: 1 };
    if (normalized.startsWith("INSERT INTO physiqueos.canonical_media_objects")) {
      if (failCatalog) throw new Error("catalog failed");
      canonicalMedia.push({ id: values[0], ownerUserId: values[1], storageKey: values[8] });
      return { rows: [], rowCount: 1 };
    }
    if (normalized.startsWith("INSERT INTO physiqueos.outbox_messages")) {
      outbox.push(JSON.parse(values[3]));
      return { rows: [], rowCount: 1 };
    }
    if (normalized.includes("SET state='failed'")) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected SQL: ${normalized}`);
  });
  const client = { query, release: vi.fn() };
  return { canonicalMedia, outbox, client, pool: { query, connect: async () => client } };
}

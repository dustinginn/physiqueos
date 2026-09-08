import { describe, expect, it, vi } from "vitest";
import { createPostgresFounderPhotoAcceptanceStore } from "./PostgresFounderPhotoAcceptanceStore.js";

const OWNER = "user_founder_001";
const MEDIA_ID = "0193e5b5-2fd0-7d6a-8f2c-411d8e8d28a1";
const SELECTION = Object.freeze({
  photoSessionId: "photo-session-one",
  photoId: "photo-one",
  mediaId: MEDIA_ID,
  poseId: "front-relaxed",
  captureDate: "2026-05-24",
});

function sessionRow(overrides = {}) {
  return {
    record_id: "photo-session-one",
    payload: {
      canonicalId: "photo-session-one",
      payload: {
        evidence_type: "photo_session",
        sessionId: "photo-session-one",
        captureDate: "2026-05-24",
        photos: [{
          canonicalPhotoId: "photo-one",
          orientation: "front",
          contractionState: "relaxed",
          poseVariant: "standard",
          storage_path: `media://${MEDIA_ID}`,
        }],
        ...overrides,
      },
    },
  };
}

function mediaRow(overrides = {}) {
  return {
    id: MEDIA_ID,
    owner_user_id: OWNER,
    evidence_record_id: "photo-one",
    content_type: "image/jpeg",
    byte_length: "42000",
    sha256: "a".repeat(64),
    storage_key: `private/${OWNER}/${MEDIA_ID}/original`,
    provider_version: "version-one",
    provenance: { width: 3024, height: 4032 },
    state: "verified",
    ...overrides,
  };
}

function store({ sessions = [sessionRow()], media = [mediaRow()] } = {}) {
  const query = vi.fn(async (sql, values) => {
    if (sql.includes("canonical_evidence_records")) return { rows: sessions };
    if (sql.includes("canonical_media_objects")) return { rows: media };
    throw new Error("unexpected query");
  });
  return { query, value: createPostgresFounderPhotoAcceptanceStore({ pool: { query }, founderOwnerUserId: OWNER }) };
}

describe("Postgres Founder photo acceptance storage", () => {
  it("uses only exact owner/allowlist queries and verifies canonical session/photo/pose/media linkage", async () => {
    const { query, value } = store();
    const result = await value.readSelectedPhotos([SELECTION]);
    expect(result).toEqual([{
      photoSessionId: "photo-session-one",
      photoId: "photo-one",
      poseId: "front-relaxed",
      captureDate: "2026-05-24",
      media: {
        id: MEDIA_ID,
        ownerUserId: OWNER,
        contentType: "image/jpeg",
        size: 42000,
        sha256: "a".repeat(64),
        objectKey: `private/${OWNER}/${MEDIA_ID}/original`,
        providerVersion: "version-one",
        pixelWidth: 3024,
        pixelHeight: 4032,
      },
    }]);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain("owner_user_id=$1");
    expect(query.mock.calls[0][0]).toContain("record_id=ANY($2::text[])");
    expect(query.mock.calls[0][1]).toEqual([OWNER, ["photo-session-one"]]);
    expect(query.mock.calls[1][0]).toContain("id=ANY($2::text[])");
    expect(query.mock.calls[1][1]).toEqual([OWNER, [MEDIA_ID]]);
    expect(query.mock.calls.map(([sql]) => sql)).not.toEqual(expect.arrayContaining([
      expect.stringMatching(/ORDER BY|listPhotos|SELECT \*/i),
    ]));
  });

  it.each([
    ["wrong owner", { media: [mediaRow({ owner_user_id: "user_other" })] }],
    ["non-allowlisted media", { media: [mediaRow({ id: "0193e5b5-2fd0-7d6a-8f2c-411d8e8d28a2" })] }],
    ["escaping storage key", { media: [mediaRow({ storage_key: "private/user_other/object/original" })] }],
    ["missing media", { media: [] }],
    ["missing photo", { sessions: [sessionRow({ photos: [] })] }],
    ["missing pose", { sessions: [sessionRow({ photos: [{ ...sessionRow().payload.payload.photos[0], orientation: "unknown" }] })] }],
  ])("fails closed for %s", async (_label, input) => {
    await expect(store(input).value.readSelectedPhotos([SELECTION]))
      .rejects.toMatchObject({ status: 404, code: "PHOTO_ACCEPTANCE_MEDIA_UNAVAILABLE" });
  });

  it("does not query when no prevalidated allowlist selection is supplied", async () => {
    const { query, value } = store();
    await expect(value.readSelectedPhotos([])).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});

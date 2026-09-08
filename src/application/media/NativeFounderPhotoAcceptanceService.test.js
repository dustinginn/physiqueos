import { describe, expect, it, vi } from "vitest";
import { createNativeFounderPhotoAcceptanceService } from "./NativeFounderPhotoAcceptanceService.js";

const OWNER = "user_native_sandbox_founder_acceptance";
const MEDIA_ONE = "0193e5b5-2fd0-7d6a-8f2c-411d8e8d28a1";
const MEDIA_TWO = "0193e5b5-2fd0-7d6a-8f2c-411d8e8d28a2";
const MEDIA_THREE = "0193e5b5-2fd0-7d6a-8f2c-411d8e8d28a3";

const config = Object.freeze({
  enabled: true,
  sandboxOwnerUserId: OWNER,
  founderOwnerUserId: "user_founder_001",
  sessions: Object.freeze([
    Object.freeze({
      photoSessionId: "session-one",
      photos: Object.freeze([
        Object.freeze({ photoId: "photo-one", mediaId: MEDIA_ONE, poseId: "front-relaxed", captureDate: "2026-05-24" }),
        Object.freeze({ photoId: "photo-two", mediaId: MEDIA_TWO, poseId: "back-relaxed", captureDate: "2026-05-24" }),
      ]),
    }),
    Object.freeze({
      photoSessionId: "session-two",
      photos: Object.freeze([
        Object.freeze({ photoId: "photo-three", mediaId: MEDIA_THREE, poseId: "front-relaxed", captureDate: "2026-07-18" }),
      ]),
    }),
  ]),
});

function resolved(selection, overrides = {}) {
  return {
    ...selection,
    media: {
      id: selection.mediaId,
      ownerUserId: "user_founder_001",
      contentType: "image/jpeg",
      size: 42000,
      sha256: "a".repeat(64),
      objectKey: `private/user_founder_001/${selection.mediaId}/original`,
      providerVersion: "version-one",
      pixelWidth: 3024,
      pixelHeight: 4032,
      ...overrides,
    },
  };
}

function harness({ principalAllowed = true, resolve = (selections) => selections.map(resolved) } = {}) {
  const requirePrincipal = vi.fn((principal) => {
    if (!principalAllowed || principal?.userId !== OWNER) throw Object.assign(new Error("unavailable"), { status: 404 });
    return principal;
  });
  const readSelectedPhotos = vi.fn(resolve);
  const authorizeProviderRead = vi.fn(async () => ({ url: "https://private-storage.invalid/signed" }));
  const service = createNativeFounderPhotoAcceptanceService({
    authority: { descriptor: { authorityId: "native-sandbox-founder-acceptance", ownerUserId: OWNER }, requirePrincipal },
    config,
    store: { readSelectedPhotos },
    authorizeProviderRead,
  });
  return { authorizeProviderRead, readSelectedPhotos, requirePrincipal, service };
}

const principal = Object.freeze({ userId: OWNER, scopes: ["founder:read"] });

describe("Native Founder photo acceptance service", () => {
  it("returns only the allowlisted canonical media contract for multiple sessions and poses", async () => {
    const { readSelectedPhotos, service } = harness();
    const result = await service.getManifest({ principal });
    expect(result.schemaVersion).toBe("native-founder-photo-media-v1");
    expect(result.sessions).toHaveLength(2);
    expect(result.sessions.flatMap((session) => session.photos)).toHaveLength(3);
    expect(result.sessions[0].photos[0]).toEqual({
      viewIdentity: "session-one-front-relaxed",
      photoSessionId: "session-one",
      photoId: "photo-one",
      mediaId: MEDIA_ONE,
      poseId: "front-relaxed",
      captureDate: "2026-05-24",
      contentType: "image/jpeg",
      pixelWidth: 3024,
      pixelHeight: 4032,
      delivery: {
        kind: "authenticated-proxy",
        path: `/api/v1/native/sandbox/photo-acceptance/media/${MEDIA_ONE}`,
      },
    });
    expect(readSelectedPhotos.mock.calls[0][0]).toHaveLength(3);
    expect(JSON.stringify(result)).not.toMatch(/objectKey|private\/|sha256|Founder production/i);
  });

  it("uses the same canonical view identity for Evidence and Briefing references", async () => {
    const manifest = await harness().service.getManifest({ principal });
    const view = manifest.sessions[0].photos[0];
    const evidenceReference = { viewIdentity: view.viewIdentity, delivery: view.delivery };
    const briefingReference = { viewIdentity: view.viewIdentity, delivery: view.delivery };
    expect(evidenceReference).toEqual(briefingReference);
  });

  it("requires the authenticated sandbox owner before any Founder lookup", async () => {
    const { readSelectedPhotos, service } = harness({ principalAllowed: false });
    await expect(service.getManifest({ principal: { userId: "user_other" } })).rejects.toMatchObject({ status: 404 });
    expect(readSelectedPhotos).not.toHaveBeenCalled();
  });

  it("does not expose a general enumeration or client-supplied path seam", () => {
    const service = harness().service;
    expect(Object.keys(service).sort()).toEqual(["getManifest", "openMedia"]);
    expect(service.listPhotos).toBeUndefined();
    expect(service.openPath).toBeUndefined();
  });

  it("rejects arbitrary and non-allowlisted media without a database or Spaces call", async () => {
    const { authorizeProviderRead, readSelectedPhotos, service } = harness();
    for (const mediaId of ["../outside.jpg", "0193e5b5-2fd0-7d6a-8f2c-411d8e8d28ff"]) {
      await expect(service.openMedia({ principal, mediaId })).rejects.toMatchObject({
        status: 404,
        code: "PHOTO_ACCEPTANCE_MEDIA_UNAVAILABLE",
      });
    }
    expect(readSelectedPhotos).not.toHaveBeenCalled();
    expect(authorizeProviderRead).not.toHaveBeenCalled();
  });

  it("revalidates canonical linkage and issues a short internal provider read for an allowlisted photo", async () => {
    const { authorizeProviderRead, readSelectedPhotos, service } = harness();
    const result = await service.openMedia({ principal, mediaId: MEDIA_ONE });
    expect(result).toEqual({
      url: "https://private-storage.invalid/signed",
      contentType: "image/jpeg",
      contentLength: 42000,
    });
    expect(readSelectedPhotos).toHaveBeenCalledWith([expect.objectContaining({ mediaId: MEDIA_ONE })]);
    expect(authorizeProviderRead).toHaveBeenCalledWith({
      objectKey: `private/user_founder_001/${MEDIA_ONE}/original`,
      providerVersion: "version-one",
      expiresInSeconds: 60,
    });
  });

  it.each([
    ["unsupported media", { contentType: "application/pdf" }],
    ["empty media", { size: 0 }],
    ["missing storage identity", { objectKey: null }],
  ])("fails closed for %s", async (_label, override) => {
    const { authorizeProviderRead, service } = harness({
      resolve: (selections) => selections.map((selection) => resolved(selection, override)),
    });
    await expect(service.getManifest({ principal })).rejects.toMatchObject({ status: 404 });
    expect(authorizeProviderRead).not.toHaveBeenCalled();
  });
});

import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createAuthenticationPrincipal } from "../auth/principal.js";
import { createLocalPrivateMediaAdapter } from "../../platform/object-storage/LocalPrivateMediaAdapter.js";
import { createSpacesAuthorizedMediaAdapter } from "../../platform/object-storage/SpacesAuthorizedMediaAdapter.js";
import { createAuthorizedMediaService } from "./AuthorizedMediaService.js";

const principal = createAuthenticationPrincipal({ userId: "owner-one", deviceId: "device-one", sessionId: "session-one" });
const object = { id: "object-one", ownerUserId: "owner-one", contentType: "image/jpeg", size: 10, sha256: "a".repeat(64), internalRelativePath: "photos/one.jpg" };

describe("authorized media application boundary", () => {
  it("returns a short-lived opaque descriptor without a filesystem path", async () => {
    const issueAccessHandle = vi.fn(async ({ objectId }) => `opaque:${objectId}`);
    const delivery = createLocalPrivateMediaAdapter({ privateRoot: path.resolve("private/founder"), issueAccessHandle });
    const service = createAuthorizedMediaService({ catalog: { getObject: async () => object }, delivery, clock: () => new Date("2026-08-11T12:00:00Z") });
    const result = await service.authorizeRead({ principal, objectId: object.id, lifetimeSeconds: 900 });
    expect(result).toMatchObject({ objectId: "object-one", ownerUserId: "owner-one", accessHandle: "opaque:object-one", expiresAt: "2026-08-11T12:05:00.000Z" });
    expect(JSON.stringify(result)).not.toMatch(/photos|internalRelativePath|private\\|private\//);
    expect(issueAccessHandle).toHaveBeenCalledWith(expect.objectContaining({ expiresInSeconds: 300 }));
  });

  it("fails closed for absent, cross-owner, and escaping objects", async () => {
    const delivery = createLocalPrivateMediaAdapter({ privateRoot: path.resolve("private/founder"), issueAccessHandle: async () => "opaque" });
    await expect(createAuthorizedMediaService({ catalog: { getObject: async () => null }, delivery }).authorizeRead({ principal, objectId: "missing" })).rejects.toMatchObject({ status: 404, code: "OBJECT_NOT_FOUND" });
    await expect(createAuthorizedMediaService({ catalog: { getObject: async () => ({ ...object, ownerUserId: "other" }) }, delivery }).authorizeRead({ principal, objectId: object.id })).rejects.toMatchObject({ status: 404, code: "RESOURCE_NOT_FOUND" });
    await expect(delivery.authorizeRead({ object: { ...object, internalRelativePath: "../outside.jpg" }, expiresInSeconds: 30 })).rejects.toThrow("outside");
  });

  it("uses the same bounded contract for a future private Spaces provider", async () => {
    const authorizeRead = vi.fn(async () => ({ url: "https://synthetic.invalid/signed", expiresInSeconds: 60 }));
    const delivery = createSpacesAuthorizedMediaAdapter({ provider: { authorizeRead } });
    const service = createAuthorizedMediaService({ catalog: { getObject: async () => ({ ...object, objectKey: "private/owner-one/object-one/original", providerVersion: "v1" }) }, delivery });
    const result = await service.authorizeRead({ principal, objectId: object.id, lifetimeSeconds: 60 });
    expect(result.accessHandle).toBe("https://synthetic.invalid/signed");
    expect(authorizeRead).toHaveBeenCalledWith({ objectKey: "private/owner-one/object-one/original", providerVersion: "v1", expiresInSeconds: 60 });
  });
});

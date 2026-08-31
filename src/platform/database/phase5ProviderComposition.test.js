import { describe, expect, it, vi } from "vitest";
import { createAuthenticationPrincipal } from "../../application/auth/principal.js";
import { createAuthorizedMediaService } from "../../application/media/AuthorizedMediaService.js";
import { createOpaqueSpacesMediaGateway } from "../object-storage/OpaqueSpacesMediaGateway.js";
import { createPhase5ProviderMediaCatalog } from "./phase5ProviderComposition.js";

const canonicalId = "media-1fadfe2c43970a9c6268b3b9f3ef4c3f-62a670131e57";

describe("Phase 5 provider media catalog", () => {
  it("maps internal provider identity without exposing it as application metadata", async () => {
    const query = async () => ({ rows: [{
      id: "object-one", owner_user_id: "owner-one", content_type: "image/jpeg", byte_length: "12",
      sha256: "a".repeat(64), storage_key: "private/owner-one/object-one/original", provider_version: "version-one", state: "verified",
    }] });
    const object = await createPhase5ProviderMediaCatalog({ query }).getObject({ objectId: "object-one", ownerUserId: "owner-one" });
    expect(object).toMatchObject({ id: "object-one", ownerUserId: "owner-one", size: 12, objectKey: "private/owner-one/object-one/original", providerVersion: "version-one" });
  });

  it("requires owner-scoped lookup and returns no record when the provider row is absent", async () => {
    const query = async (text, values) => {
      expect(text).toContain("owner_user_id=$2");
      expect(values).toEqual(["object-one", "wrong-owner"]);
      return { rows: [] };
    };
    await expect(createPhase5ProviderMediaCatalog({ query }).getObject({ objectId: "object-one", ownerUserId: "wrong-owner" })).resolves.toBeNull();
  });

  it("resolves an owner-scoped legacy path only when its verified catalog mapping is unambiguous", async () => {
    const query = vi.fn(async (_text, values) => ({ rows: values[0] === "owner-one" ? [
      { id: "front", provenance: { sourceRelativePath: "photos/uploads/2026-08-08/front.jpg" } },
      { id: "side", provenance: { sourceRelativePath: "photos/uploads/2026-08-08/side.jpg" } },
    ] : [] }));
    const catalog = createPhase5ProviderMediaCatalog({ query });

    await expect(catalog.resolveLegacyReference({
      reference: "private/founder/photos/uploads/2026-08-08/front.jpg",
      ownerUserId: "owner-one",
    })).resolves.toBe("front");
    await expect(catalog.resolveLegacyReference({ reference: "missing.jpg", ownerUserId: "owner-one" }))
      .resolves.toBeNull();
    expect(query.mock.calls[0][0]).toContain("owner_user_id=$1 AND state='verified'");
  });

  it("fails closed when a legacy basename maps to more than one verified object", async () => {
    const catalog = createPhase5ProviderMediaCatalog({ query: async () => ({ rows: [
      { id: "one", provenance: { sourceRelativePath: "photos/one/front.jpg" } },
      { id: "two", provenance: { sourceRelativePath: "photos/two/front.jpg" } },
    ] }) });
    await expect(catalog.resolveLegacyReference({ reference: "front.jpg", ownerUserId: "owner-one" }))
      .resolves.toBeNull();
  });

  it("resolves a migrated canonical ID through PostgreSQL ownership and an opaque private Spaces descriptor", async () => {
    const storageKey = `private/synthetic-owner/${canonicalId}/original`;
    const query = vi.fn(async (_text, values) => ({ rows: values[1] === "synthetic-owner" ? [{
      id: canonicalId,
      owner_user_id: "synthetic-owner",
      content_type: "image/png",
      byte_length: "24",
      sha256: "a".repeat(64),
      storage_key: storageKey,
      provider_version: "synthetic-version",
      state: "verified",
    }] : [] }));
    const authorizeRead = vi.fn(async () => ({ url: "https://signed.synthetic.invalid/object", expiresInSeconds: 60 }));
    const catalog = createPhase5ProviderMediaCatalog({ query });
    const clock = () => new Date("2026-08-14T12:00:00.000Z");
    const gateway = createOpaqueSpacesMediaGateway({
      provider: { authorizeRead },
      catalog,
      secret: "synthetic-phase5-private-media-secret-material",
      clock,
    });
    const media = createAuthorizedMediaService({ catalog, delivery: gateway, clock });
    const principal = createAuthenticationPrincipal({ userId: "synthetic-owner", deviceId: "synthetic-device", sessionId: "synthetic-session" });

    const descriptor = await media.authorizeRead({ principal, objectId: canonicalId, lifetimeSeconds: 60 });
    expect(descriptor.accessHandle).toMatch(/^\/api\/v1\/media\/read\?grant=/);
    expect(JSON.stringify(descriptor)).not.toContain(storageKey);
    await expect(gateway.redeemRead({ accessHandle: descriptor.accessHandle, principal })).resolves.toMatchObject({
      url: "https://signed.synthetic.invalid/object",
    });
    expect(authorizeRead).toHaveBeenCalledWith({ objectKey: storageKey, providerVersion: "synthetic-version", expiresInSeconds: 60 });

    const foreign = createAuthenticationPrincipal({ userId: "other-owner", deviceId: "synthetic-device", sessionId: "foreign-session" });
    await expect(media.authorizeRead({ principal: foreign, objectId: canonicalId })).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND", status: 404 });
  });
});

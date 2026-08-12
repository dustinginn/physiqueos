import { describe, expect, it, vi } from "vitest";
import { createOpaqueSpacesMediaGateway } from "./OpaqueSpacesMediaGateway.js";

const secret = "phase5-synthetic-media-secret-at-least-32-characters";
const object = { id: "object-one", ownerUserId: "owner-one", objectKey: "private/owner-one/provider-key/original", providerVersion: "v1" };

describe("opaque Spaces media gateway", () => {
  it("keeps provider identity out of the client handle and resolves it only after owner validation", async () => {
    const authorizeRead = vi.fn(async () => ({ url: "https://provider.invalid/private/provider-key?signature=secret", expiresInSeconds: 300 }));
    const catalog = { getObject: vi.fn(async () => object) };
    const gateway = createOpaqueSpacesMediaGateway({ provider: { authorizeRead }, catalog, secret, clock: () => new Date("2026-08-11T21:00:00.000Z") });
    const issued = await gateway.authorizeRead({ object, principal: { userId: "owner-one" }, expiresInSeconds: 300 });
    expect(issued.accessHandle).toMatch(/^\/api\/v1\/media\/read\?grant=/);
    expect(issued.accessHandle).not.toContain("private/");
    expect(issued.accessHandle).not.toContain("provider-key");
    expect(authorizeRead).not.toHaveBeenCalled();
    await expect(gateway.redeemRead({ accessHandle: issued.accessHandle, principal: { userId: "other" } })).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" });
    await expect(gateway.redeemRead({ accessHandle: `${issued.accessHandle}x`, principal: { userId: "owner-one" } })).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" });
    await expect(gateway.redeemRead({ accessHandle: issued.accessHandle, principal: { userId: "owner-one" } })).resolves.toMatchObject({ expiresInSeconds: 300 });
    expect(authorizeRead).toHaveBeenCalledWith({ objectKey: object.objectKey, providerVersion: "v1", expiresInSeconds: 300 });
  });

  it("rejects expired grants", async () => {
    let now = new Date("2026-08-11T21:00:00.000Z");
    const gateway = createOpaqueSpacesMediaGateway({ provider: { authorizeRead: vi.fn() }, catalog: { getObject: vi.fn(async () => object) }, secret, clock: () => now });
    const issued = await gateway.authorizeRead({ object, principal: { userId: "owner-one" }, expiresInSeconds: 1 });
    now = new Date("2026-08-11T21:00:01.000Z");
    await expect(gateway.redeemRead({ accessHandle: issued.accessHandle, principal: { userId: "owner-one" } })).rejects.toMatchObject({ code: "OBJECT_NOT_FOUND" });
  });
});

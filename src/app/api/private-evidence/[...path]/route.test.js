import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeRead: vi.fn(),
  openRead: vi.fn(),
  createAuthenticationPrincipal: vi.fn(() => ({
    userId: "synthetic-owner",
    deviceId: "provider-web-compatibility",
    sessionId: "provider-web-compatibility",
    scopes: ["media:read"],
  })),
}));

vi.mock("../../../../application/composition/productionApplicationComposition.js", () => ({
  getProductionProviderMediaDelivery: vi.fn(() => ({
    ownerUserId: "synthetic-owner",
    openRead: mocks.openRead,
  })),
}));

vi.mock("../../../../application/auth/principal.js", () => ({
  createAuthenticationPrincipal: mocks.createAuthenticationPrincipal,
}));

import { GET } from "./route.js";

const canonicalId = "media-1fadfe2c43970a9c6268b3b9f3ef4c3f-62a670131e57";
const legacyUuid = "550e8400-e29b-41d4-a716-446655440000";
const publicOrigin = "https://physiqueos-foundation-staging-a9or4.ondigitalocean.app";
const request = new Request("http://0.0.0.0:8080/api/private-evidence/media/object", {
  headers: {
    host: "evil.example",
    "x-forwarded-host": "evil-forwarded.example",
    "x-forwarded-proto": "http",
  },
});

describe("private evidence route provider media boundary", () => {
  beforeEach(() => {
    process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME = "1";
    process.env.PHYSIQUEOS_PUBLIC_APP_ORIGIN = publicOrigin;
    mocks.authorizeRead.mockReset();
    mocks.openRead.mockReset();
    mocks.createAuthenticationPrincipal.mockClear();
  });

  afterEach(() => {
    delete process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME;
    delete process.env.PHYSIQUEOS_PUBLIC_APP_ORIGIN;
  });

  it.each([canonicalId, legacyUuid])("streams an authorized opaque media identifier %s", async (objectId) => {
    mocks.openRead.mockResolvedValue({ url: "data:image/jpeg;base64,AQID" });

    const response = await GET(request, { params: Promise.resolve({ path: ["media", objectId] }) });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toContain("private");
    expect((await response.arrayBuffer()).byteLength).toBe(3);
    expect(mocks.openRead).toHaveBeenCalledWith(expect.objectContaining({ objectId, lifetimeSeconds: 60 }));
  });

  it("returns not found for an unknown valid-format identifier", async () => {
    mocks.openRead.mockRejectedValue(Object.assign(new Error("unavailable"), { code: "OBJECT_NOT_FOUND", status: 404 }));
    const response = await GET(request, { params: Promise.resolve({ path: ["media", canonicalId] }) });
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not found");
  });

  it("does not let valid syntax bypass owner authorization or leak provider identity", async () => {
    mocks.openRead.mockRejectedValue(Object.assign(new Error("private/other-owner/provider-key/original"), { code: "RESOURCE_NOT_FOUND", status: 404 }));
    const response = await GET(request, { params: Promise.resolve({ path: ["media", canonicalId] }) });
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not found");
    expect(response.headers.get("location")).toBeNull();
  });

  it.each([
    ["empty", ["media", ""]],
    ["extra segment", ["media", canonicalId, "original"]],
    ["dot segment", ["media", ".."]],
    ["encoded dot segment", ["media", "%2e%2e"]],
    ["double encoded traversal", ["media", "%252e%252e"]],
    ["encoded slash", ["media", `%2f${canonicalId}`]],
    ["encoded backslash", ["media", `%5c${canonicalId}`]],
    ["object key", ["media", "private/owner/object/original"]],
    ["URL", ["media", "https://provider.invalid/object"]],
    ["Windows path", ["media", "C:\\private\\object"]],
    ["absolute path", ["media", "/private/object"]],
    ["control character", ["media", `${canonicalId}\u0000`]],
  ])("rejects %s before repository authorization", async (_label, pathParts) => {
    const response = await GET(request, { params: Promise.resolve({ path: pathParts }) });
    expect(response.status).toBe(404);
    expect(mocks.openRead).not.toHaveBeenCalled();
  });
});

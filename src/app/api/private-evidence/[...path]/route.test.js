import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeRead: vi.fn(),
  createAuthenticationPrincipal: vi.fn(() => ({
    userId: "synthetic-owner",
    deviceId: "provider-web-compatibility",
    sessionId: "provider-web-compatibility",
    scopes: ["media:read"],
  })),
}));

vi.mock("../../../../application/composition/productionApplicationComposition.js", () => ({
  getProductionApplicationComposition: vi.fn(async () => ({
    ownerUserId: "synthetic-owner",
    media: { authorizeRead: mocks.authorizeRead },
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
    mocks.createAuthenticationPrincipal.mockClear();
  });

  afterEach(() => {
    delete process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME;
    delete process.env.PHYSIQUEOS_PUBLIC_APP_ORIGIN;
  });

  it.each([canonicalId, legacyUuid])("resolves an authorized opaque media identifier %s", async (objectId) => {
    mocks.authorizeRead.mockResolvedValue({ accessHandle: "/api/v1/media/read?grant=opaque-grant" });

    const response = await GET(request, { params: Promise.resolve({ path: ["media", objectId] }) });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${publicOrigin}/api/v1/media/read?grant=opaque-grant`);
    expect(response.headers.get("location")).not.toMatch(/0\.0\.0\.0|localhost|127\.0\.0\.1|:8080/);
    expect(response.headers.get("location")).not.toContain("evil");
    expect(response.headers.get("location")).not.toMatch(/private\/|object-key|spaces|bucket/i);
    expect(mocks.authorizeRead).toHaveBeenCalledWith(expect.objectContaining({ objectId, lifetimeSeconds: 60 }));
  });

  it("fails closed when the trusted public origin is missing", async () => {
    delete process.env.PHYSIQUEOS_PUBLIC_APP_ORIGIN;
    mocks.authorizeRead.mockResolvedValue({ accessHandle: "/api/v1/media/read?grant=opaque-grant" });
    const response = await GET(request, { params: Promise.resolve({ path: ["media", canonicalId] }) });
    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
  });

  it("fails closed when the trusted public origin is malformed or internal", async () => {
    mocks.authorizeRead.mockResolvedValue({ accessHandle: "/api/v1/media/read?grant=opaque-grant" });
    for (const origin of ["not-a-url", "http://provider.example", "https://0.0.0.0:8080"]) {
      process.env.PHYSIQUEOS_PUBLIC_APP_ORIGIN = origin;
      const response = await GET(request, { params: Promise.resolve({ path: ["media", canonicalId] }) });
      expect(response.status).toBe(404);
      expect(response.headers.get("location")).toBeNull();
    }
  });

  it("does not permit an authorized-media adapter to redirect outside the exact media reader", async () => {
    for (const accessHandle of [
      "https://evil.example/api/v1/media/read?grant=x",
      "//evil.example/api/v1/media/read?grant=x",
      "/api/v1/media/read/extra?grant=x",
    ]) {
      mocks.authorizeRead.mockResolvedValue({ accessHandle });
      const response = await GET(request, { params: Promise.resolve({ path: ["media", canonicalId] }) });
      expect(response.status).toBe(404);
      expect(response.headers.get("location")).toBeNull();
    }
  });

  it("returns not found for an unknown valid-format identifier", async () => {
    mocks.authorizeRead.mockRejectedValue(Object.assign(new Error("unavailable"), { code: "OBJECT_NOT_FOUND", status: 404 }));
    const response = await GET(request, { params: Promise.resolve({ path: ["media", canonicalId] }) });
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not found");
  });

  it("does not let valid syntax bypass owner authorization or leak provider identity", async () => {
    mocks.authorizeRead.mockRejectedValue(Object.assign(new Error("private/other-owner/provider-key/original"), { code: "RESOURCE_NOT_FOUND", status: 404 }));
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
    expect(mocks.authorizeRead).not.toHaveBeenCalled();
  });
});

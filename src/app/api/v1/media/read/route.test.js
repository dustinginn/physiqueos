import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redeemRead: vi.fn(),
  principal: { userId: "user_founder_001", scopes: ["media:read"] },
}));

vi.mock("../../../../../application/composition/productionApplicationComposition.js", () => ({
  getProductionApplicationComposition: vi.fn(async () => ({
    ownerUserId: "user_founder_001",
    mediaGateway: { redeemRead: mocks.redeemRead },
  })),
}));

vi.mock("../../../../../application/auth/principal.js", () => ({
  createAuthenticationPrincipal: vi.fn(() => mocks.principal),
}));

import { GET } from "./route.js";

describe("protected provider media reader", () => {
  beforeEach(() => {
    process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME = "1";
    mocks.redeemRead.mockReset();
  });

  afterEach(() => {
    delete process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME;
    vi.unstubAllGlobals();
  });

  it.each([
    ["image/jpeg", Buffer.from("image-bytes")],
    ["application/pdf", Buffer.from("pdf-bytes")],
  ])("streams authorized private %s bytes without making them public", async (contentType, bytes) => {
    mocks.redeemRead.mockResolvedValue({ url: "https://private-storage.invalid/signed-object" });
    const fetchMock = vi.fn(async () => new Response(bytes, {
      status: 200,
      headers: { "content-type": contentType, "content-length": String(bytes.length) },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request("https://provider.example/api/v1/media/read?grant=opaque-grant"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(contentType);
    expect(response.headers.get("content-length")).toBe(String(bytes.length));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    expect(mocks.redeemRead).toHaveBeenCalledWith({
      accessHandle: "/api/v1/media/read?grant=opaque-grant",
      principal: mocks.principal,
    });
    expect(fetchMock).toHaveBeenCalledWith("https://private-storage.invalid/signed-object", {
      redirect: "error",
      cache: "no-store",
    });
  });

  it("fails closed when the opaque grant is invalid or owner authorization fails", async () => {
    mocks.redeemRead.mockRejectedValue(Object.assign(new Error("private object unavailable"), { code: "OBJECT_NOT_FOUND" }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request("https://provider.example/api/v1/media/read?grant=invalid"));

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not found");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is unavailable outside provider full-runtime mode", async () => {
    delete process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME;
    const response = await GET(new Request("https://provider.example/api/v1/media/read?grant=opaque-grant"));
    expect(response.status).toBe(404);
    expect(mocks.redeemRead).not.toHaveBeenCalled();
  });
});

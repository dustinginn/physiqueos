import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApplicationProblem } from "../../../../../../../../contracts/v1/problem.js";

const MEDIA_ID = "0193e5b5-2fd0-7d6a-8f2c-411d8e8d28a1";
const mocks = vi.hoisted(() => ({
  openMedia: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("../../../../../../../../platform/auth/nativeFounderPhotoAcceptanceRuntime.js", () => ({
  getNativeFounderPhotoAcceptanceRuntime: () => ({ openMedia: mocks.openMedia }),
}));
vi.mock("../../../../../../../../platform/foundation/runtime.js", () => ({
  foundationBuildIdentity: { apiVersion: "v1", buildId: "test-build" },
  foundationLogger: { warn: mocks.warn },
}));

import { GET } from "./route.js";

const request = () => new Request(
  `https://provider.example/api/v1/native/sandbox/photo-acceptance/media/${MEDIA_ID}`,
  { headers: { authorization: `Bearer ${"a".repeat(43)}` } }
);
const context = () => ({ params: Promise.resolve({ mediaId: MEDIA_ID }) });

describe("Native Founder photo acceptance media proxy", () => {
  beforeEach(() => {
    mocks.openMedia.mockReset();
    mocks.warn.mockReset();
    mocks.openMedia.mockResolvedValue({
      url: "https://private-storage.invalid/signed",
      contentType: "image/jpeg",
      contentLength: 11,
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("streams the exact authorized image without exposing its signed URL or storage key", async () => {
    const bytes = Buffer.from("photo-bytes");
    const fetchMock = vi.fn(async () => new Response(bytes, {
      status: 200,
      headers: { "content-type": "image/jpeg", "content-length": String(bytes.length) },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await GET(request(), context());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("content-length")).toBe(String(bytes.length));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toBe("inline");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    expect(mocks.openMedia).toHaveBeenCalledWith({
      request: expect.any(Request),
      mediaId: MEDIA_ID,
      requestId: expect.any(String),
    });
    expect(fetchMock).toHaveBeenCalledWith("https://private-storage.invalid/signed", {
      redirect: "error",
      cache: "no-store",
    });
    expect(JSON.stringify([...response.headers])).not.toMatch(/private-storage|storage_key|signed/i);
  });

  it.each([
    ["wrong content type", { "content-type": "text/html", "content-length": "11" }],
    ["wrong byte length", { "content-type": "image/jpeg", "content-length": "10" }],
  ])("fails closed for %s from object storage", async (_label, headers) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(Buffer.from("photo-bytes"), { status: 200, headers })));
    const response = await GET(request(), context());
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "PHOTO_ACCEPTANCE_MEDIA_UNAVAILABLE" });
  });

  it.each(["ACCESS_TOKEN_EXPIRED", "ACCESS_TOKEN_REVOKED"])(
    "returns 401 for %s without contacting object storage",
    async (code) => {
      mocks.openMedia.mockRejectedValue(new ApplicationProblem({ status: 401, code, title: "Session unavailable." }));
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const response = await GET(request(), context());
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ code });
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it("returns an indistinguishable 404 for wrong-owner or non-allowlisted media", async () => {
    mocks.openMedia.mockRejectedValue(new ApplicationProblem({
      status: 404,
      code: "PHOTO_ACCEPTANCE_MEDIA_UNAVAILABLE",
      title: "The selected progress photo is unavailable.",
    }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await GET(request(), context());
    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

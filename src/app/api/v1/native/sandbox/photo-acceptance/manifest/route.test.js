import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getManifest: vi.fn(),
}));

vi.mock("../../../../../../../platform/auth/nativeFounderPhotoAcceptanceRuntime.js", () => ({
  getNativeFounderPhotoAcceptanceRuntime: () => ({ getManifest: mocks.getManifest }),
}));

import { GET } from "./route.js";

describe("Native Founder photo acceptance manifest route", () => {
  beforeEach(() => mocks.getManifest.mockReset());

  it("returns the authenticated allowlisted contract without cacheable private metadata", async () => {
    mocks.getManifest.mockResolvedValue({
      schemaVersion: "native-founder-photo-media-v1",
      sessions: [{ photoSessionId: "session-one", photos: [] }],
    });
    const request = new Request("https://provider.example/api/v1/native/sandbox/photo-acceptance/manifest", {
      headers: { authorization: `Bearer ${"a".repeat(43)}` },
    });
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ schemaVersion: "native-founder-photo-media-v1" });
    expect(mocks.getManifest).toHaveBeenCalledWith({
      request,
      requestId: expect.any(String),
    });
  });
});

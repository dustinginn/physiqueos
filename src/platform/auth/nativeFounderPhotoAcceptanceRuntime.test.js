import { describe, expect, it, vi } from "vitest";
import { ApplicationProblem } from "../../contracts/v1/problem.js";
import { createNativeFounderPhotoAcceptanceRuntime } from "./nativeFounderPhotoAcceptanceRuntime.js";

const TOKEN = "a".repeat(43);
const request = () => new Request("https://provider.example/photo", {
  headers: { authorization: `Bearer ${TOKEN}` },
});

function harness(authenticateAccessToken = vi.fn(async () => ({
  userId: "user_native_sandbox_founder_acceptance",
  sessionId: "session-one",
  scopes: ["founder:read"],
}))) {
  const getManifest = vi.fn(async () => ({ schemaVersion: "native-founder-photo-media-v1" }));
  const openMedia = vi.fn(async () => ({ url: "https://private.invalid/signed" }));
  const runtime = createNativeFounderPhotoAcceptanceRuntime({
    composition: {
      founderAuthService: { authenticateAccessToken },
      authority: { descriptor: { authorityId: "native-sandbox-founder-acceptance" } },
      service: { getManifest, openMedia },
    },
  });
  return { authenticateAccessToken, getManifest, openMedia, runtime };
}

describe("Native Founder photo acceptance bearer runtime", () => {
  it("authenticates every manifest and media request with the sandbox session", async () => {
    const { authenticateAccessToken, getManifest, openMedia, runtime } = harness();
    await runtime.getManifest({ request: request() });
    await runtime.openMedia({ request: request(), mediaId: "media-one" });
    expect(authenticateAccessToken).toHaveBeenCalledTimes(2);
    expect(authenticateAccessToken).toHaveBeenNthCalledWith(1, TOKEN);
    expect(getManifest).toHaveBeenCalledWith({ principal: expect.objectContaining({ sessionId: "session-one" }) });
    expect(openMedia).toHaveBeenCalledWith({
      principal: expect.objectContaining({ sessionId: "session-one" }),
      mediaId: "media-one",
    });
  });

  it("rejects unauthenticated requests before accessing photo data", async () => {
    const { getManifest, runtime } = harness();
    await expect(runtime.getManifest({ request: new Request("https://provider.example/photo") }))
      .rejects.toMatchObject({ status: 401, code: "AUTHENTICATION_REQUIRED" });
    expect(getManifest).not.toHaveBeenCalled();
  });

  it.each(["ACCESS_TOKEN_EXPIRED", "ACCESS_TOKEN_REVOKED"])(
    "fails closed for %s sessions before accessing photo data",
    async (code) => {
      const error = new ApplicationProblem({ status: 401, code, title: "Session unavailable." });
      const { getManifest, openMedia, runtime } = harness(vi.fn(async () => { throw error; }));
      await expect(runtime.getManifest({ request: request() })).rejects.toMatchObject({ status: 401, code });
      await expect(runtime.openMedia({ request: request(), mediaId: "media-one" })).rejects.toMatchObject({ status: 401, code });
      expect(getManifest).not.toHaveBeenCalled();
      expect(openMedia).not.toHaveBeenCalled();
    }
  );
});

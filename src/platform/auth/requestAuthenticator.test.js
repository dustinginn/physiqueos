import { describe, expect, it, vi } from "vitest";
import { createFounderBearerAuthenticator, readBearerCredential } from "./requestAuthenticator.js";

describe("Founder bearer request authentication", () => {
  it("requires one exact bearer credential", () => {
    expect(() => readBearerCredential(null)).toThrowError(expect.objectContaining({ code: "AUTHENTICATION_REQUIRED" }));
    expect(() => readBearerCredential("Basic abc")).toThrowError(expect.objectContaining({ code: "AUTHENTICATION_REQUIRED" }));
    expect(() => readBearerCredential("Bearer short")).toThrowError(expect.objectContaining({ code: "AUTHENTICATION_REQUIRED" }));
  });

  it("passes only the bearer value to FounderAuthService", async () => {
    const authenticateAccessToken = vi.fn(async () => ({ userId: "user", deviceId: "device", sessionId: "session", scopes: ["founder:read"] }));
    const authenticator = createFounderBearerAuthenticator({ authenticateAccessToken });
    const token = "a".repeat(43);
    const principal = await authenticator.authenticate(new Request("https://example.invalid", { headers: { authorization: `Bearer ${token}` } }));
    expect(authenticateAccessToken).toHaveBeenCalledWith(token);
    expect(principal.userId).toBe("user");
  });
});

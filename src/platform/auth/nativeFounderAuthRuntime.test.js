import { describe, expect, it, vi } from "vitest";
import { ApplicationProblem } from "../../contracts/v1/problem.js";
import { createNativeFounderAuthRuntime } from "./nativeFounderAuthRuntime.js";

const access = "a".repeat(43);

function request(token = access) {
  return new Request("https://example.invalid/api/v1/native/weight/summary", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

function runtime(overrides = {}) {
  const principal = { userId: "user", deviceId: "device", sessionId: "session", scopes: ["founder:read"] };
  const founderAuthService = {
    registerDeviceWithPairing: vi.fn(async () => ({ accessToken: access, refreshCredential: "r".repeat(43) })),
    authenticateAccessToken: vi.fn(async () => principal),
    rotateRefreshCredential: vi.fn(async () => ({ accessToken: "b".repeat(43), refreshCredential: "s".repeat(43) })),
    revokeSession: vi.fn(async () => true),
    ...overrides.founderAuthService,
  };
  const weightSummaryReadService = {
    getCurrentWeight: vi.fn(async () => ({ schemaVersion: "1", currentWeight: null })),
    ...overrides.weightSummaryReadService,
  };
  return { founderAuthService, weightSummaryReadService, subject: createNativeFounderAuthRuntime({ founderAuthService, weightSummaryReadService, logger: overrides.logger }) };
}

describe("Native Founder auth runtime", () => {
  it("registers an intentional iOS pairing without logging credential material", async () => {
    const logger = { info: vi.fn() };
    const current = runtime({ logger });
    await current.subject.pair({ pairingCredential: "p".repeat(43), platform: "ios", displayName: "Founder iPhone", requestId: "request-1" });
    expect(current.founderAuthService.registerDeviceWithPairing).toHaveBeenCalledWith({ pairingCredential: "p".repeat(43), platform: "ios", displayName: "Founder iPhone" });
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain("p".repeat(43));
  });

  it("rotates refresh credentials through FounderAuthService", async () => {
    const current = runtime();
    await current.subject.refresh({ refreshCredential: "r".repeat(43) });
    expect(current.founderAuthService.rotateRefreshCredential).toHaveBeenCalledWith("r".repeat(43));
  });

  it("authenticates and scope-checks the narrow Weight read", async () => {
    const current = runtime();
    await current.subject.readWeightSummary({ request: request(), requestId: "request-2" });
    expect(current.founderAuthService.authenticateAccessToken).toHaveBeenCalledWith(access);
    expect(current.weightSummaryReadService.getCurrentWeight).toHaveBeenCalledWith({ principal: expect.objectContaining({ userId: "user" }) });
  });

  it("revokes only the authenticated session represented by the bearer", async () => {
    const current = runtime();
    await expect(current.subject.revokeSession({ request: request(), requestId: "request-3" })).resolves.toEqual({ revoked: true });
    expect(current.founderAuthService.revokeSession).toHaveBeenCalledWith({ principal: expect.objectContaining({ sessionId: "session" }) });
  });

  it("preserves revoked-device and expired-token failures", async () => {
    for (const code of ["ACCESS_TOKEN_REVOKED", "ACCESS_TOKEN_EXPIRED"]) {
      const current = runtime({ founderAuthService: { authenticateAccessToken: vi.fn(async () => { throw new ApplicationProblem({ status: 401, code, title: code }); }) } });
      await expect(current.subject.readWeightSummary({ request: request() })).rejects.toMatchObject({ status: 401, code });
    }
  });

  it("requires a bearer and denies the wrong scope", async () => {
    await expect(runtime().subject.readWeightSummary({ request: request(null) })).rejects.toMatchObject({ status: 401, code: "AUTHENTICATION_REQUIRED" });
    const current = runtime({ founderAuthService: { authenticateAccessToken: vi.fn(async () => ({ userId: "user", deviceId: "device", sessionId: "session", scopes: ["founder:write"] })) } });
    await expect(current.subject.readWeightSummary({ request: request() })).rejects.toMatchObject({ status: 403, code: "AUTHORIZATION_DENIED" });
  });
});

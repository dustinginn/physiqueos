import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionToken, SESSION_COOKIE_NAME } from "../../../../../../platform/accessGate/sessionToken.js";

const mocks = vi.hoisted(() => ({ issue: vi.fn() }));

vi.mock("../../../../../../application/composition/productionApplicationComposition.js", () => ({
  getProductionFounderAuthService: () => ({ issuePairingCredentialFromFounderWeb: mocks.issue }),
}));

import { POST } from "./route.js";

const SECRET = "s".repeat(64);
const ORIGIN = "https://physiqueos.example";

describe("Founder web Native pairing credential route", () => {
  beforeEach(() => {
    mocks.issue.mockReset();
    process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME = "1";
    process.env.PHYSIQUEOS_ACCESS_GATE_SECRET = SECRET;
    process.env.PHYSIQUEOS_PUBLIC_APP_ORIGIN = ORIGIN;
    process.env.PHYSIQUEOS_CANONICAL_OWNER_USER_ID = "user_founder_001";
    process.env.PHYSIQUEOS_NATIVE_SANDBOX_OWNER_USER_ID = "user_native_sandbox_founder_acceptance";
  });

  it("returns one opaque short-lived credential to an authenticated Founder web request", async () => {
    const token = await createSessionToken(SECRET);
    mocks.issue.mockResolvedValue({
      pairingCredential: "p".repeat(43), authority: "founder-production",
      issuedAt: "2026-09-09T12:00:00.000Z", expiresAt: "2026-09-09T12:10:00.000Z",
    });
    const response = await POST(request(token));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ pairingCredential: "p".repeat(43), authority: "founder-production" });
    expect(mocks.issue).toHaveBeenCalledWith(expect.objectContaining({ userId: "user_founder_001", authority: "founder-production" }));
  });

  it("returns a versioned problem without calling storage when the Founder session is absent", async () => {
    const response = await POST(request(null));
    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    expect(await response.json()).toMatchObject({ problemVersion: "1", code: "AUTHENTICATION_REQUIRED" });
    expect(mocks.issue).not.toHaveBeenCalled();
  });
});

function request(token) {
  const headers = { origin: ORIGIN };
  if (token) headers.cookie = `${SESSION_COOKIE_NAME}=${token}`;
  return new Request(`${ORIGIN}/api/v1/native/auth/pairing-credentials`, { method: "POST", headers });
}

import { beforeEach, describe, expect, it } from "vitest";
import { createSessionToken, SESSION_COOKIE_NAME } from "../accessGate/sessionToken.js";
import { authorizeFounderWebPairingRequest } from "./founderWebPairingAuthorization.js";

const SECRET = "s".repeat(64);
const ORIGIN = "https://physiqueos.example";

describe("Founder web pairing authorization", () => {
  let env;

  beforeEach(() => {
    env = {
      PHYSIQUEOS_PROVIDER_FULL_RUNTIME: "1",
      PHYSIQUEOS_ACCESS_GATE_SECRET: SECRET,
      PHYSIQUEOS_PUBLIC_APP_ORIGIN: ORIGIN,
      PHYSIQUEOS_CANONICAL_OWNER_USER_ID: "user_founder_001",
      PHYSIQUEOS_NATIVE_SANDBOX_OWNER_USER_ID: "user_native_sandbox_founder_acceptance",
    };
  });

  it("authorizes only the signed Founder web session for the configured production owner", async () => {
    const token = await createSessionToken(SECRET);
    await expect(authorizeFounderWebPairingRequest(request(token), env)).resolves.toEqual({
      userId: "user_founder_001", authority: "founder-production",
    });
  });

  it.each([
    ["missing", null],
    ["malformed", "garbage"],
  ])("rejects a %s Founder web session", async (_name, token) => {
    await expect(authorizeFounderWebPairingRequest(request(token), env)).rejects.toMatchObject({
      status: 401, code: "AUTHENTICATION_REQUIRED",
    });
  });

  it("rejects an untrusted request origin", async () => {
    const token = await createSessionToken(SECRET);
    await expect(authorizeFounderWebPairingRequest(request(token, "https://evil.example"), env)).rejects.toMatchObject({
      status: 403, code: "ORIGIN_MISMATCH",
    });
  });

  it("rejects a Sandbox owner collision instead of crossing authorities", async () => {
    const token = await createSessionToken(SECRET);
    env.PHYSIQUEOS_NATIVE_SANDBOX_OWNER_USER_ID = "user_founder_001";
    await expect(authorizeFounderWebPairingRequest(request(token), env)).rejects.toMatchObject({
      status: 403, code: "FOUNDER_PRODUCTION_AUTHORITY_UNAVAILABLE",
    });
  });

  it("rejects duplicate Founder cookies rather than choosing an ambiguous credential", async () => {
    const token = await createSessionToken(SECRET);
    const value = `${SESSION_COOKIE_NAME}=${token}; ${SESSION_COOKIE_NAME}=${token}`;
    await expect(authorizeFounderWebPairingRequest(new Request(`${ORIGIN}/api/v1/native/auth/pairing-credentials`, {
      method: "POST", headers: { origin: ORIGIN, cookie: value },
    }), env)).rejects.toMatchObject({ status: 401, code: "AUTHENTICATION_REQUIRED" });
  });
});

function request(token, origin = ORIGIN) {
  const headers = { origin };
  if (token) headers.cookie = `${SESSION_COOKIE_NAME}=${token}`;
  return new Request(`${ORIGIN}/api/v1/native/auth/pairing-credentials`, { method: "POST", headers });
}

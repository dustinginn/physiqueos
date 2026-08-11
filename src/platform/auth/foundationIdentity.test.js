import { describe, expect, it } from "vitest";
import { assertPrincipalOwns, createAuthenticationPrincipal } from "../../application/auth/principal";
import { CredentialKind, createCredentialIdentity, createDeviceIdentity, createSessionIdentity, createUserIdentity } from "../../contracts/v1/identity";
import { generateHighEntropyCredential, hashHighEntropyCredential, verifyHighEntropyCredential } from "./credentialHash";
import { createExplicitTestAuthenticator, createInactiveFoundationAuthenticator } from "./requestAuthenticator";

const principalInput = { userId: "synthetic-user", deviceId: "synthetic-device", sessionId: "synthetic-session", scopes: ["platform:read"] };

describe("Founder identity foundation", () => {
  it("models user, device, session, and hashed credential identity without a secret", () => {
    expect(createUserIdentity({ id: "legacy-user", profileId: "legacy-profile" })).toMatchObject({ id: "legacy-user", version: "1" });
    expect(createDeviceIdentity({ id: "device", ownerUserId: "legacy-user" })).toMatchObject({ ownerUserId: "legacy-user", revocationState: "active" });
    expect(createSessionIdentity({ id: "session", ownerUserId: "legacy-user", deviceId: "device" })).toMatchObject({ id: "session", deviceId: "device" });
    const credential = createCredentialIdentity({ id: "credential", sessionId: "session", ownerUserId: "legacy-user", deviceId: "device", kind: CredentialKind.REFRESH, hashAlgorithm: "hmac-sha256:v1", expiresAt: "2026-11-08T00:00:00Z" });
    expect(credential).not.toHaveProperty("secret");
    expect(credential).not.toHaveProperty("hash");
  });

  it("hashes high-entropy credentials with a server-held pepper", () => {
    const secret = generateHighEntropyCredential();
    const pepper = "synthetic-server-pepper-value-32-bytes-minimum";
    const encoded = hashHighEntropyCredential(secret, { pepper });
    expect(encoded).not.toContain(secret);
    expect(verifyHighEntropyCredential(secret, encoded, { pepper })).toBe(true);
    expect(verifyHighEntropyCredential(`${secret}x`, encoded, { pepper })).toBe(false);
  });

  it("enforces ownership without revealing wrong-user resources", () => {
    const principal = createAuthenticationPrincipal(principalInput);
    expect(assertPrincipalOwns(principal, "synthetic-user")).toBe(principal);
    expect(() => assertPrincipalOwns(principal, "another-user")).toThrow(/unavailable/);
  });

  it("denies production requests until authentication is deliberately activated", async () => {
    await expect(createInactiveFoundationAuthenticator().authenticate()).rejects.toMatchObject({ status: 503, code: "FOUNDATION_AUTH_INACTIVE" });
    const authenticator = createExplicitTestAuthenticator(principalInput);
    await expect(authenticator.authenticate()).resolves.toMatchObject({ userId: "synthetic-user", deviceId: "synthetic-device" });
  });
});

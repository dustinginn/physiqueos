import { describe, expect, it, vi } from "vitest";
import { createPasskeyLifecycleService } from "./PasskeyLifecycleService";
import { createPasskeyServer } from "./passkeyServer";

describe("passkey server lifecycle", () => {
  it("generates real WebAuthn registration and authentication options for the configured relying party", async () => {
    const server = createPasskeyServer({ rpName: "PhysiqueOS Staging", rpId: "staging.example.test", expectedOrigin: "https://staging.example.test" });
    const registration = await server.generateRegistrationOptions({ userId: "synthetic-user", userName: "founder", displayName: "Synthetic Founder" });
    const authentication = await server.generateAuthenticationOptions();
    expect(registration).toMatchObject({ rp: { id: "staging.example.test" }, authenticatorSelection: { residentKey: "required", userVerification: "required" } });
    expect(registration.challenge.length).toBeGreaterThan(20);
    expect(authentication).toMatchObject({ rpId: "staging.example.test", userVerification: "required" });
  });

  it("does not allow an unauthenticated passkey registration challenge", async () => {
    const service = createService(fakeStore(), { generateRegistrationOptions: vi.fn() });
    await expect(service.beginRegistration({ userName: "founder", displayName: "Founder" })).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
  });

  it("persists and consumes a registration challenge before saving the verified public key", async () => {
    const passkeys = fakeStore();
    const server = {
      generateRegistrationOptions: vi.fn().mockResolvedValue({ challenge: "registration-challenge" }),
      verifyRegistrationResponse: vi.fn().mockResolvedValue({ verified: true, registrationInfo: { credential: { id: "external", publicKey: new Uint8Array([1, 2]), counter: 0 }, credentialDeviceType: "multiDevice", credentialBackedUp: true } }),
    };
    const service = createService(passkeys, server);
    const begun = await service.beginRegistration({ principal: { userId: "user", deviceId: "device", sessionId: "session", scopes: [] }, userName: "founder", displayName: "Founder" });
    passkeys.consumeChallenge.mockResolvedValue({ user_id: "user", context: { expectedChallenge: "registration-challenge" } });
    await service.finishRegistration({ challengeId: begun.challengeId, response: { response: {} } });
    expect(passkeys.saveCredential).toHaveBeenCalledWith(expect.objectContaining({ userId: "user", credentialExternalId: "external", backedUp: true }));
  });

  it("rejects expired or replayed challenges", async () => {
    const passkeys = fakeStore({ consumeChallenge: vi.fn().mockResolvedValue(null) });
    const service = createService(passkeys, { verifyRegistrationResponse: vi.fn() });
    await expect(service.finishRegistration({ challengeId: "expired", response: {} })).rejects.toMatchObject({ code: "PASSKEY_CHALLENGE_INVALID" });
  });

  it("rejects cross-owner passkey assertions", async () => {
    const passkeys = fakeStore({
      consumeChallenge: vi.fn().mockResolvedValue({ user_id: "user-a", context: { expectedChallenge: "challenge" } }),
      findActiveByExternalId: vi.fn().mockResolvedValue({ id: "credential", user_id: "user-b" }),
    });
    const service = createService(passkeys, { verifyAuthenticationResponse: vi.fn() });
    await expect(service.finishAuthentication({ challengeId: "challenge-id", response: { id: "external" } })).rejects.toMatchObject({ code: "PASSKEY_VERIFICATION_FAILED" });
  });
});

function createService(passkeys, passkeyServer) {
  return createPasskeyLifecycleService({ transactionRunner: { run: (work) => work({ passkeys }) }, passkeyServer, clock: () => new Date("2026-08-11T00:00:00Z"), createId: () => "0198f000-0000-7000-8000-000000000001" });
}
function fakeStore(overrides = {}) {
  return { listActiveForUser: vi.fn().mockResolvedValue([]), saveChallenge: vi.fn(), consumeChallenge: vi.fn(), saveCredential: vi.fn().mockResolvedValue({ id: "stored" }), findActiveByExternalId: vi.fn(), advanceCounter: vi.fn(), ...overrides };
}

import { describe, expect, it, vi } from "vitest";
import { createFounderAuthService } from "./FounderAuthService";
import { advancePinFailureState, resetPinFailureState, validateLocalPinShape } from "./pinLockoutPolicy";

const NOW = new Date("2026-08-11T12:00:00.000Z");
const PEPPER = "p".repeat(64);

describe("inactive Founder authentication lifecycle", () => {
  it("enrolls exactly one Founder and returns recovery material only in the result", async () => {
    const identity = baseIdentity({ lockFounderEnrollment: vi.fn().mockResolvedValue(true) });
    const service = serviceFor(identity);
    const result = await service.enrollFounder({ displayName: "Synthetic Founder", timeZone: "America/Los_Angeles" });
    expect(result.recoveryCredential).toHaveLength(43);
    expect(identity.createUserProfile).toHaveBeenCalledOnce();
    expect(identity.createRecoveryCredential.mock.calls[0][0]).not.toHaveProperty("credential", result.recoveryCredential);
    expect(identity.createRecoveryCredential.mock.calls[0][0].credentialHash).not.toContain(result.recoveryCredential);
  });

  it("fails closed when enrollment already exists", async () => {
    const service = serviceFor(baseIdentity({ lockFounderEnrollment: vi.fn().mockResolvedValue(false) }));
    await expect(service.enrollFounder({ displayName: "Synthetic", timeZone: "UTC" })).rejects.toMatchObject({ code: "FOUNDER_ALREADY_ENROLLED" });
  });

  it.each([
    ["expired", { expires_at: "2026-08-11T11:59:00.000Z", session_status: "active", device_status: "active" }, "ACCESS_TOKEN_EXPIRED"],
    ["revoked session", { expires_at: "2026-08-11T12:05:00.000Z", session_status: "revoked", device_status: "active" }, "ACCESS_TOKEN_REVOKED"],
    ["revoked device", { expires_at: "2026-08-11T12:05:00.000Z", session_status: "active", device_status: "revoked" }, "ACCESS_TOKEN_REVOKED"],
  ])("rejects %s access credentials", async (_name, state, code) => {
    const record = { id: "access", user_id: "user", device_id: "device", session_id: "session", idle_expires_at: "2026-09-01T00:00:00.000Z", absolute_expires_at: "2026-10-01T00:00:00.000Z", revoked_at: null, ...state };
    const service = serviceFor(baseIdentity({ findAccessCredentialForAuthentication: vi.fn().mockResolvedValue(record) }));
    await expect(service.authenticateAccessToken("a".repeat(43))).rejects.toMatchObject({ code });
  });

  it("returns an authenticated principal only for a live access credential", async () => {
    const identity = baseIdentity({ findAccessCredentialForAuthentication: vi.fn().mockResolvedValue({ user_id: "user", device_id: "device", session_id: "session", expires_at: "2026-08-11T12:05:00.000Z", idle_expires_at: "2026-09-01T00:00:00.000Z", absolute_expires_at: "2026-10-01T00:00:00.000Z", session_status: "active", device_status: "active", revoked_at: null }) });
    const principal = await serviceFor(identity).authenticateAccessToken("a".repeat(43));
    expect(principal).toMatchObject({ userId: "user", deviceId: "device", sessionId: "session" });
    expect(identity.updateDeviceSeen).toHaveBeenCalledOnce();
  });

  it("registers an iOS device from a single-use pairing credential and issues a rotating session", async () => {
    const identity = baseIdentity({ consumePairingCredential: vi.fn().mockResolvedValue({ user_id: "user" }) });
    const result = await serviceFor(identity).registerDeviceWithPairing({
      pairingCredential: "p".repeat(43), platform: "ios", displayName: "Founder's iPhone",
    });
    expect(identity.consumePairingCredential).toHaveBeenCalledOnce();
    expect(identity.createDevice).toHaveBeenCalledWith(expect.objectContaining({ userId: "user", platform: "ios" }));
    expect(identity.createSession).toHaveBeenCalledOnce();
    expect(identity.createAccessCredential).toHaveBeenCalledOnce();
    expect(identity.createRefreshCredential).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ sessionId: expect.any(String), accessToken: expect.any(String), refreshCredential: expect.any(String) });
    expect(result.accessToken).toHaveLength(43);
    expect(result.refreshCredential).toHaveLength(43);
  });

  it("issues one ten-minute pairing credential from the correct live recovery authority without creating a session", async () => {
    const identity = baseIdentity({
      findRecoveryCredentialForUse: vi.fn().mockResolvedValue({
        id: "recovery", user_id: "sandbox-user", used_at: null, revoked_at: null, expires_at: null,
      }),
      findPairingCredentialByRecoveryCredentialId: vi.fn().mockResolvedValue(null),
    });
    const result = await serviceFor(identity).issuePairingCredentialWithRecovery({
      recoveryCredential: "z".repeat(43), expectedUserId: "sandbox-user",
    });
    expect(result.pairingCredential).toHaveLength(43);
    expect(result.expiresAt).toBe("2026-08-11T12:10:00.000Z");
    expect(identity.createPairingCredentialWithRecoveryIssuer).toHaveBeenCalledWith(expect.objectContaining({
      userId: "sandbox-user",
      issuedBySessionId: null,
      issuedByRecoveryCredentialId: "recovery",
      expiresAt: new Date("2026-08-11T12:10:00.000Z"),
    }));
    expect(identity.consumeRecoveryCredential).not.toHaveBeenCalled();
    expect(identity.createDevice).not.toHaveBeenCalled();
    expect(identity.createSession).not.toHaveBeenCalled();
    expect(identity.createAccessCredential).not.toHaveBeenCalled();
    expect(identity.createRefreshCredential).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", null],
    ["used", { id: "recovery", user_id: "sandbox-user", used_at: NOW, revoked_at: null, expires_at: null }],
    ["revoked", { id: "recovery", user_id: "sandbox-user", used_at: null, revoked_at: NOW, expires_at: null }],
    ["expired", { id: "recovery", user_id: "sandbox-user", used_at: null, revoked_at: null, expires_at: "2026-08-11T11:59:00.000Z" }],
  ])("rejects a %s recovery credential before bootstrap pairing issuance", async (_state, recovery) => {
    const identity = baseIdentity({ findRecoveryCredentialForUse: vi.fn().mockResolvedValue(recovery) });
    await expect(serviceFor(identity).issuePairingCredentialWithRecovery({
      recoveryCredential: "z".repeat(43), expectedUserId: "sandbox-user",
    })).rejects.toMatchObject({ status: 401, code: "RECOVERY_CREDENTIAL_INVALID" });
    expect(identity.createPairingCredentialWithRecoveryIssuer).not.toHaveBeenCalled();
  });

  it("rejects a valid recovery credential from the wrong authority without revealing ownership", async () => {
    const identity = baseIdentity({ findRecoveryCredentialForUse: vi.fn().mockResolvedValue({
      id: "recovery", user_id: "production-user", used_at: null, revoked_at: null, expires_at: null,
    }) });
    await expect(serviceFor(identity).issuePairingCredentialWithRecovery({
      recoveryCredential: "z".repeat(43), expectedUserId: "sandbox-user",
    })).rejects.toMatchObject({ status: 401, code: "RECOVERY_CREDENTIAL_INVALID" });
    expect(identity.createPairingCredentialWithRecoveryIssuer).not.toHaveBeenCalled();
  });

  it("allows a recovery record to authorize at most one bootstrap pairing credential", async () => {
    const identity = baseIdentity({
      findRecoveryCredentialForUse: vi.fn().mockResolvedValue({
        id: "recovery", user_id: "sandbox-user", used_at: null, revoked_at: null, expires_at: null,
      }),
      findPairingCredentialByRecoveryCredentialId: vi.fn().mockResolvedValue({ id: "already-issued" }),
    });
    await expect(serviceFor(identity).issuePairingCredentialWithRecovery({
      recoveryCredential: "z".repeat(43), expectedUserId: "sandbox-user",
    })).rejects.toMatchObject({ status: 409, code: "BOOTSTRAP_PAIRING_ALREADY_ISSUED" });
    expect(identity.createPairingCredentialWithRecoveryIssuer).not.toHaveBeenCalled();
  });

  it("rejects pairing-credential reuse and never consults or consumes recovery material", async () => {
    const identity = baseIdentity({
      consumePairingCredential: vi.fn()
        .mockResolvedValueOnce({ user_id: "sandbox-user" })
        .mockResolvedValueOnce(null),
    });
    const service = serviceFor(identity);
    await service.registerDeviceWithPairing({ pairingCredential: "p".repeat(43), platform: "ios", displayName: "Founder iPhone" });
    await expect(service.registerDeviceWithPairing({
      pairingCredential: "p".repeat(43), platform: "ios", displayName: "Founder iPhone",
    })).rejects.toMatchObject({ status: 401, code: "PAIRING_CREDENTIAL_INVALID" });
    expect(identity.createDevice).toHaveBeenCalledOnce();
    expect(identity.findRecoveryCredentialForUse).not.toHaveBeenCalled();
    expect(identity.consumeRecoveryCredential).not.toHaveBeenCalled();
  });

  it("rotates an unused refresh credential and replaces it atomically", async () => {
    const identity = baseIdentity({
      lockRefreshCredential: vi.fn().mockResolvedValue({
        id: "refresh", user_id: "user", device_id: "device", session_id: "session", family_id: "family",
        used_at: null, revoked_at: null, session_status: "active", device_status: "active",
        idle_expires_at: "2026-09-01T00:00:00.000Z", absolute_expires_at: "2026-10-01T00:00:00.000Z",
      }),
    });
    const result = await serviceFor(identity).rotateRefreshCredential("r".repeat(43));
    expect(identity.createAccessCredential).toHaveBeenCalledOnce();
    expect(identity.replaceRefreshCredential).toHaveBeenCalledWith(expect.objectContaining({
      previousId: "refresh", next: expect.objectContaining({ familyId: "family", sessionId: "session" }),
    }));
    expect(result).toMatchObject({ sessionId: "session", accessToken: expect.any(String), refreshCredential: expect.any(String) });
    expect(result.accessToken).toHaveLength(43);
    expect(result.refreshCredential).toHaveLength(43);
  });

  it("revokes a refresh family when a consumed refresh credential is replayed", async () => {
    const identity = baseIdentity({ lockRefreshCredential: vi.fn().mockResolvedValue({ id: "refresh", user_id: "user", family_id: "family", used_at: NOW, revoked_at: null }) });
    await expect(serviceFor(identity).rotateRefreshCredential("r".repeat(43))).rejects.toMatchObject({ code: "REFRESH_REUSE_DETECTED" });
    expect(identity.revokeRefreshFamily).toHaveBeenCalledWith({ userId: "user", familyId: "family", at: NOW });
  });

  it("consumes recovery once, revokes sessions, and never deletes canonical data", async () => {
    const identity = baseIdentity({ findRecoveryCredentialForUse: vi.fn().mockResolvedValue({ id: "recovery", user_id: "user", used_at: null, revoked_at: null, expires_at: null }) });
    const result = await serviceFor(identity).useRecoveryCredential("z".repeat(43));
    expect(result).toEqual({ userId: "user", recoveryRequired: true, canonicalDataDeleted: false });
    expect(identity.consumeRecoveryCredential).toHaveBeenCalledOnce();
    expect(identity.revokeAllSessions).toHaveBeenCalledOnce();
  });

  it("re-enrolls a replacement device and rotates recovery material without deleting canonical data", async () => {
    const identity = baseIdentity({ findRecoveryCredentialForUse: vi.fn().mockResolvedValue({ id: "recovery", user_id: "user", used_at: null, revoked_at: null, expires_at: null }) });
    const result = await serviceFor(identity).recoverFounder({ recoveryCredential: "z".repeat(43), platform: "ios", displayName: "Replacement" });
    expect(result).toMatchObject({ userId: "user", canonicalDataDeleted: false });
    expect(result.recoveryCredential).toHaveLength(43);
    expect(identity.revokeAllSessions).toHaveBeenCalledOnce();
    expect(identity.createDevice).toHaveBeenCalledOnce();
    expect(identity.createRecoveryCredential).toHaveBeenCalledOnce();
    expect(identity.createSession).toHaveBeenCalledOnce();
  });

  it("rejects recovery credential misuse", async () => {
    const identity = baseIdentity({ findRecoveryCredentialForUse: vi.fn().mockResolvedValue(null) });
    await expect(serviceFor(identity).recoverFounder({ recoveryCredential: "x".repeat(43), platform: "ios", displayName: "Replacement" })).rejects.toMatchObject({ code: "RECOVERY_CREDENTIAL_INVALID" });
    expect(identity.createDevice).not.toHaveBeenCalled();
  });

  it("rejects malformed credentials without querying storage", async () => {
    const identity = baseIdentity();
    await expect(serviceFor(identity).authenticateAccessToken("short")).rejects.toMatchObject({ code: "CREDENTIAL_MALFORMED" });
    expect(identity.findAccessCredentialForAuthentication).not.toHaveBeenCalled();
  });

  it("enforces the eight-digit PIN and recovery threshold without data deletion", () => {
    expect(() => validateLocalPinShape("1234567")).toThrow("eight digits");
    expect(validateLocalPinShape("12345678")).toBe(true);
    let state;
    for (let index = 0; index < 10; index += 1) state = advancePinFailureState(state, { now: NOW });
    expect(state).toMatchObject({ failureCount: 10, recoveryRequired: true, canonicalDataDeleted: false });
    expect(() => resetPinFailureState()).toThrow("Founder recovery");
    expect(resetPinFailureState({ recoveryCredentialVerified: true })).toMatchObject({ failureCount: 0, recoveryRequired: false, canonicalDataDeleted: false });
  });
});

function serviceFor(identity) {
  let id = 0;
  let secret = 0;
  return createFounderAuthService({
    transactionRunner: { run: (work) => work({ identity }) }, credentialPepper: PEPPER, clock: () => NOW,
    createId: () => `0198f000-0000-7000-8000-${String(++id).padStart(12, "0")}`,
    createSecret: () => Buffer.alloc(32, ++secret).toString("base64url"),
  });
}

function baseIdentity(overrides = {}) {
  return {
    lockFounderEnrollment: vi.fn().mockResolvedValue(true), createUserProfile: vi.fn(), createRecoveryCredential: vi.fn(),
    createPairingCredential: vi.fn(), createPairingCredentialWithRecoveryIssuer: vi.fn(),
    consumePairingCredential: vi.fn(), createDevice: vi.fn(), createSession: vi.fn(),
    createAccessCredential: vi.fn(), createRefreshCredential: vi.fn(), findAccessCredentialForAuthentication: vi.fn(),
    updateDeviceSeen: vi.fn(), lockRefreshCredential: vi.fn(), replaceRefreshCredential: vi.fn(), revokeRefreshFamily: vi.fn(),
    revokeSession: vi.fn(), revokeDevice: vi.fn(), findRecoveryCredentialForUse: vi.fn(), consumeRecoveryCredential: vi.fn(),
    findPairingCredentialByRecoveryCredentialId: vi.fn().mockResolvedValue(null),
    revokeAllSessions: vi.fn(), ...overrides,
  };
}

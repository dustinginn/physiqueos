import { describe, expect, it } from "vitest";
import {
  classifyLocalUnlock,
  classifyRecoverySurface,
  classifyRefreshRotation,
  RefreshRotationDecision,
  RefreshRotationReason,
} from "./RefreshRotationRecoveryPolicy";

const NOW = new Date("2026-09-28T15:32:30.000Z");
const INTENT_A = "a".repeat(64);
const INTENT_B = "b".repeat(64);
const SUCCESSOR_A = "c".repeat(64);
const SUCCESSOR_B = "d".repeat(64);
const VALID_PROOF = Object.freeze({ valid: true, keyMatchesDevice: true, serverNonceFresh: true, proofIdFresh: true });

describe("sender-constrained refresh recovery architecture", () => {
  it("rotates an unused credential only with a fresh enrolled-device proof", () => {
    expect(classify({ current: current({ usedAt: null, rotationIntentDigest: null, successorCommitment: null }) })).toEqual({
      action: RefreshRotationDecision.ROTATE,
      reason: RefreshRotationReason.CURRENT_UNUSED,
    });
    expect(classify({ current: current({ usedAt: null }), proof: { ...VALID_PROOF, keyMatchesDevice: false } })).toMatchObject({
      action: RefreshRotationDecision.REJECT_DEVICE_PROOF,
    });
  });

  it("recovers an exact device-bound durable intent after a lost reply", () => {
    expect(classify()).toEqual({
      action: RefreshRotationDecision.RECOVER_LOST_REPLY,
      reason: RefreshRotationReason.EXACT_DEVICE_BOUND_INTENT_RETRY,
    });
  });

  it("rejects replay of a captured full request because its nonce or proof ID is consumed", () => {
    for (const proof of [{ ...VALID_PROOF, serverNonceFresh: false }, { ...VALID_PROOF, proofIdFresh: false }]) {
      expect(classify({ proof })).toMatchObject({
        action: RefreshRotationDecision.REJECT_DEVICE_PROOF,
        reason: RefreshRotationReason.DEVICE_PROOF_INVALID,
      });
    }
  });

  it("rejects a stolen bearer before or after rotation without the enrolled key", () => {
    for (const state of [current({ usedAt: null }), current()]) {
      expect(classify({ current: state, proof: { ...VALID_PROOF, valid: false, keyMatchesDevice: false } })).toMatchObject({
        action: RefreshRotationDecision.REJECT_DEVICE_PROOF,
      });
    }
  });

  it("revokes a valid-key stale presentation with a different durable intent", () => {
    expect(classify({ presentedIntentDigest: INTENT_B })).toMatchObject({
      action: RefreshRotationDecision.REVOKE_FAMILY,
      reason: RefreshRotationReason.INTENT_MISMATCH,
    });
  });

  it("revokes a valid-key retry with a different successor commitment", () => {
    expect(classify({ presentedSuccessorCommitment: SUCCESSOR_B })).toMatchObject({
      action: RefreshRotationDecision.REVOKE_FAMILY,
      reason: RefreshRotationReason.SUCCESSOR_COMMITMENT_MISMATCH,
    });
  });

  it("revokes an exact retry outside the Server-clock recovery window", () => {
    expect(classify({ now: new Date("2026-09-28T15:34:28.001Z") })).toMatchObject({
      action: RefreshRotationDecision.REVOKE_FAMILY,
      reason: RefreshRotationReason.RETRY_WINDOW_EXPIRED,
    });
  });

  it("revokes old-token replay after the successor was used", () => {
    expect(classify({ successor: successor({ usedAt: "2026-09-28T15:32:29.000Z" }) })).toMatchObject({
      action: RefreshRotationDecision.REVOKE_FAMILY,
      reason: RefreshRotationReason.SUCCESSOR_USED,
    });
  });

  it("treats associated access-token use as proof the exchange progressed", () => {
    expect(classify({ exchangeAccessResponses: [accessResponse({ firstUsedAt: "2026-09-28T15:32:29.500Z" })] })).toMatchObject({
      action: RefreshRotationDecision.REVOKE_FAMILY,
      reason: RefreshRotationReason.EXCHANGE_ACCESS_USED,
    });
  });

  it("blocks recovery when any replacement access token from the exchange was used", () => {
    expect(classify({
      current: current({ exchangeAccessCredentialIds: ["access-b", "access-recovery-1"] }),
      exchangeAccessResponses: [
        accessResponse({ revokedAt: "2026-09-28T15:32:29.000Z" }),
        accessResponse({ id: "access-recovery-1", firstUsedAt: "2026-09-28T15:32:29.500Z" }),
      ],
      recoveryAttemptCount: 1,
    })).toMatchObject({
      action: RefreshRotationDecision.REVOKE_FAMILY,
      reason: RefreshRotationReason.EXCHANGE_ACCESS_USED,
    });
  });

  it("revokes concurrent refreshes that use different durable intents", () => {
    expect(classify().action).toBe(RefreshRotationDecision.RECOVER_LOST_REPLY);
    expect(classify({ presentedIntentDigest: INTENT_B }).action).toBe(RefreshRotationDecision.REVOKE_FAMILY);
  });

  it("bounds repeated lost-reply recovery before requiring reauthorization", () => {
    expect(classify({ recoveryAttemptCount: 1 }).action).toBe(RefreshRotationDecision.RECOVER_LOST_REPLY);
    expect(classify({ recoveryAttemptCount: 2 })).toMatchObject({
      action: RefreshRotationDecision.REQUIRE_REAUTHORIZATION,
      reason: RefreshRotationReason.RECOVERY_ATTEMPTS_EXHAUSTED,
    });
  });

  it("rejects a revoked session/device or expired credential without recovery", () => {
    expect(classify({ current: current({ sessionStatus: "revoked" }) }).action).toBe(RefreshRotationDecision.REJECT_REVOKED);
    expect(classify({ current: current({ deviceStatus: "revoked" }) }).action).toBe(RefreshRotationDecision.REJECT_REVOKED);
    expect(classify({ current: current({ idleExpiresAt: NOW }) }).action).toBe(RefreshRotationDecision.REJECT_EXPIRED);
  });

  it("never crosses device, session, or family authority", () => {
    for (const state of [successor({ deviceId: "other-device" }), successor({ sessionId: "other-session" }), successor({ familyId: "other-family" })]) {
      expect(classify({ successor: state })).toMatchObject({
        action: RefreshRotationDecision.REVOKE_FAMILY,
        reason: RefreshRotationReason.SUCCESSOR_AUTHORITY_MISMATCH,
      });
    }
  });

  it("suspension, Keychain failure, and relaunch converge on the same pending intent", () => {
    for (const interruption of ["suspended_after_send", "keychain_promotion_failed", "relaunched_pending"]) {
      expect(classify({ interruption }).action).toBe(RefreshRotationDecision.RECOVER_LOST_REPLY);
    }
  });

  it("Face ID success and passcode fallback unlock only local UI", () => {
    expect(classifyLocalUnlock({ devicePasscodeSet: true, result: "success" })).toEqual({ ui: "unlocked", serverSession: "unchanged" });
    expect(classifyLocalUnlock({ devicePasscodeSet: true, result: "passcode_success" })).toEqual({ ui: "unlocked", serverSession: "unchanged" });
  });

  it("biometric failure, cancellation, enrollment change, and no biometry never revoke Server state", () => {
    for (const result of ["failure", "cancel", "biometry_changed", "no_biometry"]) {
      expect(classifyLocalUnlock({ devicePasscodeSet: true, result })).toEqual({ ui: "locked", serverSession: "unchanged" });
    }
    expect(classifyLocalUnlock({ devicePasscodeSet: false, result: "no_biometry" })).toEqual({
      ui: "security_setup_required", serverSession: "unchanged",
    });
  });

  it("routes auth recovery above Home instead of collapsing to a generic content error", () => {
    expect(classifyRecoverySurface({ hasLocalSession: false })).toBe("unpaired");
    expect(classifyRecoverySurface({ hasLocalSession: true, hasPendingRotation: true, serverState: "active" })).toBe("recovering_session");
    expect(classifyRecoverySurface({ hasLocalSession: true, hasPendingRotation: false, serverState: "revoked" })).toBe("reconnect_required");
    expect(classifyRecoverySurface({ hasLocalSession: true, hasPendingRotation: true, serverState: "active", networkAvailable: false })).toBe("offline_last_known");
  });

  it("never emits credential, proof, intent, or successor material", () => {
    const marker = "must-not-appear";
    const result = classify({ refreshCredential: marker, rawProof: marker, proposedSuccessor: marker });
    expect(Object.keys(result).sort()).toEqual(["action", "reason"]);
    expect(JSON.stringify(result)).not.toContain(marker);
  });
});

function classify(overrides = {}) {
  return classifyRefreshRotation({
    current: current(),
    successor: successor(),
    exchangeAccessResponses: [accessResponse()],
    proof: VALID_PROOF,
    presentedIntentDigest: INTENT_A,
    presentedSuccessorCommitment: SUCCESSOR_A,
    now: NOW,
    ...overrides,
  });
}

function current(overrides = {}) {
  return {
    id: "refresh-a", userId: "founder", deviceId: "iphone-1", sessionId: "session-1", familyId: "family-1",
    usedAt: "2026-09-28T15:32:28.000Z", revokedAt: null,
    idleExpiresAt: "2026-10-28T15:32:28.000Z", absoluteExpiresAt: "2026-12-27T15:32:28.000Z",
    sessionStatus: "active", deviceStatus: "active", rotationIntentDigest: INTENT_A,
    successorCommitment: SUCCESSOR_A, replacedById: "refresh-b", exchangeAccessCredentialIds: ["access-b"],
    ...overrides,
  };
}

function successor(overrides = {}) {
  return {
    id: "refresh-b", userId: "founder", deviceId: "iphone-1", sessionId: "session-1", familyId: "family-1",
    usedAt: null, revokedAt: null, ...overrides,
  };
}

function accessResponse(overrides = {}) {
  return {
    id: "access-b", userId: "founder", deviceId: "iphone-1", sessionId: "session-1", familyId: "family-1",
    firstUsedAt: null, revokedAt: null, ...overrides,
  };
}

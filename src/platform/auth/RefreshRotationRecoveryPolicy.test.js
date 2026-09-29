import { describe, expect, it } from "vitest";
import {
  classifyRefreshRotation,
  RefreshRotationDecision,
  RefreshRotationReason,
} from "./RefreshRotationRecoveryPolicy";

const NOW = new Date("2026-09-28T15:32:30.000Z");
const ATTEMPT_A = "a".repeat(64);
const ATTEMPT_B = "b".repeat(64);

describe("retry-safe refresh rotation architecture", () => {
  it("rotates an unused live credential normally", () => {
    expect(classify({ current: current({ usedAt: null, rotationAttemptDigest: null }) })).toEqual({
      action: RefreshRotationDecision.ROTATE,
      reason: RefreshRotationReason.CURRENT_UNUSED,
    });
  });

  it("replays the exact already-issued response after a lost reply", () => {
    expect(classify()).toEqual({
      action: RefreshRotationDecision.REPLAY_EXACT_RESPONSE,
      reason: RefreshRotationReason.EXACT_ATTEMPT_RETRY,
    });
  });

  it("supports repeated lost replies without creating another successor", () => {
    expect(classify()).toEqual(classify());
    expect(classify().action).toBe(RefreshRotationDecision.REPLAY_EXACT_RESPONSE);
  });

  it("revokes when an old credential is replayed with a different attempt", () => {
    expect(classify({ presentedAttemptDigest: ATTEMPT_B })).toMatchObject({
      action: RefreshRotationDecision.REVOKE_FAMILY,
      reason: RefreshRotationReason.ATTEMPT_MISMATCH,
    });
  });

  it("revokes an exact retry outside the server-clock recovery window", () => {
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

  it("revokes concurrent refreshes that use different attempt identities", () => {
    const first = classify();
    const competing = classify({ presentedAttemptDigest: ATTEMPT_B });
    expect(first.action).toBe(RefreshRotationDecision.REPLAY_EXACT_RESPONSE);
    expect(competing.action).toBe(RefreshRotationDecision.REVOKE_FAMILY);
  });

  it("rejects a revoked session or device without recovery", () => {
    for (const state of [
      current({ sessionStatus: "revoked" }),
      current({ deviceStatus: "revoked" }),
      current({ revokedAt: "2026-09-28T15:32:29.000Z" }),
    ]) {
      expect(classify({ current: state })).toMatchObject({
        action: RefreshRotationDecision.REJECT_REVOKED,
        reason: RefreshRotationReason.CREDENTIAL_OR_AUTHORITY_REVOKED,
      });
    }
  });

  it("rejects an expired credential using server time", () => {
    expect(classify({ current: current({ idleExpiresAt: NOW }) })).toMatchObject({
      action: RefreshRotationDecision.REJECT_EXPIRED,
      reason: RefreshRotationReason.CREDENTIAL_EXPIRED,
    });
  });

  it("revokes if the successor belongs to another device or family", () => {
    for (const state of [successor({ deviceId: "other-device" }), successor({ familyId: "other-family" })]) {
      expect(classify({ successor: state })).toMatchObject({
        action: RefreshRotationDecision.REVOKE_FAMILY,
        reason: RefreshRotationReason.SUCCESSOR_AUTHORITY_MISMATCH,
      });
    }
  });

  it("revokes rather than regenerating when the original access response is unavailable", () => {
    expect(classify({ accessResponse: null })).toMatchObject({
      action: RefreshRotationDecision.REVOKE_FAMILY,
      reason: RefreshRotationReason.ACCESS_RESPONSE_UNAVAILABLE,
    });
  });

  it("never accepts raw credentials or emits secret material", () => {
    const result = classify();
    expect(Object.keys(result).sort()).toEqual(["action", "reason"]);
    expect(JSON.stringify(result)).not.toContain("refresh-token");
    expect(JSON.stringify(result)).not.toContain("access-token");
  });
});

function classify(overrides = {}) {
  return classifyRefreshRotation({
    current: current(),
    successor: successor(),
    accessResponse: accessResponse(),
    presentedAttemptDigest: ATTEMPT_A,
    now: NOW,
    ...overrides,
  });
}

function current(overrides = {}) {
  return {
    id: "refresh-a",
    userId: "founder",
    deviceId: "iphone-1",
    sessionId: "session-1",
    familyId: "family-1",
    usedAt: "2026-09-28T15:32:28.000Z",
    revokedAt: null,
    idleExpiresAt: "2026-10-28T15:32:28.000Z",
    absoluteExpiresAt: "2026-12-27T15:32:28.000Z",
    sessionStatus: "active",
    deviceStatus: "active",
    rotationAttemptDigest: ATTEMPT_A,
    replacedById: "refresh-b",
    rotationAccessCredentialId: "access-b",
    ...overrides,
  };
}

function successor(overrides = {}) {
  return {
    id: "refresh-b",
    userId: "founder",
    deviceId: "iphone-1",
    sessionId: "session-1",
    familyId: "family-1",
    usedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

function accessResponse(overrides = {}) {
  return {
    id: "access-b",
    userId: "founder",
    deviceId: "iphone-1",
    sessionId: "session-1",
    familyId: "family-1",
    expiresAt: "2026-09-28T15:42:28.000Z",
    revokedAt: null,
    ...overrides,
  };
}

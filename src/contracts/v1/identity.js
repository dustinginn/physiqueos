import { requireResourceId } from "./identifiers";
import { normalizeAggregateVersion } from "./command";

export const CredentialKind = Object.freeze({ ACCESS: "access", REFRESH: "refresh", RECOVERY: "recovery" });
export const RevocationState = Object.freeze({ ACTIVE: "active", REVOKED: "revoked", EXPIRED: "expired" });

export function createUserIdentity({ id, profileId, version = "1" } = {}) {
  return Object.freeze({ id: requireResourceId(id, "userId"), profileId: requireResourceId(profileId, "profileId"), version: normalizeAggregateVersion(version) });
}

export function createDeviceIdentity({ id, ownerUserId, version = "1", revocationState = RevocationState.ACTIVE } = {}) {
  assertRevocationState(revocationState);
  return Object.freeze({ id: requireResourceId(id, "deviceId"), ownerUserId: requireResourceId(ownerUserId, "ownerUserId"), version: normalizeAggregateVersion(version), revocationState });
}

export function createSessionIdentity({ id, ownerUserId, deviceId, revocationState = RevocationState.ACTIVE } = {}) {
  assertRevocationState(revocationState);
  return Object.freeze({ id: requireResourceId(id, "sessionId"), ownerUserId: requireResourceId(ownerUserId, "ownerUserId"), deviceId: requireResourceId(deviceId, "deviceId"), revocationState });
}

export function createCredentialIdentity({ id, sessionId = null, ownerUserId, deviceId = null, kind, hashAlgorithm, expiresAt, revocationState = RevocationState.ACTIVE } = {}) {
  if (!Object.values(CredentialKind).includes(kind)) throw new Error("Credential kind is invalid.");
  if (!hashAlgorithm || !expiresAt) throw new Error("Credential hash algorithm and expiry are required.");
  assertRevocationState(revocationState);
  return Object.freeze({
    id: requireResourceId(id, "credentialId"),
    sessionId: sessionId == null ? null : requireResourceId(sessionId, "sessionId"),
    ownerUserId: requireResourceId(ownerUserId, "ownerUserId"),
    deviceId: deviceId == null ? null : requireResourceId(deviceId, "deviceId"),
    kind,
    hashAlgorithm: String(hashAlgorithm),
    expiresAt: String(expiresAt),
    revocationState,
  });
}

function assertRevocationState(value) {
  if (!Object.values(RevocationState).includes(value)) throw new Error("Revocation state is invalid.");
}

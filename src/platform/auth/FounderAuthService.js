import { ApplicationProblem } from "../../contracts/v1/problem.js";
import { createUuidV7 } from "../../contracts/v1/identifiers.js";
import { createAuthenticationPrincipal, requireAuthenticationPrincipal } from "../../application/auth/principal.js";
import { generateHighEntropyCredential, hashHighEntropyCredential, HIGH_ENTROPY_CREDENTIAL_HASH } from "./credentialHash.js";

const ACCESS_LIFETIME_MS = 10 * 60 * 1000;
const REFRESH_IDLE_MS = 30 * 24 * 60 * 60 * 1000;
const REFRESH_ABSOLUTE_MS = 90 * 24 * 60 * 60 * 1000;
const PAIRING_LIFETIME_MS = 10 * 60 * 1000;

export function createFounderAuthService({ transactionRunner, credentialPepper, clock = () => new Date(), createId = () => createUuidV7(), createSecret = () => generateHighEntropyCredential() }) {
  if (!transactionRunner?.run) throw new Error("An authentication transaction runner is required.");
  if (typeof credentialPepper !== "string" || credentialPepper.length < 32) throw new Error("A server-held credential pepper is required.");

  async function enrollFounder({ displayName, timeZone }) {
    if (!String(displayName ?? "").trim() || !String(timeZone ?? "").trim()) throw invalidAuthRequest();
    return transactionRunner.run(async (transaction) => {
      if (!(await transaction.identity.lockFounderEnrollment())) {
        throw new ApplicationProblem({ status: 409, code: "FOUNDER_ALREADY_ENROLLED", title: "Founder enrollment is already complete." });
      }
      const userId = createId();
      const profileId = createId();
      const recoveryCredential = createSecret();
      await transaction.identity.createUserProfile({ userId, profileId, displayName: displayName.trim(), timeZone: timeZone.trim() });
      await transaction.identity.createRecoveryCredential({
        id: createId(), userId, credentialHash: hash(recoveryCredential), hashAlgorithm: HIGH_ENTROPY_CREDENTIAL_HASH, expiresAt: null,
      });
      return Object.freeze({ userId, profileId, recoveryCredential });
    });
  }

  async function issuePairingCredential({ principal }) {
    const actor = requireAuthenticationPrincipal(principal);
    return transactionRunner.run(async (transaction) => {
      const credential = createSecret();
      const now = clock();
      const expiresAt = new Date(now.getTime() + PAIRING_LIFETIME_MS);
      await transaction.identity.createPairingCredential({
        id: createId(), userId: actor.userId, issuedBySessionId: actor.sessionId,
        credentialHash: hash(credential), hashAlgorithm: HIGH_ENTROPY_CREDENTIAL_HASH, expiresAt,
      });
      return Object.freeze({ pairingCredential: credential, expiresAt: expiresAt.toISOString() });
    });
  }

  async function issuePairingCredentialWithRecovery({ recoveryCredential, expectedUserId }) {
    const credentialHash = safeHash(recoveryCredential);
    if (!String(expectedUserId ?? "").trim()) throw invalidAuthRequest();
    return transactionRunner.run(async (transaction) => {
      const now = clock();
      const recovery = await transaction.identity.findRecoveryCredentialForUse(credentialHash);
      validateRecoveryRecord(recovery, now);
      if (recovery.user_id !== expectedUserId) throw invalidCredential("RECOVERY_CREDENTIAL_INVALID");
      if (await transaction.identity.findPairingCredentialByRecoveryCredentialId(recovery.id)) {
        throw new ApplicationProblem({
          status: 409,
          code: "BOOTSTRAP_PAIRING_ALREADY_ISSUED",
          title: "A bootstrap pairing credential was already issued.",
        });
      }
      const credential = createSecret();
      const expiresAt = new Date(now.getTime() + PAIRING_LIFETIME_MS);
      await transaction.identity.createPairingCredentialWithRecoveryIssuer({
        id: createId(),
        userId: recovery.user_id,
        issuedBySessionId: null,
        issuedByRecoveryCredentialId: recovery.id,
        credentialHash: hash(credential),
        hashAlgorithm: HIGH_ENTROPY_CREDENTIAL_HASH,
        expiresAt,
      });
      return Object.freeze({ pairingCredential: credential, expiresAt: expiresAt.toISOString() });
    });
  }

  async function registerDeviceWithPairing({ pairingCredential, platform, displayName }) {
    const credentialHash = safeHash(pairingCredential);
    return transactionRunner.run(async (transaction) => {
      const now = clock();
      const pairing = await transaction.identity.consumePairingCredential({ credentialHash, at: now });
      if (!pairing) throw invalidCredential("PAIRING_CREDENTIAL_INVALID");
      const deviceId = createId();
      await transaction.identity.createDevice({ id: deviceId, userId: pairing.user_id, platform, displayName });
      return issueSessionWithinTransaction(transaction, { userId: pairing.user_id, deviceId, authenticatedAt: now });
    });
  }

  async function createSession({ userId, deviceId }) {
    return transactionRunner.run((transaction) => issueSessionWithinTransaction(transaction, { userId, deviceId, authenticatedAt: clock() }));
  }

  async function authenticateAccessToken(accessToken) {
    const credentialHash = safeHash(accessToken);
    return transactionRunner.run(async (transaction) => {
      const now = clock();
      const row = await transaction.identity.findAccessCredentialForAuthentication(credentialHash);
      validateAccessRecord(row, now);
      await transaction.identity.updateDeviceSeen({ deviceId: row.device_id, sessionId: row.session_id, at: now });
      return createAuthenticationPrincipal({
        userId: row.user_id, deviceId: row.device_id, sessionId: row.session_id,
        scopes: ["founder:read", "founder:write", "platform:operate"], authenticatedAt: now.toISOString(),
      });
    });
  }

  async function rotateRefreshCredential(refreshCredential) {
    const credentialHash = safeHash(refreshCredential);
    const result = await transactionRunner.run(async (transaction) => {
      const now = clock();
      const current = await transaction.identity.lockRefreshCredential(credentialHash);
      if (!current) throw invalidCredential("REFRESH_CREDENTIAL_INVALID");
      if (current.used_at) {
        await transaction.identity.revokeRefreshFamily({ userId: current.user_id, familyId: current.family_id, at: now });
        return Object.freeze({ refreshReuseDetected: true });
      }
      validateRefreshRecord(current, now);
      const accessCredential = createSecret();
      const nextRefreshCredential = createSecret();
      const accessExpiresAt = new Date(now.getTime() + ACCESS_LIFETIME_MS);
      const idleExpiresAt = minDate(new Date(now.getTime() + REFRESH_IDLE_MS), new Date(current.absolute_expires_at));
      const accessRecord = {
        id: createId(), userId: current.user_id, deviceId: current.device_id, sessionId: current.session_id,
        credentialHash: hash(accessCredential), hashAlgorithm: HIGH_ENTROPY_CREDENTIAL_HASH, expiresAt: accessExpiresAt,
      };
      const refreshRecord = {
        id: createId(), userId: current.user_id, deviceId: current.device_id, sessionId: current.session_id,
        familyId: current.family_id, credentialHash: hash(nextRefreshCredential), hashAlgorithm: HIGH_ENTROPY_CREDENTIAL_HASH,
        idleExpiresAt, absoluteExpiresAt: current.absolute_expires_at, createdAt: now,
      };
      await transaction.identity.createAccessCredential(accessRecord);
      await transaction.identity.replaceRefreshCredential({ previousId: current.id, next: refreshRecord });
      return Object.freeze({ accessToken: accessCredential, accessExpiresAt: accessExpiresAt.toISOString(), refreshCredential: nextRefreshCredential, refreshIdleExpiresAt: idleExpiresAt.toISOString(), sessionId: current.session_id });
    });
    if (result.refreshReuseDetected) {
      throw new ApplicationProblem({ status: 401, code: "REFRESH_REUSE_DETECTED", title: "This device session was revoked after refresh credential reuse." });
    }
    return result;
  }

  async function revokeSession({ principal }) {
    const actor = requireAuthenticationPrincipal(principal);
    return transactionRunner.run((transaction) => transaction.identity.revokeSession({ sessionId: actor.sessionId, userId: actor.userId, at: clock() }));
  }

  async function revokeDevice({ principal, deviceId }) {
    const actor = requireAuthenticationPrincipal(principal);
    return transactionRunner.run((transaction) => transaction.identity.revokeDevice({ deviceId, userId: actor.userId, at: clock() }));
  }

  async function useRecoveryCredential(recoveryCredential) {
    const credentialHash = safeHash(recoveryCredential);
    return transactionRunner.run(async (transaction) => {
      const now = clock();
      const row = await transaction.identity.findRecoveryCredentialForUse(credentialHash);
      validateRecoveryRecord(row, now);
      await transaction.identity.consumeRecoveryCredential({ id: row.id, at: now });
      await transaction.identity.revokeAllSessions({ userId: row.user_id, at: now });
      return Object.freeze({ userId: row.user_id, recoveryRequired: true, canonicalDataDeleted: false });
    });
  }

  async function recoverFounder({ recoveryCredential, platform, displayName }) {
    const credentialHash = safeHash(recoveryCredential);
    return transactionRunner.run(async (transaction) => {
      const now = clock();
      const row = await transaction.identity.findRecoveryCredentialForUse(credentialHash);
      validateRecoveryRecord(row, now);
      await transaction.identity.consumeRecoveryCredential({ id: row.id, at: now });
      await transaction.identity.revokeAllSessions({ userId: row.user_id, at: now });
      const deviceId = createId();
      await transaction.identity.createDevice({ id: deviceId, userId: row.user_id, platform, displayName });
      const nextRecoveryCredential = createSecret();
      await transaction.identity.createRecoveryCredential({ id: createId(), userId: row.user_id, credentialHash: hash(nextRecoveryCredential), hashAlgorithm: HIGH_ENTROPY_CREDENTIAL_HASH, expiresAt: null });
      const session = await issueSessionWithinTransaction(transaction, { userId: row.user_id, deviceId, authenticatedAt: now });
      return Object.freeze({ ...session, userId: row.user_id, deviceId, recoveryCredential: nextRecoveryCredential, canonicalDataDeleted: false });
    });
  }

  async function issueSessionWithinTransaction(transaction, { userId, deviceId, authenticatedAt }) {
    const sessionId = createId();
    const refreshFamilyId = createId();
    const accessCredential = createSecret();
    const refreshCredential = createSecret();
    const accessExpiresAt = new Date(authenticatedAt.getTime() + ACCESS_LIFETIME_MS);
    const refreshIdleExpiresAt = new Date(authenticatedAt.getTime() + REFRESH_IDLE_MS);
    const refreshAbsoluteExpiresAt = new Date(authenticatedAt.getTime() + REFRESH_ABSOLUTE_MS);
    await transaction.identity.createSession({ id: sessionId, userId, deviceId, authenticatedAt, idleExpiresAt: refreshIdleExpiresAt, absoluteExpiresAt: refreshAbsoluteExpiresAt, refreshFamilyId });
    await transaction.identity.createAccessCredential({ id: createId(), userId, deviceId, sessionId, credentialHash: hash(accessCredential), hashAlgorithm: HIGH_ENTROPY_CREDENTIAL_HASH, expiresAt: accessExpiresAt });
    await transaction.identity.createRefreshCredential({ id: createId(), userId, deviceId, sessionId, familyId: refreshFamilyId, credentialHash: hash(refreshCredential), hashAlgorithm: HIGH_ENTROPY_CREDENTIAL_HASH, idleExpiresAt: refreshIdleExpiresAt, absoluteExpiresAt: refreshAbsoluteExpiresAt });
    return Object.freeze({ sessionId, accessToken: accessCredential, accessExpiresAt: accessExpiresAt.toISOString(), refreshCredential, refreshIdleExpiresAt: refreshIdleExpiresAt.toISOString(), refreshAbsoluteExpiresAt: refreshAbsoluteExpiresAt.toISOString() });
  }

  function hash(secret) {
    return hashHighEntropyCredential(secret, { pepper: credentialPepper });
  }

  function safeHash(secret) {
    try { return hash(secret); } catch { throw invalidCredential("CREDENTIAL_MALFORMED"); }
  }

  return Object.freeze({ enrollFounder, issuePairingCredential, issuePairingCredentialWithRecovery, registerDeviceWithPairing, createSession, authenticateAccessToken, rotateRefreshCredential, revokeSession, revokeDevice, useRecoveryCredential, recoverFounder });
}

function validateAccessRecord(row, now) {
  if (!row) throw invalidCredential("ACCESS_TOKEN_INVALID");
  if (row.revoked_at || row.session_status !== "active" || row.device_status !== "active") throw invalidCredential("ACCESS_TOKEN_REVOKED");
  if (new Date(row.expires_at) <= now || new Date(row.idle_expires_at) <= now || new Date(row.absolute_expires_at) <= now) throw invalidCredential("ACCESS_TOKEN_EXPIRED");
}

function validateRefreshRecord(row, now) {
  if (row.revoked_at || row.session_status !== "active" || row.device_status !== "active") throw invalidCredential("REFRESH_CREDENTIAL_REVOKED");
  if (new Date(row.idle_expires_at) <= now || new Date(row.absolute_expires_at) <= now) throw invalidCredential("REFRESH_CREDENTIAL_EXPIRED");
}
function validateRecoveryRecord(row, now) {
  if (!row || row.used_at || row.revoked_at || (row.expires_at && new Date(row.expires_at) <= now)) {
    throw invalidCredential("RECOVERY_CREDENTIAL_INVALID");
  }
}

function minDate(left, right) { return left <= right ? left : right; }
function invalidCredential(code) { return new ApplicationProblem({ status: 401, code, title: "The supplied authentication credential is unavailable." }); }
function invalidAuthRequest() { return new ApplicationProblem({ status: 400, code: "AUTH_REQUEST_INVALID", title: "The authentication request is invalid." }); }

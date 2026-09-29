import { ApplicationProblem } from "../../contracts/v1/problem.js";
import { createUuidV7 } from "../../contracts/v1/identifiers.js";
import { createAuthenticationPrincipal, requireAuthenticationPrincipal } from "../../application/auth/principal.js";
import { generateHighEntropyCredential, hashHighEntropyCredential, HIGH_ENTROPY_CREDENTIAL_HASH } from "./credentialHash.js";
import {
  assertHighEntropy,
  createSuccessorCommitment,
  digestRefreshProofValue,
  normalizeInstallationPublicKey,
  SENDER_CONSTRAINED_REFRESH_PROTOCOL,
  SENDER_CONSTRAINED_REFRESH_VERSION,
  verifyRefreshProof,
} from "./deviceBoundRefreshProof.js";

const ACCESS_LIFETIME_MS = 10 * 60 * 1000;
const REFRESH_IDLE_MS = 30 * 24 * 60 * 60 * 1000;
const REFRESH_ABSOLUTE_MS = 90 * 24 * 60 * 60 * 1000;
const PAIRING_LIFETIME_MS = 10 * 60 * 1000;
const REFRESH_PROOF_CHALLENGE_LIFETIME_MS = 2 * 60 * 1000;
const REFRESH_RECOVERY_WINDOW_MS = 2 * 60 * 1000;
const MAXIMUM_REFRESH_RECOVERIES = 2;
export const FOUNDER_PRODUCTION_AUTHORITY = "founder-production";

export function createFounderAuthService({
  transactionRunner,
  credentialPepper,
  allowSenderConstrainedEnrollment = false,
  refreshRecoveryWindowMs = REFRESH_RECOVERY_WINDOW_MS,
  maximumRefreshRecoveries = MAXIMUM_REFRESH_RECOVERIES,
  clock = () => new Date(),
  createId = () => createUuidV7(),
  createSecret = () => generateHighEntropyCredential(),
}) {
  if (!transactionRunner?.run) throw new Error("An authentication transaction runner is required.");
  if (typeof credentialPepper !== "string" || credentialPepper.length < 32) throw new Error("A server-held credential pepper is required.");
  if (!Number.isSafeInteger(refreshRecoveryWindowMs) || refreshRecoveryWindowMs <= 0) throw new Error("A positive refresh recovery window is required.");
  if (!Number.isSafeInteger(maximumRefreshRecoveries) || maximumRefreshRecoveries <= 0) throw new Error("A positive refresh recovery limit is required.");

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

  async function issuePairingCredentialFromFounderWeb({ userId, authority, correlationId = null }) {
    if (authority !== FOUNDER_PRODUCTION_AUTHORITY || !String(userId ?? "").trim()) {
      throw authorityUnavailable();
    }
    return transactionRunner.run(async (transaction) => {
      const owner = await transaction.identity.findUser(userId);
      if (!owner) throw authorityUnavailable();

      const now = clock();
      const expiresAt = new Date(now.getTime() + PAIRING_LIFETIME_MS);
      const issuerDeviceId = createId();
      const issuerSessionId = createId();
      const pairingCredentialId = createId();
      const pairingCredential = createSecret();

      // Production Founder web sessions are stateless, while the production
      // pairing schema requires a session issuer. Represent this web
      // authorization with a credential-free internal session, bind the
      // pairing row to it, and revoke it in the same transaction. The issuer
      // can never authenticate and the short-lived pairing remains the only
      // secret returned to the authenticated Founder.
      await transaction.identity.createDevice({
        id: issuerDeviceId,
        userId,
        platform: "founder-web",
        displayName: "Founder web pairing issuer",
      });
      await transaction.identity.createSession({
        id: issuerSessionId,
        userId,
        deviceId: issuerDeviceId,
        authenticatedAt: now,
        idleExpiresAt: expiresAt,
        absoluteExpiresAt: expiresAt,
        refreshFamilyId: createId(),
      });
      await transaction.identity.createPairingCredential({
        id: pairingCredentialId,
        userId,
        issuedBySessionId: issuerSessionId,
        credentialHash: hash(pairingCredential),
        hashAlgorithm: HIGH_ENTROPY_CREDENTIAL_HASH,
        expiresAt,
      });
      await transaction.identity.revokeDevice({ deviceId: issuerDeviceId, userId, at: now });
      await transaction.identity.recordSecurityEvent({
        id: createId(),
        userId,
        eventType: "native_pairing_credential_issued",
        outcome: "accepted",
        correlationId,
        details: {
          authority: FOUNDER_PRODUCTION_AUTHORITY,
          channel: "founder_web_session",
          pairingCredentialId,
          issuerDeviceId,
          issuerSessionId,
          expiresAt: expiresAt.toISOString(),
        },
      });
      return Object.freeze({
        pairingCredential,
        authority: FOUNDER_PRODUCTION_AUTHORITY,
        issuedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
      });
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

  async function registerDeviceWithPairing({ pairingCredential, platform, displayName, refreshProof = null }) {
    const credentialHash = safeHash(pairingCredential);
    const installationKey = refreshProof && allowSenderConstrainedEnrollment
      ? normalizeInstallationPublicKey(refreshProof)
      : null;
    return transactionRunner.run(async (transaction) => {
      const now = clock();
      const pairing = await transaction.identity.consumePairingCredential({ credentialHash, at: now });
      if (!pairing) throw invalidCredential("PAIRING_CREDENTIAL_INVALID");
      const deviceId = createId();
      await transaction.identity.createDevice({
        id: deviceId,
        userId: pairing.user_id,
        platform,
        displayName,
        refreshProofCapability: installationKey ? SENDER_CONSTRAINED_REFRESH_VERSION : 0,
      });
      let installationKeyId = null;
      if (installationKey) {
        installationKeyId = createId();
        await transaction.identity.createInstallationSigningKey({
          id: installationKeyId,
          userId: pairing.user_id,
          deviceId,
          ...installationKey,
        });
      }
      const session = await issueSessionWithinTransaction(transaction, {
        userId: pairing.user_id,
        deviceId,
        authenticatedAt: now,
        installationKeyId,
      });
      await transaction.identity.recordSecurityEvent({
        id: createId(),
        userId: pairing.user_id,
        deviceId,
        sessionId: session.sessionId,
        eventType: "native_pairing_credential_consumed",
        outcome: "accepted",
        details: {
          pairingCredentialId: pairing.id,
          platform,
          refreshProofVersion: installationKey ? SENDER_CONSTRAINED_REFRESH_VERSION : 0,
        },
      });
      return Object.freeze({
        ...session,
        deviceId,
        authProtocol: installationKey ? SENDER_CONSTRAINED_REFRESH_PROTOCOL : "legacy-refresh-v1",
      });
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
      await transaction.identity.markAccessCredentialUsed({ id: row.id, at: now });
      await transaction.identity.updateDeviceSeen({ deviceId: row.device_id, sessionId: row.session_id, at: now });
      return createAuthenticationPrincipal({
        userId: row.user_id, deviceId: row.device_id, sessionId: row.session_id,
        scopes: ["founder:read", "founder:write", "platform:operate"], authenticatedAt: now.toISOString(),
      });
    });
  }

  async function issueRefreshProofChallenge({ refreshCredential, rotationIntentId, successorCommitment }) {
    const credentialHash = safeHash(refreshCredential);
    try {
      assertHighEntropy(rotationIntentId, "rotation intent");
      assertHighEntropy(successorCommitment, "successor commitment");
    } catch {
      throw invalidAuthRequest();
    }
    return transactionRunner.run(async (transaction) => {
      const now = clock();
      const current = await transaction.identity.lockRefreshCredential(credentialHash);
      if (!current) throw invalidCredential("REFRESH_CREDENTIAL_INVALID");
      validateRefreshRecord(current, now);
      requireProofBoundRefresh(current);
      const nonce = createSecret();
      const expiresAt = new Date(now.getTime() + REFRESH_PROOF_CHALLENGE_LIFETIME_MS);
      const challengeId = createId();
      await transaction.identity.createRefreshProofChallenge({
        id: challengeId,
        userId: current.user_id,
        deviceId: current.device_id,
        sessionId: current.session_id,
        familyId: current.family_id,
        refreshCredentialId: current.id,
        installationKeyId: current.installation_key_id,
        nonceDigest: proofDigest(nonce, "refresh-nonce"),
        intentDigest: proofDigest(rotationIntentId, "refresh-intent"),
        successorCommitmentDigest: proofDigest(successorCommitment, "refresh-successor-commitment"),
        expiresAt,
      });
      return Object.freeze({
        proofVersion: SENDER_CONSTRAINED_REFRESH_VERSION,
        challengeId,
        nonce,
        expiresAt: expiresAt.toISOString(),
      });
    });
  }

  async function rotateRefreshCredential(input) {
    const request = typeof input === "string" ? { refreshCredential: input } : input;
    const credentialHash = safeHash(request?.refreshCredential);
    const result = await transactionRunner.run(async (transaction) => {
      const now = clock();
      const current = await transaction.identity.lockRefreshCredential(credentialHash);
      if (!current) throw invalidCredential("REFRESH_CREDENTIAL_INVALID");
      if (Number(current.refresh_proof_version ?? 0) === SENDER_CONSTRAINED_REFRESH_VERSION) {
        validateRefreshRecord(current, now);
        return rotateProofBoundRefresh(transaction, { current, request, now });
      }
      if (request?.proof || request?.rotationIntentId || request?.successorRefreshCredential) {
        throw invalidCredential("REFRESH_PROTOCOL_MISMATCH");
      }
      if (current.used_at) return revokeRefreshReuse(transaction, current, now, "legacy_reuse");
      validateRefreshRecord(current, now);
      return rotateLegacyRefresh(transaction, current, now);
    });
    if (result.refreshReuseDetected) {
      throw new ApplicationProblem({ status: 401, code: "REFRESH_REUSE_DETECTED", title: "This device session was revoked after refresh credential reuse." });
    }
    if (result.reauthenticationRequired) {
      throw new ApplicationProblem({ status: 401, code: "SESSION_REAUTHENTICATION_REQUIRED", title: "Reconnect this trusted installation to continue." });
    }
    return result;
  }

  async function rotateLegacyRefresh(transaction, current, now) {
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
      return Object.freeze({
        accessToken: accessCredential,
        accessExpiresAt: accessExpiresAt.toISOString(),
        refreshCredential: nextRefreshCredential,
        refreshIdleExpiresAt: idleExpiresAt.toISOString(),
        sessionId: current.session_id,
        deviceId: current.device_id,
        authProtocol: "legacy-refresh-v1",
      });
  }

  async function rotateProofBoundRefresh(transaction, { current, request, now }) {
    const proof = request?.proof;
    if (!proof || typeof proof !== "object") throw invalidDeviceProof();
    for (const [label, value] of [
      ["rotation intent", request.rotationIntentId],
      ["successor refresh credential", request.successorRefreshCredential],
      ["successor commitment", request.successorCommitment],
      ["Server nonce", proof.nonce],
      ["proof identity", proof.proofId],
    ]) {
      try { assertHighEntropy(value, label); } catch { throw invalidDeviceProof(); }
    }
    let expectedCommitment;
    try { expectedCommitment = createSuccessorCommitment(request.successorRefreshCredential); } catch { throw invalidDeviceProof(); }
    if (!secureTextEqual(expectedCommitment, request.successorCommitment)) throw invalidDeviceProof();

    const intentDigest = proofDigest(request.rotationIntentId, "refresh-intent");
    const commitmentDigest = proofDigest(request.successorCommitment, "refresh-successor-commitment");
    const challenge = await transaction.identity.lockRefreshProofChallenge({
      id: String(proof.challengeId ?? ""),
      nonceDigest: proofDigest(proof.nonce, "refresh-nonce"),
    });
    if (!challenge || challenge.consumed_at || new Date(challenge.expires_at) <= now ||
        challenge.refresh_credential_id !== current.id || challenge.user_id !== current.user_id ||
        challenge.device_id !== current.device_id || challenge.session_id !== current.session_id ||
        challenge.family_id !== current.family_id || challenge.installation_key_id !== current.installation_key_id ||
        !secureTextEqual(challenge.intent_digest, intentDigest) ||
        !secureTextEqual(challenge.successor_commitment_digest, commitmentDigest)) {
      throw invalidDeviceProof();
    }
    if (current.installation_key_status !== "active" || !current.public_key_spki ||
        !verifyRefreshProof({
          publicKeySpki: current.public_key_spki,
          signature: proof.signature,
          refreshCredential: request.refreshCredential,
          rotationIntentId: request.rotationIntentId,
          successorRefreshCredential: request.successorRefreshCredential,
          successorCommitment: request.successorCommitment,
          nonce: proof.nonce,
          proofId: proof.proofId,
        })) throw invalidDeviceProof();

    let consumed;
    try {
      consumed = await transaction.identity.consumeRefreshProofChallenge({
        id: challenge.id,
        proofIdDigest: proofDigest(proof.proofId, "refresh-proof-id"),
        at: now,
      });
    } catch (error) {
      if (error?.code === "23505") throw invalidDeviceProof();
      throw error;
    }
    if (!consumed) throw invalidDeviceProof();

    if (!current.used_at) {
      return commitProofBoundRotation(transaction, {
        current,
        now,
        successorRefreshCredential: request.successorRefreshCredential,
        intentDigest,
        commitmentDigest,
      });
    }
    return recoverProofBoundRotation(transaction, {
      current,
      now,
      successorRefreshCredential: request.successorRefreshCredential,
      intentDigest,
      commitmentDigest,
    });
  }

  async function commitProofBoundRotation(transaction, {
    current, now, successorRefreshCredential, intentDigest, commitmentDigest,
  }) {
    const accessCredential = createSecret();
    const accessExpiresAt = new Date(now.getTime() + ACCESS_LIFETIME_MS);
    const idleExpiresAt = minDate(new Date(now.getTime() + REFRESH_IDLE_MS), new Date(current.absolute_expires_at));
    const accessId = createId();
    const successorId = createId();
    const exchangeId = createId();
    await transaction.identity.createAccessCredential({
      id: accessId, userId: current.user_id, deviceId: current.device_id, sessionId: current.session_id,
      credentialHash: hash(accessCredential), hashAlgorithm: HIGH_ENTROPY_CREDENTIAL_HASH, expiresAt: accessExpiresAt,
    });
    await transaction.identity.replaceRefreshCredential({
      previousId: current.id,
      next: {
        id: successorId, userId: current.user_id, deviceId: current.device_id, sessionId: current.session_id,
        familyId: current.family_id, credentialHash: hash(successorRefreshCredential),
        hashAlgorithm: HIGH_ENTROPY_CREDENTIAL_HASH, idleExpiresAt,
        absoluteExpiresAt: current.absolute_expires_at, createdAt: now,
      },
    });
    await transaction.identity.createRefreshExchange({
      id: exchangeId, userId: current.user_id, deviceId: current.device_id, sessionId: current.session_id,
      familyId: current.family_id, installationKeyId: current.installation_key_id,
      predecessorRefreshId: current.id, successorRefreshId: successorId,
      intentDigest, successorCommitmentDigest: commitmentDigest,
      recoveryExpiresAt: new Date(now.getTime() + refreshRecoveryWindowMs),
      maximumRecoveries: maximumRefreshRecoveries,
    });
    await transaction.identity.linkRefreshExchangeAccessCredential({ exchangeId, accessCredentialId: accessId });
    await recordRefreshSecurityEvent(transaction, current, "native_refresh_rotated", "accepted", {
      refreshProofVersion: SENDER_CONSTRAINED_REFRESH_VERSION,
      recoveryCount: 0,
    });
    return proofBoundSessionResponse({
      current, accessCredential, accessExpiresAt, successorRefreshCredential, idleExpiresAt, recovered: false,
    });
  }

  async function recoverProofBoundRotation(transaction, {
    current, now, successorRefreshCredential, intentDigest, commitmentDigest,
  }) {
    const exchange = await transaction.identity.lockRefreshExchangeByPredecessor(current.id);
    if (!exchange || exchange.user_id !== current.user_id || exchange.device_id !== current.device_id ||
        exchange.session_id !== current.session_id || exchange.family_id !== current.family_id ||
        exchange.installation_key_id !== current.installation_key_id ||
        !secureTextEqual(exchange.intent_digest, intentDigest) ||
        !secureTextEqual(exchange.successor_commitment_digest, commitmentDigest)) {
      return revokeRefreshReuse(transaction, current, now, "exchange_authority_mismatch");
    }
    const successor = await transaction.identity.lockRefreshCredentialById(exchange.successor_refresh_id);
    const accessCredentials = await transaction.identity.lockRefreshExchangeAccessCredentials(exchange.id);
    if (!successor || successor.user_id !== current.user_id || successor.device_id !== current.device_id ||
        successor.session_id !== current.session_id || successor.family_id !== current.family_id ||
        successor.used_at || successor.revoked_at || hash(successorRefreshCredential) !== successor.credential_hash) {
      return revokeRefreshReuse(transaction, current, now, "successor_unavailable");
    }
    if (accessCredentials.length === 0 || accessCredentials.some((credential) => credential.first_used_at)) {
      return revokeRefreshReuse(transaction, current, now, "exchange_access_used");
    }
    if (new Date(exchange.recovery_expires_at) < now) {
      return revokeRefreshReuse(transaction, current, now, "recovery_window_expired");
    }
    if (Number(exchange.recovery_count) >= Number(exchange.maximum_recoveries)) {
      await transaction.identity.revokeRefreshFamily({ userId: current.user_id, familyId: current.family_id, at: now });
      await recordRefreshSecurityEvent(transaction, current, "native_refresh_recovery_exhausted", "revoked", {
        recoveryCount: Number(exchange.recovery_count),
      });
      return Object.freeze({ reauthenticationRequired: true });
    }

    await transaction.identity.revokeRefreshExchangeAccessCredentials({ exchangeId: exchange.id, at: now });
    const accessCredential = createSecret();
    const accessId = createId();
    const accessExpiresAt = new Date(now.getTime() + ACCESS_LIFETIME_MS);
    await transaction.identity.createAccessCredential({
      id: accessId, userId: current.user_id, deviceId: current.device_id, sessionId: current.session_id,
      credentialHash: hash(accessCredential), hashAlgorithm: HIGH_ENTROPY_CREDENTIAL_HASH, expiresAt: accessExpiresAt,
    });
    await transaction.identity.linkRefreshExchangeAccessCredential({ exchangeId: exchange.id, accessCredentialId: accessId });
    const updated = await transaction.identity.incrementRefreshExchangeRecovery({ id: exchange.id, at: now });
    await recordRefreshSecurityEvent(transaction, current, "native_refresh_lost_response_recovered", "accepted", {
      recoveryCount: Number(updated.recovery_count),
    });
    return proofBoundSessionResponse({
      current,
      accessCredential,
      accessExpiresAt,
      successorRefreshCredential,
      idleExpiresAt: new Date(successor.idle_expires_at),
      recovered: true,
    });
  }

  async function revokeRefreshReuse(transaction, current, now, reason) {
    await transaction.identity.revokeRefreshFamily({ userId: current.user_id, familyId: current.family_id, at: now });
    await recordRefreshSecurityEvent(transaction, current, "native_refresh_reuse_detected", "revoked", { reason });
    return Object.freeze({ refreshReuseDetected: true });
  }

  async function recordRefreshSecurityEvent(transaction, current, eventType, outcome, details) {
    await transaction.identity.recordSecurityEvent({
      id: createId(), userId: current.user_id, deviceId: current.device_id, sessionId: current.session_id,
      eventType, outcome, details,
    });
  }

  function proofBoundSessionResponse({ current, accessCredential, accessExpiresAt, successorRefreshCredential, idleExpiresAt, recovered }) {
    return Object.freeze({
      accessToken: accessCredential,
      accessExpiresAt: accessExpiresAt.toISOString(),
      refreshCredential: successorRefreshCredential,
      refreshIdleExpiresAt: idleExpiresAt.toISOString(),
      sessionId: current.session_id,
      deviceId: current.device_id,
      authProtocol: SENDER_CONSTRAINED_REFRESH_PROTOCOL,
      recovered,
    });
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

  async function issueSessionWithinTransaction(transaction, { userId, deviceId, authenticatedAt, installationKeyId = null }) {
    const sessionId = createId();
    const refreshFamilyId = createId();
    const accessCredential = createSecret();
    const refreshCredential = createSecret();
    const accessExpiresAt = new Date(authenticatedAt.getTime() + ACCESS_LIFETIME_MS);
    const refreshIdleExpiresAt = new Date(authenticatedAt.getTime() + REFRESH_IDLE_MS);
    const refreshAbsoluteExpiresAt = new Date(authenticatedAt.getTime() + REFRESH_ABSOLUTE_MS);
    await transaction.identity.createSession({
      id: sessionId, userId, deviceId, authenticatedAt, idleExpiresAt: refreshIdleExpiresAt,
      absoluteExpiresAt: refreshAbsoluteExpiresAt, refreshFamilyId,
      refreshProofVersion: installationKeyId ? SENDER_CONSTRAINED_REFRESH_VERSION : 0,
      installationKeyId,
    });
    await transaction.identity.createAccessCredential({ id: createId(), userId, deviceId, sessionId, credentialHash: hash(accessCredential), hashAlgorithm: HIGH_ENTROPY_CREDENTIAL_HASH, expiresAt: accessExpiresAt });
    await transaction.identity.createRefreshCredential({ id: createId(), userId, deviceId, sessionId, familyId: refreshFamilyId, credentialHash: hash(refreshCredential), hashAlgorithm: HIGH_ENTROPY_CREDENTIAL_HASH, idleExpiresAt: refreshIdleExpiresAt, absoluteExpiresAt: refreshAbsoluteExpiresAt });
    return Object.freeze({
      sessionId, accessToken: accessCredential, accessExpiresAt: accessExpiresAt.toISOString(),
      refreshCredential, refreshIdleExpiresAt: refreshIdleExpiresAt.toISOString(),
      refreshAbsoluteExpiresAt: refreshAbsoluteExpiresAt.toISOString(),
    });
  }

  function hash(secret) {
    return hashHighEntropyCredential(secret, { pepper: credentialPepper });
  }

  function safeHash(secret) {
    try { return hash(secret); } catch { throw invalidCredential("CREDENTIAL_MALFORMED"); }
  }

  function proofDigest(value, domain) {
    return digestRefreshProofValue(value, { pepper: credentialPepper, domain });
  }

  return Object.freeze({
    enrollFounder, issuePairingCredential, issuePairingCredentialFromFounderWeb,
    issuePairingCredentialWithRecovery, registerDeviceWithPairing, createSession,
    authenticateAccessToken, issueRefreshProofChallenge, rotateRefreshCredential,
    revokeSession, revokeDevice, useRecoveryCredential, recoverFounder,
  });
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
function requireProofBoundRefresh(row) {
  if (Number(row.refresh_proof_version ?? 0) !== SENDER_CONSTRAINED_REFRESH_VERSION ||
      !row.installation_key_id || row.installation_key_status !== "active" || !row.public_key_spki) {
    throw invalidCredential("REFRESH_PROOF_UNAVAILABLE");
  }
}
function validateRecoveryRecord(row, now) {
  if (!row || row.used_at || row.revoked_at || (row.expires_at && new Date(row.expires_at) <= now)) {
    throw invalidCredential("RECOVERY_CREDENTIAL_INVALID");
  }
}

function minDate(left, right) { return left <= right ? left : right; }
function invalidCredential(code) { return new ApplicationProblem({ status: 401, code, title: "The supplied authentication credential is unavailable." }); }
function invalidAuthRequest() { return new ApplicationProblem({ status: 400, code: "AUTH_REQUEST_INVALID", title: "The authentication request is invalid." }); }
function invalidDeviceProof() { return new ApplicationProblem({ status: 401, code: "DEVICE_PROOF_INVALID", title: "Fresh proof from the paired installation is required." }); }
function authorityUnavailable() { return new ApplicationProblem({ status: 403, code: "FOUNDER_PRODUCTION_AUTHORITY_UNAVAILABLE", title: "Founder production pairing is unavailable for this session." }); }
function secureTextEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

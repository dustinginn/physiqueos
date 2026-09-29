import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createFounderAuthService } from "./FounderAuthService.js";
import { hashHighEntropyCredential } from "./credentialHash.js";
import {
  createRefreshProofMessage,
  createSuccessorCommitment,
  SENDER_CONSTRAINED_REFRESH_PROTOCOL,
} from "./deviceBoundRefreshProof.js";

const PEPPER = "sender-constrained-test-pepper".repeat(3);
const START = new Date("2026-09-29T12:00:00.000Z");

describe("sender-constrained persistent pairing threat matrix", () => {
  it("keeps Build 69 on strict legacy rotation until enrollment is enabled", async () => {
    const current = harness({ allowSenderConstrainedEnrollment: false });
    const pair = await current.pair({ offerProof: true });
    expect(pair.authProtocol).toBe("legacy-refresh-v1");

    const rotated = await current.service.rotateRefreshCredential(pair.refreshCredential);
    expect(rotated.authProtocol).toBe("legacy-refresh-v1");
    await expect(current.service.rotateRefreshCredential(pair.refreshCredential)).rejects.toMatchObject({
      code: "REFRESH_REUSE_DETECTED",
    });
  });

  it("enrolls a P-256 installation key and completes normal rotation", async () => {
    const current = harness();
    const pair = await current.pair();
    expect(pair.authProtocol).toBe(SENDER_CONSTRAINED_REFRESH_PROTOCOL);
    expect(current.state.installationKeys.size).toBe(1);

    const pending = await current.pending(pair.refreshCredential);
    const rotated = await current.service.rotateRefreshCredential(pending.request);
    expect(rotated).toMatchObject({
      authProtocol: SENDER_CONSTRAINED_REFRESH_PROTOCOL,
      refreshCredential: pending.successor,
      recovered: false,
    });
    expect(current.state.exchanges.size).toBe(1);
  });

  it("recovers a lost response after suspension or relaunch without creating C", async () => {
    const current = harness();
    const pair = await current.pair();
    const pending = await current.pending(pair.refreshCredential);
    const first = await current.service.rotateRefreshCredential(pending.request);
    const recovered = await current.service.rotateRefreshCredential((await current.retry(pending)).request);

    expect(recovered.refreshCredential).toBe(pending.successor);
    expect(recovered.refreshCredential).toBe(first.refreshCredential);
    expect(recovered.accessToken).not.toBe(first.accessToken);
    expect(recovered.recovered).toBe(true);
    expect([...current.state.refresh.values()]).toHaveLength(2);
    expect([...current.state.access.values()].find((row) => row.credential === first.accessToken)?.revoked_at).toBeTruthy();
  });

  it("rejects a captured bearer or missing proof without revoking the legitimate family", async () => {
    const current = harness();
    const pair = await current.pair();
    const pending = await current.pending(pair.refreshCredential);
    await expect(current.service.rotateRefreshCredential({
      refreshCredential: pair.refreshCredential,
      rotationIntentId: pending.intent,
      successorRefreshCredential: pending.successor,
      successorCommitment: pending.commitment,
    })).rejects.toMatchObject({ code: "DEVICE_PROOF_INVALID" });
    expect(current.sessionStatus(pair.sessionId)).toBe("active");
  });

  it("rejects a captured full old request, nonce replay, and proof-ID replay without bearer recovery", async () => {
    const current = harness();
    const pair = await current.pair();
    const pending = await current.pending(pair.refreshCredential);
    await current.service.rotateRefreshCredential(pending.request);

    await expect(current.service.rotateRefreshCredential(pending.request)).rejects.toMatchObject({ code: "DEVICE_PROOF_INVALID" });
    const sameNonceDifferentProof = {
      ...pending.request,
      proof: { ...pending.request.proof, proofId: "q".repeat(43) },
    };
    sameNonceDifferentProof.proof.signature = current.signature(sameNonceDifferentProof, current.keyPair.privateKey);
    await expect(current.service.rotateRefreshCredential(sameNonceDifferentProof)).rejects.toMatchObject({ code: "DEVICE_PROOF_INVALID" });

    const freshChallengeSameProofId = await current.retry(pending, { proofId: pending.request.proof.proofId });
    await expect(current.service.rotateRefreshCredential(freshChallengeSameProofId.request)).rejects.toMatchObject({ code: "DEVICE_PROOF_INVALID" });
    expect(current.sessionStatus(pair.sessionId)).toBe("active");
  });

  it("rejects the wrong installation key without letting it revoke the family", async () => {
    const current = harness();
    const pair = await current.pair();
    const pending = await current.pending(pair.refreshCredential);
    pending.request.proof.signature = current.signature(pending.request, createKeyPair().privateKey);
    await expect(current.service.rotateRefreshCredential(pending.request)).rejects.toMatchObject({ code: "DEVICE_PROOF_INVALID" });
    expect(current.sessionStatus(pair.sessionId)).toBe("active");
  });

  it("revokes valid-key reuse with a different intent or successor commitment", async () => {
    for (const mismatch of ["intent", "successor"]) {
      const current = harness();
      const pair = await current.pair();
      const pending = await current.pending(pair.refreshCredential);
      await current.service.rotateRefreshCredential(pending.request);
      const competing = mismatch === "intent"
        ? await current.pending(pair.refreshCredential, { intent: "x".repeat(43), successor: pending.successor })
        : await current.pending(pair.refreshCredential, { intent: pending.intent, successor: "y".repeat(43) });
      await expect(current.service.rotateRefreshCredential(competing.request)).rejects.toMatchObject({ code: "REFRESH_REUSE_DETECTED" });
      expect(current.sessionStatus(pair.sessionId)).toBe("revoked");
    }
  });

  it("denies recovery after successor use", async () => {
    const current = harness();
    const pair = await current.pair();
    const first = await current.pending(pair.refreshCredential);
    await current.service.rotateRefreshCredential(first.request);
    const successorRotation = await current.pending(first.successor);
    await current.service.rotateRefreshCredential(successorRotation.request);

    await expect(current.service.rotateRefreshCredential((await current.retry(first)).request)).rejects.toMatchObject({
      code: "REFRESH_REUSE_DETECTED",
    });
  });

  it("denies recovery after any associated access credential was used", async () => {
    const current = harness();
    const pair = await current.pair();
    const pending = await current.pending(pair.refreshCredential);
    const rotated = await current.service.rotateRefreshCredential(pending.request);
    await current.service.authenticateAccessToken(rotated.accessToken);

    await expect(current.service.rotateRefreshCredential((await current.retry(pending)).request)).rejects.toMatchObject({
      code: "REFRESH_REUSE_DETECTED",
    });
  });

  it("uses Server time for the recovery window and fails closed outside it", async () => {
    const current = harness();
    const pair = await current.pair();
    const pending = await current.pending(pair.refreshCredential);
    await current.service.rotateRefreshCredential(pending.request);
    current.advance(120_001);

    await expect(current.service.rotateRefreshCredential((await current.retry(pending)).request)).rejects.toMatchObject({
      code: "REFRESH_REUSE_DETECTED",
    });
  });

  it("bounds repeated lost-response recovery and then requires reconnect", async () => {
    const current = harness();
    const pair = await current.pair();
    const pending = await current.pending(pair.refreshCredential);
    await current.service.rotateRefreshCredential(pending.request);
    await current.service.rotateRefreshCredential((await current.retry(pending)).request);
    await current.service.rotateRefreshCredential((await current.retry(pending)).request);
    await expect(current.service.rotateRefreshCredential((await current.retry(pending)).request)).rejects.toMatchObject({
      code: "SESSION_REAUTHENTICATION_REQUIRED",
    });
    expect(current.sessionStatus(pair.sessionId)).toBe("revoked");
  });

  it("rejects revoked devices and sessions even with valid fresh proof", async () => {
    for (const authority of ["device", "session"]) {
      const current = harness();
      const pair = await current.pair();
      const pending = await current.pending(pair.refreshCredential);
      if (authority === "device") current.state.devices.get(pair.deviceId).status = "revoked";
      else current.state.sessions.get(pair.sessionId).status = "revoked";
      await expect(current.service.rotateRefreshCredential(pending.request)).rejects.toMatchObject({
        code: "REFRESH_CREDENTIAL_REVOKED",
      });
    }
  });

  it("serializes same-intent concurrency and revokes a competing valid-key intent", async () => {
    const same = harness();
    const paired = await same.pair();
    const pending = await same.pending(paired.refreshCredential);
    await same.service.rotateRefreshCredential(pending.request);
    await expect(same.service.rotateRefreshCredential((await same.retry(pending)).request)).resolves.toMatchObject({ recovered: true });

    const competing = await same.pending(paired.refreshCredential, { intent: "d".repeat(43), successor: pending.successor });
    await expect(same.service.rotateRefreshCredential(competing.request)).rejects.toMatchObject({ code: "REFRESH_REUSE_DETECTED" });
  });

  it("keeps credential, intent, successor, nonce, proof, signature, and key material out of events", async () => {
    const current = harness();
    const pair = await current.pair();
    const pending = await current.pending(pair.refreshCredential);
    await current.service.rotateRefreshCredential(pending.request);
    const serialized = JSON.stringify(current.state.events);
    for (const secret of [
      pair.refreshCredential,
      pending.intent,
      pending.successor,
      pending.commitment,
      pending.request.proof.nonce,
      pending.request.proof.proofId,
      pending.request.proof.signature,
      current.publicKeySpki,
    ]) expect(serialized).not.toContain(secret);
  });
});

function harness({ allowSenderConstrainedEnrollment = true } = {}) {
  let now = new Date(START);
  let idCounter = 0;
  let secretCounter = 0;
  let proofCounter = 0;
  const keyPair = createKeyPair();
  const publicKeySpki = keyPair.publicKey.export({ format: "der", type: "spki" }).toString("base64url");
  const state = {
    pairingAvailable: true,
    devices: new Map(),
    installationKeys: new Map(),
    sessions: new Map(),
    access: new Map(),
    refresh: new Map(),
    challenges: new Map(),
    exchanges: new Map(),
    exchangeAccess: new Map(),
    events: [],
  };
  const identity = identityStore(state, () => now);
  const service = createFounderAuthService({
    transactionRunner: { run: (work) => work({ identity }) },
    credentialPepper: PEPPER,
    allowSenderConstrainedEnrollment,
    clock: () => new Date(now),
    createId: () => `01990000-0000-7000-8000-${String(++idCounter).padStart(12, "0")}`,
    createSecret: () => Buffer.alloc(32, ++secretCounter).toString("base64url"),
  });

  async function pair({ offerProof = true } = {}) {
    return service.registerDeviceWithPairing({
      pairingCredential: "p".repeat(43),
      platform: "ios",
      displayName: "Founder iPhone",
      refreshProof: offerProof ? { algorithm: "ES256", publicKeySpki } : null,
    });
  }

  async function pending(refreshCredential, options = {}) {
    const sequence = ++proofCounter;
    const intent = options.intent ?? "i".repeat(42) + String(sequence % 10);
    const successor = options.successor ?? "s".repeat(42) + String(sequence % 10);
    const signingKey = options.signingKey ?? keyPair.privateKey;
    const proofId = options.proofId ?? "f".repeat(42) + String(sequence % 10);
    const commitment = createSuccessorCommitment(successor);
    const challenge = await service.issueRefreshProofChallenge({
      refreshCredential,
      rotationIntentId: intent,
      successorCommitment: commitment,
    });
    const request = {
      refreshCredential,
      rotationIntentId: intent,
      successorRefreshCredential: successor,
      successorCommitment: commitment,
      proof: {
        challengeId: challenge.challengeId,
        nonce: challenge.nonce,
        proofId,
        signature: "",
      },
    };
    request.proof.signature = signature(request, signingKey);
    return { request, intent, successor, commitment };
  }

  async function retry(previous, { proofId } = {}) {
    return pending(previous.request.refreshCredential, {
      intent: previous.intent,
      successor: previous.successor,
      proofId: proofId ?? `r${String(++proofCounter).padStart(42, "r")}`,
    });
  }

  function signature(request, privateKey) {
    return sign("sha256", createRefreshProofMessage({
      refreshCredential: request.refreshCredential,
      rotationIntentId: request.rotationIntentId,
      successorRefreshCredential: request.successorRefreshCredential,
      successorCommitment: request.successorCommitment,
      nonce: request.proof.nonce,
      proofId: request.proof.proofId,
    }), privateKey).toString("base64url");
  }

  return {
    state,
    service,
    keyPair,
    publicKeySpki,
    pair,
    pending,
    retry,
    signature,
    advance(milliseconds) { now = new Date(now.getTime() + milliseconds); },
    sessionStatus(id) { return state.sessions.get(id).status; },
  };
}

function identityStore(state, clock) {
  return {
    async consumePairingCredential() {
      if (!state.pairingAvailable) return null;
      state.pairingAvailable = false;
      return { id: "pairing", user_id: "user" };
    },
    async createDevice(record) {
      state.devices.set(record.id, { id: record.id, user_id: record.userId, status: "active", ...record });
    },
    async createInstallationSigningKey(record) {
      state.installationKeys.set(record.id, {
        id: record.id, user_id: record.userId, device_id: record.deviceId, status: "active",
        algorithm: record.algorithm, public_key_spki: Buffer.from(record.publicKeySpki), thumbprint: record.thumbprint,
      });
    },
    async createSession(record) {
      state.sessions.set(record.id, {
        id: record.id, user_id: record.userId, device_id: record.deviceId, status: "active",
        idle_expires_at: record.idleExpiresAt, absolute_expires_at: record.absoluteExpiresAt,
        refresh_family_id: record.refreshFamilyId, refresh_proof_version: record.refreshProofVersion,
        installation_key_id: record.installationKeyId,
      });
    },
    async createAccessCredential(record) {
      state.access.set(record.id, {
        id: record.id, user_id: record.userId, device_id: record.deviceId, session_id: record.sessionId,
        credential_hash: record.credentialHash, credential: findCredential(record.credentialHash),
        expires_at: record.expiresAt, revoked_at: null, first_used_at: null, created_at: clock(),
      });
    },
    async createRefreshCredential(record) {
      state.refresh.set(record.id, {
        id: record.id, user_id: record.userId, device_id: record.deviceId, session_id: record.sessionId,
        family_id: record.familyId, credential_hash: record.credentialHash,
        idle_expires_at: record.idleExpiresAt, absolute_expires_at: record.absoluteExpiresAt,
        used_at: null, revoked_at: null, replaced_by_id: null,
      });
    },
    async findAccessCredentialForAuthentication(hash) {
      const row = [...state.access.values()].find((candidate) => candidate.credential_hash === hash);
      if (!row) return null;
      const session = state.sessions.get(row.session_id);
      const device = state.devices.get(row.device_id);
      return { ...row, session_status: session.status, device_status: device.status,
        idle_expires_at: session.idle_expires_at, absolute_expires_at: session.absolute_expires_at };
    },
    async markAccessCredentialUsed({ id, at }) { state.access.get(id).first_used_at ??= at; },
    async updateDeviceSeen() {},
    async lockRefreshCredential(hash) {
      const row = [...state.refresh.values()].find((candidate) => candidate.credential_hash === hash);
      if (!row) return null;
      const session = state.sessions.get(row.session_id);
      const device = state.devices.get(row.device_id);
      const key = session.installation_key_id ? state.installationKeys.get(session.installation_key_id) : null;
      return {
        ...row,
        session_status: session.status,
        device_status: device.status,
        refresh_proof_version: session.refresh_proof_version,
        installation_key_id: session.installation_key_id,
        installation_key_status: key?.status ?? null,
        public_key_spki: key?.public_key_spki ?? null,
        thumbprint: key?.thumbprint ?? null,
      };
    },
    async replaceRefreshCredential({ previousId, next }) {
      await this.createRefreshCredential(next);
      const previous = state.refresh.get(previousId);
      previous.used_at = next.createdAt;
      previous.replaced_by_id = next.id;
    },
    async createRefreshProofChallenge(record) {
      state.challenges.set(record.id, {
        id: record.id, user_id: record.userId, device_id: record.deviceId, session_id: record.sessionId,
        family_id: record.familyId, refresh_credential_id: record.refreshCredentialId,
        installation_key_id: record.installationKeyId, nonce_digest: record.nonceDigest,
        intent_digest: record.intentDigest, successor_commitment_digest: record.successorCommitmentDigest,
        expires_at: record.expiresAt, consumed_at: null, proof_id_digest: null,
      });
    },
    async lockRefreshProofChallenge({ id, nonceDigest }) {
      const row = state.challenges.get(id);
      return row?.nonce_digest === nonceDigest ? row : null;
    },
    async consumeRefreshProofChallenge({ id, proofIdDigest, at }) {
      if ([...state.challenges.values()].some((row) => row.proof_id_digest === proofIdDigest)) return null;
      const row = state.challenges.get(id);
      if (!row || row.consumed_at) return null;
      row.consumed_at = at;
      row.proof_id_digest = proofIdDigest;
      return row;
    },
    async createRefreshExchange(record) {
      state.exchanges.set(record.id, {
        id: record.id, user_id: record.userId, device_id: record.deviceId, session_id: record.sessionId,
        family_id: record.familyId, installation_key_id: record.installationKeyId,
        predecessor_refresh_id: record.predecessorRefreshId, successor_refresh_id: record.successorRefreshId,
        intent_digest: record.intentDigest, successor_commitment_digest: record.successorCommitmentDigest,
        recovery_expires_at: record.recoveryExpiresAt, recovery_count: 0,
        maximum_recoveries: record.maximumRecoveries,
      });
      state.exchangeAccess.set(record.id, []);
    },
    async lockRefreshExchangeByPredecessor(id) {
      return [...state.exchanges.values()].find((row) => row.predecessor_refresh_id === id) ?? null;
    },
    async lockRefreshCredentialById(id) { return state.refresh.get(id) ?? null; },
    async linkRefreshExchangeAccessCredential({ exchangeId, accessCredentialId }) {
      state.exchangeAccess.get(exchangeId).push(accessCredentialId);
    },
    async lockRefreshExchangeAccessCredentials(exchangeId) {
      return state.exchangeAccess.get(exchangeId).map((id) => state.access.get(id));
    },
    async revokeRefreshExchangeAccessCredentials({ exchangeId, at }) {
      for (const id of state.exchangeAccess.get(exchangeId)) state.access.get(id).revoked_at ??= at;
    },
    async incrementRefreshExchangeRecovery({ id }) {
      const row = state.exchanges.get(id);
      row.recovery_count += 1;
      return row;
    },
    async revokeRefreshFamily({ familyId, at }) {
      for (const row of state.refresh.values()) if (row.family_id === familyId) row.revoked_at ??= at;
      for (const row of state.sessions.values()) if (row.refresh_family_id === familyId) row.status = "revoked";
    },
    async recordSecurityEvent(event) { state.events.push(event); },
  };

  function findCredential(hash) {
    // Tests inspect access revocation by token. The deterministic secret space is small and local.
    for (let value = 1; value < 64; value += 1) {
      const candidate = Buffer.alloc(32, value).toString("base64url");
      if (hashHighEntropyCredential(candidate, { pepper: PEPPER }) === hash) return candidate;
    }
    return null;
  }
}

function createKeyPair() {
  return generateKeyPairSync("ec", { namedCurve: "P-256" });
}

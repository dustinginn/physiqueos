import { ApplicationProblem } from "../../contracts/v1/problem";
import { createUuidV7 } from "../../contracts/v1/identifiers";
import { requireAuthenticationPrincipal } from "../../application/auth/principal";

const CHALLENGE_LIFETIME_MS = 5 * 60 * 1000;

export function createPasskeyLifecycleService({ transactionRunner, passkeyServer, clock = () => new Date(), createId = () => createUuidV7() }) {
  async function beginRegistration({ principal, userName, displayName }) {
    const actor = requireAuthenticationPrincipal(principal);
    return transactionRunner.run(async (transaction) => {
      const existing = await transaction.passkeys.listActiveForUser(actor.userId);
      const options = await passkeyServer.generateRegistrationOptions({ userId: actor.userId, userName, displayName, excludeCredentials: existing.map(toAllowedCredential) });
      const challengeId = createId();
      await transaction.passkeys.saveChallenge({ id: challengeId, userId: actor.userId, purpose: "passkey_registration", challenge: options.challenge, expiresAt: new Date(clock().getTime() + CHALLENGE_LIFETIME_MS) });
      return Object.freeze({ challengeId, options });
    });
  }

  async function finishRegistration({ challengeId, response }) {
    return transactionRunner.run(async (transaction) => {
      const challenge = await transaction.passkeys.consumeChallenge({ id: challengeId, purpose: "passkey_registration", at: clock() });
      if (!challenge) throw challengeInvalid();
      const verification = await passkeyServer.verifyRegistrationResponse({ response, expectedChallenge: challenge.context.expectedChallenge });
      if (!verification.verified) throw verificationInvalid();
      const info = verification.registrationInfo;
      return transaction.passkeys.saveCredential({
        id: createId(), userId: challenge.user_id, credentialExternalId: info.credential.id,
        publicKey: Buffer.from(info.credential.publicKey), counter: info.credential.counter,
        transports: info.credential.transports ?? response.response?.transports ?? null,
        deviceType: info.credentialDeviceType, backedUp: info.credentialBackedUp,
      });
    });
  }

  async function beginAuthentication({ userId }) {
    return transactionRunner.run(async (transaction) => {
      const credentials = await transaction.passkeys.listActiveForUser(userId);
      if (credentials.length === 0) throw new ApplicationProblem({ status: 401, code: "PASSKEY_UNAVAILABLE", title: "No active passkey is available." });
      const options = await passkeyServer.generateAuthenticationOptions({ allowCredentials: credentials.map(toAllowedCredential) });
      const challengeId = createId();
      await transaction.passkeys.saveChallenge({ id: challengeId, userId, purpose: "passkey_authentication", challenge: options.challenge, expiresAt: new Date(clock().getTime() + CHALLENGE_LIFETIME_MS) });
      return Object.freeze({ challengeId, options });
    });
  }

  async function finishAuthentication({ challengeId, response }) {
    return transactionRunner.run(async (transaction) => {
      const challenge = await transaction.passkeys.consumeChallenge({ id: challengeId, purpose: "passkey_authentication", at: clock() });
      if (!challenge) throw challengeInvalid();
      const stored = await transaction.passkeys.findActiveByExternalId(response.id);
      if (!stored || stored.user_id !== challenge.user_id) throw verificationInvalid();
      const credential = { id: stored.credential_external_id, publicKey: new Uint8Array(stored.public_key), counter: Number(stored.counter), transports: stored.transports ?? undefined };
      const verification = await passkeyServer.verifyAuthenticationResponse({ response, expectedChallenge: challenge.context.expectedChallenge, credential });
      if (!verification.verified) throw verificationInvalid();
      const advanced = await transaction.passkeys.advanceCounter({ credentialExternalId: stored.credential_external_id, previousCounter: stored.counter, nextCounter: verification.authenticationInfo.newCounter, at: clock() });
      if (!advanced) throw new ApplicationProblem({ status: 409, code: "PASSKEY_COUNTER_CONFLICT", title: "The passkey assertion was already consumed." });
      return Object.freeze({ userId: stored.user_id, credentialId: stored.id });
    });
  }

  return Object.freeze({ beginRegistration, finishRegistration, beginAuthentication, finishAuthentication });
}

function toAllowedCredential(row) { return { id: row.credential_external_id, transports: row.transports ?? undefined }; }
function challengeInvalid() { return new ApplicationProblem({ status: 401, code: "PASSKEY_CHALLENGE_INVALID", title: "The passkey challenge is expired or already used." }); }
function verificationInvalid() { return new ApplicationProblem({ status: 401, code: "PASSKEY_VERIFICATION_FAILED", title: "The passkey response could not be verified." }); }

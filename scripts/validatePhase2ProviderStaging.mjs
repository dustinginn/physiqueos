import { createHash } from "node:crypto";
import { executeIdempotentCommand } from "../src/application/commands/executeIdempotentCommand.js";
import { createPrivateObjectService } from "../src/application/objects/PrivateObjectService.js";
import { createCommandMetadata } from "../src/contracts/v1/command.js";
import { createUuidV7 } from "../src/contracts/v1/identifiers.js";
import { createFounderAuthService } from "../src/platform/auth/FounderAuthService.js";
import { createPasskeyLifecycleService } from "../src/platform/auth/PasskeyLifecycleService.js";
import { createPasskeyServer } from "../src/platform/auth/passkeyServer.js";
import { advancePinFailureState, resetPinFailureState, validateLocalPinShape } from "../src/platform/auth/pinLockoutPolicy.js";
import { collectObjectInventory } from "../src/platform/backup/objectInventory.js";
import { readDatabaseConfig } from "../src/platform/database/config.js";
import { createFoundationPostgresAdapters, createFoundationPostgresTransactionRunner } from "../src/platform/database/foundationPostgresComposition.js";
import { createPostgresPool } from "../src/platform/database/pool.js";
import { createDurableOutboxWorker } from "../src/platform/jobs/DurableOutboxWorker.js";
import { readSpacesConfig } from "../src/platform/object-storage/spacesConfig.js";
import { createSpacesPrivateObjectProvider } from "../src/platform/object-storage/SpacesPrivateObjectProvider.js";
import { evaluateOperationalReadiness } from "../src/platform/observability/operationalReadiness.js";
import { createStructuredLogger } from "../src/platform/observability/structuredLogger.js";

const EXPECTED_DATABASE = "physiqueos_phase2_test_provider_20260811";
const EXPECTED_BUCKET_PREFIX = "physiqueos-p2-staging-";
const BASE_TIME = new Date("2026-08-12T01:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

if (process.env.PHYSIQUEOS_PHASE2_PROVIDER_ACCEPTANCE !== "1") throw new Error("Provider acceptance requires PHYSIQUEOS_PHASE2_PROVIDER_ACCEPTANCE=1.");
const databaseConfig = readDatabaseConfig();
const spacesConfig = readSpacesConfig();
const databaseUrl = new URL(databaseConfig.connectionString);
assert(decodeURIComponent(databaseUrl.pathname.slice(1)) === EXPECTED_DATABASE, `Refusing to mutate database ${databaseUrl.pathname}.`);
assert(databaseUrl.hostname.endsWith(".ondigitalocean.com"), "Provider acceptance requires a DigitalOcean PostgreSQL host.");
assert(databaseConfig.caCertificate && databaseConfig.caCertificate.includes("BEGIN CERTIFICATE"), "Provider acceptance requires the managed database CA.");
assert(spacesConfig.region === "sfo3" && spacesConfig.bucket.startsWith(EXPECTED_BUCKET_PREFIX), "Provider acceptance requires the approved sfo3 staging bucket.");

let pool = createPostgresPool(databaseConfig);
let adapters = adaptersFor(pool);
let transactionRunner = createFoundationPostgresTransactionRunner({ pool });
const provider = createSpacesPrivateObjectProvider(spacesConfig);
const evidence = [];

try {
  await assertSyntheticDatabaseIsFresh();
  const authState = await validateAuthentication();
  await validatePasskeys(authState);
  const objectState = await validatePrivateObjects(authState);
  await validateCommandsWorkersAndSecurity(authState);
  await validateRestartDurability(authState, objectState);
  evidence.push("strict-provider-configuration");
  process.stdout.write(`[phase2-provider] PASS ${evidence.join(" ")}\n`);
} finally {
  provider.close();
  await pool.end().catch(() => undefined);
}

async function assertSyntheticDatabaseIsFresh() {
  const state = await pool.query("SELECT current_database() AS database, (SELECT count(*)::integer FROM physiqueos.users) AS users, (SELECT count(*)::integer FROM physiqueos.physiqueos_schema_migrations) AS migrations");
  assert(state.rows[0].database === EXPECTED_DATABASE && state.rows[0].users === 0 && state.rows[0].migrations === 2, "The synthetic provider database is not at the expected fresh migration state.");
  evidence.push("schema-compatible");
}

async function validateAuthentication() {
  const service = createFounderAuthService({ transactionRunner, credentialPepper: process.env.PHYSIQUEOS_CREDENTIAL_PEPPER, clock: () => BASE_TIME });
  const enrollment = await service.enrollFounder({ displayName: "Synthetic Provider Founder", timeZone: "America/Los_Angeles" });
  await expectProblem("FOUNDER_ALREADY_ENROLLED", () => service.enrollFounder({ displayName: "Second Synthetic Founder", timeZone: "UTC" }));
  const storedRecovery = await pool.query("SELECT credential_hash, hash_algorithm FROM physiqueos.recovery_credentials WHERE user_id = $1", [enrollment.userId]);
  assert(storedRecovery.rowCount === 1 && storedRecovery.rows[0].credential_hash !== enrollment.recoveryCredential && storedRecovery.rows[0].hash_algorithm === "hmac-sha256:v1", "Recovery material was not stored as a peppered hash.");

  const bootstrapDeviceId = createUuidV7();
  await transactionRunner.run((transaction) => transaction.identity.createDevice({ id: bootstrapDeviceId, userId: enrollment.userId, platform: "web", displayName: "Synthetic Bootstrap" }));
  const session = await service.createSession({ userId: enrollment.userId, deviceId: bootstrapDeviceId });
  assert(duration(session.accessExpiresAt, BASE_TIME) === 10 * 60 * 1000, "Access lifetime is not ten minutes.");
  assert(duration(session.refreshIdleExpiresAt, BASE_TIME) === 30 * DAY_MS, "Refresh idle lifetime is not thirty days.");
  assert(duration(session.refreshAbsoluteExpiresAt, BASE_TIME) === 90 * DAY_MS, "Refresh absolute lifetime is not ninety days.");
  const principal = await service.authenticateAccessToken(session.accessToken);
  await expectProblem("ACCESS_TOKEN_EXPIRED", () => authAt(new Date(BASE_TIME.getTime() + 11 * 60 * 1000)).authenticateAccessToken(session.accessToken));

  const pairing = await service.issuePairingCredential({ principal });
  const paired = await service.registerDeviceWithPairing({ pairingCredential: pairing.pairingCredential, platform: "ios-synthetic", displayName: "Synthetic Paired Device" });
  await expectProblem("PAIRING_CREDENTIAL_INVALID", () => service.registerDeviceWithPairing({ pairingCredential: pairing.pairingCredential, platform: "ios-synthetic", displayName: "Replay" }));
  const pairedPrincipal = await service.authenticateAccessToken(paired.accessToken);
  const rotated = await service.rotateRefreshCredential(paired.refreshCredential);
  await expectProblem("REFRESH_REUSE_DETECTED", () => service.rotateRefreshCredential(paired.refreshCredential));
  await expectProblem("ACCESS_TOKEN_REVOKED", () => service.authenticateAccessToken(rotated.accessToken));
  const revokedFamily = await pool.query("SELECT status FROM physiqueos.sessions WHERE id = $1", [paired.sessionId]);
  assert(revokedFamily.rows[0].status === "revoked", "Refresh-family revocation was not persisted.");

  const idleDevice = createUuidV7();
  await transactionRunner.run((transaction) => transaction.identity.createDevice({ id: idleDevice, userId: enrollment.userId, platform: "test", displayName: "Idle Boundary" }));
  const idleSession = await service.createSession({ userId: enrollment.userId, deviceId: idleDevice });
  await expectProblem("REFRESH_CREDENTIAL_EXPIRED", () => authAt(new Date(BASE_TIME.getTime() + 30 * DAY_MS + 1)).rotateRefreshCredential(idleSession.refreshCredential));

  const revokeDeviceId = createUuidV7();
  await transactionRunner.run((transaction) => transaction.identity.createDevice({ id: revokeDeviceId, userId: enrollment.userId, platform: "test", displayName: "Revoked Device" }));
  const deviceSession = await service.createSession({ userId: enrollment.userId, deviceId: revokeDeviceId });
  await service.revokeDevice({ principal, deviceId: revokeDeviceId });
  await expectProblem("ACCESS_TOKEN_REVOKED", () => service.authenticateAccessToken(deviceSession.accessToken));

  const revokeSessionDeviceId = createUuidV7();
  await transactionRunner.run((transaction) => transaction.identity.createDevice({ id: revokeSessionDeviceId, userId: enrollment.userId, platform: "test", displayName: "Revoked Session" }));
  const revocable = await service.createSession({ userId: enrollment.userId, deviceId: revokeSessionDeviceId });
  const revocablePrincipal = await service.authenticateAccessToken(revocable.accessToken);
  await service.revokeSession({ principal: revocablePrincipal });
  await expectProblem("ACCESS_TOKEN_REVOKED", () => service.authenticateAccessToken(revocable.accessToken));

  await expectProblem("RECOVERY_CREDENTIAL_INVALID", () => service.recoverFounder({ recoveryCredential: "x".repeat(43), platform: "ios", displayName: "Invalid Recovery" }));
  const recovered = await service.recoverFounder({ recoveryCredential: enrollment.recoveryCredential, platform: "ios-synthetic", displayName: "Synthetic Replacement" });
  assert(recovered.canonicalDataDeleted === false && recovered.recoveryCredential !== enrollment.recoveryCredential, "Recovery did not preserve canonical data and rotate recovery material.");
  await expectProblem("RECOVERY_CREDENTIAL_INVALID", () => service.recoverFounder({ recoveryCredential: enrollment.recoveryCredential, platform: "ios", displayName: "Recovery Replay" }));
  const recoveredPrincipal = await service.authenticateAccessToken(recovered.accessToken);
  assert((await pool.query("SELECT count(*)::integer AS count FROM physiqueos.users WHERE id = $1", [enrollment.userId])).rows[0].count === 1, "Recovery deleted the canonical synthetic user.");

  validateLocalPinShape("12345678");
  let pinState;
  for (let index = 0; index < 10; index += 1) pinState = advancePinFailureState(pinState, { now: BASE_TIME });
  assert(pinState.recoveryRequired && pinState.failureCount === 10 && pinState.canonicalDataDeleted === false, "PIN recovery threshold failed.");
  await expectProblem("RECOVERY_CREDENTIAL_REQUIRED", async () => resetPinFailureState());
  assert(resetPinFailureState({ recoveryCredentialVerified: true }).failureCount === 0, "Verified recovery did not reset PIN state.");

  const adversaryUserId = createUuidV7();
  const adversaryDeviceId = createUuidV7();
  await transactionRunner.run(async (transaction) => {
    await transaction.identity.createUserProfile({ userId: adversaryUserId, profileId: createUuidV7(), displayName: "Synthetic Adversary", timeZone: "UTC" });
    await transaction.identity.createDevice({ id: adversaryDeviceId, userId: adversaryUserId, platform: "test", displayName: "Synthetic Adversary" });
  });
  const adversarySession = await service.createSession({ userId: adversaryUserId, deviceId: adversaryDeviceId });
  const adversaryPrincipal = await service.authenticateAccessToken(adversarySession.accessToken);
  evidence.push("auth-lifecycle");
  return { ownerUserId: enrollment.userId, principal: recoveredPrincipal, adversaryUserId, adversaryPrincipal, pairedPrincipal };

  function authAt(now) {
    return createFounderAuthService({ transactionRunner, credentialPepper: process.env.PHYSIQUEOS_CREDENTIAL_PEPPER, clock: () => now });
  }
}

async function validatePasskeys(state) {
  const service = createPasskeyLifecycleService({
    transactionRunner,
    passkeyServer: createPasskeyServer({ rpName: "PhysiqueOS Staging", rpId: "physiqueos-foundation-staging-a9or4.ondigitalocean.app", expectedOrigin: "https://physiqueos-foundation-staging-a9or4.ondigitalocean.app" }),
    clock: () => BASE_TIME,
  });
  const registration = await service.beginRegistration({ principal: state.principal, userName: "synthetic-founder", displayName: "Synthetic Provider Founder" });
  assert(registration.options.rp.id === "physiqueos-foundation-staging-a9or4.ondigitalocean.app" && registration.options.challenge.length > 20, "Real passkey registration options were not generated.");
  await pool.query("UPDATE physiqueos.auth_challenges SET expires_at = $2 WHERE id = $1", [registration.challengeId, new Date(BASE_TIME.getTime() - 1)]);
  await expectProblem("PASSKEY_CHALLENGE_INVALID", () => service.finishRegistration({ challengeId: registration.challengeId, response: {} }));
  await expectProblem("PASSKEY_CHALLENGE_INVALID", () => service.finishRegistration({ challengeId: createUuidV7(), response: {} }));

  const adversaryCredentialId = `synthetic-passkey-${createUuidV7()}`;
  await adapters.passkeys.saveCredential({ id: createUuidV7(), userId: state.adversaryUserId, credentialExternalId: adversaryCredentialId, publicKey: Buffer.from([1, 2, 3]), counter: 0, transports: ["internal"], deviceType: "singleDevice", backedUp: false });
  const challengeId = createUuidV7();
  await adapters.passkeys.saveChallenge({ id: challengeId, userId: state.ownerUserId, purpose: "passkey_authentication", challenge: "synthetic-owner-challenge", expiresAt: new Date(BASE_TIME.getTime() + 60_000) });
  await expectProblem("PASSKEY_VERIFICATION_FAILED", () => service.finishAuthentication({ challengeId, response: { id: adversaryCredentialId } }));
  evidence.push("passkey-server-lifecycle");
}

async function validatePrivateObjects(state) {
  const service = createPrivateObjectService({ transactionRunner, provider, clock: () => BASE_TIME, createId: () => createUuidV7() });
  const bytes = Buffer.from("synthetic-provider-private-object-v1", "utf8");
  const sha256 = digest(bytes);
  const committed = await upload(service, state.principal, bytes, { contentType: "application/pdf", sha256 });
  assert(committed.completion.outcome === "committed", "The provider object was not committed.");
  const replay = await service.completeUpload({ principal: state.principal, uploadId: committed.begin.uploadId, parts: committed.parts });
  assert(replay.outcome === "replayed", "Identical upload completion was not replay-safe.");
  await expectProblem("UPLOAD_RECEIPT_REUSED", () => service.completeUpload({ principal: state.principal, uploadId: committed.begin.uploadId, parts: [{ partNumber: 1, etag: `${committed.parts[0].etag}-wrong` }] }));
  await expectProblem("PRIVATE_OBJECT_NOT_FOUND", () => service.completeUpload({ principal: state.adversaryPrincipal, uploadId: committed.begin.uploadId, parts: committed.parts }));

  const read = await service.authorizeRead({ principal: state.principal, objectId: committed.begin.objectId });
  assert(read.expiresInSeconds <= 300 && read.sha256 === sha256, "Authorized read metadata is invalid.");
  const readResponse = await fetch(read.readUrl);
  const readBytes = Buffer.from(await readResponse.arrayBuffer());
  assert(readResponse.ok && readBytes.equals(bytes) && digest(readBytes) === sha256, "Authorized provider read did not preserve bytes and hash.");
  await expectProblem("PRIVATE_OBJECT_NOT_FOUND", () => service.authorizeRead({ principal: state.adversaryPrincipal, objectId: committed.begin.objectId }));

  const stored = await pool.query("SELECT object_key, provider_version FROM physiqueos.stored_objects WHERE id = $1", [committed.begin.objectId]);
  const unsigned = `${spacesConfig.endpoint.replace("https://", `https://${spacesConfig.bucket}.`)}/${stored.rows[0].object_key.split("/").map(encodeURIComponent).join("/")}`;
  assert((await fetch(unsigned)).status === 403, "A private object was available without authorization.");
  const oneSecondRead = await provider.authorizeRead({ objectKey: stored.rows[0].object_key, providerVersion: stored.rows[0].provider_version, expiresInSeconds: 1 });
  await new Promise((resolve) => setTimeout(resolve, 2_100));
  assert((await fetch(oneSecondRead.url)).status === 403, "An expired object read handle remained usable.");

  const concurrent = await uploadParts(service, state.principal, Buffer.from("synthetic-concurrent-completion"), { contentType: "application/pdf" });
  const claims = await Promise.all([
    service.completeUpload({ principal: state.principal, uploadId: concurrent.begin.uploadId, parts: concurrent.parts }),
    service.completeUpload({ principal: state.principal, uploadId: concurrent.begin.uploadId, parts: concurrent.parts }),
  ]);
  assert(claims.filter((item) => item.outcome === "committed").length === 1 && claims.some((item) => ["pending", "replayed"].includes(item.outcome)), "Concurrent completion was not single-claim.");

  await expectVerificationFailure(service, state.principal, Buffer.from("short"), { contentType: "application/pdf", byteLength: 6 }, "OBJECT_LENGTH_MISMATCH");
  await expectVerificationFailure(service, state.principal, Buffer.from("mime"), { contentType: "application/pdf", mutateContentType: "image/jpeg" }, "OBJECT_CONTENT_TYPE_MISMATCH");
  await expectVerificationFailure(service, state.principal, Buffer.from("checksum"), { contentType: "application/pdf", sha256: "0".repeat(64) }, "OBJECT_CHECKSUM_MISMATCH");

  const interrupted = await service.beginUpload({ principal: state.principal, contentType: "application/pdf", byteLength: 10, sha256: null, provenance: { fixture: "interrupted" } });
  assert((await service.abortUpload({ principal: state.principal, uploadId: interrupted.uploadId })).outcome === "aborted", "Interrupted multipart upload was not aborted.");
  await expectProblem("PRIVATE_OBJECT_NOT_FOUND", () => service.abortUpload({ principal: state.adversaryPrincipal, uploadId: interrupted.uploadId }));

  const inventory = await collectObjectInventory({ provider, resolveObjectId: (key) => key.split("/")[2] ?? null });
  for (const objectId of [committed.begin.objectId, concurrent.begin.objectId]) assert(inventory.some((entry) => entry.objectId === objectId), "Provider inventory omitted an intentional synthetic fixture.");
  const tombstoned = await service.tombstone({ principal: state.principal, objectId: committed.begin.objectId, expectedVersion: committed.completion.version });
  assert(tombstoned.state === "tombstoned", "Object tombstone did not persist.");
  await expectProblem("PRIVATE_OBJECT_NOT_FOUND", () => service.authorizeRead({ principal: state.principal, objectId: committed.begin.objectId }));
  await expectProblem("STALE_VERSION", () => service.tombstone({ principal: state.principal, objectId: concurrent.begin.objectId, expectedVersion: "1" }));
  evidence.push("private-spaces");
  return { objectId: committed.begin.objectId, concurrentObjectId: concurrent.begin.objectId, inventoryCount: inventory.length };
}

async function validateCommandsWorkersAndSecurity(state) {
  const metadata = createCommandMetadata({ idempotencyKey: `provider-command-${createUuidV7()}` });
  const input = { transactionRunner, principal: state.principal, metadata, commandType: "synthetic.provider", payload: { value: 1 }, handler: async () => ({ result: { accepted: true } }) };
  assert((await executeIdempotentCommand(input)).outcome === "committed" && (await executeIdempotentCommand(input)).outcome === "replayed", "Provider command idempotency replay failed.");
  await expectProblem("IDEMPOTENCY_KEY_REUSED", () => executeIdempotentCommand({ ...input, payload: { value: 2 } }));
  await expectProblem("CONTRACT_VALIDATION_FAILED", async () => createCommandMetadata({ commandId: "malformed", idempotencyKey: "valid-idempotency-key" }));

  const operation = await adapters.operations.create({ id: createUuidV7(), userId: state.ownerUserId, operationType: "synthetic", status: "queued" });
  assert(await adapters.operations.update({ id: operation.id, userId: state.ownerUserId, expectedVersion: 1, status: "running" }), "Optimistic update failed.");
  assert(await adapters.operations.update({ id: operation.id, userId: state.ownerUserId, expectedVersion: 1, status: "failed" }) === null, "A stale expected version was accepted.");

  const successId = createUuidV7();
  await adapters.commands.outbox.insert({ id: successId, userId: state.ownerUserId, operationId: operation.id, topic: "foundation.synthetic", dedupeKey: `success:${successId}`, payloadVersion: "1", payload: { commandId: metadata.commandId } });
  let handled = 0;
  const worker = createDurableOutboxWorker({ store: adapters.outbox, handlers: { "foundation.synthetic": async (message) => { handled += 1; assert(message.correlation.commandId === metadata.commandId && message.correlation.operationId === operation.id, "Worker correlation was not propagated."); } }, workerId: "provider-local-worker", buildId: "provider-acceptance", clock: () => BASE_TIME });
  assert((await worker.runOnce()).outcome === "succeeded" && handled === 1, "Successful outbox acknowledgement failed.");
  assert((await worker.runOnce()).outcome === "idle" && handled === 1, "Completed outbox work was repeated.");

  const leaseId = createUuidV7();
  await adapters.commands.outbox.insert({ id: leaseId, userId: state.ownerUserId, topic: "foundation.synthetic", dedupeKey: `lease:${leaseId}`, payloadVersion: "1", payload: {} });
  const leaseNow = new Date(BASE_TIME.getTime() + 1_000);
  const claims = await Promise.all([
    adapters.outbox.claimNext({ workerId: "lease-a", now: leaseNow, leaseExpiresAt: new Date(leaseNow.getTime() + 5_000) }),
    adapters.outbox.claimNext({ workerId: "lease-b", now: leaseNow, leaseExpiresAt: new Date(leaseNow.getTime() + 5_000) }),
  ]);
  assert(claims.filter(Boolean).length === 1, "SKIP LOCKED allowed duplicate simultaneous claims.");
  assert(await adapters.outbox.claimNext({ workerId: "lease-c", now: new Date(leaseNow.getTime() + 1_000), leaseExpiresAt: new Date(leaseNow.getTime() + 6_000) }) === null, "An active lease was stolen.");
  const recovered = await adapters.outbox.claimNext({ workerId: "lease-recovery", now: new Date(leaseNow.getTime() + 6_000), leaseExpiresAt: new Date(leaseNow.getTime() + 12_000) });
  assert(recovered?.id === leaseId && await adapters.outbox.acknowledge({ id: leaseId, workerId: "lease-recovery", at: new Date(leaseNow.getTime() + 6_100) }), "Expired lease recovery failed.");

  const failureId = createUuidV7();
  await adapters.commands.outbox.insert({ id: failureId, userId: state.ownerUserId, topic: "synthetic.failure", dedupeKey: `failure:${failureId}`, payloadVersion: "1", payload: {} });
  let workerNow = new Date(BASE_TIME.getTime() + 20_000);
  const logs = [];
  const failingWorker = createDurableOutboxWorker({ store: adapters.outbox, handlers: { "synthetic.failure": async () => { const error = new Error("SENSITIVE-SENTINEL"); error.code = "SYNTHETIC_FAILURE"; throw error; } }, workerId: "provider-failing-worker", buildId: "provider-acceptance", maximumAttempts: 2, clock: () => workerNow, logger: createStructuredLogger({ sink: { error: (value) => logs.push(value), info: (value) => logs.push(value), warn: (value) => logs.push(value) }, buildIdentity: { buildId: "provider-acceptance" } }) });
  assert((await failingWorker.runOnce()).outcome === "retry_scheduled", "Bounded worker retry was not persisted.");
  workerNow = new Date(workerNow.getTime() + 6_000);
  assert((await failingWorker.runOnce()).outcome === "dead", "Terminal worker failure was not persisted.");
  const failed = await pool.query("SELECT status, attempt_count, last_error_code, last_error_detail, dead_at FROM physiqueos.outbox_messages WHERE id = $1", [failureId]);
  assert(failed.rows[0].status === "dead" && failed.rows[0].attempt_count === 2 && failed.rows[0].last_error_code === "SYNTHETIC_FAILURE" && failed.rows[0].dead_at && !failed.rows[0].last_error_detail.includes("SENSITIVE-SENTINEL") && !logs.join("").includes("SENSITIVE-SENTINEL"), "Worker failure state leaked or was not terminal.");
  await failingWorker.markStopping();
  assert((await failingWorker.runOnce()).outcome === "stopping", "Graceful worker stop failed.");

  await adapters.control.putFeatureFlag({ key: "synthetic.provider.kill-switch", enabled: false, configuration: { stagingOnly: true } });
  const readiness = await evaluateOperationalReadiness({ buildIdentity: { buildId: "provider-acceptance", apiVersion: "v1" }, environment: { databaseEnabled: true, objectStorageEnabled: true, objectStorageRequired: true }, database: pool, objectProvider: provider, workerStore: adapters.outbox, workerRequired: false });
  assert(readiness.status === "ready", "Provider readiness did not report healthy dependencies.");
  const missing = await evaluateOperationalReadiness({ buildIdentity: { buildId: "provider-acceptance", apiVersion: "v1" }, environment: { databaseEnabled: false, objectStorageEnabled: false, objectStorageRequired: true }, database: { query: async () => { throw new Error("SENSITIVE-SENTINEL"); } }, workerRequired: false });
  assert(missing.status === "not_ready" && !JSON.stringify(missing).includes("SENSITIVE-SENTINEL"), "Missing configuration did not fail closed and redact details.");
  evidence.push("commands-worker-security");
}

async function validateRestartDurability(state, objectState) {
  await pool.end();
  pool = createPostgresPool(databaseConfig);
  adapters = adaptersFor(pool);
  transactionRunner = createFoundationPostgresTransactionRunner({ pool });
  const durable = await pool.query(
    `SELECT
      (SELECT count(*)::integer FROM physiqueos.users WHERE id = $1) AS users,
      (SELECT count(*)::integer FROM physiqueos.sessions WHERE user_id = $1 AND status = 'revoked') AS revoked_sessions,
      (SELECT count(*)::integer FROM physiqueos.command_receipts WHERE user_id = $1) AS receipts,
      (SELECT count(*)::integer FROM physiqueos.stored_objects WHERE id IN ($2, $3)) AS objects,
      (SELECT count(*)::integer FROM physiqueos.feature_flags WHERE key = 'synthetic.provider.kill-switch') AS flags,
      (SELECT count(*)::integer FROM physiqueos.physiqueos_schema_migrations) AS migrations`,
    [state.ownerUserId, objectState.objectId, objectState.concurrentObjectId],
  );
  const row = durable.rows[0];
  assert(row.users === 1 && row.revoked_sessions >= 1 && row.receipts === 1 && row.objects === 2 && row.flags === 1 && row.migrations === 2, "Foundation state did not survive a process/pool restart.");
  assert(objectState.inventoryCount >= 2, "Object inventory was not captured for recovery evidence.");
  evidence.push("restart-durability");
}

async function upload(service, principal, bytes, options) {
  const partial = await uploadParts(service, principal, bytes, options);
  const completion = await service.completeUpload({ principal, uploadId: partial.begin.uploadId, parts: partial.parts });
  return { ...partial, completion };
}

async function uploadParts(service, principal, bytes, { contentType, sha256 = digest(bytes), byteLength = bytes.length, mutateContentType = null } = {}) {
  const begin = await service.beginUpload({ principal, contentType, byteLength, sha256, provenance: { fixture: "provider-acceptance" } });
  if (mutateContentType) await pool.query("UPDATE physiqueos.stored_objects SET content_type = $2 WHERE id = $1", [begin.objectId, mutateContentType]);
  const part = await service.authorizePart({ principal, uploadId: begin.uploadId, partNumber: 1 });
  const response = await fetch(part.uploadUrl, { method: "PUT", body: bytes });
  assert(response.ok && response.headers.get("etag"), `Provider part upload failed with HTTP ${response.status}.`);
  return { begin, parts: [{ partNumber: 1, etag: response.headers.get("etag").replace(/^"|"$/g, "") }] };
}

async function expectVerificationFailure(service, principal, bytes, options, code) {
  const partial = await uploadParts(service, principal, bytes, options);
  await expectProblem(code, () => service.completeUpload({ principal, uploadId: partial.begin.uploadId, parts: partial.parts }));
  const state = await pool.query("SELECT state FROM physiqueos.upload_intents WHERE id = $1", [partial.begin.uploadId]);
  assert(state.rows[0].state === "failed", `Rejected upload ${code} did not enter terminal failed state.`);
}

function adaptersFor(database) {
  return createFoundationPostgresAdapters({ query: (text, values) => database.query(text, values) });
}
function duration(iso, start) { return new Date(iso).getTime() - start.getTime(); }
function digest(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
async function expectProblem(code, work) {
  try { await work(); } catch (error) { if (error?.code === code) return error; throw error; }
  throw new Error(`Expected ${code}.`);
}
function assert(condition, message) { if (!condition) throw new Error(message); }

import { register } from "node:module";
import pg from "pg";

register("./sourceModuleResolutionHook.mjs", import.meta.url);
const { createPayloadHash } = await import("../src/contracts/v1/canonicalJson.js");
const { readAndValidateCanonicalPackage } = await import("../src/platform/migration/phase4CanonicalExport.js");
const { createPhase4CanonicalRecordStore, createInMemoryCanonicalRecordStore } = await import("../src/platform/database/Phase4CanonicalRecordStore.js");
const { createCanonicalPersistenceCommandPorts, CANONICAL_PERSISTENCE_PORT_NAMES } = await import("../src/application/commands/CanonicalPersistenceCommandPorts.js");
const { createPhase3CommandService, Phase3Command } = await import("../src/application/commands/Phase3CommandService.js");
const { createInMemoryFoundationTransactionStore } = await import("../src/platform/commands/InMemoryFoundationTransactionStore.js");
const { createPhase4TransactionRunner } = await import("../src/platform/database/phase4PostgresComposition.js");

const databaseUrl = String(process.env.PHYSIQUEOS_PHASE4_DATABASE_URL ?? "").trim();
const packageRoot = process.argv[2];
if (!databaseUrl || !packageRoot) throw new Error("PHYSIQUEOS_PHASE4_DATABASE_URL and package root are required.");
const packageData = await readAndValidateCanonicalPackage(packageRoot);
const ownerUserId = packageData.collections.user.id;
const pool = new pg.Pool({ connectionString: databaseUrl, max: 4, allowExitOnIdle: true });
const now = () => new Date("2026-08-12T04:00:00.000Z");
const principal = { userId: ownerUserId, deviceId: "phase4-device", sessionId: "phase4-session" };
const fixtureCollections = createFixtureCollections(ownerUserId);
const memoryRecords = createInMemoryCanonicalRecordStore(fixtureCollections);
const postgresRecords = createPhase4CanonicalRecordStore({ query: (text, values) => pool.query(text, values) });
try {
  const runner = createPhase4TransactionRunner({ pool });
  await pool.query("DELETE FROM physiqueos.sessions WHERE id=$1", [principal.sessionId]);
  await pool.query("DELETE FROM physiqueos.devices WHERE id=$1", [principal.deviceId]);
  await runner.run(async (transaction) => {
    await transaction.identity.createDevice({ id: principal.deviceId, userId: ownerUserId, platform: "phase4-test", displayName: "Phase 4 isolated" });
    await transaction.identity.createSession({ id: principal.sessionId, userId: ownerUserId, deviceId: principal.deviceId, authenticatedAt: now(), idleExpiresAt: new Date(now().getTime() + 86_400_000), absoluteExpiresAt: new Date(now().getTime() + 172_800_000), refreshFamilyId: "phase4-family" });
  });
  for (const [collection, records] of Object.entries(fixtureCollections)) {
    for (const record of records) await postgresRecords.put({ ownerUserId, collection, recordId: record.id, payload: record });
  }
  const memoryPorts = createCanonicalPersistenceCommandPorts({ records: memoryRecords, now });
  const postgresPorts = Object.fromEntries(CANONICAL_PERSISTENCE_PORT_NAMES.map((name) => [name, (context) =>
    createCanonicalPersistenceCommandPorts({ records: context.transaction.canonicalRecords, now })[name](context)]));
  const memory = createPhase3CommandService({ transactionRunner: createInMemoryFoundationTransactionStore(), ports: memoryPorts });
  const postgres = createPhase3CommandService({ transactionRunner: runner, ports: postgresPorts });
  const cases = commandCases();
  const results = {};
  let index = 0;
  for (const testCase of cases) {
    index += 1;
    const metadata = { commandId: commandId(index), idempotencyKey: `phase4-command-parity-${String(index).padStart(3, "0")}`, expectedVersion: testCase.expectedVersion };
    const input = { commandType: testCase.commandType, principal, metadata, payload: testCase.payload };
    const [left, right] = await Promise.all([memory.execute(input), postgres.execute(input)]);
    assertSemanticEqual(left.receipt.result, right.receipt.result, testCase.commandType);
    results[testCase.commandType] = "pass";
  }
  const outboxAfterCommands = Number((await pool.query("SELECT count(*)::integer AS count FROM physiqueos.outbox_messages WHERE topic='canonical.read-model.invalidate'")).rows[0].count);
  assert(outboxAfterCommands === cases.length, "Canonical mutations did not commit exactly one transactional outbox effect each.");

  const replayCase = cases[0];
  const replayInput = { commandType: replayCase.commandType, principal, metadata: { commandId: commandId(1), idempotencyKey: "phase4-command-parity-001" }, payload: replayCase.payload };
  const replay = await postgres.execute(replayInput);
  assert(replay.outcome === "replayed", "Committed response-loss retry did not replay its receipt.");
  assert(Number((await pool.query("SELECT count(*)::integer AS count FROM physiqueos.outbox_messages WHERE topic='canonical.read-model.invalidate'")).rows[0].count) === outboxAfterCommands, "Receipt replay duplicated its outbox effect.");
  await expectCode("IDEMPOTENCY_KEY_REUSED", () => postgres.execute({ ...replayInput, payload: { ...replayInput.payload, value: 999 } }));

  const duplicateInput = { commandType: Phase3Command.COMPLETE_PRIORITY, principal, metadata: { commandId: commandId(90), idempotencyKey: "phase4-duplicate-priority-001", expectedVersion: "1" }, payload: { priorityId: "synthetic-priority", occurrenceDate: "2026-08-11" } };
  const duplicate = await postgres.execute(duplicateInput);
  assert(duplicate.receipt.result.status === "already_completed", "Duplicate occurrence completion was not suppressed.");

  const interrupted = createPhase3CommandService({ transactionRunner: runner, ports: {
    submitWeight: async (context) => {
      await context.transaction.canonicalRecords.put({ ownerUserId, collection: "weightEntries", recordId: "synthetic-interrupted", payload: { id: "synthetic-interrupted", userId: ownerUserId, version: 1 } });
      throw new Error("synthetic interruption before commit");
    },
  } });
  await expectFailure(() => interrupted.execute({ commandType: Phase3Command.SUBMIT_WEIGHT, principal, metadata: { commandId: commandId(91), idempotencyKey: "phase4-interrupted-command" }, payload: { localDate: "2026-08-09", value: 181 } }));
  assert(await postgresRecords.get({ ownerUserId, collection: "weightEntries", recordId: "synthetic-interrupted" }) === null, "Interrupted command leaked canonical state.");
  assert(Number((await pool.query("SELECT count(*)::integer AS count FROM physiqueos.outbox_messages WHERE id=$1", [`outbox:${commandId(91)}`])).rows[0].count) === 0, "Interrupted command leaked an outbox effect.");

  await postgresRecords.put({ ownerUserId, collection: "goals", recordId: "synthetic-concurrent", payload: { id: "synthetic-concurrent", userId: ownerUserId, version: 1 } });
  const sameAggregate = await Promise.allSettled([
    transactionalPut(runner, { ownerUserId, collection: "goals", recordId: "synthetic-concurrent", expectedVersion: 1, payload: { id: "synthetic-concurrent", userId: ownerUserId, title: "web" } }),
    transactionalPut(runner, { ownerUserId, collection: "goals", recordId: "synthetic-concurrent", expectedVersion: 1, payload: { id: "synthetic-concurrent", userId: ownerUserId, title: "native" } }),
  ]);
  assert(sameAggregate.filter((item) => item.status === "fulfilled").length === 1, "Concurrent same-aggregate writes did not produce exactly one winner.");
  assert(sameAggregate.filter((item) => item.status === "rejected" && item.reason?.code === "EXPECTED_VERSION_CONFLICT").length === 1, "Concurrent stale writer did not receive a version conflict.");
  const independent = await Promise.all([
    postgresRecords.put({ ownerUserId, collection: "goals", recordId: "synthetic-independent-goal", payload: { id: "synthetic-independent-goal", userId: ownerUserId, version: 1 } }),
    postgresRecords.put({ ownerUserId, collection: "protocols", recordId: "synthetic-independent-protocol", payload: { id: "synthetic-independent-protocol", userId: ownerUserId, version: 1 } }),
  ]);
  assert(independent.length === 2, "Independent aggregate writes interfered.");
  assert(await postgresRecords.get({ ownerUserId: "cross-owner", collection: "goals", recordId: "synthetic-goal" }) === null, "Cross-owner record read was exposed.");
  await postgresRecords.put({ ownerUserId, collection: "evidencePackages", recordId: "synthetic-source-a", payload: { id: "synthetic-source-a", userId: ownerUserId }, sourceIdentity: "unique-source-identity" });
  await expectDatabaseCode("23505", () => postgresRecords.put({ ownerUserId, collection: "evidencePackages", recordId: "synthetic-source-b", payload: { id: "synthetic-source-b", userId: ownerUserId }, sourceIdentity: "unique-source-identity" }));

  process.stdout.write(`${JSON.stringify({ commandParity: results, commandCount: Object.keys(results).length, replay: "pass", payloadDrift: "pass", transactionalOutbox: "pass", interruptedRollback: "pass", sameAggregateConcurrency: "pass", independentConcurrency: "pass", duplicateOccurrence: "pass", duplicateSourceIdentity: "pass", crossOwnerRead: "pass" })}\n`);
} finally { await pool.end(); }

function createFixtureCollections(userId) {
  const record = (id, extra = {}) => ({ id, userId, version: 1, ...extra });
  return {
    goals: [record("synthetic-goal"), record("synthetic-transition-goal")],
    protocols: [record("synthetic-protocol")], executionItems: [record("synthetic-priority", { completionHistory: [] })],
    evidenceReviews: ["edit", "confirm", "dispose", "nutrition", "photo", "dexa"].map((kind) => record(`synthetic-review-${kind}`, { status: "pending" })),
    trainingPerformanceEvents: [record("synthetic-training-correct"), record("synthetic-training-draft", { reconciliations: [] })],
    weightEntries: [], dailyCheckIns: [], evidencePackages: [], goalTransitionDrafts: [], progressPhotos: [], dexaScans: [],
  };
}

function commandCases() {
  return [
    { commandType: Phase3Command.SUBMIT_WEIGHT, payload: { localDate: "2026-08-11", value: 180 } },
    { commandType: Phase3Command.SUBMIT_CHECK_IN, payload: { localDate: "2026-08-11", energy: 4 } },
    { commandType: Phase3Command.CREATE_EVIDENCE_INTAKE, payload: { submissionId: "synthetic-intake", sourceIdentity: "synthetic-intake-source" } },
    { commandType: Phase3Command.EDIT_EVIDENCE_REVIEW, payload: { reviewId: "synthetic-review-edit", changes: { note: "corrected" } }, expectedVersion: "1" },
    { commandType: Phase3Command.CONFIRM_EVIDENCE_REVIEW, payload: { reviewId: "synthetic-review-confirm" }, expectedVersion: "1" },
    { commandType: Phase3Command.DISPOSE_EVIDENCE_REVIEW, payload: { reviewId: "synthetic-review-dispose", disposition: "rejected" }, expectedVersion: "1" },
    { commandType: Phase3Command.COMPLETE_PRIORITY, payload: { priorityId: "synthetic-priority", occurrenceDate: "2026-08-11" }, expectedVersion: "1" },
    { commandType: Phase3Command.RECONCILE_PREVIOUS_DAY, payload: { localDate: "2026-08-10", items: [{ id: "item", complete: true }] }, expectedVersion: "1" },
    { commandType: Phase3Command.EDIT_PROTOCOL, payload: { protocolId: "synthetic-protocol", patch: { title: "updated" } }, expectedVersion: "1" },
    { commandType: Phase3Command.EDIT_GOAL, payload: { goalId: "synthetic-goal", patch: { title: "updated" } }, expectedVersion: "1" },
    { commandType: Phase3Command.TRANSITION_GOAL, payload: { goalId: "synthetic-transition-goal", transitionId: "synthetic-transition" }, expectedVersion: "1" },
    { commandType: Phase3Command.CREATE_TRAINING_SESSION, payload: { sessionId: "synthetic-training-new", observedAt: "2026-08-11T18:00:00.000Z" } },
    { commandType: Phase3Command.CORRECT_TRAINING_SESSION, payload: { sessionId: "synthetic-training-correct", corrections: [{ field: "load" }] }, expectedVersion: "1" },
    { commandType: Phase3Command.COMPLETE_TRAINING_LOGGER, payload: { draftId: "synthetic-training-draft", localDate: "2026-08-11" }, expectedVersion: "1" },
    { commandType: Phase3Command.CONFIRM_NUTRITION, payload: { reviewId: "synthetic-review-nutrition" }, expectedVersion: "1" },
    { commandType: Phase3Command.CONFIRM_PHOTO, payload: { reviewId: "synthetic-review-photo" }, expectedVersion: "1" },
    { commandType: Phase3Command.CONFIRM_DEXA, payload: { reviewId: "synthetic-review-dexa" }, expectedVersion: "1" },
  ];
}
function commandId(index) { return `0198f100-0000-7000-8000-${String(index).padStart(12, "0")}`; }
async function transactionalPut(runner, input) { return runner.run((transaction) => transaction.canonicalRecords.put(input)); }
function assertSemanticEqual(left, right, label) { if (createPayloadHash(left) !== createPayloadHash(right)) throw new Error(`Command parity failed for ${label}.`); }
function assert(condition, message) { if (!condition) throw new Error(message); }
async function expectCode(code, work) { try { await work(); } catch (error) { if (error.code === code) return; throw error; } throw new Error(`Expected ${code}.`); }
async function expectFailure(work) { try { await work(); } catch { return; } throw new Error("Expected command failure."); }
async function expectDatabaseCode(code, work) { try { await work(); } catch (error) { if (error.code === code) return; throw error; } throw new Error(`Expected PostgreSQL ${code}.`); }

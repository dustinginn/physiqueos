import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { createHash } from "node:crypto";
import { register } from "node:module";
import { verifyFounderRuntimeBackup } from "./lib/founderRuntimeBackup.mjs";
import { parseOperationalJsonBytes, readOperationalJsonFileSync } from "./lib/operationalJson.mjs";

register("./sourceModuleResolutionHook.mjs", import.meta.url);

const root = path.resolve(import.meta.dirname, "..");
const productionStorePath = path.join(root, "private/founder/runtime-store.json");

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ status: "failed", code: error.code ?? "CUTOVER_STAGE_FAILED",
    error: error.message }, null, 2)}\n`);
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const stage = required(args.stage, "--stage");
  const expectedStoreRevision = integer(args["expected-store-revision"], "--expected-store-revision");
  const expectedSourceHash = required(args["expected-source-hash"], "--expected-source-hash").toUpperCase();
  const approvalId = required(args["approval-id"], "--approval-id");
  const operator = required(args.operator, "--operator");
  const storePath = path.resolve(args.store ?? productionStorePath);
  const isolated = args.isolated === "true";
  const production = storePath === path.resolve(productionStorePath);
  if (production && isolated) throw safety("Production store cannot use isolated mode.");
  if (!production && !isolated) throw safety("Non-production store requires --isolated true.");
  const confirmation = `AUTHORIZE PRODUCTION ${stage} REVISION ${expectedStoreRevision}`;
  if (production && args.confirm !== confirmation) {
    throw safety(`Exact --confirm value required: ${confirmation}`);
  }
  const verifiedBackup = verifyFounderRuntimeBackup({
    backupDirectory: path.resolve(required(args["backup-directory"], "--backup-directory")) });
  if (production) {
    if (path.resolve(verifiedBackup.manifest.source.path) !== storePath)
      throw safety("Backup manifest is not bound to the production store.");
    await assertWriteFreeze();
  }

  const [{ createFounderStoreUnitOfWork }, { createFounderStoreMutationLockService }, cutover] =
    await Promise.all([
      import("../src/data/repositories/FounderStoreUnitOfWork.js"),
      import("../src/data/repositories/FounderStoreMutationLock.js"),
      import("../src/domain/services/FounderProductionCutoverService.js"),
    ]);
  if (!cutover.FOUNDER_CUTOVER_STAGE_ORDER.includes(stage)) throw safety("Unknown cutover stage.");
  const lock = createFounderStoreMutationLockService({ storePath });
  const ownership = await lock.acquire({ operation: `founder_cutover_${stage}`,
    goalId: cutover.FOUNDER_CUTOVER_GOAL_ID, requestId: approvalId,
    timeoutMs: 750, maxHoldMs: 5 * 60_000 });
  let outcome = "failed";
  let endingRevision = expectedStoreRevision;
  let errorCode = null;
  try {
    const beforeBytes = fs.readFileSync(storePath);
    if (sha256(beforeBytes) !== expectedSourceHash) throw safety("Expected source hash changed.");
    const before = parseOperationalJsonBytes(beforeBytes,
      { filePath: storePath, stage: `cutover_${stage}_source` });
    if (Number(before.revision ?? 0) !== expectedStoreRevision) throw safety("Expected revision changed.");
    const authorization = { authorized: true, scope: "founder_production_cutover_stage",
      stage, actorId: "user_founder_001", approvalId, operator };
    const prepared = cutover.applyFounderProductionCutoverStage({ store: before, stage,
      expectedStoreRevision, expectedGoalFingerprint:
        verifiedBackup.manifest.founderStore.activeGoalFingerprint,
      authorization });
    if (!prepared.changed) {
      outcome = "idempotent_no_write";
      process.stdout.write(`${JSON.stringify({ status: "matched", stage, committed: false,
        revision: expectedStoreRevision, sourceHash: expectedSourceHash }, null, 2)}\n`);
      return;
    }
    const liveStore = structuredClone(before);
    const uow = createFounderStoreUnitOfWork({ filePath: storePath, liveStore,
      binding: { storeIdentity: production ? "founder_runtime_store" : "cutover_isolated_store",
        storeKind: production ? "production" : "temporary_clone", isolated: !production,
        productionAllowed: production }, mutationLock: lock, lockOwnership: ownership,
      lockContext: { operation: `founder_cutover_${stage}`,
        goalId: cutover.FOUNDER_CUTOVER_GOAL_ID, requestId: approvalId },
      validatePersistedBaseline: (current) =>
        cutover.fingerprintCutoverValue(current) === cutover.fingerprintCutoverValue(before) });
    const transaction = uow.begin();
    if (transaction.expectedRevision !== expectedStoreRevision) throw safety("Transaction revision changed.");
    await transaction.mutate((staged) => replaceObject(staged, prepared.candidate));
    const committed = await transaction.commit({
      validate: (candidate) => candidate.revision === expectedStoreRevision,
      validateFinalized: (candidate, context) =>
        candidate.revision === context.candidateRevision,
    });
    const afterBytes = fs.readFileSync(storePath); const after = parseOperationalJsonBytes(afterBytes,
      { filePath: storePath, stage: `cutover_${stage}_post_commit` });
    endingRevision = Number(after.revision ?? 0);
    verifyPostCommit({ before, after, stage, expectedStoreRevision, cutover });
    outcome = "committed_verified";
    process.stdout.write(`${JSON.stringify({ status: "committed_verified", stage,
      transactionId: committed.transactionId, commitId: committed.commitId,
      startingRevision: expectedStoreRevision, endingRevision,
      sourceHash: expectedSourceHash, endingHash: sha256(afterBytes),
      idempotencyKey: prepared.idempotencyKey }, null, 2)}\n`);
  } catch (error) {
    errorCode = error.code ?? "CUTOVER_STAGE_FAILED";
    throw error;
  } finally {
    await lock.release(ownership, { outcome, startingStoreRevision: expectedStoreRevision,
      endingStoreRevision: endingRevision, errorCode });
  }
}

async function assertWriteFreeze() {
  const controlPath = path.join(root, "logs/physiqueos-runtime-control.json");
  const control = readOperationalJsonFileSync(controlPath,
    { stage: "cutover_runtime_control" });
  if (control.desiredState !== "stopped") throw safety("Runtime control is not intentionally stopped.");
  const ngrokControlPath = path.join(root, "logs/physiqueos-ngrok-control.json");
  const ngrokControl = readOperationalJsonFileSync(ngrokControlPath,
    { stage: "cutover_ngrok_control" });
  if (ngrokControl.ngrokDesiredState !== "running") {
    throw safety("Ngrok control is not intentionally running.");
  }
  if (await isPortOpen(3000)) throw safety("Port 3000 still has a listener.");
}
function verifyPostCommit({ before, after, stage, expectedStoreRevision, cutover }) {
  if (Number(after.revision) !== expectedStoreRevision + 1)
    throw safety("Post-commit revision did not advance exactly once.");
  const protectedNames = ["protocols", "protocolVersions", "dailyBriefings", "evidence",
    "evidencePackages", "dexaScans", "photoSessions", "goalConfidenceHistory",
    "goalConfidenceSnapshots", "confidenceInitializationArtifacts", "phaseReviewDecisions"];
  protectedNames.forEach((name) => { if (cutover.fingerprintCutoverValue(before[name] ?? []) !==
      cutover.fingerprintCutoverValue(after[name] ?? []))
    throw safety(`Protected collection changed: ${name}.`); });
  const strategy = (after.phaseStrategies ?? []).filter((item) => item.id === cutover.FOUNDER_CUTOVER_STRATEGY_ID);
  const trajectory = (after.phaseExpectedTrajectories ?? []).filter((item) => item.id === cutover.FOUNDER_CUTOVER_TRAJECTORY_ID);
  const expected = {
    [cutover.FounderCutoverStage.SEED_STRATEGY]: [strategy, "draft", 0],
    [cutover.FounderCutoverStage.REVIEW_STRATEGY]: [strategy, "ready_for_review", 1],
    [cutover.FounderCutoverStage.ACCEPT_STRATEGY]: [strategy, "accepted", 2],
    [cutover.FounderCutoverStage.SEED_TRAJECTORY]: [trajectory, "draft", 0],
    [cutover.FounderCutoverStage.REVIEW_TRAJECTORY]: [trajectory, "ready_for_review", 1],
    [cutover.FounderCutoverStage.ACCEPT_TRAJECTORY]: [trajectory, "accepted", 2],
  }[stage];
  if (expected && (expected[0].length !== 1 || expected[0][0].status !== expected[1] ||
      expected[0][0].revision !== expected[2])) throw safety("Post-commit lifecycle verification failed.");
  if (stage === cutover.FounderCutoverStage.REPAIR) {
    const goal = after.goals.find((item) => item.id === cutover.FOUNDER_CUTOVER_GOAL_ID);
    const first = goal.phases.find((item) => item.id === cutover.FOUNDER_CUTOVER_PHASE_1_ID);
    const second = goal.phases.find((item) => item.id === cutover.FOUNDER_CUTOVER_PHASE_2_ID);
    if (first.startedAt !== "2026-07-19" || first.plannedReviewAt !== "2026-08-15" ||
        first.status !== "active" || second.status !== "planned" || second.startedAt != null ||
        second.projectedNextPhaseStart !== "2026-08-16") throw safety("Repair verification failed.");
  }
}
function replaceObject(target, source) { Object.keys(target).forEach((key) => delete target[key]);
  Object.assign(target, structuredClone(source)); }
function isPortOpen(port) { return new Promise((resolve) => { const socket = net.createConnection({ port,
  host: "127.0.0.1" }); const done = (value) => { socket.destroy(); resolve(value); };
  socket.setTimeout(500); socket.once("connect", () => done(true)); socket.once("timeout", () => done(false));
  socket.once("error", () => done(false)); }); }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex").toUpperCase(); }
function parseArgs(values) { const result = {}; for (let index = 0; index < values.length; index += 2) {
  const key = values[index]; if (!key?.startsWith("--") || values[index + 1] == null)
    throw safety(`Invalid argument: ${key ?? "missing"}`); result[key.slice(2)] = values[index + 1]; }
  return result; }
function required(value, field) { if (typeof value !== "string" || !value.trim())
  throw safety(`${field} is required.`); return value.trim(); }
function integer(value, field) { const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < 0)
  throw safety(`${field} must be a non-negative integer.`); return parsed; }
function safety(message) { const error = new Error(message); error.code = "FOUNDER_CUTOVER_SAFETY_STOP"; return error; }

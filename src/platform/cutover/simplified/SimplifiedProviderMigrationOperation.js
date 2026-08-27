import { createPayloadHash } from "../../../contracts/v1/canonicalJson.js";
import { createPostgresTransactionRunner } from "../../database/transaction.js";
import { SIMPLIFIED_MIGRATION_MODE } from "./SimplifiedMigrationEligibility.js";
import { SIMPLIFIED_PROVIDER_PHASES } from "./SimplifiedProviderMigrationExecution.js";

export const SIMPLIFIED_PROVIDER_OPERATION_VERSION = "simplified-provider-migration-operation-v1";
export const SIMPLIFIED_PROVIDER_OPERATION_TOPIC = "operations.simplified-provider-migration";
export const SIMPLIFIED_PROVIDER_OPERATION_PAYLOAD_VERSION = "simplified-provider-migration-outbox-v1";
export const SIMPLIFIED_PROVIDER_DIAGNOSTIC_PHASES = Object.freeze([
  "ENVIRONMENT_CONSTRUCTION_STARTED",
  "ENVIRONMENT_CONSTRUCTION_COMPLETE",
  "TRANSPORT_STREAM_HASH_STARTED",
  "TRANSPORT_STREAM_HASH_COMPLETE",
  "ARCHIVE_LIST_STARTED",
  "ARCHIVE_LIST_COMPLETE",
  "ARCHIVE_EXTRACT_STARTED",
  "ARCHIVE_EXTRACT_COMPLETE",
  "ARCHIVE_LAYOUT_VALIDATION_STARTED",
  "ARCHIVE_LAYOUT_VALIDATION_COMPLETE",
  "RUNNER_ENTRY",
  "PACKAGE_VALIDATION_STARTED",
  "PACKAGE_VALIDATION_COMPLETE",
  "MEDIA_VALIDATION_STARTED",
  "MEDIA_VALIDATION_COMPLETE",
  "PREIMPORT_GATE_STARTED",
  "PREIMPORT_GATE_COMPLETE",
  "RUNNER_EXIT",
  "TRANSPORT_CLEANUP_STARTED",
  "TRANSPORT_CLEANUP_COMPLETE",
]);

export function validateSimplifiedProviderMigrationRequest(input = {}, context = {}) {
  const request = Object.freeze({
    contractVersion: requiredExact(input.contractVersion, SIMPLIFIED_PROVIDER_OPERATION_VERSION, "contractVersion"),
    commandId: identifier(input.commandId, "commandId"),
    migrationMode: requiredExact(input.migrationMode, SIMPLIFIED_MIGRATION_MODE, "migrationMode"),
    phase: requiredPhase(input.phase),
    execute: input.execute === true,
    migrationOperationId: identifier(input.migrationOperationId, "migrationOperationId"),
    migrationId: required(input.migrationId, "migrationId"),
    packageDigest: digest(input.packageDigest, "packageDigest"),
    runtimeRevision: integer(input.runtimeRevision, "runtimeRevision"),
    runtimeSha256: digest(input.runtimeSha256, "runtimeSha256"),
    controlSha256: digest(input.controlSha256, "controlSha256"),
    backupInventorySha256: digest(input.backupInventorySha256, "backupInventorySha256"),
    mediaCount: integer(input.mediaCount, "mediaCount"),
    mediaBytes: integer(input.mediaBytes, "mediaBytes"),
    mediaInventorySha256: digest(input.mediaInventorySha256, "mediaInventorySha256"),
    frozenSourceCommit: commit(input.frozenSourceCommit, "frozenSourceCommit"),
    frozenBuildId: required(input.frozenBuildId, "frozenBuildId"),
    providerSourceCommit: commit(input.providerSourceCommit, "providerSourceCommit"),
    providerBuildId: required(input.providerBuildId, "providerBuildId"),
    windowsCold: input.windowsCold === true,
    transport: Object.freeze({
      objectKey: transportKey(input.transport?.objectKey),
      byteLength: integer(input.transport?.byteLength, "transport.byteLength"),
      sha256: digest(input.transport?.sha256, "transport.sha256"),
    }),
    authority: Object.freeze({
      environment: optional(input.authority?.environment),
      commandPrefix: optional(input.authority?.commandPrefix),
      fenceId: optional(input.authority?.fenceId),
      routingTarget: optional(input.authority?.routingTarget),
      routingReady: input.authority?.routingReady === true,
    }),
  });
  if (request.phase === "pre-import" && request.execute) {
    throw operationError("SIMPLIFIED_PROVIDER_PREFLIGHT_MUST_BE_READ_ONLY", "Pre-import rejects execution authorization.");
  }
  if (request.phase !== "pre-import" && (!request.execute || !request.windowsCold)) {
    throw operationError("SIMPLIFIED_PROVIDER_EXECUTION_AUTHORIZATION_REQUIRED", "A mutating provider phase requires explicit execution authorization and a cold Windows source.");
  }
  if (["prepare-authority", "transfer-authority"].includes(request.phase)
    && Object.values(request.authority).slice(0, 4).some((value) => !value)) {
    throw operationError("SIMPLIFIED_PROVIDER_AUTHORITY_INPUT_REQUIRED", "Authority phases require the existing authority and routing identities.");
  }
  assertContext(request, context);
  return request;
}

export function fingerprintSimplifiedProviderMigrationRequest(request) {
  return createPayloadHash(request);
}

export function createPostgresSimplifiedProviderMigrationOperationStore({
  pool,
  ownerUserId,
  clock = () => new Date(),
} = {}) {
  if (!pool?.query || !pool?.connect) throw new Error("Simplified provider operation storage requires PostgreSQL.");
  const owner = required(ownerUserId, "ownerUserId");
  const transactions = createPostgresTransactionRunner({ pool });
  return Object.freeze({
    async enqueue({ request, payloadFingerprint }) {
      return transactions.run(async ({ query }) => {
        await requireAcceptedDryRun(query, request);
        const existing = (await query("SELECT * FROM physiqueos.operations WHERE id=$1 FOR UPDATE", [request.commandId])).rows[0];
        if (existing) {
          const operation = mapOperation(existing);
          if (operation.result?.payloadFingerprint !== payloadFingerprint) {
            throw operationError("SIMPLIFIED_PROVIDER_OPERATION_CONFLICT", "The command ID is already bound to a different provider operation.");
          }
          return Object.freeze({ operation, replayed: true });
        }
        const queuedAt = clock();
        const result = baseResult(request, payloadFingerprint, queuedAt.toISOString());
        const operation = (await query(
          `INSERT INTO physiqueos.operations (id,user_id,operation_type,status,result,problem,created_at,updated_at)
           VALUES ($1,$2,$3,'queued',$4,NULL,$5,$5) RETURNING *`,
          [request.commandId, owner, SIMPLIFIED_PROVIDER_OPERATION_VERSION, result, queuedAt],
        )).rows[0];
        await query(
          `INSERT INTO physiqueos.outbox_messages
             (id,user_id,operation_id,topic,dedupe_key,payload_version,payload,due_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            `simplified-provider:${request.commandId}`,
            owner,
            request.commandId,
            SIMPLIFIED_PROVIDER_OPERATION_TOPIC,
            request.commandId,
            SIMPLIFIED_PROVIDER_OPERATION_PAYLOAD_VERSION,
            { request, payloadFingerprint },
            queuedAt,
          ],
        );
        return Object.freeze({ operation: mapOperation(operation), replayed: false });
      });
    },
    async find(commandId) {
      return mapOperation((await pool.query(
        "SELECT * FROM physiqueos.operations WHERE id=$1 AND operation_type=$2",
        [commandId, SIMPLIFIED_PROVIDER_OPERATION_VERSION],
      )).rows[0]);
    },
    async markRunning(commandId) {
      const row = (await pool.query(
        `UPDATE physiqueos.operations SET status='running',version=version+1,updated_at=$3,
           result=jsonb_set(result,'{startedAt}',to_jsonb($4::text),true)
         WHERE id=$1 AND operation_type=$2 AND status='queued' RETURNING *`,
        [commandId, SIMPLIFIED_PROVIDER_OPERATION_VERSION, clock(), clock().toISOString()],
      )).rows[0];
      if (!row) throw operationError("SIMPLIFIED_PROVIDER_OPERATION_NOT_RUNNABLE", "The provider operation is missing or no longer runnable.");
      return mapOperation(row);
    },
    async markPhase(commandId, marker) {
      const at = clock();
      const row = (await pool.query(
        `UPDATE physiqueos.operations SET version=version+1,updated_at=$4,
           result=jsonb_set(result,'{diagnosticPhases}',
             COALESCE(result->'diagnosticPhases','[]'::jsonb) || $3::jsonb,true)
         WHERE id=$1 AND operation_type=$2 AND status='running' RETURNING *`,
        [commandId, SIMPLIFIED_PROVIDER_OPERATION_VERSION, JSON.stringify([marker]), at],
      )).rows[0];
      if (!row) throw operationError("SIMPLIFIED_PROVIDER_OPERATION_NOT_RUNNABLE", "The provider operation could not record its diagnostic phase.");
      return mapOperation(row);
    },
    async succeed(commandId, result) {
      const at = clock();
      const row = (await pool.query(
        `UPDATE physiqueos.operations SET status='succeeded',version=version+1,result=$3,problem=NULL,updated_at=$4
         WHERE id=$1 AND operation_type=$2 AND status='running' RETURNING *`,
        [commandId, SIMPLIFIED_PROVIDER_OPERATION_VERSION, result, at],
      )).rows[0];
      if (!row) throw operationError("SIMPLIFIED_PROVIDER_OPERATION_NOT_RUNNABLE", "The provider operation could not record success.");
      return mapOperation(row);
    },
    async fail(commandId, result, problem) {
      const at = clock();
      const row = (await pool.query(
        `UPDATE physiqueos.operations SET status='failed',version=version+1,result=$3,problem=$4,updated_at=$5
         WHERE id=$1 AND operation_type=$2 AND status='running' RETURNING *`,
        [commandId, SIMPLIFIED_PROVIDER_OPERATION_VERSION, result, problem, at],
      )).rows[0];
      if (!row) throw operationError("SIMPLIFIED_PROVIDER_OPERATION_NOT_RUNNABLE", "The provider operation could not record failure.");
      return mapOperation(row);
    },
  });
}

export function createSimplifiedProviderMigrationController({ store, validationContext } = {}) {
  if (!store?.enqueue || !store?.find) throw new Error("Simplified provider operation controller requires durable storage.");
  return Object.freeze({
    async submit(input) {
      const request = validateSimplifiedProviderMigrationRequest(input, validationContext);
      const payloadFingerprint = fingerprintSimplifiedProviderMigrationRequest(request);
      const result = await store.enqueue({ request, payloadFingerprint });
      return Object.freeze({ status: result.replayed ? 200 : 202, body: publicOperation(result.operation) });
    },
    async status(commandId) {
      const operation = await store.find(identifier(commandId, "commandId"));
      if (!operation) throw operationError("SIMPLIFIED_PROVIDER_OPERATION_NOT_FOUND", "The provider operation was not found.");
      return Object.freeze({ status: 200, body: publicOperation(operation) });
    },
  });
}

export function createSimplifiedProviderMigrationWorkerHandler({
  store,
  validationContext,
  createEnvironment,
  executeMigration,
  logger,
  clock = () => new Date(),
} = {}) {
  if (!store?.markRunning || !store?.markPhase || !store?.succeed || !store?.fail) throw new Error("Simplified provider worker requires durable operation storage.");
  if (typeof createEnvironment !== "function" || typeof executeMigration !== "function") throw new Error("Simplified provider worker requires in-process environment and execution functions.");
  return async function handle({ messageId, payloadVersion, payload }) {
    if (payloadVersion !== SIMPLIFIED_PROVIDER_OPERATION_PAYLOAD_VERSION) {
      throw operationError("SIMPLIFIED_PROVIDER_PAYLOAD_VERSION_UNSUPPORTED", "The simplified provider operation payload version is unsupported.");
    }
    const request = validateSimplifiedProviderMigrationRequest(payload?.request, validationContext);
    if (payload?.payloadFingerprint !== fingerprintSimplifiedProviderMigrationRequest(request)) {
      throw operationError("SIMPLIFIED_PROVIDER_PAYLOAD_FINGERPRINT_MISMATCH", "The simplified provider operation fingerprint is invalid.");
    }
    const running = await store.markRunning(request.commandId);
    const diagnosticPhases = [];
    const observePhase = async (phase, details = {}) => {
      const marker = diagnosticMarker(phase, details, clock);
      diagnosticPhases.push(marker);
      await store.markPhase(request.commandId, marker);
      logger?.info?.("simplified_provider_migration.phase", {
        commandId: request.commandId,
        phase: marker.phase,
        rss: marker.memory.rss,
        heapUsed: marker.memory.heapUsed,
        maxRssBytes: marker.memory.maxRssBytes,
      });
    };
    let environment;
    let materialized;
    try {
      await observePhase("ENVIRONMENT_CONSTRUCTION_STARTED");
      environment = await createEnvironment({ request });
      await observePhase("ENVIRONMENT_CONSTRUCTION_COMPLETE");
      materialized = await environment.transport.materialize(request.transport, { observePhase });
      await observePhase("RUNNER_ENTRY");
      const execution = await executeMigration({
        phase: request.phase,
        execute: request.execute,
        env: environment.env,
        pool: environment.pool,
        objectProvider: environment.objectProvider,
        args: toExecutionArgs(request, materialized, messageId),
        observePhase,
      });
      await observePhase("RUNNER_EXIT");
      await observePhase("TRANSPORT_CLEANUP_STARTED");
      const cleanup = await materialized.cleanup();
      materialized = null;
      await observePhase("TRANSPORT_CLEANUP_COMPLETE", cleanup);
      const result = Object.freeze({
        ...running.result,
        state: "succeeded",
        completedAt: clock().toISOString(),
        execution: safeExecutionResult(execution),
        transport: { ...environment.transportSummary(request.transport), ...cleanup },
        diagnosticPhases,
        inProcess: true,
        workerPid: process.pid,
      });
      await store.succeed(request.commandId, result);
      logger?.info?.("simplified_provider_migration.succeeded", { commandId: request.commandId, phase: request.phase });
      return result;
    } catch (error) {
      const cleanupFailure = await materialized?.cleanup?.().then(() => null, (failure) => failure);
      const problem = safeProblem(cleanupFailure ?? error);
      const result = Object.freeze({
        ...running.result,
        state: "failed",
        completedAt: clock().toISOString(),
        diagnosticPhases,
        inProcess: true,
        workerPid: process.pid,
      });
      await store.fail(request.commandId, result, problem);
      logger?.error?.("simplified_provider_migration.failed", { commandId: request.commandId, phase: request.phase, code: problem.code });
      return result;
    } finally {
      await environment?.close?.();
    }
  };
}

function toExecutionArgs(request, materialized, currentOutboxMessageId) {
  return Object.freeze({
    packagePath: materialized.packageRoot,
    mediaRoot: materialized.mediaRoot,
    migrationOperationId: request.migrationOperationId,
    migrationId: request.migrationId,
    runtimeRevision: request.runtimeRevision,
    runtimeSha256: request.runtimeSha256,
    frozenSourceCommit: request.frozenSourceCommit,
    packageDigest: request.packageDigest,
    controlSha256: request.controlSha256,
    mediaInventorySha256: request.mediaInventorySha256,
    authorityEnvironment: request.authority.environment,
    frozenBuildId: request.frozenBuildId,
    commandPrefix: request.authority.commandPrefix,
    fenceId: request.authority.fenceId,
    routingTarget: request.authority.routingTarget,
    windowsCold: request.windowsCold,
    routingReady: request.authority.routingReady,
    currentOutboxMessageId,
  });
}

async function requireAcceptedDryRun(query, request) {
  const row = (await query(
    "SELECT result,validation_result,report FROM physiqueos.migration_runs WHERE id=$1",
    [request.migrationOperationId],
  )).rows[0];
  const dryRun = row?.report?.result;
  const backup = dryRun?.providerChecks?.backup;
  if (row?.result !== "succeeded" || row?.validation_result !== "succeeded"
    || dryRun?.finalClassification !== "READY"
    || backup?.canonicalPackage?.migrationId !== request.migrationId
    || backup?.canonicalPackage?.packageDigest !== request.packageDigest
    || backup?.migrationControl?.sha256 !== request.controlSha256
    || backup?.finalRollbackBackup?.sha256 !== request.backupInventorySha256) {
    throw operationError("SIMPLIFIED_PROVIDER_DRY_RUN_REQUIRED", "The exact frozen package has no accepted READY provider dry-run.");
  }
}

function assertContext(request, context) {
  const comparisons = [
    [request.runtimeRevision, Number(context.founder?.revision)],
    [request.runtimeSha256, context.founder?.sha256],
    [request.mediaCount, Number(context.media?.count)],
    [request.mediaBytes, Number(context.media?.bytes)],
    [request.mediaInventorySha256, context.media?.sha256],
    [request.backupInventorySha256, context.backup?.sha256],
    [request.frozenSourceCommit, context.frozen?.sourceCommit],
    [request.frozenBuildId, context.frozen?.buildId],
    [request.providerSourceCommit, context.provider?.sourceCommit],
    [request.providerBuildId, context.provider?.buildId],
  ];
  if (comparisons.some(([actual, expected]) => actual !== expected)) {
    throw operationError("SIMPLIFIED_PROVIDER_EXPECTED_IDENTITY_MISMATCH", "The provider operation differs from the deployed accepted identities.");
  }
}

function baseResult(request, payloadFingerprint, queuedAt) {
  return Object.freeze({
    contractVersion: SIMPLIFIED_PROVIDER_OPERATION_VERSION,
    commandId: request.commandId,
    migrationOperationId: request.migrationOperationId,
    phase: request.phase,
    payloadFingerprint,
    state: "queued",
    queuedAt,
    inProcess: true,
  });
}
function mapOperation(row) {
  if (!row) return null;
  return Object.freeze({
    commandId: row.id,
    state: row.status,
    version: Number(row.version),
    result: row.result ?? null,
    problem: row.problem ?? null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  });
}
function publicOperation(operation) {
  return Object.freeze({
    commandId: operation.commandId,
    state: operation.state,
    version: operation.version,
    result: operation.result,
    problem: operation.problem,
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt,
  });
}
function safeExecutionResult(result) {
  return JSON.parse(JSON.stringify(result, (_key, value) =>
    typeof value === "string" && /postgres(?:ql)?:\/\//i.test(value) ? "[REDACTED]" : value));
}
function safeProblem(error) {
  const code = String(error?.code ?? "SIMPLIFIED_PROVIDER_OPERATION_FAILED").toUpperCase();
  return Object.freeze({
    code: /^[A-Z0-9_]{3,80}$/.test(code) ? code : "SIMPLIFIED_PROVIDER_OPERATION_FAILED",
    message: "The in-process provider migration operation failed; inspect protected worker logs.",
  });
}
function diagnosticMarker(phase, details, clock) {
  if (!SIMPLIFIED_PROVIDER_DIAGNOSTIC_PHASES.includes(phase)) {
    throw operationError("SIMPLIFIED_PROVIDER_DIAGNOSTIC_PHASE_INVALID", "The provider diagnostic phase is invalid.");
  }
  const memory = process.memoryUsage();
  const maximumRss = process.resourceUsage().maxRSS;
  return Object.freeze({
    phase,
    observedAt: clock().toISOString(),
    workerPid: process.pid,
    memory: Object.freeze({
      rss: memory.rss,
      heapTotal: memory.heapTotal,
      heapUsed: memory.heapUsed,
      external: memory.external,
      arrayBuffers: memory.arrayBuffers,
      maxRssBytes: process.platform === "linux" ? maximumRss * 1024 : maximumRss,
    }),
    details: safeDiagnosticDetails(details),
  });
}
function safeDiagnosticDetails(details) {
  const safe = {};
  for (const [key, value] of Object.entries(details ?? {})) {
    if (/^(?:expectedByteLength|byteLength|archiveBytes|entryCount|listingBytes|extractedBytes|extractedFiles|temporaryFreeBytes|temporaryTotalBytes|collectionCount|mediaCount|mediaBytes|deletedExactVersion|localRemoved|ready)$/.test(key)
      && (value === null || ["string", "number", "boolean"].includes(typeof value))) safe[key] = value;
  }
  return Object.freeze(safe);
}
function requiredPhase(value) {
  const phase = required(value, "phase");
  if (!SIMPLIFIED_PROVIDER_PHASES.includes(phase)) throw operationError("SIMPLIFIED_PROVIDER_PHASE_UNSUPPORTED", "The simplified provider phase is unsupported.");
  return phase;
}
function requiredExact(value, expected, field) {
  if (value !== expected) throw operationError("SIMPLIFIED_PROVIDER_CONTRACT_INVALID", `${field} is invalid.`);
  return expected;
}
function identifier(value, field) {
  const candidate = required(value, field);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/.test(candidate) || candidate.includes("..")) throw operationError("SIMPLIFIED_PROVIDER_IDENTITY_INVALID", `${field} is invalid.`);
  return candidate;
}
function digest(value, field) {
  const candidate = String(value ?? "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(candidate)) throw operationError("SIMPLIFIED_PROVIDER_IDENTITY_INVALID", `${field} is invalid.`);
  return candidate;
}
function commit(value, field) {
  const candidate = String(value ?? "").toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(candidate)) throw operationError("SIMPLIFIED_PROVIDER_IDENTITY_INVALID", `${field} is invalid.`);
  return candidate;
}
function transportKey(value) {
  const candidate = required(value, "transport.objectKey");
  if (!/^migration-staging\/simplified-[A-Za-z0-9._-]{8,120}\/[A-Za-z0-9._-]{8,120}\.tar$/.test(candidate)
    || candidate.includes("..")) {
    throw operationError("SIMPLIFIED_TRANSPORT_KEY_INVALID", "transport.objectKey is invalid.");
  }
  return candidate;
}
function integer(value, field) {
  const candidate = Number(value);
  if (!Number.isSafeInteger(candidate) || candidate < 0) throw operationError("SIMPLIFIED_PROVIDER_IDENTITY_INVALID", `${field} is invalid.`);
  return candidate;
}
function required(value, field) {
  const candidate = String(value ?? "").trim();
  if (!candidate) throw operationError("SIMPLIFIED_PROVIDER_REQUIRED", `${field} is required.`);
  return candidate;
}
function optional(value) { return value == null ? null : String(value).trim() || null; }
function operationError(code, message) { return Object.assign(new Error(message), { code }); }

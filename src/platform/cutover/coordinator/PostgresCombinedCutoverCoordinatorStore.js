import {
  CoordinatorErrorCode, CoordinatorStep, CoordinatorStepStatus, coordinatorError, freeze, requireRunId,
} from "./combinedCutoverCoordinatorContract.js";
import { validateCoordinatorBSnapshot } from "./combinedCutoverBSnapshot.js";

export function createPostgresCombinedCutoverCoordinatorStore({ pool } = {}) {
  if (!pool?.connect || !pool?.query) throw new Error("Coordinator state requires PostgreSQL.");
  return freeze({ createRun, readRun, beginStep, beginRecovery, recordStepOutcome, saveBSnapshot });

  async function createRun(identity) {
    const value = normalizeIdentity(identity);
    const inserted = await pool.query(
      `INSERT INTO physiqueos.combined_cutover_coordinator_runs
       (run_id,coordinator_operation_id,migration_operation_id,environment,authorization_fingerprint,input_digest)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (run_id) DO NOTHING RETURNING *`,
      [value.runId, value.coordinatorOperationId, value.migrationOperationId, value.environment, value.authorizationFingerprint, value.inputDigest],
    );
    if (inserted.rows[0]) return freeze({ run: row(inserted.rows[0]), outcome: "created" });
    const existing = await readRun(value.runId);
    assertIdentity(existing.run, value);
    return freeze({ run: existing.run, outcome: "idempotent-replay" });
  }

  async function readRun(runId) {
    const result = await pool.query("SELECT * FROM physiqueos.combined_cutover_coordinator_runs WHERE run_id=$1", [requireRunId(runId)]);
    if (!result.rows[0]) throw coordinatorError(CoordinatorErrorCode.RUN_NOT_FOUND, "Coordinator run does not exist.");
    return freeze({ run: row(result.rows[0]) });
  }

  async function beginStep({ runId, expectedVersion, step, approvalFingerprint = null }) {
    return update({ runId, expectedVersion, apply(current) {
      if (current.currentStep !== step || ![CoordinatorStepStatus.NOT_STARTED, CoordinatorStepStatus.FAILED_CONCLUSIVE, CoordinatorStepStatus.BLOCKED_PRECONDITION].includes(current.stepStatus)) {
        throw coordinatorError(CoordinatorErrorCode.STALE_STATE, "Coordinator step is not eligible to begin.");
      }
      const approvals = { ...current.approvalFingerprints };
      if (approvalFingerprint) approvals[step] = approvalFingerprint;
      return { currentStep: step, stepStatus: CoordinatorStepStatus.IN_PROGRESS_OR_UNRESOLVED, approvalFingerprints: approvals, failureCode: null };
    } });
  }

  async function beginRecovery({ runId, expectedVersion, approvalFingerprint, recoveryStep }) {
    return update({ runId, expectedVersion, apply(current) {
      if ([CoordinatorStepStatus.ABORTED_TO_WINDOWS, CoordinatorStepStatus.PROVIDER_FORWARD_RECOVERY].includes(current.stepStatus) ||
          current.failureCode === "COORDINATOR_RECOVERY_IN_PROGRESS" || current.failureCode === "COORDINATOR_RECOVERY_AMBIGUOUS") {
        throw coordinatorError(CoordinatorErrorCode.STALE_STATE, "Coordinator recovery is already terminal or unresolved.");
      }
      const approvals = { ...current.approvalFingerprints, recovery: approvalFingerprint };
      return { stepStatus: CoordinatorStepStatus.IN_PROGRESS_OR_UNRESOLVED, approvalFingerprints: approvals, failureCode: "COORDINATOR_RECOVERY_IN_PROGRESS", evidenceRefs: { ...current.evidenceRefs, recovery: { status: "reserved", recoveryStep } } };
    } });
  }

  async function recordStepOutcome({ runId, expectedVersion, step, status, evidenceRef = null, failureCode = null, completed = false, mBoundaryCrossed = false, approvalFingerprint = null }) {
    return update({ runId, expectedVersion, apply(current) {
      if (current.currentStep !== step) throw coordinatorError(CoordinatorErrorCode.STALE_STATE, "Coordinator step changed before outcome recording.");
      const completedSteps = completed && !current.completedSteps.includes(step) ? [...current.completedSteps, step] : current.completedSteps;
      const evidenceRefs = { ...current.evidenceRefs };
      if (evidenceRef) evidenceRefs[step] = safeJson(evidenceRef, "evidenceRef");
      const approvalFingerprints = approvalFingerprint ? { ...current.approvalFingerprints, recovery: approvalFingerprint } : current.approvalFingerprints;
      const next = completed ? nextStep(completedSteps) : step;
      return {
        currentStep: next,
        stepStatus: completed ? (next === CoordinatorStep.COMPLETE ? CoordinatorStepStatus.COMPLETED : CoordinatorStepStatus.NOT_STARTED) : status,
        completedSteps, evidenceRefs, approvalFingerprints, failureCode, mBoundaryCrossed: current.mBoundaryCrossed || mBoundaryCrossed,
      };
    } });
  }

  async function saveBSnapshot({ runId, expectedVersion, snapshot }) {
    const envelope = validateCoordinatorBSnapshot(snapshot, { runId: requireRunId(runId) });
    return update({ runId, expectedVersion, apply(current) {
      if (current.currentStep !== CoordinatorStep.B || current.stepStatus !== CoordinatorStepStatus.IN_PROGRESS_OR_UNRESOLVED) {
        throw coordinatorError(CoordinatorErrorCode.STALE_STATE, "B snapshot may only be retained while B is active.");
      }
      if (current.bSnapshot) {
        if (current.bSnapshotDigest !== envelope.digest) throw coordinatorError(CoordinatorErrorCode.SNAPSHOT_CONFLICT, "A conflicting B snapshot already exists for this run.");
        return null;
      }
      return { bSnapshot: envelope, bSnapshotDigest: envelope.digest };
    } });
  }

  async function update({ runId, expectedVersion, apply }) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query("SELECT * FROM physiqueos.combined_cutover_coordinator_runs WHERE run_id=$1 FOR UPDATE", [requireRunId(runId)]);
      if (!selected.rows[0]) throw coordinatorError(CoordinatorErrorCode.RUN_NOT_FOUND, "Coordinator run does not exist.");
      const current = row(selected.rows[0]);
      if (current.version !== Number(expectedVersion)) throw coordinatorError(CoordinatorErrorCode.STALE_STATE, "Coordinator CAS version is stale.", { expectedVersion, observedVersion: current.version });
      const patch = apply(current);
      if (!patch) { await client.query("COMMIT"); return freeze({ run: current, outcome: "idempotent-replay" }); }
      const next = { ...current, ...patch };
      const result = await client.query(
        `UPDATE physiqueos.combined_cutover_coordinator_runs SET
          version=version+1,current_step=$2,step_status=$3,completed_steps=$4::jsonb,evidence_refs=$5::jsonb,
          approval_fingerprints=$6::jsonb,b_snapshot=$7::jsonb,b_snapshot_digest=$8,m_boundary_crossed=$9,failure_code=$10,updated_at=now()
         WHERE run_id=$1 AND version=$11 RETURNING *`,
        [current.runId, next.currentStep, next.stepStatus, JSON.stringify(next.completedSteps), JSON.stringify(next.evidenceRefs),
          JSON.stringify(next.approvalFingerprints), next.bSnapshot ? JSON.stringify(next.bSnapshot) : null, next.bSnapshotDigest,
          next.mBoundaryCrossed, next.failureCode, current.version],
      );
      if (!result.rows[0]) throw coordinatorError(CoordinatorErrorCode.STALE_STATE, "Coordinator CAS update lost its version race.");
      await client.query("COMMIT");
      return freeze({ run: row(result.rows[0]), outcome: "updated" });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }
}

function row(value) {
  return freeze({
    schemaVersion: Number(value.schema_version), runId: value.run_id, coordinatorOperationId: value.coordinator_operation_id,
    migrationOperationId: value.migration_operation_id, environment: value.environment,
    authorizationFingerprint: value.authorization_fingerprint, inputDigest: value.input_digest, version: Number(value.version),
    currentStep: value.current_step, stepStatus: value.step_status, completedSteps: value.completed_steps ?? [],
    evidenceRefs: value.evidence_refs ?? {}, approvalFingerprints: value.approval_fingerprints ?? {},
    bSnapshot: value.b_snapshot ?? null, bSnapshotDigest: value.b_snapshot_digest,
    mBoundaryCrossed: value.m_boundary_crossed === true, failureCode: value.failure_code,
    createdAt: iso(value.created_at), updatedAt: iso(value.updated_at),
  });
}
function normalizeIdentity(value) { return freeze({ runId: requireRunId(value?.runId), coordinatorOperationId: requireRunId(value?.coordinatorOperationId, "coordinatorOperationId"), migrationOperationId: requireRunId(value?.migrationOperationId, "migrationOperationId"), environment: required(value?.environment, "environment"), authorizationFingerprint: digest(value?.authorizationFingerprint, "authorizationFingerprint"), inputDigest: digest(value?.inputDigest, "inputDigest") }); }
function assertIdentity(run, expected) { for (const key of Object.keys(expected)) if (run[key] !== expected[key]) throw coordinatorError(CoordinatorErrorCode.RUN_CONFLICT, "Coordinator run identity conflicts with durable state.", { runId: run.runId }); }
function nextStep(completed) { const order = ["A","B","C_D","E","F_G","H_I_J","K","L","M","N_O","P"]; return order.find((step) => !completed.includes(step)) ?? CoordinatorStep.COMPLETE; }
function safeJson(value, field) { const text = JSON.stringify(value); if (text.length > 65536 || /"(?:token|credential|authorization|payload|commandLine|taskXml|providerBody)"\s*:/i.test(text)) throw coordinatorError(CoordinatorErrorCode.IDENTITY_MISMATCH, `${field} contains unsafe or oversized evidence.`); return JSON.parse(text); }
function digest(value, field) { const result = String(value ?? "").toLowerCase(); if (!/^[0-9a-f]{64}$/.test(result)) throw coordinatorError(CoordinatorErrorCode.IDENTITY_MISMATCH, `${field} is invalid.`); return result; }
function required(value, field) { const result = String(value ?? "").trim(); if (!result) throw coordinatorError(CoordinatorErrorCode.IDENTITY_MISMATCH, `${field} is required.`); return result; }
function iso(value) { return value instanceof Date ? value.toISOString() : value == null ? null : String(value); }

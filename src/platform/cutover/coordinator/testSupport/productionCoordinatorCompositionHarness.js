import { createExternalCombinedCutoverCoordinator, coordinatorInputDigest } from "../ExternalCombinedCutoverCoordinator.js";
import { createPostgresCombinedCutoverCoordinatorStore } from "../PostgresCombinedCutoverCoordinatorStore.js";
import { coordinatorStateDigest } from "../combinedCutoverCoordinatorAuthorization.js";
import { createDeterministicAuthorityStore, createDeterministicCoordinatorServices } from "./deterministicCoordinatorServices.js";

export const COMPOSITION_RUN_ID = "phase7b-composition-run-1";
export const COMPOSITION_OPERATION_ID = "phase7b-composition-operation-1";
export const COMPOSITION_NOW = "2026-08-21T06:00:00.000Z";
const GATED = new Set(["B", "L", "M", "N_O"]);

/** Local-only graph: real coordinator + real PostgreSQL store over deterministic I/O boundaries. */
export async function createProductionCoordinatorCompositionHarness({ modes = {} } = {}) {
  const postgres = createCoordinatorPoolTransport();
  const store = createPostgresCombinedCutoverCoordinatorStore({ pool: postgres.pool });
  const authorityStore = createDeterministicAuthorityStore();
  const deterministic = createDeterministicCoordinatorServices({ authorityStore, modes });
  const coordinator = createExternalCombinedCutoverCoordinator({ store, authorityStore, services: deterministic.services, now: () => new Date(COMPOSITION_NOW) });
  const input = {
    migrationOperationId: COMPOSITION_OPERATION_ID,
    commandPrefix: "phase7b-composition",
    authorizationFingerprint: "a".repeat(64),
    expectedRuntimeSha256: "b".repeat(64),
    expectedRuntimeRevision: 358,
    providerDeploymentId: "deployment-composition-1",
    providerBuildId: "phase7b-composition-build",
    routingTarget: "provider",
    firstProviderCommandId: "phase7b-composition:first-provider-command",
  };
  await coordinator.createRun({ identity: {
    runId: COMPOSITION_RUN_ID,
    coordinatorOperationId: "phase7b-composition-coordinator-1",
    migrationOperationId: COMPOSITION_OPERATION_ID,
    environment: "phase7b-local-composition",
    authorizationFingerprint: input.authorizationFingerprint,
    inputDigest: coordinatorInputDigest(input),
  } });
  return Object.freeze({ coordinator, store, authorityStore, deterministic, input, postgres });
}

export async function advanceComposition(harness) {
  const run = (await harness.store.readRun(COMPOSITION_RUN_ID)).run;
  const authorization = GATED.has(run.currentStep) ? await compositionApproval(harness, run.currentStep) : null;
  return harness.coordinator.advance({ runId: COMPOSITION_RUN_ID, input: harness.input, authorization });
}

async function compositionApproval(harness, step) {
  const run = (await harness.store.readRun(COMPOSITION_RUN_ID)).run;
  const authority = (await harness.authorityStore.read()).state;
  return {
    authorized: true,
    runId: COMPOSITION_RUN_ID,
    step,
    expectedCoordinatorVersion: run.version,
    authorizationId: `founder-composition-${step.toLowerCase().replaceAll("_", "-")}`,
    authorizedAt: COMPOSITION_NOW,
    expiresAt: "2026-08-21T06:10:00.000Z",
    priorStateDigest: coordinatorStateDigest(run, authority),
  };
}

function createCoordinatorPoolTransport() {
  let durable = null;
  let mutationCount = 0;
  const query = async (sql, values = []) => {
    if (/^(?:BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return { rows: [] };
    if (/INSERT INTO physiqueos\.combined_cutover_coordinator_runs/.test(sql)) {
      if (durable) return { rows: [] };
      const now = new Date(COMPOSITION_NOW);
      durable = { run_id: values[0], schema_version: 1, coordinator_operation_id: values[1], migration_operation_id: values[2], environment: values[3], authorization_fingerprint: values[4], input_digest: values[5], version: 0, current_step: "A", step_status: "NOT_STARTED", completed_steps: [], evidence_refs: {}, approval_fingerprints: {}, b_snapshot: null, b_snapshot_digest: null, m_boundary_crossed: false, failure_code: null, created_at: now, updated_at: now };
      return { rows: [{ ...durable }] };
    }
    if (/SELECT \* FROM physiqueos\.combined_cutover_coordinator_runs/.test(sql)) return { rows: durable ? [{ ...durable }] : [] };
    if (/UPDATE physiqueos\.combined_cutover_coordinator_runs SET/.test(sql)) {
      if (!durable || durable.version !== Number(values[10])) return { rows: [] };
      mutationCount += 1;
      durable = { ...durable, version: durable.version + 1, current_step: values[1], step_status: values[2], completed_steps: JSON.parse(values[3]), evidence_refs: JSON.parse(values[4]), approval_fingerprints: JSON.parse(values[5]), b_snapshot: values[6] == null ? null : JSON.parse(values[6]), b_snapshot_digest: values[7], m_boundary_crossed: values[8], failure_code: values[9], updated_at: new Date(COMPOSITION_NOW) };
      return { rows: [{ ...durable }] };
    }
    throw new Error("Unexpected coordinator SQL in local composition harness.");
  };
  const client = { query, release() {} };
  return Object.freeze({ pool: Object.freeze({ query, connect: async () => client }), mutationCount: () => mutationCount });
}

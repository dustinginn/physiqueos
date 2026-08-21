import { CoordinatorInspectionClassification, freeze } from "../combinedCutoverCoordinatorContract.js";

const GROUPS = ["A","C_D","E","F_G","H_I_J","K","L","N_O","P"];
const A_CATEGORIES = ["authorization","windowsSource","providerBuild","targetIsolation","backups","costCeiling","routingZone","routingLeaf","windowsTarget","providerTarget","customDomains","tlsSni","deploymentBuild","routingReadback","workerControl"];
const P_CATEGORIES = ["health","readiness","worker","authority","routing","backups","domainMediaOutbox","crossClient"];

export function createDeterministicCoordinatorServices({ authorityStore, modes = {}, wrongDeployment = false, wrongRoutingRun = false } = {}) {
  const completed = new Set();
  const ambiguous = new Set();
  const counts = new Map();
  let fence = false;
  let cadenceQuiesced = false;
  let recoveryCalls = 0;
  let windowsRecovered = false;
  let providerRecovered = false;
  let windowsRecoveryAmbiguous = false;
  let providerRecoveryAmbiguous = false;
  const snapshot = freeze({
    schemaVersion: 1,
    runtimeMonitor: { taskName: "PhysiqueOS Runtime Monitor", enabled: true, taskState: "ready", definitionSha256: "a".repeat(64) },
    runtimeDesiredState: "running", ngrokDesiredState: "running", cadencePresent: false,
    productionServer: { taskName: "PhysiqueOS Production Server", taskState: "running", definitionSha256: "b".repeat(64), listenerPid: 4100, nodeOwnershipProven: true, runtimeMetadataMatches: true },
    ngrok: { taskName: "PhysiqueOS Ngrok Tunnel", taskState: "running", definitionSha256: "c".repeat(64), processId: 4200, processOwnershipProven: true },
  });

  const services = {};
  for (const step of GROUPS) services[serviceName(step)] = makeService(step);
  services.windowsFenceService = {
    inspect: async () => inspection(fence, ambiguous.has("B:fence"), { fenceId: "fence-coordinator-1", status: fence ? "active" : "inactive" }),
    activate: async () => mutate("B:fence", () => { fence = true; }),
  };
  services.windowsCadenceService = {
    inspect: async () => inspection(cadenceQuiesced, ambiguous.has("B:cadence"), { status: cadenceQuiesced ? "quiesced" : "active" }),
    captureAfterWriteFence: async () => { count("B:capture"); if (!fence) throw new Error("fence required"); return { ready: true, snapshot }; },
    quiesceAfterWriteFence: async ({ snapshot: supplied }) => { if (supplied?.runtimeMonitor?.definitionSha256 !== snapshot.runtimeMonitor.definitionSha256) throw new Error("snapshot mismatch"); return mutate("B:cadence", () => { cadenceQuiesced = true; }); },
  };
  services.firstProviderCommandService = {
    async executeFirstProviderCommand({ input, commandId }) {
      count("M");
      const mode = modes.M ?? "accepted";
      if (mode === "ambiguous-unknown") {
        authorityStore.patch({ firstProviderCanonicalWriteAt: "2026-08-21T06:05:00.000Z", firstProviderCommandId: "different-command" });
        throw new Error("response lost");
      }
      if (mode === "rejected") throw new Error("rejected");
      authorityStore.patch({ firstProviderCanonicalWriteAt: "2026-08-21T06:05:00.000Z", firstProviderCommandId: commandId, authority: "provider-authoritative", migrationOperationId: input.migrationOperationId });
      if (mode === "crash-after-apply") throw crash();
      if (mode === "response-lost-applied") throw new Error("response lost");
      return { ready: true };
    },
  };
  services.windowsRecoveryService = {
    inspect: async () => inspection(windowsRecovered, windowsRecoveryAmbiguous, { status: windowsRecovered ? "windows-restored" : "not-restored" }),
    async restorePreBoundaryWindows({ snapshot: supplied }) {
      recoveryCalls += 1;
      if (modes.windowsRecovery === "crash-before-apply") throw crash();
      if (modes.windowsRecovery === "ambiguous") { windowsRecoveryAmbiguous = true; throw new Error("ambiguous restoration"); }
      if (supplied?.runtimeMonitor?.definitionSha256 !== snapshot.runtimeMonitor.definitionSha256) return { ready: false, classification: "SNAPSHOT_MISMATCH" };
      authorityStore.patch({ authority: "windows-legacy-authoritative", migrationOperationId: null, firstProviderCanonicalWriteAt: null, firstProviderCommandId: null });
      windowsRecovered = true;
      if (modes.windowsRecovery === "crash-after-apply") throw crash();
      return { ready: true, classification: "RESTORED", status: "windows-restored" };
    },
  };
  services.providerRecoveryService = {
    inspect: async () => inspection(providerRecovered, providerRecoveryAmbiguous, { status: providerRecovered ? "provider-forward" : "not-recovered" }),
    async enterProviderRecovery() { recoveryCalls += 1; if (modes.providerRecovery === "crash-before-apply") throw crash(); if (modes.providerRecovery === "ambiguous") { providerRecoveryAmbiguous = true; throw new Error("ambiguous recovery"); } authorityStore.patch({ authority: "recovery-required" }); providerRecovered = true; if (modes.providerRecovery === "crash-after-apply") throw crash(); return { ready: true, status: "provider-forward" }; },
  };
  services.statusService = {
    async inspect() {
      const authority = (await authorityStore.read()).state;
      return { routingRole: completed.has("L") ? "provider" : "windows", workerRole: completed.has("N_O") ? "provider" : "windows", rollbackToWindowsLegal: authority.firstProviderCanonicalWriteAt == null, providerForwardRecoveryRequired: authority.firstProviderCanonicalWriteAt != null, blockingPreconditions: [] };
    },
  };

  return freeze({
    services,
    counts: () => Object.fromEntries(counts),
    completed: () => [...completed],
    setMode(step, mode) { modes[step] = mode; },
    markCompleted(step, operationId = "migration-operation-1") { completed.add(step); applyAuthority(step, operationId); },
    markAmbiguous(step) { ambiguous.add(step); },
    state: () => ({ fence, cadenceQuiesced, recoveryCalls }),
    snapshot,
  });

  function makeService(step) {
    return {
      inspect: async ({ input, run }) => {
        if (step === "N_O" && wrongDeployment) return { classification: CoordinatorInspectionClassification.BLOCKED, evidence: { status: "wrong-deployment", providerDeploymentId: "wrong" } };
        const result = inspection(completed.has(step), ambiguous.has(step), { ...evidenceFor(step, input), runId: step === "L" && wrongRoutingRun ? "another-run-0001" : run?.runId });
        if (step === "A") return { ...result, phase: "A", categories: Object.fromEntries(A_CATEGORIES.map((name) => [name, modes.APartial !== name])) };
        if (step === "P") return { ...result, phase: "P", categories: Object.fromEntries(P_CATEGORIES.map((name) => [name, modes.PPartial !== name])) };
        return result;
      },
      execute: async ({ input }) => mutate(step, () => { completed.add(step); applyAuthority(step, input?.migrationOperationId); }),
    };
  }
  async function mutate(step, apply) {
    count(step);
    const mode = modes[step] ?? "accepted";
    if (mode === "rejected") throw new Error("conclusive rejection");
    if (mode === "ambiguous-unreadable") { ambiguous.add(step); throw new Error("unreadable"); }
    if (mode === "crash-before-apply") throw crash();
    apply();
    if (mode === "crash-after-apply") throw crash();
    if (mode === "response-lost-applied") throw new Error("response lost");
    return { ready: true };
  }
  function applyAuthority(step, operationId = "migration-operation-1") {
    if (step === "C_D") authorityStore.patch({ authority: "combined-cutover-in-progress", migrationOperationId: operationId });
    if (step === "K") authorityStore.patch({ authority: "provider-prepared", migrationOperationId: operationId });
    if (step === "L") authorityStore.patch({ authority: "provider-authoritative", migrationOperationId: operationId });
  }
  function count(step) { counts.set(step, (counts.get(step) ?? 0) + 1); }
}

export function createDeterministicAuthorityStore(initial = {}) {
  let state = { version: 0, authority: "windows-legacy-authoritative", migrationOperationId: null, firstProviderCanonicalWriteAt: null, firstProviderCommandId: null, ...initial };
  return freeze({ async read() { return { state: freeze({ ...state }) }; }, patch(value) { state = { ...state, ...value, version: state.version + 1 }; } });
}

export function simulatedCrash() { return crash(); }
function crash() { return Object.assign(new Error("simulated process crash"), { simulatedCrash: true }); }
function inspection(done, isAmbiguous, evidence) { return { classification: isAmbiguous ? CoordinatorInspectionClassification.AMBIGUOUS : done ? CoordinatorInspectionClassification.COMPLETED : CoordinatorInspectionClassification.NOT_APPLIED, evidence }; }
function serviceName(step) { return ({ A: "preflightService", C_D: "finalPackageService", E: "transferService", F_G: "importService", H_I_J: "providerValidationService", K: "preparationService", L: "authorityHandoffService", N_O: "workerHandoffService", P: "stabilizationService" })[step]; }
function evidenceFor(step, input) { return { status: step === "P" ? "stabilized" : `${step}-durable`, operationId: input?.migrationOperationId, providerDeploymentId: step === "N_O" ? input?.providerDeploymentId : undefined, routingRole: step === "L" ? "provider" : undefined, workerRole: step === "L" ? "provider-inert" : undefined, receiptId: `${step.toLowerCase()}-receipt-1`, packageDigest: "d".repeat(64) }; }

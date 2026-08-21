import { describe, expect, it, vi } from "vitest";
import { loadPhase7BProductionConfiguration, PHASE7B_PRODUCTION_APP_ID, PHASE7B_ROUTING_LEAF, PHASE7B_ROUTING_ZONE } from "./Phase7BProductionConfiguration.js";
import { createPhase7BProductionComposition } from "./Phase7BProductionComposition.js";

describe("Phase7BProductionComposition", () => {
  it("constructs the real typed graph without I/O, testSupport, or a general executor", () => {
    const calls = [];
    const never = (name) => vi.fn(async () => { calls.push(name); throw new Error("LOCAL_CONSTRUCTION_MUST_NOT_EXECUTE_IO"); });
    const pool = { query: never("postgres-query"), connect: never("postgres-connect") };
    const controlStore = { read: never("control-read"), transition: never("control-transition") };
    const digitalOceanClient = { getDeployment: never("deployment-read"), getDomain: never("domain-read"), listDomainRecords: never("records-read"), updateDomainRecord: never("record-mutation") };
    const heartbeatStore = { latestHeartbeat: never("heartbeat-read") };
    const windowsTransport = Object.fromEntries(["inspectRuntimeMonitor", "quiesceRuntimeMonitor", "restoreRuntimeMonitor", "inspectProductionServer", "retireProductionServer", "inspectNgrok", "retireNgrok"].map((name) => [name, never(name)]));
    const transferClient = {};
    const transferStaging = { put: never("staging-put"), read: never("staging-read") };
    const objectProvider = { beginMultipartUpload: never("spaces-upload"), inspectObject: never("spaces-inspect") };
    const verify = { verify: never("preflight-verify") };
    const inspect = { inspect: never("inspect") };
    const stabilizationInspectors = Object.fromEntries(["healthInspector", "readinessInspector", "workerInspector", "authorityInspector", "routingInspector", "backupInspector", "domainMediaOutboxInspector", "crossClientInspector"].map((name) => [name, inspect]));
    const configuration = loadPhase7BProductionConfiguration({ env: validEnv(), expectedEnvironment: "phase7b-isolated-exercise-1" });
    const composition = createPhase7BProductionComposition({
      configuration, pool, controlStore, digitalOceanClient, transferClient, transferStaging, objectProvider,
      heartbeatStore, windowsTransport, sourceRuntimePath: "C:/isolated/runtime.json", sourceMediaRoot: "C:/isolated/media",
      workspaceRoot: "C:/isolated/workspace", targetDatabase: "physiqueos_phase5_restore_provider_phase7b",
      mediaAccessSecret: "transport-bound-test-secret", expectedProviderWorkerId: "phase7b-worker-1",
      providerBuildVerifier: verify, providerTargetIsolationVerifier: verify, managedBackupFreshnessVerifier: verify,
      phaseAInspectors: phaseAInspectors(inspect), providerOutboxInspector: inspect, stabilizationInspectors,
      maximumMonthlyCostUsd: 100,
    });
    expect(composition).toMatchObject({ kind: "phase7b-production-composition", configuration });
    expect(composition.coordinator).toEqual(expect.objectContaining({ createRun: expect.any(Function), inspect: expect.any(Function), advance: expect.any(Function), recover: expect.any(Function) }));
    expect(composition.controls).toEqual(expect.objectContaining({ routingControl: expect.any(Object), workerControl: expect.any(Object) }));
    expect(calls).toEqual([]);
    expect(JSON.stringify(composition)).not.toContain("transport-bound-test-secret");
  });

  it("fails closed when a required production inspector is absent", () => {
    const base = minimalArguments();
    expect(() => createPhase7BProductionComposition({ ...base, providerOutboxInspector: null })).toThrow(/outboxInspector\.inspect/);
  });
});

function minimalArguments() {
  const noop = async () => ({});
  const pool = { query: noop, connect: noop };
  const digitalOceanClient = { getDeployment: noop, getDomain: noop, listDomainRecords: noop, updateDomainRecord: noop };
  const windowsTransport = Object.fromEntries(["inspectRuntimeMonitor", "quiesceRuntimeMonitor", "restoreRuntimeMonitor", "inspectProductionServer", "retireProductionServer", "inspectNgrok", "retireNgrok"].map((name) => [name, noop]));
  const inspector = { inspect: noop };
  return {
    configuration: loadPhase7BProductionConfiguration({ env: validEnv(), expectedEnvironment: "phase7b-isolated-exercise-1" }),
    pool, controlStore: { read: noop, transition: noop }, digitalOceanClient, transferClient: {},
    transferStaging: { put: noop, read: noop }, objectProvider: { beginMultipartUpload: noop, inspectObject: noop },
    heartbeatStore: { latestHeartbeat: noop }, windowsTransport, sourceRuntimePath: "C:/isolated/runtime.json",
    workspaceRoot: "C:/isolated/workspace", targetDatabase: "physiqueos_phase5_restore_provider_phase7b",
    expectedProviderWorkerId: "phase7b-worker-1", providerBuildVerifier: { verify: noop }, providerTargetIsolationVerifier: { verify: noop },
    managedBackupFreshnessVerifier: { verify: noop }, phaseAInspectors: phaseAInspectors(inspector),
    providerOutboxInspector: inspector, stabilizationInspectors: Object.fromEntries(["healthInspector", "readinessInspector", "workerInspector", "authorityInspector", "routingInspector", "backupInspector", "domainMediaOutboxInspector", "crossClientInspector"].map((name) => [name, inspector])),
    maximumMonthlyCostUsd: 100,
  };
}

function validEnv() { return {
  PHYSIQUEOS_PHASE7B_ENVIRONMENT: "phase7b-isolated-exercise-1", PHYSIQUEOS_PHASE7B_APP_ID: PHASE7B_PRODUCTION_APP_ID,
  PHYSIQUEOS_PHASE7B_WEB_COMPONENT: "web", PHYSIQUEOS_PHASE7B_WORKER_COMPONENT: "worker", PHYSIQUEOS_PHASE7B_ROUTING_ZONE: PHASE7B_ROUTING_ZONE,
  PHYSIQUEOS_PHASE7B_ROUTING_LEAF: PHASE7B_ROUTING_LEAF, PHYSIQUEOS_PHASE7B_ROUTING_RECORD_TYPE: "CNAME", PHYSIQUEOS_PHASE7B_ROUTING_TTL: "60",
  PHYSIQUEOS_PHASE7B_PROVIDER_DEPLOYMENT_ID: "bed088ae-064e-4420-845c-0d972ed81153", PHYSIQUEOS_PHASE7B_PROVIDER_BUILD_ID: "phase7b-build-1", PHYSIQUEOS_PHASE7B_PROVIDER_SOURCE_COMMIT: "d".repeat(40),
  PHYSIQUEOS_PHASE7B_CANONICAL_OWNER_USER_ID: "phase5-synthetic-user", PHYSIQUEOS_PHASE7B_WINDOWS_ROUTING_TARGET: "windows-edge.example.net", PHYSIQUEOS_PHASE7B_PROVIDER_ROUTING_TARGET: "provider.ondigitalocean.app",
  PHYSIQUEOS_PHASE7B_WINDOWS_EDGE_CUSTOM_DOMAIN_READY: "1", PHYSIQUEOS_PHASE7B_PROVIDER_CUSTOM_DOMAIN_READY: "1",
}; }
function phaseAInspectors(inspector) { return Object.fromEntries(["backups", "routingZone", "routingLeaf", "windowsTarget", "providerTarget", "customDomains", "tlsSni", "deploymentBuild", "routingReadback", "workerControl"].map((name) => [name, inspector])); }

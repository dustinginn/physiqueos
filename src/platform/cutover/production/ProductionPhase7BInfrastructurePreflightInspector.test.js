import { describe, expect, it } from "vitest";
import { createProductionPhase7BInfrastructurePreflightInspector } from "./ProductionPhase7BInfrastructurePreflightInspector.js";

const NOW = new Date("2026-08-21T07:00:00.000Z");
const CHECKED = "2026-08-21T06:59:30.000Z";

describe("ProductionPhase7BInfrastructurePreflightInspector", () => {
  it("accepts only a fresh exact backup/DNS/edge/deployment/worker evidence join", async () => {
    const inspector = createProductionPhase7BInfrastructurePreflightInspector({ configuration: config(), inspectors: evidence(), now: () => NOW });
    await expect(inspector.inspect({ input: { providerWorkerId: "worker-1", windowsHostId: "phase7b-isolated-windows-restore-1" } })).resolves.toMatchObject({ ready: true, categories: { backups: true, routingZone: true, workerControl: true } });
  });
  it.each([
    ["stale", (items) => { items.routingZone.inspect = async () => ({ ...(await evidence().routingZone.inspect()), checkedAt: "2026-08-21T06:00:00.000Z" }); }],
    ["backup ref", (items) => { items.backups.inspect = async () => ({ ...(await evidence().backups.inspect()), windowsBackupRef: "../escape" }); }],
    ["wrong route", (items) => { items.routingReadback.inspect = async () => ({ ...(await evidence().routingReadback.inspect()), role: "provider" }); }],
    ["worker active before M", (items) => { items.workerControl.inspect = async () => ({ ...(await evidence().workerControl.inspect()), providerWorkerStatus: "healthy" }); }],
  ])("blocks %s evidence", async (_label, mutate) => {
    const items = evidence(); mutate(items);
    const result = await createProductionPhase7BInfrastructurePreflightInspector({ configuration: config(), inspectors: items, now: () => NOW }).inspect({ input: { providerWorkerId: "worker-1", windowsHostId: "phase7b-isolated-windows-restore-1" } });
    expect(result.ready).toBe(false);
    expect(Object.values(result.categories)).toContain(false);
  });
});

function config() { return { provider: { deploymentId: "deployment-1", buildId: "build-1", sourceCommit: "a".repeat(40) }, routing: { delegatedZone: "cutover.dustinginn.com", publicLeaf: "app.cutover.dustinginn.com", recordType: "CNAME", ttl: 60, windowsTarget: "windows.example.net", providerTarget: "provider.example.net" } }; }
function evidence() {
  const common = { ready: true, checkedAt: CHECKED, providerDeploymentId: "deployment-1", providerBuildId: "build-1" };
  const values = {
    backups: { ...common, windowsEncryptedRestoreVerified: true, windowsIndependentReplicaVerified: true, postgresManagedBackupCurrent: true, postgresIsolatedRestoreVerified: true, spacesIndependentRestoreVerified: true, windowsBackupRef: "backup:windows:one", postgresBackupRef: "backup:postgres:one", spacesBackupRef: "backup:spaces:one" },
    routingZone: { ...common, zone: "cutover.dustinginn.com", authoritativeDelegationVerified: true },
    routingLeaf: { ...common, leaf: "app.cutover.dustinginn.com", recordType: "CNAME", ttl: 60 },
    windowsTarget: { ...common, target: "windows.example.net", publicHttpsReady: true, hostSniReady: true, buildIdentityReady: true },
    providerTarget: { ...common, target: "provider.example.net", publicHttpsReady: true },
    customDomains: { ...common, domain: "app.cutover.dustinginn.com", windowsCustomDomainReady: true, providerCustomDomainReady: true },
    tlsSni: { ...common, domain: "app.cutover.dustinginn.com", windowsTlsSniReady: true, providerTlsSniReady: true },
    deploymentBuild: { ...common, providerSourceCommit: "a".repeat(40) },
    routingReadback: { ...common, role: "windows", zone: "cutover.dustinginn.com", leaf: "app.cutover.dustinginn.com", target: "windows.example.net" },
    workerControl: { ...common, providerWorkerId: "worker-1", providerWorkerStatus: "paused_authority", windowsIdentityReady: true, windowsHostId: "phase7b-isolated-windows-restore-1" },
  };
  return Object.fromEntries(Object.entries(values).map(([name, value]) => [name, { inspect: async () => value }]));
}

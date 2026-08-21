import { describe, expect, it, vi } from "vitest";
import { createProductionCombinedCutoverCoordinatorServices } from "./ProductionCombinedCutoverCoordinatorServices.js";

const OPERATION = "phase7b-production-services-operation";
const RUN = { runId: "phase7b-production-services-run", migrationOperationId: OPERATION };
const INPUT = {
  migrationOperationId: OPERATION, authorizationFingerprint: "a".repeat(64), commandPrefix: "phase7b-services",
  expectedRuntimeSha256: "b".repeat(64), expectedRuntimeRevision: 358,
  providerDeploymentId: "deployment-1", providerBuildId: "build-1", routingTarget: "provider.example.net",
  providerSource: { commit: "c".repeat(40), buildId: "build-1" },
  target: { databaseClusterId: "cluster-1", databaseName: "physiqueos_phase5_restore_provider_phase7b", spacesBucket: "bucket-1" },
};

describe("ProductionCombinedCutoverCoordinatorServices", () => {
  it("joins all A evidence and requires independent backup restore proof", async () => {
    const harness = fixture();
    await expect(harness.services.preflightService.inspect({ run: RUN, input: INPUT })).resolves.toMatchObject({
      phase: "A", classification: "COMPLETED", categories: { authorization: true, backups: true, workerControl: true },
    });
    const blocked = fixture({ infrastructureCategories: { backups: false } });
    await expect(blocked.services.preflightService.inspect({ run: RUN, input: INPUT })).resolves.toMatchObject({ classification: "BLOCKED", categories: { backups: false } });
  });

  it("classifies verified transfer receipt as complete and an unresolved receipt as ambiguous", async () => {
    const complete = fixture();
    await expect(complete.services.transferService.inspect({ run: RUN, input: INPUT })).resolves.toMatchObject({ classification: "COMPLETED", evidence: { packageDigest: "d".repeat(64) } });
    const unresolved = fixture({ transferStatus: "receiving" });
    await expect(unresolved.services.transferService.inspect({ run: RUN, input: INPUT })).resolves.toMatchObject({ classification: "AMBIGUOUS" });
  });

  it("fails a foreign receipt closed before transfer dispatch", async () => {
    const harness = fixture({ transferOperationId: "another-operation" });
    await expect(harness.services.transferService.inspect({ run: RUN, input: INPUT })).resolves.toMatchObject({ classification: "BLOCKED", evidence: { status: "transfer-receipt-identity-mismatch" } });
    expect(harness.transferSnapshot).not.toHaveBeenCalled();
  });

  it("resumes C/D from an already-written package and binds authority before export", async () => {
    const harness = fixture({ authority: windowsAuthority(), finalSnapshot: null });
    await harness.services.finalPackageService.execute({ run: RUN, input: INPUT });
    expect(harness.finalSnapshotService.inspectFinalSnapshot).toHaveBeenCalledTimes(1);
    expect(harness.finalSnapshotService.captureFinalSnapshot).not.toHaveBeenCalled();
    expect(harness.authorityStore.transition).toHaveBeenCalledWith(expect.objectContaining({ action: "begin-combined-cutover", finalSnapshot: expect.objectContaining({ packageDigest: "d".repeat(64) }) }));
    expect(harness.finalPackageExportService.exportFinalPackage).toHaveBeenCalledTimes(1);
  });

  it("requires exact paused worker/outbox/deployment/build evidence before H/I/J completes", async () => {
    const passing = fixture();
    await expect(passing.services.providerValidationService.inspect({ run: RUN, input: INPUT })).resolves.toMatchObject({ classification: "COMPLETED" });
    const wrongBuild = fixture({ providerPreBoundary: { providerBuildId: "wrong" } });
    await expect(wrongBuild.services.providerValidationService.inspect({ run: RUN, input: INPUT })).resolves.toMatchObject({ classification: "BLOCKED", evidence: { status: "provider-preboundary-contract-failed" } });
  });

  it("derives status only from durable authority/handoff evidence", async () => {
    const harness = fixture({ authority: providerAuthority(), workerActivationStatus: "verified", windowsWorkerRetirementStatus: "retired" });
    await expect(harness.services.statusService.inspect({ run: RUN, input: INPUT })).resolves.toMatchObject({ routingRole: "provider", workerRole: "provider", rollbackToWindowsLegal: true });
  });
});

function fixture({
  authority = cutoverAuthority(), finalSnapshot = authority.finalSnapshot,
  transferStatus = "verified", transferOperationId = OPERATION,
  infrastructureCategories = {}, providerPreBoundary = {},
  workerActivationStatus = null, windowsWorkerRetirementStatus = null,
} = {}) {
  let currentAuthority = { ...authority, finalSnapshot };
  const authorityStore = {
    read: vi.fn(async () => ({ state: currentAuthority })),
    transition: vi.fn(async (command) => {
      currentAuthority = command.action === "begin-combined-cutover"
        ? { ...cutoverAuthority(), finalSnapshot: command.finalSnapshot }
        : currentAuthority;
      return { state: currentAuthority };
    }),
  };
  const controlState = { fenceState: "active", fenceId: "fence-1", migrationOperationId: OPERATION, writesEnabled: false, firstPostgresWriteAt: null };
  const controlStore = { read: vi.fn(async () => ({ state: controlState })) };
  const snapshot = { runtimeSha256: "b".repeat(64), runtimeRevision: 358, mediaInventorySha256: "e".repeat(64), migrationControlSha256: "f".repeat(64), packageDigest: "d".repeat(64) };
  const finalSnapshotService = { inspectFinalSnapshot: vi.fn(async () => snapshot), captureFinalSnapshot: vi.fn(async () => snapshot) };
  const finalPackageExportService = { exportFinalPackage: vi.fn(async () => ({ packageDigest: "d".repeat(64), manifest: { semanticDigest: "d".repeat(64) } })) };
  const transferSnapshot = vi.fn(async () => ({ ready: true }));
  const transferReceipt = { migrationOperationId: transferOperationId, authorizationFingerprint: "a".repeat(64), fenceId: "fence-1", packageDigest: "d".repeat(64), status: transferStatus };
  const preparationReceipt = { operationId: OPERATION, receiptId: "prep-1", authorizationFingerprint: "a".repeat(64), fenceId: "fence-1", packageDigest: "d".repeat(64), importStatus: "succeeded", mediaStatus: "succeeded", parityStatus: "passed", preparedStatus: "pending", providerDeploymentId: null };
  const handoffReceipt = { operationId: OPERATION, receiptId: "handoff-1", authorizationFingerprint: "a".repeat(64), fenceId: "fence-1", packageDigest: "d".repeat(64), providerDeploymentId: "deployment-1", authorityStatus: "committed", routingStatus: "verified", workerActivationStatus, windowsWorkerRetirementStatus };
  const ready = async () => ({ ready: true, mutated: false });
  const preflightAdapters = Object.fromEntries(["verifyAuthorization", "verifyWindowsSource", "verifyProviderBuild", "verifyTargetIsolation", "verifyBackups", "verifyCostCeiling"].map((name) => [name, ready]));
  const allInfra = Object.fromEntries(["backups", "routingZone", "routingLeaf", "windowsTarget", "providerTarget", "customDomains", "tlsSni", "deploymentBuild", "routingReadback", "workerControl"].map((name) => [name, true]));
  const methods = {
    infrastructurePreflightInspector: { inspect: async () => ({ categories: { ...allInfra, ...infrastructureCategories } }) },
    windowsFenceAdapter: { activateWindowsWriteFence: vi.fn() },
    windowsCadenceService: { inspect: vi.fn(), captureAfterWriteFence: vi.fn(), quiesceAfterWriteFence: vi.fn() },
    manifestReceiptStore: { read: vi.fn(async () => ({ receipt: transferReceipt })) },
    canonicalImportService: { import: vi.fn() },
    providerParityService: { verifyParity: vi.fn() },
    preparationAcknowledgementService: { acknowledge: vi.fn() },
    preparationStore: { read: vi.fn(async () => ({ receipt: preparationReceipt })) },
    providerPreBoundaryInspector: { inspect: vi.fn(async () => ({ ready: true, workerStatus: "paused_authority", outboxReady: true, providerDeploymentId: "deployment-1", providerBuildId: "build-1", ...providerPreBoundary })) },
    authorityHandoffService: { transferAuthorityAndRoute: vi.fn() },
    postHandoffVerificationService: { verifyPostHandoff: vi.fn(async () => ({ ready: true })) },
    handoffReceiptStore: { read: vi.fn(async () => ({ receipt: handoffReceipt })) },
    workerHandoffService: { activateProviderWorkersAndRetireWindows: vi.fn() },
    firstProviderCommandService: { executeFirstProviderCommand: vi.fn() },
    stabilizationService: { inspect: vi.fn(), execute: vi.fn() },
    windowsRecoveryService: { restorePreBoundaryWindows: vi.fn() },
    providerRecoveryService: { enterProviderRecovery: vi.fn() },
  };
  const services = createProductionCombinedCutoverCoordinatorServices({ authorityStore, controlStore, preflightAdapters, finalSnapshotService, finalPackageExportService, transferSnapshot, ...methods });
  return { services, authorityStore, finalSnapshotService, finalPackageExportService, transferSnapshot };
}

function cutoverAuthority() { return { version: 2, authority: "combined-cutover-in-progress", publicRuntimeAuthority: "windows", migrationOperationId: OPERATION, authorizationFingerprint: "a".repeat(64), fenceId: "fence-1", finalSnapshot: { packageDigest: "d".repeat(64) }, firstProviderCanonicalWriteAt: null }; }
function windowsAuthority() { return { version: 1, authority: "windows-legacy-authoritative", publicRuntimeAuthority: "windows", migrationOperationId: null, authorizationFingerprint: null, fenceId: null, finalSnapshot: null, firstProviderCanonicalWriteAt: null }; }
function providerAuthority() { return { ...cutoverAuthority(), authority: "provider-authoritative", publicRuntimeAuthority: "provider" }; }

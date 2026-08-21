import { createPostgresCombinedRuntimeAuthorityStore } from "../PostgresCombinedRuntimeAuthorityStore.js";
import { createPostgresCombinedTransferReceiptStore } from "../PostgresCombinedTransferReceiptStore.js";
import { createExternalCombinedCutoverCoordinator } from "../coordinator/ExternalCombinedCutoverCoordinator.js";
import { createPostgresCombinedCutoverCoordinatorStore } from "../coordinator/PostgresCombinedCutoverCoordinatorStore.js";
import { createPostgresCombinedCutoverHandoffReceiptStore } from "../handoff/PostgresCombinedCutoverHandoffReceiptStore.js";
import { createProductionAuthorityHandoffService } from "../handoff/ProductionAuthorityHandoffService.js";
import { createPostgresCombinedCutoverPreparationStore } from "../preparation/PostgresCombinedCutoverPreparationStore.js";
import { createProductionAcknowledgeProviderPreparedService } from "../preparation/ProductionAcknowledgeProviderPreparedService.js";
import { createProductionCanonicalImportService } from "../preparation/ProductionCanonicalImportService.js";
import { createProductionProviderParityService } from "../preparation/ProductionProviderParityService.js";
import { createProductionPostHandoffVerificationService } from "../recovery/ProductionPostHandoffVerificationService.js";
import { createProductionProviderForwardRecoveryService } from "../recovery/ProductionProviderForwardRecoveryService.js";
import { createProductionWindowsAuthorityRestorationService } from "../recovery/ProductionWindowsAuthorityRestorationService.js";
import { createProductionDigitalOceanRoutingControl } from "../routing/ProductionDigitalOceanRoutingControl.js";
import { createPostgresCombinedCutoverTransferReceiptStore } from "../transfer/PostgresCombinedCutoverTransferReceiptStore.js";
import { createProductionTransferSnapshotAdapter } from "../transfer/WindowsCombinedCutoverTransferClient.js";
import { createProductionCombinedCutoverWorkerControl } from "../worker/ProductionCombinedCutoverWorkerControl.js";
import { createProductionWindowsCadenceControlService } from "../worker/ProductionWindowsCadenceControlService.js";
import { createProductionWindowsWorkerRestorationService } from "../worker/ProductionWindowsWorkerRestorationService.js";
import { createProductionWorkerHandoffService } from "../worker/ProductionWorkerHandoffService.js";
import { createVerifyAuthorizationPreflight } from "./ProductionCombinedCutoverAuthorizationPreflight.js";
import { createProductionCombinedCutoverStabilizationService } from "./ProductionCombinedCutoverStabilizationService.js";
import { createVerifyCostCeilingPreflight } from "./ProductionCostCeilingPreflight.js";
import { createProductionFinalPackageExportService } from "./ProductionFinalPackageExportService.js";
import { createProductionFinalSnapshotService } from "./ProductionFinalSnapshotService.js";
import { createProductionFirstProviderCommandService } from "./ProductionFirstProviderCommandService.js";
import {
  createVerifyBackupsPreflight,
  createVerifyProviderBuildPreflight,
  createVerifyTargetIsolationPreflight,
} from "./ProductionProviderReadinessPreflights.js";
import { createProductionWindowsWriteFenceAdapter } from "./ProductionWindowsWriteFenceAdapter.js";
import { createVerifyWindowsSourcePreflight } from "./ProductionWindowsSourceIdentityPreflight.js";
import { createProductionCombinedCutoverCoordinatorServices } from "./ProductionCombinedCutoverCoordinatorServices.js";
import { createProductionPhase7BInfrastructurePreflightInspector } from "./ProductionPhase7BInfrastructurePreflightInspector.js";
import { createProductionProviderPreBoundaryInspector } from "./ProductionProviderPreBoundaryInspector.js";

/**
 * Real Phase 7B graph. Every dependency at this boundary is a narrow production transport,
 * verifier, or store; deterministic/testSupport implementations are intentionally not imported.
 * Constructing the graph performs no I/O.
 */
export function createPhase7BProductionComposition({
  configuration,
  pool,
  controlStore,
  digitalOceanClient,
  transferClient,
  transferStaging,
  objectProvider,
  heartbeatStore,
  windowsTransport,
  sourceRuntimePath,
  sourceMediaRoot = null,
  workspaceRoot,
  targetDatabase,
  mediaAccessSecret,
  expectedProviderWorkerId,
  providerBuildVerifier,
  providerTargetIsolationVerifier,
  managedBackupFreshnessVerifier,
  phaseAInspectors,
  providerOutboxInspector,
  stabilizationInspectors,
  maximumMonthlyCostUsd,
  buildIdentityProvider,
  checkoutStatusProvider,
  now = () => new Date(),
} = {}) {
  assertConfiguration(configuration);
  assertPool(pool);
  required(targetDatabase, "targetDatabase");
  required(expectedProviderWorkerId, "expectedProviderWorkerId");

  const authorityStore = createPostgresCombinedRuntimeAuthorityStore({ pool, environment: configuration.environment });
  const coordinatorStore = createPostgresCombinedCutoverCoordinatorStore({ pool });
  const manifestReceiptStore = createPostgresCombinedTransferReceiptStore({ pool });
  const artifactReceiptStore = createPostgresCombinedCutoverTransferReceiptStore({ pool, staging: transferStaging });
  const preparationStore = createPostgresCombinedCutoverPreparationStore({ pool });
  const handoffReceiptStore = createPostgresCombinedCutoverHandoffReceiptStore({ pool });

  const routingControl = createProductionDigitalOceanRoutingControl({
    client: digitalOceanClient,
    zone: configuration.routing.delegatedZone,
    leafFqdn: configuration.routing.publicLeaf,
    windowsTarget: configuration.routing.windowsTarget,
    providerTarget: configuration.routing.providerTarget,
    expectedTtl: configuration.routing.ttl,
  });
  const workerControl = createProductionCombinedCutoverWorkerControl({
    client: digitalOceanClient,
    appId: configuration.provider.appId,
    heartbeatStore,
    windowsTransport,
    expectedProviderBuildId: configuration.provider.buildId,
    expectedProviderWorkerId,
    now,
  });
  const infrastructurePreflightInspector = createProductionPhase7BInfrastructurePreflightInspector({ configuration, inspectors: phaseAInspectors, now });
  const providerPreBoundaryInspector = createProductionProviderPreBoundaryInspector({ configuration, workerControl, outboxInspector: providerOutboxInspector });
  const windowsFenceAdapter = createProductionWindowsWriteFenceAdapter({ controlStore });
  const windowsCadenceService = createProductionWindowsCadenceControlService({ controlStore, workerControl });
  const finalSnapshotService = createProductionFinalSnapshotService({
    sourceRuntimePath, sourceMediaRoot, workspaceRoot,
    ...(buildIdentityProvider ? { buildIdentityProvider } : {}),
  });
  const finalPackageExportService = createProductionFinalPackageExportService({ workspaceRoot });
  const transferSnapshot = createProductionTransferSnapshotAdapter({
    client: transferClient,
    providerDeploymentId: configuration.provider.deploymentId,
    mediaRoot: sourceMediaRoot,
  });
  const canonicalImportService = createProductionCanonicalImportService({
    pool, objectProvider, manifestReceiptStore, artifactReceiptStore, preparationStore, targetDatabase,
  });
  const providerParityService = createProductionProviderParityService({
    pool, objectProvider, manifestReceiptStore, artifactReceiptStore, preparationStore,
    ownerUserId: configuration.canonicalOwnerUserId, mediaAccessSecret, now,
  });
  const preparationAcknowledgementService = createProductionAcknowledgeProviderPreparedService({
    authorityStore, manifestReceiptStore, artifactReceiptStore, preparationStore,
    providerDeploymentId: configuration.provider.deploymentId,
  });
  const authorityHandoffService = createProductionAuthorityHandoffService({
    authorityStore, preparationStore, handoffReceiptStore, routingControl,
  });
  const postHandoffVerificationService = createProductionPostHandoffVerificationService({ authorityStore, handoffReceiptStore });
  const workerHandoffService = createProductionWorkerHandoffService({ authorityStore, handoffReceiptStore, workerControl });
  const authorityRestorationService = createProductionWindowsAuthorityRestorationService({ authorityStore, handoffReceiptStore, routingControl, controlStore });
  const windowsRecoveryService = createProductionWindowsWorkerRestorationService({ authorityStore, controlStore, authorityRestorationService, workerControl });
  const providerRecoveryService = createProductionProviderForwardRecoveryService({ authorityStore });
  const firstProviderCommandService = createProductionFirstProviderCommandService({ pool, authorityStore, ownerUserId: configuration.canonicalOwnerUserId });
  const stabilizationService = createProductionCombinedCutoverStabilizationService({ ...stabilizationInspectors, now });

  const preflightAdapters = Object.freeze({
    verifyAuthorization: createVerifyAuthorizationPreflight({ authorityStore, environment: configuration.environment, preparationStore, handoffReceiptStore }),
    verifyWindowsSource: createVerifyWindowsSourcePreflight({
      runtimePath: sourceRuntimePath,
      ...(buildIdentityProvider ? { buildIdentityProvider } : {}),
      ...(checkoutStatusProvider ? { checkoutStatusProvider } : {}),
    }),
    verifyProviderBuild: createVerifyProviderBuildPreflight({ providerBuildVerifier }),
    verifyTargetIsolation: createVerifyTargetIsolationPreflight({ providerTargetIsolationVerifier }),
    verifyBackups: createVerifyBackupsPreflight({ backupFreshnessVerifier: managedBackupFreshnessVerifier }),
    verifyCostCeiling: createVerifyCostCeilingPreflight({ maximumMonthlyCostUsd }),
  });
  const services = createProductionCombinedCutoverCoordinatorServices({
    authorityStore, controlStore, preflightAdapters, infrastructurePreflightInspector,
    windowsFenceAdapter, windowsCadenceService, finalSnapshotService, finalPackageExportService,
    transferSnapshot, manifestReceiptStore, canonicalImportService, providerParityService,
    preparationAcknowledgementService, preparationStore, providerPreBoundaryInspector,
    authorityHandoffService, postHandoffVerificationService, handoffReceiptStore,
    workerHandoffService, firstProviderCommandService, stabilizationService,
    windowsRecoveryService, providerRecoveryService,
  });
  const coordinator = createExternalCombinedCutoverCoordinator({ store: coordinatorStore, authorityStore, services, now });
  return Object.freeze({
    kind: "phase7b-production-composition",
    configuration,
    coordinator,
    stores: Object.freeze({ coordinatorStore, authorityStore, manifestReceiptStore, artifactReceiptStore, preparationStore, handoffReceiptStore }),
    controls: Object.freeze({ routingControl, workerControl }),
  });
}

function assertConfiguration(value) {
  if (!value || value.schemaVersion !== 1 || !value.environment || !value.canonicalOwnerUserId ||
      !value.provider?.appId || !value.provider?.deploymentId || !value.provider?.buildId ||
      !value.routing?.delegatedZone || !value.routing?.publicLeaf || !value.routing?.windowsTarget || !value.routing?.providerTarget) {
    throw new Error("Phase 7B production composition requires validated Phase7BProductionConfiguration.");
  }
}
function assertPool(value) { if (!value?.connect || !value?.query) throw new Error("Phase 7B production composition requires PostgreSQL."); }
function required(value, field) { if (!String(value ?? "").trim()) throw new Error(`Phase 7B production composition requires ${field}.`); }

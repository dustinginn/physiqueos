import fs from "node:fs";
import path from "node:path";
import { getFounderRuntimeStore, resolveFounderRuntimeStorePath } from
  "../../data/repositories/founderRuntimeStore";
import { FounderRepositories } from "../../data/repositories/founderRepositories";
import { createFounderStoreUnitOfWork } from "../../data/repositories/FounderStoreUnitOfWork";
import { createFounderStoreMutationLockService } from
  "../../data/repositories/FounderStoreMutationLock";
import { createPhaseActivationPackageAcceptanceService } from
  "./PhaseActivationPackageAcceptanceService";
import { createPhaseReviewApplicationBoundary } from "./PhaseReviewApplicationBoundary";
import { createStartingForecastContext } from "../confidence/StartingForecastService";
import { adaptProductionGoalToCanonicalContract } from
  "../confidence/ProductionConfidenceContextAdapter";
import { InterpretationEngine } from "../interpretation/InterpretationEngine";
import { ForecastEngine } from "../forecast/ForecastEngine";
import { NarrativeEngine } from "../narrative/NarrativeEngine";
import { projectNumericConfidence } from "../confidence/NumericConfidenceProjectionService";

export const PRODUCTION_PHASE_REVIEW_COORDINATOR_FACTORY_VERSION =
  "production_phase_review_coordinator_factory_v1";

export function createProductionPhaseReviewCoordinatorFactory() {
  const runtimeStorePath = resolveFounderRuntimeStorePath();
  const liveStore = getFounderRuntimeStore();
  return assemble({ runtimeStorePath, liveStore,
    actorResolver: async () => FounderRepositories.users.getCurrentUser(),
    binding: { storeIdentity: "founder_runtime_store", storeKind: "production",
      isolated: false, productionAllowed: true } });
}

export function createIsolatedProductionShapedPhaseReviewCoordinatorFactory({
  runtimeStorePath, liveStore, actorId = "user_founder_001",
  now = () => new Date(),
} = {}) {
  if (!runtimeStorePath || path.resolve(runtimeStorePath) ===
      path.resolve(resolveFounderRuntimeStorePath())) {
    throw new Error("Isolated Phase Review factory cannot bind the production Founder store.");
  }
  return assemble({ runtimeStorePath: path.resolve(runtimeStorePath), liveStore,
    actorResolver: async () => ({ id: actorId }), now,
    binding: { storeIdentity: "phase_review_production_shaped_clone",
      storeKind: "temporary_clone", isolated: true, productionAllowed: false } });
}

function assemble({ runtimeStorePath, liveStore, actorResolver, now = () => new Date(), binding }) {
  const lockService = createFounderStoreMutationLockService({ storePath: runtimeStorePath });
  const acceptanceService = createPhaseActivationPackageAcceptanceService();
  const required = [runtimeStorePath, liveStore, lockService, acceptanceService,
    createStartingForecastContext, adaptProductionGoalToCanonicalContract,
    InterpretationEngine, ForecastEngine, NarrativeEngine, projectNumericConfidence];
  if (required.some((value) => value == null)) {
    throw new Error("Production Phase Review dependencies are incomplete.");
  }
  const boundary = createPhaseReviewApplicationBoundary({
    runtimeStorePath,
    liveStore,
    lockService,
    readPersistedStore: () => JSON.parse(fs.readFileSync(runtimeStorePath, "utf8")),
    createUnitOfWork: (options) => createFounderStoreUnitOfWork(options),
    acceptanceService,
    actorResolver,
    now,
    binding,
  });
  return Object.freeze({
    version: PRODUCTION_PHASE_REVIEW_COORDINATOR_FACTORY_VERSION,
    execute: boundary.execute,
    dryRun: boundary.dryRun,
    inspectLock: boundary.inspectLock,
    dependencyManifest: Object.freeze({
      founderStore: true,
      crossProcessLock: true,
      phaseReviewCoordinator: true,
      canonicalParticipants: true,
      strategyAcceptance: true,
      trajectoryAcceptance: true,
      startingForecast: true,
      goalContractAdapter: true,
      interpretationV2: true,
      forecastV2: true,
      narrativeV2: true,
      numericConfidenceProjection: true,
      confidencePersistence: true,
      lifecycleReadModels: true,
      transactionLogging: true,
      actorResolver: true,
      authorizationVerifier: true,
    }),
  });
}

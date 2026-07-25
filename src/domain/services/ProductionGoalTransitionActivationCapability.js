import fs from "node:fs";
import path from "node:path";

export const ProductionGoalTransitionActivationCapabilityVersion =
  "production_goal_transition_activation_capability_v1";

const issuedCapabilities = new WeakSet();
const SERVICE_IDENTITY = "ProductionGoalTransitionActivationService";
const BOUNDARY_IDENTITY = "production_goal_transition_activation_action";

export function issueProductionGoalTransitionActivationCapability({
  canonicalProductionStorePath,
  transitionIdentity,
  finalReviewTokenIdentity,
  founderConfirmed,
} = {}) {
  if (!canonicalProductionStorePath || !transitionIdentity?.goalTransitionDraftId
    || !finalReviewTokenIdentity || founderConfirmed !== true) {
    throw new Error("Production activation capability requirements are incomplete.");
  }
  const capability = Object.freeze({
    mode: "production_goal_transition_activation",
    capabilityVersion: ProductionGoalTransitionActivationCapabilityVersion,
    serviceIdentity: SERVICE_IDENTITY,
    productionBoundaryIdentity: BOUNDARY_IDENTITY,
    founderConfirmationRequired: true,
    founderConfirmed: true,
    canonicalProductionStoreIdentity: "founder_runtime_store",
    canonicalProductionStorePath: canonicalPath(canonicalProductionStorePath),
    transitionIdentity: structuredClone(transitionIdentity),
    finalReviewTokenIdentity,
  });
  issuedCapabilities.add(capability);
  return capability;
}

export function verifyProductionGoalTransitionActivationCapability(capability, {
  storePath,
  transitionIdentity,
  finalReviewTokenIdentity,
} = {}) {
  return issuedCapabilities.has(capability)
    && capability.capabilityVersion === ProductionGoalTransitionActivationCapabilityVersion
    && capability.serviceIdentity === SERVICE_IDENTITY
    && capability.productionBoundaryIdentity === BOUNDARY_IDENTITY
    && capability.founderConfirmationRequired === true
    && capability.founderConfirmed === true
    && capability.finalReviewTokenIdentity === finalReviewTokenIdentity
    && same(capability.transitionIdentity, transitionIdentity)
    && capability.canonicalProductionStorePath === canonicalPath(storePath);
}

function canonicalPath(value) {
  const resolved = path.resolve(value);
  try {
    return fs.realpathSync.native(resolved).toLowerCase();
  } catch {
    return resolved.toLowerCase();
  }
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

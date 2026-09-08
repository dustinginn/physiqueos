import { ApplicationProblem } from "../../contracts/v1/problem.js";
import { createNativeFounderPhotoAcceptanceService } from "../media/NativeFounderPhotoAcceptanceService.js";
import { getProductionFounderPhotoAcceptanceDataAccess } from "./productionApplicationComposition.js";
import { getNativeSandboxApplicationComposition } from "./nativeSandboxApplicationComposition.js";
import { readNativeFounderPhotoAcceptanceConfig } from "../../platform/sandbox/NativeFounderPhotoAcceptanceConfig.js";

let runtime;

export function getNativeFounderPhotoAcceptanceComposition(env = process.env) {
  if (runtime) return runtime;
  const config = readNativeFounderPhotoAcceptanceConfig(env);
  if (!config.enabled) throw unavailable();
  const sandbox = getNativeSandboxApplicationComposition(env);
  if (sandbox.config.ownerUserId !== config.sandboxOwnerUserId) throw unavailable();
  const dataAccess = getProductionFounderPhotoAcceptanceDataAccess(
    config.founderOwnerUserId,
    env
  );
  runtime = Object.freeze({
    founderAuthService: sandbox.founderAuthService,
    authority: sandbox.authority,
    service: createNativeFounderPhotoAcceptanceService({
      authority: sandbox.authority,
      config,
      store: dataAccess.store,
      authorizeProviderRead: dataAccess.authorizeProviderRead,
    }),
  });
  return runtime;
}

export function resetNativeFounderPhotoAcceptanceCompositionForTests() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Native Founder photo acceptance composition cannot be reset in production.");
  }
  runtime = undefined;
}

function unavailable() {
  return new ApplicationProblem({
    status: 404,
    code: "RESOURCE_NOT_FOUND",
    title: "The requested resource is unavailable.",
  });
}

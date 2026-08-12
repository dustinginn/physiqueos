import { createDestination, DestinationId } from "../../contracts/v1/destination.js";
import { listPhase3CommandContracts } from "../commands/Phase3CommandService.js";
import { Phase3ReadModel } from "../read-models/Phase3ReadModelService.js";
import { requireAuthenticationPrincipal } from "../auth/principal.js";

export function getApplicationCapabilities({ principal, buildIdentity } = {}) {
  requireAuthenticationPrincipal(principal);
  return Object.freeze({
    contractVersion: "1",
    apiVersion: "v1",
    build: buildIdentity ?? null,
    canonicalRuntime: "legacy_json_file",
    transportActivation: "inactive",
    readModels: Object.freeze(Object.values(Phase3ReadModel)),
    commands: listPhase3CommandContracts(),
    media: Object.freeze({ authorizedDescriptorVersion: "1", productionFilesMoved: false }),
    fallbackDestination: createDestination(DestinationId.HOME),
  });
}

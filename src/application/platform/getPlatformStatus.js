import { requireAuthenticationPrincipal } from "../auth/principal";
import { createDestination, DestinationId } from "../../contracts/v1/destination";

export function createGetPlatformStatusHandler({ buildIdentity, featureFlags, readiness }) {
  return async function getPlatformStatus({ principal }) {
    requireAuthenticationPrincipal(principal);
    return Object.freeze({
      contractVersion: "1",
      apiVersion: buildIdentity.apiVersion,
      build: buildIdentity,
      readiness,
      capabilities: featureFlags.describe(),
      destination: createDestination(DestinationId.PLATFORM_STATUS),
    });
  };
}

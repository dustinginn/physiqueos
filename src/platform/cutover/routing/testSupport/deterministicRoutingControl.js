// Deterministic, in-memory routing-control double satisfying the exact
// `combinedCutoverRoutingControl.js` contract. Test-support only; never imported by production
// composition. Unlike `createUnavailableRoutingControl` (the real production default), this can
// actually succeed, fail on command, or report an ambiguous/unknown outcome, so integration tests
// can exercise every real branch of `ProductionAuthorityHandoffService.js` - including the ones a
// permanently-unavailable production default can never reach (activation succeeding, verification
// failing after activation, etc.) - without any live DigitalOcean call.
import { RouteState, routingControlError, RoutingErrorCode } from "../combinedCutoverRoutingControl.js";

export function createDeterministicCombinedCutoverRoutingControl({
  initialRouteState = RouteState.WINDOWS_ACTIVE,
  failActivateWith = null,
  failVerifyWith = null,
  failRestoreWith = null,
} = {}) {
  let routeState = initialRouteState;
  const calls = [];
  const recordId = "deterministic-routing-record";

  return Object.freeze({
    kind: "deterministic-routing-control",
    async inspectCurrentRoute({ routingTarget } = {}) {
      calls.push({ op: "inspect", routingTarget });
      return Object.freeze({ routeState, routingTarget: routingTarget ?? null, recordId });
    },
    async activateProviderRoute({ routingTarget, providerDeploymentId, operationIdentity } = {}) {
      calls.push({ op: "activate", routingTarget, providerDeploymentId, operationIdentity });
      if (failActivateWith) throw failActivateWith;
      if (routeState === RouteState.PROVIDER_ACTIVE) return Object.freeze({ routeState, outcome: "idempotent-replay", recordId });
      if (routeState !== RouteState.WINDOWS_ACTIVE) {
        throw routingControlError(RoutingErrorCode.ACTIVATION_FAILED, `Provider activation refused routing state ${routeState}.`);
      }
      routeState = RouteState.PROVIDER_ACTIVE;
      return Object.freeze({ routeState, outcome: "activated", recordId });
    },
    async verifyProviderRoute({ routingTarget } = {}) {
      calls.push({ op: "verify", routingTarget });
      if (failVerifyWith) throw failVerifyWith;
      if (routeState !== RouteState.PROVIDER_ACTIVE) {
        throw routingControlError(RoutingErrorCode.VERIFICATION_FAILED, "Provider route is not active.");
      }
      return Object.freeze({ ready: true, routeState, recordId });
    },
    async restoreWindowsRoute({ routingTarget, operationIdentity } = {}) {
      calls.push({ op: "restore", routingTarget, operationIdentity });
      if (failRestoreWith) throw failRestoreWith;
      if (routeState === RouteState.WINDOWS_ACTIVE) return Object.freeze({ routeState, outcome: "idempotent-replay", recordId });
      if (routeState !== RouteState.PROVIDER_ACTIVE) {
        throw routingControlError(RoutingErrorCode.RESTORE_FAILED, `Windows restoration refused routing state ${routeState}.`);
      }
      routeState = RouteState.WINDOWS_ACTIVE;
      return Object.freeze({ routeState, outcome: "restored", recordId });
    },
    inspectCalls: () => calls.map((entry) => ({ ...entry })),
    currentRouteState: () => routeState,
  });
}

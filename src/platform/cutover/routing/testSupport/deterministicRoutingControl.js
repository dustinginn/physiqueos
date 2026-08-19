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

  return Object.freeze({
    kind: "deterministic-routing-control",
    async inspectCurrentRoute({ routingTarget } = {}) {
      calls.push({ op: "inspect", routingTarget });
      return Object.freeze({ routeState, routingTarget: routingTarget ?? null });
    },
    async activateProviderRoute({ routingTarget, providerDeploymentId } = {}) {
      calls.push({ op: "activate", routingTarget, providerDeploymentId });
      if (failActivateWith) throw failActivateWith;
      if (routeState === RouteState.PROVIDER_ACTIVE) return Object.freeze({ routeState, outcome: "idempotent-replay" });
      routeState = RouteState.PROVIDER_ACTIVE;
      return Object.freeze({ routeState, outcome: "activated" });
    },
    async verifyProviderRoute({ routingTarget } = {}) {
      calls.push({ op: "verify", routingTarget });
      if (failVerifyWith) throw failVerifyWith;
      if (routeState !== RouteState.PROVIDER_ACTIVE) {
        throw routingControlError(RoutingErrorCode.VERIFICATION_FAILED, "Provider route is not active.");
      }
      return Object.freeze({ ready: true, routeState });
    },
    async restoreWindowsRoute({ routingTarget } = {}) {
      calls.push({ op: "restore", routingTarget });
      if (failRestoreWith) throw failRestoreWith;
      routeState = RouteState.WINDOWS_ACTIVE;
      return Object.freeze({ routeState, outcome: "restored" });
    },
    inspectCalls: () => calls.map((entry) => ({ ...entry })),
    currentRouteState: () => routeState,
  });
}

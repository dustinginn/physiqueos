import { describe, expect, it } from "vitest";
import {
  RouteState,
  RoutingErrorCode,
  assertCombinedCutoverRoutingControl,
  createUnavailableRoutingControl,
} from "./combinedCutoverRoutingControl.js";
import { createDeterministicCombinedCutoverRoutingControl } from "./testSupport/deterministicRoutingControl.js";

describe("assertCombinedCutoverRoutingControl", () => {
  it("accepts an implementation exposing all four operations", () => {
    expect(() => assertCombinedCutoverRoutingControl(createUnavailableRoutingControl())).not.toThrow();
    expect(() => assertCombinedCutoverRoutingControl(createDeterministicCombinedCutoverRoutingControl())).not.toThrow();
  });

  it("rejects an incomplete implementation", () => {
    expect(() => assertCombinedCutoverRoutingControl({ inspectCurrentRoute: async () => {} })).toThrow(/missing/i);
  });
});

describe("createUnavailableRoutingControl — fail-closed production default", () => {
  it("every operation throws ROUTING_CONTROL_UNAVAILABLE rather than silently succeeding or no-op-ing", async () => {
    const routing = createUnavailableRoutingControl();
    for (const operation of ["inspectCurrentRoute", "activateProviderRoute", "verifyProviderRoute", "restoreWindowsRoute"]) {
      await expect(routing[operation]({})).rejects.toMatchObject({ code: RoutingErrorCode.UNAVAILABLE });
    }
  });

  it("never falls back to a synthetic/deterministic success", async () => {
    const routing = createUnavailableRoutingControl();
    await expect(routing.activateProviderRoute({ routingTarget: "provider-ingress" })).rejects.toThrow();
  });
});

describe("createDeterministicCombinedCutoverRoutingControl — test double", () => {
  it("starts with Windows active and transitions through activate/verify", async () => {
    const routing = createDeterministicCombinedCutoverRoutingControl();
    expect((await routing.inspectCurrentRoute({})).routeState).toBe(RouteState.WINDOWS_ACTIVE);
    const activated = await routing.activateProviderRoute({ routingTarget: "provider-ingress", providerDeploymentId: "deployment-1" });
    expect(activated.routeState).toBe(RouteState.PROVIDER_ACTIVE);
    const verified = await routing.verifyProviderRoute({ routingTarget: "provider-ingress" });
    expect(verified.ready).toBe(true);
  });

  it("activation is idempotent when already active", async () => {
    const routing = createDeterministicCombinedCutoverRoutingControl({ initialRouteState: RouteState.PROVIDER_ACTIVE });
    const result = await routing.activateProviderRoute({ routingTarget: "provider-ingress" });
    expect(result.outcome).toBe("idempotent-replay");
  });

  it("verify fails when the route is not yet active", async () => {
    const routing = createDeterministicCombinedCutoverRoutingControl();
    await expect(routing.verifyProviderRoute({})).rejects.toMatchObject({ code: RoutingErrorCode.VERIFICATION_FAILED });
  });

  it("restore returns the route to Windows-active", async () => {
    const routing = createDeterministicCombinedCutoverRoutingControl({ initialRouteState: RouteState.PROVIDER_ACTIVE });
    const restored = await routing.restoreWindowsRoute({});
    expect(restored.routeState).toBe(RouteState.WINDOWS_ACTIVE);
    expect(routing.currentRouteState()).toBe(RouteState.WINDOWS_ACTIVE);
  });

  it("can be configured to fail activation/verification/restore deterministically", async () => {
    const activateFailure = createDeterministicCombinedCutoverRoutingControl({ failActivateWith: new Error("activate boom") });
    await expect(activateFailure.activateProviderRoute({})).rejects.toThrow("activate boom");

    const verifyFailure = createDeterministicCombinedCutoverRoutingControl({ initialRouteState: RouteState.PROVIDER_ACTIVE, failVerifyWith: new Error("verify boom") });
    await expect(verifyFailure.verifyProviderRoute({})).rejects.toThrow("verify boom");

    const restoreFailure = createDeterministicCombinedCutoverRoutingControl({ failRestoreWith: new Error("restore boom") });
    await expect(restoreFailure.restoreWindowsRoute({})).rejects.toThrow("restore boom");
  });

  it("records every call for test assertions", async () => {
    const routing = createDeterministicCombinedCutoverRoutingControl();
    await routing.inspectCurrentRoute({ routingTarget: "x" });
    await routing.activateProviderRoute({ routingTarget: "x" });
    expect(routing.inspectCalls().map((call) => call.op)).toEqual(["inspect", "activate"]);
  });
});

import { describe, expect, it, vi } from "vitest";
import { applyCombinedRuntimeAuthorityTransition, createInitialCombinedRuntimeAuthorityState } from "../CombinedRuntimeAuthorityState.js";
import { createProductionAuthorityHandoffService } from "../handoff/ProductionAuthorityHandoffService.js";
import { createSimplifiedAuthorityHandoffService } from "./SimplifiedAuthorityHandoffService.js";

describe("simplified authority handoff", () => {
  it("requires import, private parity, Windows cold, and routing readiness before authority can transfer", async () => {
    const fixture = harness();
    for (const override of [
      { windowsCold: false },
      { importResult: { ready: false, packageDigest: D } },
      { parityResult: { ready: false, packageDigest: D } },
    ]) await expect(fixture.service.prepare(input(override))).rejects.toThrow();
    await fixture.service.prepare(input());
    expect(fixture.state().authority).toBe("provider-prepared");
    expect(fixture.state().firstProviderCanonicalWriteAt).toBeNull();
    await expect(fixture.service.transfer(input({ routingReadiness: { ready: false } }))).rejects.toMatchObject({ code: "SIMPLIFIED_HANDOFF_ROUTING_NOT_READY" });
    expect(fixture.routing.activateProviderRoute).not.toHaveBeenCalled();
    await expect(fixture.service.transfer(input({ parityResult: { ready: false, packageDigest: D } }))).rejects.toThrow();
  });

  it("transfers through the existing state machine, routes only afterward, and leaves first-write null", async () => {
    const fixture = harness();
    await fixture.service.prepare(input());
    const result = await fixture.service.transfer(input());
    expect(result).toMatchObject({ authority: "provider-authoritative", firstProviderCanonicalWriteAt: null });
    expect(fixture.state().firstProviderCanonicalWriteAt).toBeNull();
    expect(fixture.routing.activateProviderRoute).toHaveBeenCalledTimes(1);
  });

  it("supports the legitimate provider-side authority transition without pretending it changed the external route", async () => {
    const fixture = harness({ withRouting: false });
    await fixture.service.prepare(input());
    const result = await fixture.service.transferAuthority(input());
    expect(result).toMatchObject({ authority: "provider-authoritative", firstProviderCanonicalWriteAt: null, routingActivationRequired: true });
    expect(fixture.state().firstProviderCanonicalWriteAt).toBeNull();
  });

  it("retains abort-to-Windows before first write", async () => {
    const fixture = harness();
    await fixture.service.prepare(input());
    await fixture.service.abortBeforeFirstWrite({ migrationOperationId: "simplified-op", commandPrefix: "simplified" });
    expect(fixture.state()).toMatchObject({ authority: "windows-legacy-authoritative", firstProviderCanonicalWriteAt: null, writesEnabled: true });
  });

  it("does not weaken the historical handoff requirement", () => {
    expect(() => createProductionAuthorityHandoffService({ authorityStore: {}, routingControl: harness().routing })).toThrow("runtime-authority store");
    expect(() => createProductionAuthorityHandoffService({ authorityStore: { read: vi.fn() }, routingControl: harness().routing })).toThrow("durable preparation evidence store");
  });
});

const D = "d".repeat(64);
function input(overrides = {}) { return { migrationMode: "single-user-cold-backup-v1", windowsCold: true, providerPreflight: { ready: true, authority: "non-authoritative", firstPostgresWriteAt: null }, productionDryRun: { ready: true }, importResult: { ready: true, packageDigest: D }, parityResult: { ready: true, packageDigest: D }, routingReadiness: { ready: true }, migrationOperationId: "simplified-op", commandPrefix: "simplified", fenceId: "cold-windows-fence", packageDigest: D, providerDeploymentId: "deployment-one", providerSource: { commit: "a".repeat(40), buildId: "build-one" }, target: { databaseClusterId: "attached-db", databaseName: "defaultdb", spacesBucket: "private-bucket" }, routingTarget: "provider-upstream", finalSnapshot: { runtimeSha256: "a".repeat(64), runtimeRevision: 142, mediaInventorySha256: "b".repeat(64), migrationControlSha256: "c".repeat(64), packageDigest: D }, ...overrides }; }
function harness({ withRouting = true } = {}) {
  let state = createInitialCombinedRuntimeAuthorityState({ environment: "production", windowsSource: { commit: "f".repeat(40), buildId: "windows-build" }, now: "2026-08-27T00:00:00.000Z" });
  const authorityStore = { read: vi.fn(async () => ({ state })), transition: vi.fn(async (command) => { state = applyCombinedRuntimeAuthorityTransition(state, command, { now: "2026-08-27T00:01:00.000Z" }); return { state }; }) };
  const routing = { inspectCurrentRoute: vi.fn(async () => ({ target: "windows" })), activateProviderRoute: vi.fn(async () => ({ ready: true })), verifyProviderRoute: vi.fn(async () => ({ ready: true })), restoreWindowsRoute: vi.fn(async () => ({ ready: true })), verifyWindowsRoute: vi.fn(async () => ({ ready: true })) };
  return { service: createSimplifiedAuthorityHandoffService({ authorityStore, ...(withRouting ? { routingControl: routing } : {}) }), routing, state: () => state };
}

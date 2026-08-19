import { describe, expect, it } from "vitest";
import { assessCombinedCutoverPreflightReadiness, COMBINED_CUTOVER_PREFLIGHT_NAMES } from "./combinedCutoverPreflightReadiness.js";

function readyAdapter(extra = {}) { return async () => ({ ready: true, mutated: false, ...extra }); }
function blockedAdapter(code, reason) { return async () => ({ ready: false, mutated: false, code, reason }); }
function throwingAdapter(code, message) { return async () => { throw Object.assign(new Error(message), { code }); }; }

function allReadyAdapters() {
  return Object.fromEntries(COMBINED_CUTOVER_PREFLIGHT_NAMES.map((name) => [name, readyAdapter()]));
}

describe("assessCombinedCutoverPreflightReadiness", () => {
  it("requires all six preflight adapters", async () => {
    await expect(assessCombinedCutoverPreflightReadiness({ preflightAdapters: {}, input: {} })).rejects.toThrow(/missing preflight adapters/);
  });

  it("reports ready when every preflight passes", async () => {
    const result = await assessCombinedCutoverPreflightReadiness({ preflightAdapters: allReadyAdapters(), input: {} });
    expect(result.ready).toBe(true);
    expect(result.blocked).toHaveLength(0);
    for (const name of COMBINED_CUTOVER_PREFLIGHT_NAMES) expect(result.results[name].ready).toBe(true);
  });

  it("reports the exact set of blocked preflights, e.g. an unavailable real-routing-dependent capability, without throwing", async () => {
    const adapters = { ...allReadyAdapters(), verifyProviderBuild: blockedAdapter("COMBINED_CUTOVER_CAPABILITY_UNAVAILABLE", "real DigitalOcean routing is deferred") };
    const result = await assessCombinedCutoverPreflightReadiness({ preflightAdapters: adapters, input: {} });
    expect(result.ready).toBe(false);
    expect(result.blocked).toEqual([{ preflight: "verifyProviderBuild", code: "COMBINED_CUTOVER_CAPABILITY_UNAVAILABLE", reason: "real DigitalOcean routing is deferred" }]);
    expect(result.results.verifyWindowsSource.ready).toBe(true); // unrelated preflights still individually inspectable
  });

  it("converts a thrown preflight error into a blocked, non-throwing result rather than propagating", async () => {
    const adapters = { ...allReadyAdapters(), verifyWindowsSource: throwingAdapter("COMBINED_CUTOVER_SOURCE_IDENTITY_MISMATCH", "commit mismatch") };
    const result = await assessCombinedCutoverPreflightReadiness({ preflightAdapters: adapters, input: {} });
    expect(result.ready).toBe(false);
    expect(result.blocked).toContainEqual({ preflight: "verifyWindowsSource", code: "COMBINED_CUTOVER_SOURCE_IDENTITY_MISMATCH", reason: "commit mismatch" });
  });

  it("aggregates multiple simultaneously blocked preflights", async () => {
    const adapters = {
      ...allReadyAdapters(),
      verifyProviderBuild: blockedAdapter("COMBINED_CUTOVER_CAPABILITY_UNAVAILABLE", "no provider build verifier"),
      verifyTargetIsolation: blockedAdapter("COMBINED_CUTOVER_CAPABILITY_UNAVAILABLE", "no target isolation verifier"),
      verifyBackups: blockedAdapter("COMBINED_CUTOVER_CAPABILITY_UNAVAILABLE", "no backup freshness verifier"),
    };
    const result = await assessCombinedCutoverPreflightReadiness({ preflightAdapters: adapters, input: {} });
    expect(result.ready).toBe(false);
    expect(result.blocked.map((entry) => entry.preflight).sort()).toEqual(["verifyBackups", "verifyProviderBuild", "verifyTargetIsolation"]);
  });
});

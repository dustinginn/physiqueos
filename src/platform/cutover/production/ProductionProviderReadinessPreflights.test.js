import { describe, expect, it } from "vitest";
import {
  createVerifyProviderBuildPreflight, createVerifyTargetIsolationPreflight, createVerifyBackupsPreflight,
} from "./ProductionProviderReadinessPreflights.js";

describe("verifyProviderBuild", () => {
  it("reports a structured blocked capability when no verifier is configured (default production state)", async () => {
    const preflight = createVerifyProviderBuildPreflight({});
    const result = await preflight({ input: {} });
    expect(result).toMatchObject({ ready: false, mutated: false, blocked: true, capability: "verifyProviderBuild", code: "COMBINED_CUTOVER_CAPABILITY_UNAVAILABLE" });
  });

  it("reports blocked (not silently ready) when an injected verifier itself is not ready", async () => {
    const preflight = createVerifyProviderBuildPreflight({ providerBuildVerifier: { verify: async () => ({ ready: false, reason: "deployment not found" }) } });
    const result = await preflight({ input: {} });
    expect(result).toMatchObject({ ready: false, blocked: true, capability: "verifyProviderBuild" });
  });

  it("passes through a ready result from an injected verifier", async () => {
    const preflight = createVerifyProviderBuildPreflight({ providerBuildVerifier: { verify: async () => ({ ready: true, deploymentId: "d-1" }) } });
    const result = await preflight({ input: {} });
    expect(result).toMatchObject({ ready: true, mutated: false, deploymentId: "d-1" });
  });
});

describe("verifyTargetIsolation", () => {
  it("reports a structured blocked capability when no verifier is configured", async () => {
    const preflight = createVerifyTargetIsolationPreflight({});
    const result = await preflight({ input: {} });
    expect(result).toMatchObject({ ready: false, blocked: true, capability: "verifyTargetIsolation", code: "COMBINED_CUTOVER_CAPABILITY_UNAVAILABLE" });
  });

  it("passes through a ready result from an injected verifier", async () => {
    const preflight = createVerifyTargetIsolationPreflight({ providerTargetIsolationVerifier: { verify: async () => ({ ready: true, isolated: true }) } });
    const result = await preflight({ input: {} });
    expect(result).toMatchObject({ ready: true, isolated: true });
  });
});

describe("verifyBackups", () => {
  it("reports a structured blocked capability when no verifier is configured", async () => {
    const preflight = createVerifyBackupsPreflight({});
    const result = await preflight({ input: {} });
    expect(result).toMatchObject({ ready: false, blocked: true, capability: "verifyBackups", code: "COMBINED_CUTOVER_CAPABILITY_UNAVAILABLE" });
  });

  it("reuses assertManagedPostgresBackupFreshness to reject a stale backup, never treating it as ready", async () => {
    const preflight = createVerifyBackupsPreflight({ backupFreshnessVerifier: { verify: async () => ({ ready: false, status: "BLOCKED", reason: "backup-stale" }) } });
    const result = await preflight({ input: {} });
    expect(result).toMatchObject({ ready: false, blocked: true, capability: "verifyBackups" });
  });

  it("passes when the injected verifier reports a fresh backup", async () => {
    const preflight = createVerifyBackupsPreflight({ backupFreshnessVerifier: { verify: async () => ({ ready: true, status: "PASS" }) } });
    const result = await preflight({ input: {} });
    expect(result).toMatchObject({ ready: true, mutated: false });
    expect(result.backupFreshness).toMatchObject({ status: "PASS" });
  });
});

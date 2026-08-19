// Production `verifyProviderBuild`, `verifyTargetIsolation`, and `verifyBackups` preflight adapters.
// All three inherently require live DigitalOcean/provider connectivity to genuinely prove readiness
// (provider deployment/build identity, cluster firewall/Trusted-Source isolation, managed-database
// backup freshness) - none of which this task may exercise. Each accepts an injected verifier via
// source-owned dependency injection; with none supplied (the production default until a later,
// provider-backed phase), each reports `combinedCutoverCapabilityBlockedResult` rather than silently
// treating the capability as ready. This is what keeps the overall combined-cutover readiness result
// honestly blocked after Phase 6B rather than falsely green.
import { assertManagedPostgresBackupFreshness } from "../../backup/DigitalOceanManagedPostgresBackupFreshness.js";
import { combinedCutoverCapabilityBlockedResult } from "./combinedCutoverCapabilityAvailability.js";

export function createVerifyProviderBuildPreflight({ providerBuildVerifier = null } = {}) {
  return async ({ input } = {}) => {
    if (typeof providerBuildVerifier?.verify !== "function") {
      return combinedCutoverCapabilityBlockedResult({
        capability: "verifyProviderBuild",
        reason: "No production provider-build/deployment verification implementation is configured yet; real DigitalOcean deployment verification is deferred to a later phase.",
      });
    }
    const result = await providerBuildVerifier.verify({ input });
    if (result?.ready !== true) {
      return combinedCutoverCapabilityBlockedResult({ capability: "verifyProviderBuild", reason: result?.reason ?? "Provider build verification did not report readiness.", extra: { verification: result ?? null } });
    }
    return freeze({ ready: true, mutated: false, ...result });
  };
}

export function createVerifyTargetIsolationPreflight({ providerTargetIsolationVerifier = null } = {}) {
  return async ({ input } = {}) => {
    if (typeof providerTargetIsolationVerifier?.verify !== "function") {
      return combinedCutoverCapabilityBlockedResult({
        capability: "verifyTargetIsolation",
        reason: "No production provider-target isolation (cluster firewall / Trusted Source) verification implementation is configured yet.",
      });
    }
    const result = await providerTargetIsolationVerifier.verify({ input });
    if (result?.ready !== true) {
      return combinedCutoverCapabilityBlockedResult({ capability: "verifyTargetIsolation", reason: result?.reason ?? "Provider target isolation verification did not report readiness.", extra: { verification: result ?? null } });
    }
    return freeze({ ready: true, mutated: false, ...result });
  };
}

export function createVerifyBackupsPreflight({ backupFreshnessVerifier = null } = {}) {
  return async () => {
    if (typeof backupFreshnessVerifier?.verify !== "function") {
      return combinedCutoverCapabilityBlockedResult({
        capability: "verifyBackups",
        reason: "No production managed-database backup freshness verifier is configured yet.",
      });
    }
    const freshness = await backupFreshnessVerifier.verify();
    try {
      assertManagedPostgresBackupFreshness(freshness);
    } catch (error) {
      return combinedCutoverCapabilityBlockedResult({ capability: "verifyBackups", reason: error.message, extra: { backupFreshness: freshness ?? null } });
    }
    return freeze({ ready: true, mutated: false, backupFreshness: freshness });
  };
}

function freeze(value) { return Object.freeze(value); }

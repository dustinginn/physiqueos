// Windows-side HTTP client for the combined-cutover PREPARATION channel, plus the three production
// orchestrator adapters (`importProviderCanonicalState`, `verifyProviderParity`,
// `acknowledgeProviderPrepared`) built on top of it - the Phase 4 counterpart to Phase 3's
// `WindowsCombinedCutoverTransferClient.js`.
//
// WHY THIS MUST BE AN HTTP CLIENT, NOT DIRECT POSTGRES ACCESS. The database firewall is
// App-Platform-only; Windows cannot reach Postgres or Spaces directly
// (docs/COMBINED_APP_PLATFORM_AND_PERSISTENCE_CUTOVER.md). Import writes canonical data and parity/
// acknowledgement read it, so - exactly like Phase 3's `transferSnapshot` - these three adapters
// must cross the machine boundary over the authenticated preparation channel rather than touching
// PostgreSQL/Spaces locally.
//
// EACH ADAPTER PRESERVES THE SYNTHETIC REHEARSAL'S EXACT INTERFACE
// (`src/platform/cutover/syntheticCombinedCutoverRehearsal.js`), so any one of them can be
// substituted into `createCombinedAppPlatformCutoverOrchestrator({ adapters })` without changing the
// orchestrator: `importProviderCanonicalState` returns `{ready, records, ...}`,
// `verifyProviderParity` returns `{ready, readParity, commandReadiness, ...}`, and
// `acknowledgeProviderPrepared` returns exactly
// `{migrationOperationId, authorizationFingerprint, fenceId, packageDigest, providerDeploymentId}`.
//
// RETRY BOUNDARY. Only network-level failures and the small set of explicitly retryable codes are
// retried, bounded by `maxAttempts` - identical policy to the transfer client. Every semantic
// rejection (authentication, wrong operation, transfer not verified, parity mismatch, wrong
// authority state, not yet eligible) is raised immediately, never retried, because retrying cannot
// change a semantic outcome and would only hide a real cutover-recovery decision.

import { isRetryablePreparationFailure, preparationError, PreparationErrorCode } from "./combinedCutoverPreparationContract.js";

export function createCombinedCutoverPreparationHttpClient({
  fetchImpl = globalThis.fetch,
  baseUrl,
  credential,
  maxAttempts = 3,
  retryDelayMs = 250,
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required.");
  if (!String(baseUrl ?? "").trim()) throw new Error("A provider preparation base URL is required.");
  if (!String(credential ?? "").trim()) throw new Error("A machine preparation credential is required.");
  const origin = new URL(String(baseUrl).endsWith("/") ? baseUrl : `${baseUrl}/`);
  if (origin.protocol !== "https:") throw new Error("The provider preparation base URL must use HTTPS.");

  async function request(path, { method = "GET", body = null } = {}) {
    let attempt = 0;
    for (;;) {
      attempt += 1;
      let response;
      try {
        response = await fetchImpl(new URL(path, origin), {
          method,
          headers: { authorization: `Bearer ${credential}`, ...(body ? { "content-type": "application/json" } : {}) },
          body,
        });
      } catch (cause) {
        if (attempt < maxAttempts) { await delay(retryDelayMs * attempt); continue; }
        throw preparationError(PreparationErrorCode.TRANSPORT_FAILED, "The preparation request could not reach the provider.", { retryable: true, cause });
      }
      let parsed = null;
      try { parsed = await response.json(); } catch { parsed = null; }
      if (response.ok) return parsed;
      const code = String(parsed?.code ?? "PREPARATION_TRANSPORT_FAILED");
      if (isRetryablePreparationFailure(code) && attempt < maxAttempts) { await delay(retryDelayMs * attempt); continue; }
      throw preparationError(code, `The provider rejected the preparation request (${response.status}).`, { retryable: isRetryablePreparationFailure(code) });
    }
  }

  return Object.freeze({
    import: (payload) => request("import", { method: "POST", body: JSON.stringify(payload) }),
    parity: (payload) => request("parity", { method: "POST", body: JSON.stringify(payload) }),
    acknowledge: (payload) => request("acknowledge", { method: "POST", body: JSON.stringify(payload) }),
    status: (operationId) => request(`status?operationId=${encodeURIComponent(operationId)}`),
  });
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function requestPayload({ input, state, snapshot }) {
  return Object.freeze({
    migrationOperationId: input.migrationOperationId,
    authorizationFingerprint: input.authorizationFingerprint,
    fenceId: state.fenceId,
    expectedPackageDigest: snapshot.packageDigest,
  });
}

export function createProductionImportProviderCanonicalStateAdapter({ client }) {
  if (!client?.import) throw new Error("The import adapter requires a preparation HTTP client.");
  return async function importProviderCanonicalState(context) {
    const result = await client.import(requestPayload(context));
    if (result?.ready !== true) throw preparationError(PreparationErrorCode.IMPORT_FAILED, "Provider did not report a successful canonical import.");
    return result;
  };
}

export function createProductionVerifyProviderParityAdapter({ client }) {
  if (!client?.parity) throw new Error("The parity adapter requires a preparation HTTP client.");
  return async function verifyProviderParity(context) {
    return client.parity(requestPayload(context));
  };
}

export function createProductionAcknowledgeProviderPreparedAdapter({ client }) {
  if (!client?.acknowledge) throw new Error("The acknowledge adapter requires a preparation HTTP client.");
  return async function acknowledgeProviderPrepared(context) {
    const acknowledgement = await client.acknowledge(requestPayload(context));
    for (const field of ["migrationOperationId", "authorizationFingerprint", "fenceId", "packageDigest", "providerDeploymentId"]) {
      if (!acknowledgement?.[field]) throw preparationError(PreparationErrorCode.ACKNOWLEDGE_NOT_ELIGIBLE, `Provider acknowledgement is missing ${field}.`);
    }
    return acknowledgement;
  };
}

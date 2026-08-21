// Safe, provider-neutral result vocabulary for the narrow DigitalOcean control-plane client.
// Higher-level routing/worker adapters may depend on these classifications, but provider transport
// deliberately knows nothing about Phase 7B sequencing or authority policy.

export const ProviderResultClassification = Object.freeze({
  REQUEST_ACCEPTED: "PROVIDER_REQUEST_ACCEPTED",
  REQUEST_REJECTED: "PROVIDER_REQUEST_REJECTED",
  READ_FAILED: "PROVIDER_READ_FAILED",
  MUTATION_AMBIGUOUS: "PROVIDER_MUTATION_AMBIGUOUS",
  IDENTITY_MISMATCH: "PROVIDER_IDENTITY_MISMATCH",
  READBACK_MISMATCH: "PROVIDER_READBACK_MISMATCH",
  MUTATION_UNRESOLVED: "PROVIDER_MUTATION_UNRESOLVED",
});

export const ProviderReadbackClassification = Object.freeze({
  PROVEN_APPLIED: "PROVEN_APPLIED",
  PROVEN_NOT_APPLIED: "PROVEN_NOT_APPLIED",
  STILL_AMBIGUOUS: "STILL_AMBIGUOUS",
});

export const ProviderPollClassification = Object.freeze({
  TERMINAL_SUCCESS: "TERMINAL_SUCCESS",
  TERMINAL_FAILURE: "TERMINAL_FAILURE",
  DEADLINE_EXCEEDED: "DEADLINE_EXCEEDED",
});

// This is a capability map, not token discovery and not a request for broad `api:write` access.
// DigitalOcean currently documents the four read scopes as prerequisites of app:update.
export const DigitalOceanLeastPrivilegeScopes = Object.freeze({
  appRead: Object.freeze(["app:read", "regions:read", "sizes:read", "actions:read"]),
  appUpdate: Object.freeze(["app:update", "app:read", "regions:read", "sizes:read", "actions:read"]),
  domainRead: Object.freeze(["domain:read"]),
  domainCreate: Object.freeze(["domain:create", "domain:read"]),
  domainUpdate: Object.freeze(["domain:update", "domain:read"]),
  domainDelete: Object.freeze(["domain:delete", "domain:read"]),
});

const SECRET_KEY = /(?:authorization|cookie|password|passphrase|secret|token|credential|signature|signed[_-]?url|private[_-]?key|hash)$/i;
const TOKEN_VALUE = /\b(?:dop|doo|dor)_v1_[A-Za-z0-9_-]+\b/g;
const BEARER_VALUE = /\bBearer\s+[^\s,;]+/gi;
const SENSITIVE_QUERY_KEY = /^(?:access_token|token|authorization|credential|signature|x-amz-(?:credential|signature|security-token))$/i;

/**
 * Produces a JSON-safe copy appropriate for evidence and exception metadata. The client itself does
 * not expose arbitrary provider bodies; this helper is the final defense for caller-owned details.
 */
export function redactProviderEvidence(value, seen = new WeakSet()) {
  if (value == null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value !== "object") return "[REDACTED]";
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((entry) => redactProviderEvidence(entry, seen));
  const safe = {};
  for (const [key, entry] of Object.entries(value)) {
    safe[key] = SECRET_KEY.test(key) ? "[REDACTED]" : redactProviderEvidence(entry, seen);
  }
  return safe;
}

export function providerFailure(classification, message, evidence = {}) {
  const error = new Error(redactString(message));
  error.name = "DigitalOceanProviderError";
  error.code = classification;
  error.classification = classification;
  error.evidence = Object.freeze(redactProviderEvidence(evidence));
  return error;
}

function redactString(value) {
  let safe = String(value).replace(TOKEN_VALUE, "[REDACTED_TOKEN]").replace(BEARER_VALUE, "Bearer [REDACTED]");
  try {
    const parsed = new URL(safe);
    for (const key of [...parsed.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEY.test(key)) parsed.searchParams.set(key, "[REDACTED]");
    }
    safe = parsed.toString();
  } catch {
    safe = safe.replace(/([?&](?:access_token|token|authorization|credential|signature|x-amz-[^=]+)=)[^&\s]+/gi, "$1[REDACTED]");
  }
  return safe;
}

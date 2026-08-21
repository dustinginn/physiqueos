import {
  ProviderResultClassification,
  providerFailure,
  redactProviderEvidence,
} from "./DigitalOceanProviderContract.js";

const DEFAULT_API_BASE_URL = "https://api.digitalocean.com";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAXIMUM_RESPONSE_BYTES = 1_048_576;

/**
 * Narrow DigitalOcean control-plane transport. It intentionally exposes no arbitrary request
 * method and owns no routing, worker, cutover, or authority policy.
 */
export function createDigitalOceanApiClient({
  accessToken,
  fetchImpl = globalThis.fetch,
  apiBaseUrl = DEFAULT_API_BASE_URL,
  requestTimeoutMs = DEFAULT_TIMEOUT_MS,
  maximumResponseBytes = DEFAULT_MAXIMUM_RESPONSE_BYTES,
  maximumReadAttempts = 1,
  readRetryDelayMs = 100,
  now = () => Date.now(),
  wait = delay,
} = {}) {
  const token = required(accessToken, "A DigitalOcean access token");
  if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required.");
  const baseUrl = parseApiBaseUrl(apiBaseUrl);
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1) throw new Error("requestTimeoutMs must be a positive integer.");
  if (!Number.isInteger(maximumResponseBytes) || maximumResponseBytes < 1) throw new Error("maximumResponseBytes must be a positive integer.");
  if (!Number.isInteger(maximumReadAttempts) || maximumReadAttempts < 1 || maximumReadAttempts > 3) {
    throw new Error("maximumReadAttempts must be an integer from 1 through 3.");
  }
  if (!Number.isInteger(readRetryDelayMs) || readRetryDelayMs < 0 || readRetryDelayMs > 5_000) {
    throw new Error("readRetryDelayMs must be an integer from 0 through 5000.");
  }

  async function request({ method, path, safePath, resourceKind, body, operationIdentity, decode, expectedIdentity }) {
    const mutation = method !== "GET";
    const applicationIdentity = mutation ? normalizeOperationIdentity(operationIdentity) : null;
    // Serialize before entering the transport attempt so a caller-owned non-serializable object is
    // a local validation failure, never misreported as an outcome-ambiguous dispatched mutation.
    const serializedBody = body === undefined ? undefined : JSON.stringify(body);
    const maximumAttempts = mutation ? 1 : maximumReadAttempts;
    let attempt = 0;

    while (attempt < maximumAttempts) {
      attempt += 1;
      const startedAt = now();
      const deadline = createRequestDeadline(requestTimeoutMs);
      let response;
      try {
        response = await deadline.wait(Promise.resolve().then(() => fetchImpl(new URL(path, baseUrl), {
          method,
          headers: {
            authorization: `Bearer ${token}`,
            accept: "application/json",
            ...(body === undefined ? {} : { "content-type": "application/json" }),
          },
          body: serializedBody,
          signal: deadline.signal,
        })));
      } catch (cause) {
        deadline.clear();
        const timedOut = cause?.code === "PROVIDER_REQUEST_TIMEOUT";
        if (!mutation && attempt < maximumAttempts) {
          if (readRetryDelayMs) await wait(readRetryDelayMs * attempt);
          continue;
        }
        const classification = mutation
          ? ProviderResultClassification.MUTATION_AMBIGUOUS
          : ProviderResultClassification.READ_FAILED;
        throw providerFailure(classification, mutation
          ? "The provider mutation outcome is ambiguous after a transport failure."
          : "The provider read failed at the transport boundary.", evidence({
          method, resourceKind, safePath, classification, elapsedMs: elapsed(now, startedAt), timedOut,
          retryCount: attempt - 1, operationIdentity: applicationIdentity,
        }));
      }

      const responseEvidence = evidence({
        method,
        resourceKind,
        safePath,
        status: response.status,
        elapsedMs: elapsed(now, startedAt),
        timedOut: false,
        retryCount: attempt - 1,
        operationIdentity: applicationIdentity,
        providerRequestId: safeHeader(response.headers, "x-request-id"),
        rateLimit: readRateLimit(response.headers),
      });

      if (!response.ok) {
        deadline.clear();
        const classification = mutation
          ? ProviderResultClassification.REQUEST_REJECTED
          : ProviderResultClassification.READ_FAILED;
        throw providerFailure(classification, `The provider rejected the ${mutation ? "mutation" : "read"} with HTTP ${response.status}.`, {
          ...responseEvidence,
          classification,
        });
      }

      let payload = null;
      if (response.status !== 204) {
        try {
          const contentType = safeHeader(response.headers, "content-type");
          if (!contentType || !/(?:application\/json|\+json)(?:\s*;|$)/i.test(contentType)) {
            throw new Error("unexpected-content-type");
          }
          payload = JSON.parse(await deadline.wait(readBoundedText(response, maximumResponseBytes)));
        } catch (cause) {
          const timedOut = cause?.code === "PROVIDER_REQUEST_TIMEOUT";
          const classification = mutation
            ? ProviderResultClassification.MUTATION_AMBIGUOUS
            : ProviderResultClassification.READ_FAILED;
          throw providerFailure(classification, mutation
            ? "The provider accepted the HTTP mutation but its response could not be safely classified."
            : "The provider read returned an invalid or oversized response.", {
            ...responseEvidence,
            classification,
            timedOut,
          });
        } finally {
          deadline.clear();
        }
      } else {
        deadline.clear();
      }

      const decoded = decode(payload);
      if (!decoded?.valid || (expectedIdentity != null && String(decoded.identity) !== String(expectedIdentity))) {
        const classification = ProviderResultClassification.IDENTITY_MISMATCH;
        throw providerFailure(classification, "The provider response identity did not match the exact requested resource.", {
          ...responseEvidence,
          classification,
          expectedProviderIdentity: expectedIdentity == null ? undefined : String(expectedIdentity),
          observedProviderIdentity: decoded?.identity == null ? undefined : String(decoded.identity),
        });
      }

      const classification = ProviderResultClassification.REQUEST_ACCEPTED;
      return Object.freeze({
        classification,
        value: decoded.value,
        providerIdentity: Object.freeze(redactProviderEvidence(decoded.providerIdentity ?? { resourceId: decoded.identity })),
        evidence: Object.freeze({
          ...responseEvidence,
          classification,
          providerResourceId: decoded.identity == null ? undefined : String(decoded.identity),
          providerDeploymentId: decoded.providerIdentity?.deploymentId == null ? undefined : String(decoded.providerIdentity.deploymentId),
          providerActionId: decoded.providerIdentity?.actionId == null ? undefined : String(decoded.providerIdentity.actionId),
        }),
      });
    }
    throw new Error("Unreachable provider request state.");
  }

  return Object.freeze({
    getApp: (appId) => request({
      method: "GET", path: `/v2/apps/${segment(appId, "appId")}`, safePath: "/v2/apps/{app_id}", resourceKind: "app",
      expectedIdentity: appId, decode: envelope("app", "id"),
    }),
    updateApp: ({ appId, spec, updateAllSourceVersions = false, operationIdentity } = {}) => request({
      method: "PUT", path: `/v2/apps/${segment(appId, "appId")}`, safePath: "/v2/apps/{app_id}", resourceKind: "app",
      body: { spec: requirePlainObject(spec, "spec"), update_all_source_versions: Boolean(updateAllSourceVersions) },
      operationIdentity, expectedIdentity: appId, decode: appEnvelope,
    }),
    createDeployment: ({ appId, forceBuild = false, operationIdentity } = {}) => request({
      method: "POST", path: `/v2/apps/${segment(appId, "appId")}/deployments`, safePath: "/v2/apps/{app_id}/deployments", resourceKind: "deployment",
      body: { force_build: Boolean(forceBuild) }, operationIdentity, decode: envelope("deployment", "id", "deploymentId"),
    }),
    getDeployment: ({ appId, deploymentId } = {}) => request({
      method: "GET", path: `/v2/apps/${segment(appId, "appId")}/deployments/${segment(deploymentId, "deploymentId")}`,
      safePath: "/v2/apps/{app_id}/deployments/{deployment_id}", resourceKind: "deployment", expectedIdentity: deploymentId,
      decode: envelope("deployment", "id", "deploymentId"),
    }),
    getAction: (actionId) => request({
      method: "GET", path: `/v2/actions/${segment(actionId, "actionId")}`, safePath: "/v2/actions/{action_id}", resourceKind: "action",
      expectedIdentity: actionId, decode: envelope("action", "id", "actionId"),
    }),
    getDomain: (domainName) => request({
      method: "GET", path: `/v2/domains/${segment(domainName, "domainName")}`, safePath: "/v2/domains/{domain_name}", resourceKind: "domain",
      expectedIdentity: domainName, decode: envelope("domain", "name"),
    }),
    createDomain: ({ name, ipAddress, operationIdentity } = {}) => request({
      method: "POST", path: "/v2/domains", safePath: "/v2/domains", resourceKind: "domain",
      body: { name: required(name, "name"), ...(ipAddress == null ? {} : { ip_address: required(ipAddress, "ipAddress") }) },
      operationIdentity, expectedIdentity: name, decode: envelope("domain", "name"),
    }),
    listDomainRecords: ({ domainName, page = 1, perPage = 200, name, type } = {}) => {
      const query = new URLSearchParams({ page: String(boundedInteger(page, "page", 1, Number.MAX_SAFE_INTEGER)), per_page: String(boundedInteger(perPage, "perPage", 1, 200)) });
      if (name != null) query.set("name", required(name, "name"));
      if (type != null) query.set("type", required(type, "type"));
      return request({
        method: "GET", path: `/v2/domains/${segment(domainName, "domainName")}/records?${query}`,
        safePath: "/v2/domains/{domain_name}/records", resourceKind: "domain-record-list", decode: domainRecordList,
      });
    },
    getDomainRecord: ({ domainName, recordId } = {}) => request({
      method: "GET", path: `/v2/domains/${segment(domainName, "domainName")}/records/${segment(recordId, "recordId")}`,
      safePath: "/v2/domains/{domain_name}/records/{record_id}", resourceKind: "domain-record", expectedIdentity: recordId,
      decode: envelope("domain_record", "id"),
    }),
    createDomainRecord: ({ domainName, record, operationIdentity } = {}) => request({
      method: "POST", path: `/v2/domains/${segment(domainName, "domainName")}/records`, safePath: "/v2/domains/{domain_name}/records", resourceKind: "domain-record",
      body: requirePlainObject(record, "record"), operationIdentity, decode: envelope("domain_record", "id"),
    }),
    updateDomainRecord: ({ domainName, recordId, record, operationIdentity } = {}) => request({
      method: "PUT", path: `/v2/domains/${segment(domainName, "domainName")}/records/${segment(recordId, "recordId")}`,
      safePath: "/v2/domains/{domain_name}/records/{record_id}", resourceKind: "domain-record",
      body: requirePlainObject(record, "record"), operationIdentity, expectedIdentity: recordId, decode: envelope("domain_record", "id"),
    }),
    deleteDomainRecord: ({ domainName, recordId, operationIdentity } = {}) => request({
      method: "DELETE", path: `/v2/domains/${segment(domainName, "domainName")}/records/${segment(recordId, "recordId")}`,
      safePath: "/v2/domains/{domain_name}/records/{record_id}", resourceKind: "domain-record", operationIdentity,
      expectedIdentity: recordId, decode: () => ({ valid: true, identity: String(recordId), value: null }),
    }),
  });
}

function createRequestDeadline(timeoutMs) {
  const controller = new AbortController();
  let timer;
  let deadlineExceeded = false;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      deadlineExceeded = true;
      controller.abort();
      reject(Object.assign(new Error("Provider request deadline exceeded."), { code: "PROVIDER_REQUEST_TIMEOUT" }));
    }, timeoutMs);
  });
  return Object.freeze({
    signal: controller.signal,
    wait: async (promise) => {
      try {
        return await Promise.race([promise, timeout]);
      } catch (cause) {
        if (deadlineExceeded && cause?.code !== "PROVIDER_REQUEST_TIMEOUT") {
          throw Object.assign(new Error("Provider request deadline exceeded."), { code: "PROVIDER_REQUEST_TIMEOUT" });
        }
        throw cause;
      }
    },
    clear: () => clearTimeout(timer),
  });
}

async function readBoundedText(response, maximumBytes) {
  const declaredLength = Number(safeHeader(response.headers, "content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) throw new Error("response-too-large");
  if (!response.body?.getReader) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maximumBytes) throw new Error("response-too-large");
    return text;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) throw new Error("response-too-large");
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    try { await reader.cancel(); } catch { /* the stream may already be closed */ }
  }
}

function appEnvelope(payload) {
  const decoded = envelope("app", "id")(payload);
  if (!decoded.valid) return decoded;
  // Never mislabel the pre-existing active deployment as the identity created by this update.
  const deploymentId = payload.app.in_progress_deployment?.id;
  return { ...decoded, providerIdentity: { resourceId: decoded.identity, ...(deploymentId ? { deploymentId } : {}) } };
}

function envelope(key, identityKey, providerIdentityKey = null) {
  return (payload) => {
    const value = payload?.[key];
    const identity = value?.[identityKey];
    return {
      valid: Boolean(value && identity != null && String(identity).trim()),
      identity,
      value,
      providerIdentity: providerIdentityKey ? { resourceId: identity, [providerIdentityKey]: identity } : { resourceId: identity },
    };
  };
}

function domainRecordList(payload) {
  if (!Array.isArray(payload?.domain_records)) return { valid: false };
  return { valid: true, identity: null, value: Object.freeze({ records: payload.domain_records, links: payload.links ?? null, meta: payload.meta ?? null }), providerIdentity: {} };
}

function normalizeOperationIdentity(value) {
  const object = requirePlainObject(value, "operationIdentity");
  const operationId = required(object.operationId, "operationIdentity.operationId");
  return Object.freeze(redactProviderEvidence({ operationId, ...(object.commandId == null ? {} : { commandId: required(object.commandId, "operationIdentity.commandId") }) }));
}

function evidence(value) {
  return Object.freeze(redactProviderEvidence(Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null))));
}

function readRateLimit(headers) {
  const limit = finiteHeader(headers, "ratelimit-limit");
  const remaining = finiteHeader(headers, "ratelimit-remaining");
  const reset = finiteHeader(headers, "ratelimit-reset");
  return limit == null && remaining == null && reset == null ? undefined : Object.freeze({ limit, remaining, reset });
}

function finiteHeader(headers, name) {
  const value = Number(safeHeader(headers, name));
  return Number.isFinite(value) ? value : undefined;
}

function safeHeader(headers, name) {
  const value = headers?.get?.(name);
  return value == null ? undefined : String(value).slice(0, 256);
}

function elapsed(now, startedAt) {
  return Math.max(0, Math.round(now() - startedAt));
}

function parseApiBaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value));
  } catch {
    throw new Error("The DigitalOcean API base URL is invalid.");
  }
  if (parsed.protocol !== "https:") throw new Error("The DigitalOcean API base URL must use HTTPS.");
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("The DigitalOcean API base URL must not contain credentials, query parameters, or a fragment.");
  }
  return parsed;
}

function requirePlainObject(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} must be an object.`);
  return value;
}

function required(value, field) {
  const candidate = String(value ?? "").trim();
  if (!candidate) throw new Error(`${field} is required.`);
  return candidate;
}

function segment(value, field) {
  return encodeURIComponent(required(value, field));
}

function boundedInteger(value, field, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`${field} must be an integer from ${minimum} through ${maximum}.`);
  return value;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const DIGITALOCEAN_DEFAULT_REQUEST_TIMEOUT_MS = DEFAULT_TIMEOUT_MS;
export const DIGITALOCEAN_DEFAULT_MAXIMUM_RESPONSE_BYTES = DEFAULT_MAXIMUM_RESPONSE_BYTES;

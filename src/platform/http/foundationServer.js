import { createHash, timingSafeEqual } from "node:crypto";
import { resolveCorrelationId } from "../observability/correlation.js";

const JSON_HEADERS = Object.freeze({
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
});

export function createFoundationRequestHandler({ getReadiness, buildIdentity, operationsToken, migrationDryRun = null, logger } = {}) {
  if (typeof getReadiness !== "function") throw new Error("A readiness evaluator is required.");
  if (!buildIdentity?.buildId) throw new Error("A build identity is required.");
  const configuredToken = normalizeOperationsToken(operationsToken);

  return async function handleFoundationRequest(request, response) {
    const requestId = resolveCorrelationId(request.headers["x-request-id"]);
    try {
      const pathname = new URL(request.url, "http://foundation.invalid").pathname;
      if (request.method === "GET" && pathname === "/api/v1/health/live") {
        return writeJson(response, 200, publicStatus("alive", "PROCESS_ALIVE", buildIdentity, requestId));
      }
      if (request.method === "GET" && pathname === "/api/v1/health/ready") {
        const readiness = await getReadiness();
        const ready = readiness?.status === "ready";
        return writeJson(response, ready ? 200 : 503, publicStatus(ready ? "ready" : "not_ready", ready ? "DEPENDENCIES_READY" : "DEPENDENCIES_NOT_READY", buildIdentity, requestId));
      }
      if (request.method === "GET" && pathname === "/api/v1/operations/status") {
        if (!configuredToken) return writeJson(response, 503, { code: "OPERATIONS_AUTH_NOT_CONFIGURED", requestId });
        if (!authorized(request.headers.authorization, configuredToken)) return writeJson(response, 401, { code: "AUTHENTICATION_REQUIRED", requestId });
        const readiness = await getReadiness();
        return writeJson(response, readiness?.status === "ready" ? 200 : 503, { ...readiness, requestId });
      }
      if (pathname === "/api/v1/operations/production-migration-dry-runs") {
        if (request.method !== "POST") return writeJson(response, 405, { code: "METHOD_NOT_ALLOWED", requestId });
        if (!configuredToken) return writeJson(response, 503, { code: "OPERATIONS_AUTH_NOT_CONFIGURED", requestId });
        if (!authorized(request.headers.authorization, configuredToken)) return writeJson(response, 401, { code: "AUTHENTICATION_REQUIRED", requestId });
        if (!migrationDryRun?.submit) return writeJson(response, 503, { code: "REMOTE_DRY_RUN_NOT_CONFIGURED", requestId });
        const result = await migrationDryRun.submit(await readJsonBody(request));
        return writeJson(response, result.status, { ...result.body, requestId });
      }
      const dryRunStatusMatch = /^\/api\/v1\/operations\/production-migration-dry-runs\/([A-Za-z0-9._:-]{8,160})$/.exec(pathname);
      if (dryRunStatusMatch) {
        if (request.method !== "GET") return writeJson(response, 405, { code: "METHOD_NOT_ALLOWED", requestId });
        if (!configuredToken) return writeJson(response, 503, { code: "OPERATIONS_AUTH_NOT_CONFIGURED", requestId });
        if (!authorized(request.headers.authorization, configuredToken)) return writeJson(response, 401, { code: "AUTHENTICATION_REQUIRED", requestId });
        if (!migrationDryRun?.status) return writeJson(response, 503, { code: "REMOTE_DRY_RUN_NOT_CONFIGURED", requestId });
        const result = await migrationDryRun.status(dryRunStatusMatch[1]);
        return writeJson(response, result.status, { ...result.body, requestId });
      }
      if (request.method === "GET" && pathname === "/api/v1/platform") {
        return writeJson(response, 503, { status: "inactive", code: "FOUNDATION_PRODUCT_APIS_INACTIVE", requestId });
      }
      if (request.method !== "GET") return writeJson(response, 405, { code: "METHOD_NOT_ALLOWED", requestId });
      return writeJson(response, 404, { code: "NOT_FOUND", requestId });
    } catch (error) {
      logger?.error?.("foundation.http.failed", { requestId, error });
      return writeJson(response, errorStatus(error), { code: safeErrorCode(error), requestId });
    }
  };
}

async function readJsonBody(request, maximumBytes = 32 * 1024) {
  if (!/^application\/json(?:;|$)/i.test(String(request.headers["content-type"] ?? ""))) {
    const error = new Error("JSON content type is required.");
    error.code = "REMOTE_DRY_RUN_CONTENT_TYPE_REQUIRED";
    throw error;
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maximumBytes) {
      const error = new Error("Remote dry-run request is too large.");
      error.code = "REMOTE_DRY_RUN_PAYLOAD_TOO_LARGE";
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Remote dry-run request JSON is invalid.");
    error.code = "REMOTE_DRY_RUN_PAYLOAD_INVALID";
    throw error;
  }
}

function publicStatus(status, code, buildIdentity, requestId) {
  return Object.freeze({ status, code, buildId: buildIdentity.buildId, apiVersion: buildIdentity.apiVersion, requestId });
}

function normalizeOperationsToken(value) {
  const token = String(value ?? "").trim();
  if (!token) return null;
  if (token.length < 32) throw new Error("The operations token must contain at least 32 characters.");
  return token;
}

function authorized(header, expected) {
  const match = /^Bearer ([^\s]+)$/.exec(String(header ?? ""));
  if (!match) return false;
  const suppliedHash = createHash("sha256").update(match[1]).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(suppliedHash, expectedHash);
}

function errorStatus(error) {
  if (error?.code === "REMOTE_DRY_RUN_OPERATOR_FORBIDDEN") return 403;
  if (/CONFLICT|MISMATCH/.test(String(error?.code ?? ""))) return 409;
  if (/^REMOTE_DRY_RUN_(?:PAYLOAD|CONTENT_TYPE|CONTRACT_VERSION|EXECUTION_FLAG|REQUIRED)/.test(String(error?.code ?? ""))) return 400;
  return 500;
}

function safeErrorCode(error) {
  const code = String(error?.code ?? "INTERNAL_ERROR");
  return /^[A-Z0-9_]{3,80}$/.test(code) ? code : "INTERNAL_ERROR";
}

function writeJson(response, status, value) {
  response.writeHead(status, JSON_HEADERS);
  response.end(JSON.stringify(value));
}

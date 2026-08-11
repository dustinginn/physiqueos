import { createHash, timingSafeEqual } from "node:crypto";
import { resolveCorrelationId } from "../observability/correlation.js";

const JSON_HEADERS = Object.freeze({
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
});

export function createFoundationRequestHandler({ getReadiness, buildIdentity, operationsToken, logger } = {}) {
  if (typeof getReadiness !== "function") throw new Error("A readiness evaluator is required.");
  if (!buildIdentity?.buildId) throw new Error("A build identity is required.");
  const configuredToken = normalizeOperationsToken(operationsToken);

  return async function handleFoundationRequest(request, response) {
    const requestId = resolveCorrelationId(request.headers["x-request-id"]);
    try {
      if (request.method !== "GET") return writeJson(response, 405, { code: "METHOD_NOT_ALLOWED", requestId });
      const pathname = new URL(request.url, "http://foundation.invalid").pathname;
      if (pathname === "/api/v1/health/live") {
        return writeJson(response, 200, publicStatus("alive", "PROCESS_ALIVE", buildIdentity, requestId));
      }
      if (pathname === "/api/v1/health/ready") {
        const readiness = await getReadiness();
        const ready = readiness?.status === "ready";
        return writeJson(response, ready ? 200 : 503, publicStatus(ready ? "ready" : "not_ready", ready ? "DEPENDENCIES_READY" : "DEPENDENCIES_NOT_READY", buildIdentity, requestId));
      }
      if (pathname === "/api/v1/operations/status") {
        if (!configuredToken) return writeJson(response, 503, { code: "OPERATIONS_AUTH_NOT_CONFIGURED", requestId });
        if (!authorized(request.headers.authorization, configuredToken)) return writeJson(response, 401, { code: "AUTHENTICATION_REQUIRED", requestId });
        const readiness = await getReadiness();
        return writeJson(response, readiness?.status === "ready" ? 200 : 503, { ...readiness, requestId });
      }
      if (pathname === "/api/v1/platform") {
        return writeJson(response, 503, { status: "inactive", code: "FOUNDATION_PRODUCT_APIS_INACTIVE", requestId });
      }
      return writeJson(response, 404, { code: "NOT_FOUND", requestId });
    } catch (error) {
      logger?.error?.("foundation.http.failed", { requestId, error });
      return writeJson(response, 500, { code: "INTERNAL_ERROR", requestId });
    }
  };
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

function writeJson(response, status, value) {
  response.writeHead(status, JSON_HEADERS);
  response.end(JSON.stringify(value));
}

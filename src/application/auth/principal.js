import { ApplicationProblem } from "../../contracts/v1/problem.js";
import { requireResourceId } from "../../contracts/v1/identifiers.js";

export function createAuthenticationPrincipal({ userId, deviceId, sessionId, scopes = [], authenticatedAt, authenticationMethod = null, transport = null } = {}) {
  return Object.freeze({
    userId: requireResourceId(userId, "userId"),
    deviceId: requireResourceId(deviceId, "deviceId"),
    sessionId: requireResourceId(sessionId, "sessionId"),
    scopes: Object.freeze([...new Set(scopes.map(String))]),
    authenticatedAt: authenticatedAt ?? null,
    authenticationMethod,
    transport,
  });
}

export function requireAuthenticationPrincipal(principal) {
  if (!principal?.userId || !principal?.deviceId || !principal?.sessionId) {
    throw new ApplicationProblem({ status: 401, code: "AUTHENTICATION_REQUIRED", title: "Authentication is required." });
  }
  return principal;
}

export function assertPrincipalOwns(principal, ownerUserId) {
  const authenticated = requireAuthenticationPrincipal(principal);
  if (authenticated.userId !== ownerUserId) {
    throw new ApplicationProblem({ status: 404, code: "RESOURCE_NOT_FOUND", title: "The requested resource is unavailable." });
  }
  return authenticated;
}

export function requireScope(principal, scope) {
  const authenticated = requireAuthenticationPrincipal(principal);
  if (!authenticated.scopes.includes(scope)) {
    throw new ApplicationProblem({ status: 403, code: "AUTHORIZATION_DENIED", title: "This session cannot perform the requested action." });
  }
  return authenticated;
}

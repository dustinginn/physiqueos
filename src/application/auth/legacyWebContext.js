import { createAuthenticationPrincipal } from "./principal.js";

const LEGACY_WEB_SCOPE = "legacy.runtime.application-boundary";

// This adapter exists only for in-process parity while production authentication is inactive.
// API transports must use the real request authenticator and must never call this function.
export async function createInactiveLegacyWebContext({ repositories, requestId = null } = {}) {
  const user = await repositories?.users?.getCurrentUser?.();
  if (!user?.id) throw new Error("The inactive legacy web context requires the canonical current user.");
  return Object.freeze({
    principal: createAuthenticationPrincipal({
      userId: user.id,
      deviceId: "legacy-web-server",
      sessionId: "legacy-web-inactive-auth",
      scopes: [LEGACY_WEB_SCOPE],
      authenticationMethod: "inactive_legacy_web_composition",
      transport: "in_process_web",
    }),
    requestId,
    user: structuredClone(user),
  });
}

export function assertLegacyContextCannotCrossApi(principal) {
  if (principal?.authenticationMethod === "inactive_legacy_web_composition") {
    throw new Error("The inactive legacy web principal cannot authorize an API request.");
  }
  return principal;
}

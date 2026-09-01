import { ApplicationProblem } from "../../contracts/v1/problem";
import { createAuthenticationPrincipal } from "../../application/auth/principal";

export function createInactiveFoundationAuthenticator() {
  return Object.freeze({
    async authenticate() {
      throw new ApplicationProblem({
        status: 503,
        code: "FOUNDATION_AUTH_INACTIVE",
        title: "The shared-platform authentication boundary is not active.",
      });
    },
  });
}

export function createFounderBearerAuthenticator(founderAuthService) {
  if (typeof founderAuthService?.authenticateAccessToken !== "function") {
    throw new Error("A Founder authentication service is required.");
  }
  return Object.freeze({
    kind: "founder-device-bearer",
    async authenticate(request) {
      const accessToken = readBearerCredential(request?.headers?.get?.("authorization"));
      return founderAuthService.authenticateAccessToken(accessToken);
    },
  });
}

export function createExplicitTestAuthenticator(principalInput) {
  if (process.env.NODE_ENV === "production") throw new Error("The test authenticator is forbidden in production.");
  const principal = createAuthenticationPrincipal(principalInput);
  return Object.freeze({ kind: "explicit-test-only", async authenticate() { return principal; } });
}

export function readBearerCredential(authorizationHeader) {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(String(authorizationHeader ?? ""));
  if (!match) {
    throw new ApplicationProblem({
      status: 401,
      code: "AUTHENTICATION_REQUIRED",
      title: "A Founder device session is required.",
    });
  }
  return match[1];
}

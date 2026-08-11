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

export function createExplicitTestAuthenticator(principalInput) {
  if (process.env.NODE_ENV === "production") throw new Error("The test authenticator is forbidden in production.");
  const principal = createAuthenticationPrincipal(principalInput);
  return Object.freeze({ kind: "explicit-test-only", async authenticate() { return principal; } });
}

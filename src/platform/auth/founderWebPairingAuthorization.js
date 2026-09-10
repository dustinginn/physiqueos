import { ApplicationProblem } from "../../contracts/v1/problem.js";
import { isAccessGateExpected, readAccessGateSecret } from "../accessGate/accessGateConfig.js";
import { SESSION_COOKIE_NAME, verifySessionToken } from "../accessGate/sessionToken.js";
import { isTrustedApplicationRequestOrigin } from "../http/trustedApplicationOrigin.js";
import { FOUNDER_PRODUCTION_AUTHORITY } from "./FounderAuthService.js";

export async function authorizeFounderWebPairingRequest(request, env = process.env) {
  if (!isAccessGateExpected(env)) throw unavailable();

  const secret = readAccessGateSecret(env);
  if (!secret) throw unavailable();
  if (!isTrustedApplicationRequestOrigin(request.headers.get("origin"), env)) {
    throw new ApplicationProblem({ status: 403, code: "ORIGIN_MISMATCH", title: "The request origin is not authorized." });
  }

  const cookieValue = readSingleCookie(request.headers.get("cookie"), SESSION_COOKIE_NAME);
  if (!cookieValue || !(await verifySessionToken(cookieValue, secret))) {
    throw new ApplicationProblem({ status: 401, code: "AUTHENTICATION_REQUIRED", title: "Founder authentication is required." });
  }

  const userId = String(env.PHYSIQUEOS_CANONICAL_OWNER_USER_ID ?? "").trim();
  const sandboxOwnerUserId = String(env.PHYSIQUEOS_NATIVE_SANDBOX_OWNER_USER_ID ?? "").trim();
  if (!userId || (sandboxOwnerUserId && sandboxOwnerUserId === userId)) throw unavailable();

  return Object.freeze({ userId, authority: FOUNDER_PRODUCTION_AUTHORITY });
}

function readSingleCookie(header, name) {
  const matches = String(header ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`))
    .map((part) => part.slice(name.length + 1));
  return matches.length === 1 && matches[0] ? matches[0] : null;
}

function unavailable() {
  return new ApplicationProblem({
    status: 403,
    code: "FOUNDER_PRODUCTION_AUTHORITY_UNAVAILABLE",
    title: "Founder production pairing is unavailable for this session.",
  });
}

// Fail-closed guard: a provider COMPATIBILITY/rehearsal environment must never operate under a
// Founder-owner identity. Enforced centrally in `productionApplicationComposition.js`'s
// `createPostgresComposition` - the single choke point every persistence-capable composition
// (auth/enrollment, canonical import, preparation, or any other mutation route) is built through -
// rather than independently in every route, so nothing downstream can ever reach a mutation path
// under a forbidden owner.
//
// THIS GUARD IS COMPATIBILITY-MODE-ONLY BY DESIGN. The eventual real production combined-cutover
// environment is explicitly authorized to use the real Founder owner (that is the whole point of the
// production cutover) - this module is never invoked outside `compatibilityMode`, so it can never
// constrain that separately authorized path.
import { isFounderOwnerIdentifier } from "../identity/founderOwnerIdentity.js";

export function assertCompatibilityOwnerIdentity(ownerUserId, { expectedOwnerUserId = null } = {}) {
  const candidate = String(ownerUserId ?? "").trim();
  if (!candidate) {
    throw compatibilityOwnerError("PROVIDER_COMPATIBILITY_OWNER_REQUIRED", "Provider compatibility mode requires an explicit non-Founder owner identity.");
  }
  if (isFounderOwnerIdentifier(candidate)) {
    throw compatibilityOwnerError("PROVIDER_COMPATIBILITY_OWNER_FORBIDDEN", `Provider compatibility mode refuses the Founder-owner identity "${candidate}".`);
  }
  if (expectedOwnerUserId != null) {
    const expected = String(expectedOwnerUserId).trim();
    if (!expected) {
      throw compatibilityOwnerError("PROVIDER_COMPATIBILITY_OWNER_REQUIRED", "An expected compatibility owner identity was requested but is empty.");
    }
    if (candidate !== expected) {
      throw compatibilityOwnerError("PROVIDER_COMPATIBILITY_OWNER_MISMATCH", `Provider compatibility owner "${candidate}" does not match the expected rehearsal owner "${expected}".`);
    }
  }
  return candidate;
}

function compatibilityOwnerError(code, message) {
  return Object.assign(new Error(message), { code });
}

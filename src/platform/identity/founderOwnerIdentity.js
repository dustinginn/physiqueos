// Single source of truth for recognizing Founder-owner identifiers: any identifier beginning with
// the reserved "user_founder_" prefix, followed by one or more identifier characters (for example,
// the canonical seed identity uses a three-digit numeric suffix). Reused by the provider artifact
// scanner (scripts/scanProviderArtifact.mjs, which already defined this pattern first) and by the
// combined-cutover provider-compatibility owner guard (combinedCutoverCompatibilityOwnerGuard.js)
// and the generic canonical-package importer's owner guard (canonicalImportOwnerGuard.js), so the
// classification can never drift between them.
//
// This file must never itself contain a literal string matching the pattern it defines below - the
// provider artifact privacy scanner (which imports this exact pattern) also scans this module's own
// source as part of the collected worker artifact, so a literal example here would make the
// classifier flag itself. See the regression test in founderOwnerIdentity.test.js.
const FOUNDER_OWNER_IDENTIFIER_SOURCE = "user_founder_[A-Za-z0-9_-]+";

/** For scanning arbitrary text/file content where the identifier may appear anywhere. */
export function founderOwnerIdentifierContentPattern() {
  return new RegExp(`\\b${FOUNDER_OWNER_IDENTIFIER_SOURCE}\\b`, "i");
}

/** For validating a single identifier value (e.g. an env var or a package's declared owner). */
export function isFounderOwnerIdentifier(candidate) {
  const value = String(candidate ?? "").trim();
  if (!value) return false;
  return new RegExp(`^${FOUNDER_OWNER_IDENTIFIER_SOURCE}$`, "i").test(value);
}

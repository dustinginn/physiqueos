// Single source of truth for recognizing Founder-owner identifiers (e.g. "user_founder_001"). Reused
// by the provider artifact scanner (scripts/scanProviderArtifact.mjs, which already defined this
// pattern first) and by the combined-cutover provider-compatibility owner guard
// (combinedCutoverCompatibilityOwnerGuard.js) and the generic canonical-package importer's owner
// guard (canonicalImportOwnerGuard.js), so the classification can never drift between them.
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

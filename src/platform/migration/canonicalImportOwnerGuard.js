// Owner-identity guard for the GENERIC canonical package importer (scripts/importPhase4CanonicalPackage.mjs).
// That script already refuses any target database outside the guarded Phase 4 rehearsal / Phase 5
// provider-test naming pattern - but, unlike the Phase-5-specific validators
// (scripts/validatePhase5ProviderOperations.mjs and siblings, which hardcode
// `phase5-synthetic-user`), it never checked the PACKAGE'S OWN owner identity. A Founder-seed-shaped
// local package could therefore be imported into an isolated compatibility/rehearsal target without
// any guard catching it.
//
// SCOPED TO COMPATIBILITY/REHEARSAL TARGETS ONLY. Outside that target-name pattern (i.e. wherever a
// genuinely production-authorized import might one day run), the real Founder owner is legitimate and
// this function never rejects it - the guard exists specifically to protect isolated targets, not to
// become a second, accidental global ban.
//
// OWNER IDENTITY COMES FROM THE PACKAGE'S OWN MANIFEST, NEVER FROM A FILENAME OR CALLER CLAIM, so this
// guard cannot be bypassed by renaming or relocating a package directory.
import { isFounderOwnerIdentifier } from "../identity/founderOwnerIdentity.js";

export const COMPATIBILITY_REHEARSAL_DATABASE_PATTERN = /^(?:physiqueos_phase4_(?:test|rehearsal|restore)|physiqueos_phase5_(?:test|restore)_provider)(?:_|$)/;

export function isCompatibilityRehearsalTargetDatabase(databaseName) {
  return COMPATIBILITY_REHEARSAL_DATABASE_PATTERN.test(String(databaseName ?? ""));
}

export function assertCanonicalImportOwnerAllowed({ packageOwnerUserId, targetDatabaseName, expectedOwnerUserId = null } = {}) {
  const owner = String(packageOwnerUserId ?? "").trim();
  if (!owner) throw ownerError("PROVIDER_COMPATIBILITY_OWNER_REQUIRED", "The canonical package does not declare an owner identity.");

  if (!isCompatibilityRehearsalTargetDatabase(targetDatabaseName)) {
    // Not a compatibility/rehearsal target - this guard does not apply (see module header).
    return { isCompatibilityRehearsalTarget: false, packageOwnerUserId: owner };
  }

  if (isFounderOwnerIdentifier(owner)) {
    throw ownerError("PROVIDER_COMPATIBILITY_OWNER_FORBIDDEN", `Refusing to import a Founder-owned package ("${owner}") into a compatibility/rehearsal target ("${targetDatabaseName}").`);
  }
  if (expectedOwnerUserId != null) {
    const expected = String(expectedOwnerUserId).trim();
    if (!expected) throw ownerError("PROVIDER_COMPATIBILITY_OWNER_REQUIRED", "An expected package owner was requested but is empty.");
    if (owner !== expected) {
      throw ownerError("PROVIDER_COMPATIBILITY_OWNER_MISMATCH", `Package owner "${owner}" does not match the expected rehearsal owner "${expected}".`);
    }
  }
  return { isCompatibilityRehearsalTarget: true, packageOwnerUserId: owner };
}

function ownerError(code, message) {
  return Object.assign(new Error(message), { code });
}

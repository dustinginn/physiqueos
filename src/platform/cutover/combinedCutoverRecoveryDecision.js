// Shared, source-owned combined-cutover recovery decision helper.
//
// Extracted from `syntheticCombinedCutoverRehearsal.js` (which re-exports it unchanged, so existing
// imports keep working) so PRODUCTION recovery services (`recovery/ProductionWindowsAuthorityRestorationService.js`,
// `recovery/ProductionProviderForwardRecoveryService.js`) can depend on the exact same decision logic
// the synthetic rehearsal already proved, rather than re-deriving similar-but-subtly-different rules.
//
// PROVIDER-SIDE DURABLE EVIDENCE IS AUTHORITATIVE. If the provider recorded a canonical write
// boundary (`firstProviderCanonicalWriteAt`), no local state - including a stale or missing
// migration-control `firstPostgresWriteAt` mirror - may readmit a Windows rollback or a pre-boundary
// retry. A hard crash after the provider first-write COMMIT but before any local mirror update must
// still classify as provider forward recovery required: this function decides from
// `combined_runtime_authority` alone and never consults local migration-control state.
import { RuntimeAuthority } from "./CombinedRuntimeAuthorityState.js";

export function inspectCombinedCutoverRecovery(authorityState) {
  if (!authorityState) {
    return Object.freeze({
      classification: "AUTHORITY_UNAVAILABLE", rollbackLegal: false, forwardRecoveryRequired: false, restartAdmissible: false,
      reason: "Combined runtime authority state is unavailable; nothing may be admitted.",
    });
  }
  if (authorityState.firstProviderCanonicalWriteAt != null) {
    return Object.freeze({
      classification: "FORWARD_REPAIR_REQUIRED", rollbackLegal: false, forwardRecoveryRequired: true, restartAdmissible: false,
      reason: "Provider recorded a durable canonical write boundary; only forward recovery applies.",
    });
  }
  if (authorityState.authority === RuntimeAuthority.RECOVERY_REQUIRED) {
    return Object.freeze({
      classification: "FORWARD_REPAIR_REQUIRED", rollbackLegal: false, forwardRecoveryRequired: true, restartAdmissible: false,
      reason: "Runtime authority is explicitly recovery-required.",
    });
  }
  if (authorityState.authority === RuntimeAuthority.WINDOWS_LEGACY) {
    return Object.freeze({
      classification: "WINDOWS_AUTHORITATIVE", rollbackLegal: true, forwardRecoveryRequired: false, restartAdmissible: true,
      reason: "Windows retains legacy authority with no provider write boundary.",
    });
  }
  return Object.freeze({
    classification: "PRE_BOUNDARY_CUTOVER_IN_PROGRESS", rollbackLegal: true, forwardRecoveryRequired: false, restartAdmissible: false,
    reason: "A combined cutover is in progress before the provider write boundary; rollback remains legal but a fresh restart is not admissible until it is resolved.",
  });
}

export const EvidenceCanonicalCommitReadinessCode = Object.freeze({
  NUTRITION_DAILY_TOTALS_CONFLICT: "NUTRITION_DAILY_TOTALS_CONFLICT",
});

/**
 * Proves that a reviewed package is semantically ready before the durable
 * confirmation receipt is accepted. This is deliberately narrower than the
 * canonical commit itself: it only rejects a conflict already established by
 * interpretation and visible in the review. It never chooses one set of
 * Nutrition totals over another and never mutates the package.
 */
export function assertEvidenceCanonicalCommitReady(evidencePackage) {
  for (const object of evidencePackage?.evidence_objects ?? []) {
    if (object?.removed === true || object?.evidence_type !== "nutrition") continue;
    const reconciliation = object.metadata?.daily_totals_reconciliation;
    if (reconciliation?.status !== "needs_review") continue;
    const fields = [...new Set((reconciliation.conflicting_fields ?? [])
      .map((field) => String(field ?? "").trim())
      .filter(Boolean))];
    const suffix = fields.length > 0 ? ` for: ${fields.join(", ")}` : "";
    const error = new Error(
      `The supplied daily Nutrition summary conflicts with complete meal totals${suffix}. Correct the review before confirming.`
    );
    error.code = EvidenceCanonicalCommitReadinessCode.NUTRITION_DAILY_TOTALS_CONFLICT;
    error.fields = fields;
    throw error;
  }
  return true;
}

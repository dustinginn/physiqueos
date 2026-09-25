import {
  COVERAGE_UNKNOWN_READ_FAILED,
  DEFAULT_SETTLEMENT_POLICY,
  decideBriefingPublishActionV1,
  evaluateBriefingReadinessV1,
  resolveBriefingHardDeadline,
  SettlementReasonCode,
} from "./BriefingEvidenceSettlementPolicy.js";

// The read side of the settlement gate: turns a recurring cadence's final
// local evidence day into the `domainStates`/`activeReadinessDomains`
// evaluateBriefingReadinessV1 needs, then decides wait/retry/generate.
//
// This gate reads HealthKit canonical-day coverage only through the existing
// graduation reader's `readSettlementCoverage` method rather than touching
// HealthKit collections directly — the same read-side quarantine every other
// strategic reader (V3, Confidence, Energy, briefings) is held to. The
// reader already restricts what it returns to domains actually in
// evidence-eligibility scope, coverage/identity/revision only, never an
// observed value.
//
// FAIL CLOSED ON READ ERRORS. "The coverage read failed" is never "nothing is
// HealthKit-backed": a failed read (a thrown error, or an explicit `readError`
// from the reader) yields wait/retry until the hard deadline, exactly as if
// every readiness domain were unsettled-and-unknown. Only the hard deadline may
// authorize generation while the coverage state cannot be read, and then the
// decision is flagged `coverageReadFailed` so the persisted watermark and the
// logs say so honestly (every domain `unknown_coverage_read_failed`).
//
// ONE COHERENT SNAPSHOT (review N2). Readiness, the persisted watermark's
// canonical record/revision identities, and the generator's evidence inputs all
// derive from the reader's single per-run HealthKit day snapshot: the evidence
// overlay the generator freezes and `readSettlementCoverage` share it, so a
// canonical revision that lands mid-tick can never be watermarked while an
// older one is what the artifact actually used. Evidence that advances after
// the snapshot is picked up by the NEXT tick's snapshot (a new current-Evidence
// revision) and never mutates a frozen artifact.
//
// ACCEPTED FAIL-SAFE (review N3, Founder-accepted 2026-09-25). A coverage read
// failure fails closed here but is bounded by the hard deadline (above). An
// UNEXPECTED non-coverage exception escaping `evaluate` (a programming or
// configuration error) is deliberately NOT bounded by the hard deadline: the
// executor catches it per entry, logs it through the settlement observer with
// only an error class/code (never a message or stack), reports
// `awaiting_evidence_settlement`/retryable, and NEVER generates — unknown
// errors must not force publication of a potentially invalid strategic
// artifact. Repeated failure writes only execution records (no artifact, so no
// duplicate). Future work: alert on a sustained `gate_error` rate, since this
// state has no self-resolving deadline.
//
// A user who has not graduated any domain to HealthKit yet — the ordinary
// case for most of this codebase's history, and still ordinary for a domain
// a person simply never enables — must never be blocked waiting for
// evidence that was never going to settle. In that case this gate is a
// no-op: generate exactly as it did before this policy existed.

export function createBriefingCadenceSettlementGate({
  healthKitGraduationReader,
  policy = DEFAULT_SETTLEMENT_POLICY,
} = {}) {
  if (!healthKitGraduationReader?.readSettlementCoverage) {
    throw new Error("Briefing cadence settlement gate requires a HealthKit graduation reader.");
  }
  return Object.freeze({
    // Call once per executor tick, before evaluating any cadence entry, so
    // every entry in the same tick reads one consistent policy AND day
    // snapshot. When the tick owner (the cadence composition) already began a
    // run before its evidence overlay read, the gate ADOPTS that run instead of
    // resetting it: resetting would let coverage be re-read at a later revision
    // than the one the generator froze (review N2). A reader without
    // `beginSettlementRun` (a minimal test double) simply begins a run.
    async beginTick() {
      if (typeof healthKitGraduationReader.beginSettlementRun === "function") {
        healthKitGraduationReader.beginSettlementRun();
      } else {
        healthKitGraduationReader.beginRun();
      }
    },
    async evaluate({ finalEvidenceDate, earliestPublishAt, now }) {
      const timing = {
        earliestPublishAt: new Date(earliestPublishAt).toISOString(),
        hardDeadlineAt: resolveBriefingHardDeadline({ policy, earliestPublishAt }).toISOString(),
      };
      let coverage;
      try {
        coverage = await healthKitGraduationReader.readSettlementCoverage({
          localDate: finalEvidenceDate, domains: policy.readinessDomains,
        });
      } catch (error) {
        coverage = { readError: { stage: "settlement_coverage", name: String(error?.name ?? "Error").slice(0, 80),
          code: String(error?.code ?? "UNCLASSIFIED_ERROR").slice(0, 80) } };
      }
      if (coverage?.readError) {
        const readiness = evaluateBriefingReadinessV1({
          policy,
          domainStates: Object.fromEntries(policy.readinessDomains.map((domain) =>
            [domain, { present: false, coverage: COVERAGE_UNKNOWN_READ_FAILED }])),
        });
        const decision = decideBriefingPublishActionV1({ policy, earliestPublishAt, now, readiness });
        return {
          ...decision,
          // A retry before the deadline is specifically "the read failed", so the
          // reason is not mistaken for an ordinary partial-day wait.
          reasonCode: decision.action === "retry" ? SettlementReasonCode.COVERAGE_READ_FAILED : decision.reasonCode,
          readiness, coverageReadFailed: true, readError: coverage.readError, ...timing,
        };
      }
      const { activeDomains, domainStates } = coverage;
      if (activeDomains.length === 0) {
        return {
          action: "generate",
          reasonCode: SettlementReasonCode.NOT_APPLICABLE,
          readiness: null,
          unsettledDomains: [],
          ...timing,
        };
      }
      const scopedPolicy = { ...policy, readinessDomains: activeDomains };
      const readiness = evaluateBriefingReadinessV1({ policy: scopedPolicy, domainStates });
      const decision = decideBriefingPublishActionV1({
        policy: scopedPolicy, earliestPublishAt, now, readiness,
      });
      return { ...decision, readiness, ...timing };
    },
  });
}

import {
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
    // every entry in the same tick reads one consistent policy snapshot.
    async beginTick() {
      healthKitGraduationReader.beginRun();
    },
    async evaluate({ finalEvidenceDate, earliestPublishAt, now }) {
      const { activeDomains, domainStates } = await healthKitGraduationReader.readSettlementCoverage({
        localDate: finalEvidenceDate, domains: policy.readinessDomains,
      });
      const timing = {
        earliestPublishAt: new Date(earliestPublishAt).toISOString(),
        hardDeadlineAt: resolveBriefingHardDeadline({ policy, earliestPublishAt }).toISOString(),
      };
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

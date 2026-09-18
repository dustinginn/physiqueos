import { describe, expect, test } from "vitest";
import { evaluateEvidenceEligibility, FreshnessState, CompletenessState } from "./EvidenceEligibilityService.js";

describe("evaluateEvidenceEligibility", () => {
  test("a domain with a recent observation is current and complete", () => {
    const result = evaluateEvidenceEligibility({
      evidenceRefs: [{ id: "w1", domain: "weight", observedOn: "2026-09-15", status: "active" }],
      primaryDomains: ["weight"],
      expectedCadenceDaysByDomain: { weight: 14 },
      asOf: "2026-09-17",
    });
    const weight = result.perDomain.find((item) => item.domain === "weight");
    expect(weight.freshnessState).toBe(FreshnessState.CURRENT);
    expect(weight.completenessState).toBe(CompletenessState.COMPLETE);
    expect(result.overallCompleteness).toBe(CompletenessState.COMPLETE);
    expect(result.missingEvidence).toEqual([]);
  });

  test("a primary domain with zero observations is missing, not silently ignored", () => {
    const result = evaluateEvidenceEligibility({
      evidenceRefs: [],
      primaryDomains: ["dexa"],
      asOf: "2026-09-17",
    });
    expect(result.overallCompleteness).toBe(CompletenessState.MISSING);
    expect(result.missingEvidence.length).toBe(1);
    expect(result.missingEvidence[0].domain).toBe("dexa");
  });

  test("an observation far older than expected cadence is classified stale", () => {
    const result = evaluateEvidenceEligibility({
      evidenceRefs: [{ id: "w1", domain: "weight", observedOn: "2026-07-01", status: "active" }],
      primaryDomains: ["weight"],
      expectedCadenceDaysByDomain: { weight: 14 },
      asOf: "2026-09-17",
    });
    const weight = result.perDomain.find((item) => item.domain === "weight");
    expect(weight.freshnessState).toBe(FreshnessState.STALE);
    expect(result.staleEvidence.length).toBe(1);
  });

  test("superseded/retracted observations are excluded from eligibility", () => {
    const result = evaluateEvidenceEligibility({
      evidenceRefs: [
        { id: "w1", domain: "weight", observedOn: "2026-09-16", status: "superseded" },
        { id: "w2", domain: "weight", observedOn: "2026-09-01", status: "active" },
      ],
      primaryDomains: ["weight"],
      asOf: "2026-09-17",
    });
    expect(result.eligibleEvidenceRefs).toEqual(["w2"]);
  });

  test("future-dated observations past the cutoff are not eligible", () => {
    const result = evaluateEvidenceEligibility({
      evidenceRefs: [{ id: "w1", domain: "weight", observedOn: "2026-09-20", status: "active" }],
      primaryDomains: ["weight"],
      asOf: "2026-09-17",
    });
    const weight = result.perDomain.find((item) => item.domain === "weight");
    expect(weight.eligibleObservationCount).toBe(0);
  });

  test("two same-domain readings disagreeing on direction are flagged as a contradiction", () => {
    const result = evaluateEvidenceEligibility({
      evidenceRefs: [
        { id: "w1", domain: "weight", observedOn: "2026-09-01", status: "active", direction: "favorable" },
        { id: "w2", domain: "weight", observedOn: "2026-09-10", status: "active", direction: "unfavorable" },
      ],
      primaryDomains: ["weight"],
      asOf: "2026-09-17",
    });
    expect(result.contradictions.length).toBe(1);
    expect(result.contradictions[0].earlierEvidenceRef).toBe("w1");
    expect(result.contradictions[0].laterEvidenceRef).toBe("w2");
  });

  test("throws rather than silently defaulting when the cutoff is missing", () => {
    expect(() => evaluateEvidenceEligibility({ evidenceRefs: [] })).toThrow();
  });
});

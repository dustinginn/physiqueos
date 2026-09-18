import { test, describe } from "node:test";
import assert from "node:assert/strict";
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
    assert.equal(weight.freshnessState, FreshnessState.CURRENT);
    assert.equal(weight.completenessState, CompletenessState.COMPLETE);
    assert.equal(result.overallCompleteness, CompletenessState.COMPLETE);
    assert.deepEqual(result.missingEvidence, []);
  });

  test("a primary domain with zero observations is missing, not silently ignored", () => {
    const result = evaluateEvidenceEligibility({
      evidenceRefs: [],
      primaryDomains: ["dexa"],
      asOf: "2026-09-17",
    });
    assert.equal(result.overallCompleteness, CompletenessState.MISSING);
    assert.equal(result.missingEvidence.length, 1);
    assert.equal(result.missingEvidence[0].domain, "dexa");
  });

  test("an observation far older than expected cadence is classified stale", () => {
    const result = evaluateEvidenceEligibility({
      evidenceRefs: [{ id: "w1", domain: "weight", observedOn: "2026-07-01", status: "active" }],
      primaryDomains: ["weight"],
      expectedCadenceDaysByDomain: { weight: 14 },
      asOf: "2026-09-17",
    });
    const weight = result.perDomain.find((item) => item.domain === "weight");
    assert.equal(weight.freshnessState, FreshnessState.STALE);
    assert.equal(result.staleEvidence.length, 1);
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
    assert.deepEqual(result.eligibleEvidenceRefs, ["w2"]);
  });

  test("future-dated observations past the cutoff are not eligible", () => {
    const result = evaluateEvidenceEligibility({
      evidenceRefs: [{ id: "w1", domain: "weight", observedOn: "2026-09-20", status: "active" }],
      primaryDomains: ["weight"],
      asOf: "2026-09-17",
    });
    const weight = result.perDomain.find((item) => item.domain === "weight");
    assert.equal(weight.eligibleObservationCount, 0);
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
    assert.equal(result.contradictions.length, 1);
    assert.equal(result.contradictions[0].earlierEvidenceRef, "w1");
    assert.equal(result.contradictions[0].laterEvidenceRef, "w2");
  });

  test("throws rather than silently defaulting when the cutoff is missing", () => {
    assert.throws(() => evaluateEvidenceEligibility({ evidenceRefs: [] }));
  });
});

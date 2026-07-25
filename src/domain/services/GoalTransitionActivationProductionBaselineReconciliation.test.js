import { describe, expect, it } from "vitest";
import {
  ProductionBaselineSectionClass as C,
  captureProductionRuntimeSemanticBaseline as capture,
  compareControlledProductionWindow,
  compareProductionRuntimeSemanticBaselines as compare,
  decideProductionBaselineLock,
  findActivationSignatures,
} from "./GoalTransitionActivationProductionBaselineReconciliation";

function fixture(overrides = {}) {
  return {
    version: "v1", updatedAt: "t1", goals: [{ id: "visible", status: "active" }],
    goalTransitionDrafts: [{ id: "gtd", status: "accepted" }],
    goalProtocolTransitionDrafts: [{ id: "ptd", status: "accepted" }],
    protocols: [{ id: "p", goalId: "visible", provenance: "historic" }],
    protocolVersions: [{ id: "pv", protocolId: "p" }],
    energyStrategyLinks: [], executionItems: [{ id: "commitment" }],
    reminders: [{ id: "reminder" }], operatingPlan: { cadence: "weekly" },
    dailyBriefings: [{ id: "brief" }], analyses: [],
    weightEntries: [], dexaScans: [], progressPhotos: [], dailyCheckIns: [],
    evidencePackages: [], evidenceReviews: [], canonicalEvidenceObjects: [],
    evidenceRelationships: [], ...overrides,
  };
}

const explainedEvidence = (section) => ({
  [section]: { classification: C.EVIDENCE_INGESTION, attribution: "confirmed upload" },
});

describe("production baseline reconciliation", () => {
  it("accepts an attributed evidence-only addition", () => {
    const before = fixture();
    const after = fixture({ evidencePackages: [{ package_id: "new" }] });
    expect(compare({ before: capture(before), after: capture(after),
      explainedSections: explainedEvidence("evidencePackages") }).acceptable).toBe(true);
  });

  it.each([
    ["goal drift", (s) => ({ ...s, goals: [{ id: "visible", status: "completed" }] })],
    ["target creation", (s) => ({ ...s, goals: [...s.goals, { id: "build-lean-mass" }] })],
    ["ownership drift", (s) => ({ ...s, protocols: [{ ...s.protocols[0], goalId: "other" }] })],
    ["draft drift", (s) => ({ ...s, goalTransitionDrafts: [{ id: "gtd", status: "consumed" }] })],
    ["commitment drift", (s) => ({ ...s, executionItems: [] })],
    ["scheduler drift", (s) => ({ ...s, reminders: [] })],
    ["recommendation/briefing drift", (s) => ({ ...s, dailyBriefings: [{ id: "changed" }] })],
  ])("blocks %s", (_name, mutate) => {
    const before = fixture();
    expect(compare({ before: capture(before), after: capture(mutate(before)) }).acceptable)
      .toBe(false);
  });

  it("classifies relationship drift as evidence and stales its fingerprint only", () => {
    const before = capture(fixture());
    const after = capture(fixture({ evidenceRelationships: [{ id: "relationship" }] }));
    const result = compare({ before, after,
      explainedSections: explainedEvidence("evidenceRelationships") });
    expect(result.acceptable).toBe(true);
    expect(after.activationCriticalFingerprint).toBe(before.activationCriticalFingerprint);
    expect(after.evidenceRelationshipFingerprint).not.toBe(before.evidenceRelationshipFingerprint);
  });

  it("does not accept a whole semantic change without section attribution", () => {
    const before = fixture();
    const after = fixture({ canonicalEvidenceObjects: [{ canonicalId: "e" }] });
    expect(capture(after).wholeSemanticFingerprint).not.toBe(capture(before).wholeSemanticFingerprint);
    expect(compare({ before: capture(before), after: capture(after) }).acceptable).toBe(false);
  });

  it("blocks unknown root collections", () => {
    const before = fixture();
    const after = fixture({ mysteryState: [{ id: "x" }] });
    expect(compare({ before: capture(before), after: capture(after) }).blockers[0].section)
      .toBe("mysteryState");
  });

  it("finds coordinator signatures deterministically", () => {
    const store = fixture({ revision: 1, lastCommitId: "activation_commit_1",
      goals: [{ id: "build-lean-mass" }] });
    const first = findActivationSignatures(store, { targetGoalId: "build-lean-mass" });
    expect(first).toEqual(findActivationSignatures(store, { targetGoalId: "build-lean-mass" }));
    expect(first).toContain("TARGET_GOAL_PRESENT");
    expect(first).toContain("MONOTONIC_REVISION_PRESENT");
  });

  it("treats absent revision and commit metadata as signature-free", () => {
    expect(findActivationSignatures(fixture(), { targetGoalId: "build-lean-mass" })).toEqual([]);
  });

  it("fails a controlled window on any byte-level field change", () => {
    expect(compareControlledProductionWindow({
      before: { sha256: "a" }, after: { sha256: "b" },
    })).toEqual({ passed: false, changedFields: ["sha256"] });
  });

  it("passes an unchanged controlled window", () => {
    const measurement = {
      sha256: "a", size: 1, modifiedUtc: "t", updatedAt: "t",
      activationCriticalFingerprint: "a", evidenceFingerprint: "e",
      evidenceRelationshipFingerprint: "r", briefingArtifactFingerprint: "b",
    };
    expect(compareControlledProductionWindow({ before: measurement, after: { ...measurement } })
      .passed).toBe(true);
  });

  it("returns a deterministic lock result", () => {
    const input = { reconciliation: { acceptable: true }, controlledWindow: { passed: true },
      activationStateValid: true, coordinatorNonInvolvement: true,
      regressionsPassed: true, productionBoundaryAbsent: true };
    expect(decideProductionBaselineLock(input)).toEqual(decideProductionBaselineLock(input));
    expect(decideProductionBaselineLock(input).result).toBe("LOCKED");
  });

  it("blocks when any acceptance condition fails", () => {
    expect(decideProductionBaselineLock({}).result).toBe("BLOCKED");
  });
});

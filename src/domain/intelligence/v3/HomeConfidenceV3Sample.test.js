import { describe, expect, it } from "vitest";
import { createPairedCalibrationFixtures } from "../../../fixtures/confidenceNarrativeV3CalibrationFixtures.js";
import { createGoalContractV3 } from "./GoalContractV3.js";
import { runConfidenceNarrativeV3 } from "./ConfidenceNarrativeV3Pipeline.js";
import { createHomeConfidenceV3Sample } from "./HomeConfidenceV3SampleService.js";
import { findNarrativeV3VoiceViolations } from "./NarrativeV3CompositionService.js";

describe("Unwired Home Confidence and canonical evidence vocabulary", () => {
  it.each([
    { cadenceDays: 28, phrase: "next few weeks" },
    { cadenceDays: 56, phrase: "next 8 weeks" },
    { cadenceDays: null, phrase: "until the next DEXA" },
  ])("binds temporal language to canonical timing $cadenceDays", ({ cadenceDays, phrase }) => {
    const fixture = createPairedCalibrationFixtures().dexa;
    const goalContract = createGoalContractV3({ ...fixture.goalContract, evidenceRequests: fixture.goalContract.evidenceRequests.map((request) => ({ ...request, timing: { cadenceDays } })) });
    const result = runConfidenceNarrativeV3({ ...fixture, goalContract });
    expect(createHomeConfidenceV3Sample(result).expanded.explanation.whatIsHoldingItBack.join(" ")).toContain(phrase);
    expect(result.narrativePlan.confidenceBriefing.heading).toContain("confidence ·");
  });
  it("shares one assessment snapshot and explanation across briefing, collapsed and expanded Home", () => {
    const result = runConfidenceNarrativeV3(createPairedCalibrationFixtures().dexa);
    const home = createHomeConfidenceV3Sample(result);
    for (const view of [result.narrativePlan.confidenceBriefing, home.collapsed, home.expanded]) {
      expect(view).toMatchObject({ percentage: 79, delta: 17, movement: "increase" });
    }
    expect(home.expanded.explanation).toBe(result.narrativePlan.confidenceDeepExplanation);
    expect(home.publication).toMatchObject({ clientWiring: false, persistenceWrites: 0, artifactWrites: 0 });
    expect(home.expanded.explanation.whatCouldRaiseIt.join(" ")).toContain("before the next DEXA");
    expect(home.expanded.explanation.nextEvidence).toContain("not whether the plan works");
    expect(home.collapsed).toMatchObject({ label: "goal confidence", movementLabel: "up 17 points" });
    expect(home.expanded.explanation.whatIsHoldingItBack).toContain("One excellent response is not a promise that the next few weeks will match it.");
    expect(home.expanded.explanation.whatCouldLowerIt.join(" ")).toContain("Body fat moving outside the intended range of 8% to 9%");
    expect(home.expanded.explanation.whatCouldLowerIt.join(" ")).not.toMatch(/important limits|0 index|recovery/iu);
    const copy = JSON.stringify(home.expanded.explanation);
    expect(findNarrativeV3VoiceViolations(copy)).toEqual([]);
    expect(copy).not.toMatch(/feasibility|persistence|attribution|normalized|execution health|55%|78\.54/iu);
  });

  it("preserves the latest canonical increase while the following publication correctly reports a hold", () => {
    const fixtures = createPairedCalibrationFixtures();
    const event = runConfidenceNarrativeV3(fixtures.dexa);
    const weekly = runConfidenceNarrativeV3({ ...fixtures.weekly, priorInterpretation: event.strategicInterpretation, priorCoachingState: event.coachingState, priorConfidence: event.confidence, priorNarrativePlan: event.narrativePlan });
    const homeAfterWeekly = createHomeConfidenceV3Sample(weekly);
    expect(weekly.narrativePlan.latestMeaningfulConfidenceChange).toEqual(event.narrativePlan.latestMeaningfulConfidenceChange);
    expect(weekly.narrativePlan.confidenceBriefing).toMatchObject({ percentage: 79, delta: 0, movement: "no_meaningful_change" });
    expect(homeAfterWeekly.collapsed).toMatchObject(weekly.narrativePlan.primaryConfidenceSnapshot);
    expect(homeAfterWeekly.expanded).toMatchObject(weekly.narrativePlan.primaryConfidenceSnapshot);
    expect(weekly.narrativePlan.composition.sections.meaning).toBeNull();
    expect(weekly.narrativePlan.composition.finalNarrative).not.toContain("5.0 lb");
    expect(homeAfterWeekly.latestMeaningfulConfidenceChange).toMatchObject({ percentage: 79, delta: 17, movement: "increase" });
  });

  it("rejects mismatched assessment identity, interpretation identity, percentage and movement", () => {
    const result = runConfidenceNarrativeV3(createPairedCalibrationFixtures().dexa);
    for (const change of [{ confidenceAssessmentId: "wrong" }, { strategicInterpretationId: "wrong" }, { primaryConfidenceSnapshot: { ...result.narrativePlan.primaryConfidenceSnapshot, percentage: 80 } }, { primaryConfidenceSnapshot: { ...result.narrativePlan.primaryConfidenceSnapshot, movement: "decrease" } }]) {
      expect(() => createHomeConfidenceV3Sample({ confidence: result.confidence, narrativePlan: { ...result.narrativePlan, ...change } })).toThrow(/matching canonical/iu);
    }
  });

  it.each([
    ["DEXA", "singular"], ["time trial", "singular"], ["strength assessment", "singular"],
    ["progress photos", "plural"], ["weight trend", "singular"], ["launch assessment", "singular"],
  ])("names the next %s from bindings without changing strategic meaning", (displayName, grammaticalNumber) => {
    const fixture = createPairedCalibrationFixtures().dexa;
    const goalContract = createGoalContractV3({ ...fixture.goalContract, vocabulary: { ...fixture.goalContract.vocabulary, evidence: { requests: { composition_comparison: { displayName, grammaticalNumber } } } } });
    const result = runConfidenceNarrativeV3({ ...fixture, goalContract });
    const home = createHomeConfidenceV3Sample(result);
    expect(result.confidence.currentPercentage).toBe(79);
    expect(result.narrativePlan.composition.sections.watch).toContain(`The next ${displayName} ${grammaticalNumber === "plural" ? "are" : "is"} about`);
    expect(home.expanded.explanation.nextEvidence).toBe(result.narrativePlan.composition.sections.watch);
    expect(result.narrativePlan.composition.coachTake).toContain(`the next ${displayName}`);
    expect(result.narrativePlan.nextEvidence.namedFromBinding).toBe(true);
  });

  it.each(["absent", "unknown vocabulary", "multiple alternatives", "other revision", "other question"])("does not guess an evidence name when %s", (mode) => {
    const fixture = createPairedCalibrationFixtures().dexa;
    const request = structuredClone(fixture.goalContract.evidenceRequests[0]);
    if (mode === "unknown vocabulary") request.alternatives[0].vocabularyKey = "unknown";
    if (mode === "multiple alternatives") request.alternatives.push({ capabilityIds: ["custom.measurement"], vocabularyKey: "custom" });
    if (mode === "other revision") request.strategyRevisionId = "other";
    if (mode === "other question") request.questionId = "other";
    const goalContract = createGoalContractV3({ ...fixture.goalContract, evidenceRequests: mode === "absent" ? [] : [request], vocabulary: { ...fixture.goalContract.vocabulary, evidence: { ...fixture.goalContract.vocabulary.evidence, requests: { ...fixture.goalContract.vocabulary.evidence.requests, custom: { displayName: "custom assessment" } } } } });
    const result = runConfidenceNarrativeV3({ ...fixture, goalContract });
    expect(result.narrativePlan.nextEvidence.namedFromBinding).toBe(false);
    expect(result.narrativePlan.composition.sections.watch).toContain("The next check");
    expect(result.narrativePlan.composition.sections.watch).not.toContain("DEXA");
  });
});

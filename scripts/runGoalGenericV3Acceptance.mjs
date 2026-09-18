import { evaluateGoalGenericV3Acceptance } from "../src/fixtures/goalGenericV3AcceptanceFixtures.js";
import { findNarrativeV3VoiceViolations } from "../src/domain/intelligence/v3/NarrativeV3CompositionService.js";

const rows = evaluateGoalGenericV3Acceptance().map(({ fixture, result, checks }) => {
  const state = result.strategicInterpretation;
  const voicePass = findNarrativeV3VoiceViolations(result.narrativePlan.composition.finalNarrative + result.narrativePlan.composition.coachTake).length === 0;
  return {
    id: fixture.id, name: fixture.name, contract: { objectives: fixture.objectives, guardrails: fixture.guards ?? [], decisionPolicy: "all_required" },
    evidence: result.observationIds, objectiveState: state.objectiveFindings.map((item) => item.state), goalAchievement: state.goalAchievement,
    guardrails: state.guardrailFindings.map((item) => ({ name: item.metricCapability.displayName, state: item.status })),
    feasibility: state.strategyEffectiveness.feasibility, persistence: state.strategyEffectiveness.persistence,
    goalConfidence: result.confidence.currentPercentage, priorConfidence: result.confidence.priorPercentage, movement: result.confidence.delta,
    recommendation: state.recommendation, affect: state.coachingAffect, nextEvidencePurpose: state.nextCoachingQuestion?.evidencePurpose,
    checks: { ...checks, voicePass }, pass: voicePass && Object.values(checks).every(Boolean),
    representativeCopy: fixture.representative ? { sections: result.narrativePlan.composition.sections, coachTake: result.narrativePlan.composition.coachTake } : undefined,
  };
});
console.log(JSON.stringify({ schemaVersion: "goal_generic_v3_acceptance_report_v1", syntheticDeterministicFixtures: true, productionWrites: 0, passed: rows.every((row) => row.pass), rows }, null, 2));
if (rows.some((row) => !row.pass)) process.exitCode = 1;

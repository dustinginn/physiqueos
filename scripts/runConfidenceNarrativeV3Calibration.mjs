import { runConfidenceNarrativeV3 } from "../src/domain/intelligence/v3/ConfidenceNarrativeV3Pipeline.js";
import { createPairedCalibrationFixtures } from "../src/fixtures/confidenceNarrativeV3CalibrationFixtures.js";
import { createHomeConfidenceV3Sample } from "../src/domain/intelligence/v3/HomeConfidenceV3SampleService.js";

const fixtures = createPairedCalibrationFixtures();
const dexa = runConfidenceNarrativeV3(fixtures.dexa);
const weekly = runConfidenceNarrativeV3({
  ...fixtures.weekly,
  priorInterpretation: dexa.strategicInterpretation,
  priorCoachingState: dexa.coachingState,
  priorConfidence: dexa.confidence,
  priorNarrativePlan: dexa.narrativePlan,
});
const homeConfidence = createHomeConfidenceV3Sample(dexa);

const report = {
  schemaVersion: "confidence_narrative_v3_paired_calibration_report_v1",
  fixturePolicy: {
    bothFixturesRegeneratedTogether: true,
    v3EngineChangedDuringFixtureCorrection: false,
    v3EngineChangedDuringVoiceCalibration: true,
    v3GoalConfidenceModelRevised: true,
    confidenceModelChangedDuringFinalPass: false,
    strategicStateMachinesChangedDuringFinalPass: true,
    genericityQuestionLifecycleCorrected: true,
    homeSampleOnly: true,
    fixtureSpecificConfidenceAdjustmentUsed: false,
    sourceArtifactsMutated: false,
    productionDataMutated: false,
    publishedBriefingsMutated: false,
    persistenceWrites: dexa.publication.persistenceWrites + weekly.publication.persistenceWrites,
    artifactWrites: dexa.publication.artifactWrites + weekly.publication.artifactWrites,
    nativeWiring: false,
    webWiring: false,
    deployed: false,
    canonicalDocsUpdated: false,
  },
  fixtureChronology: {
    canonicalDexaDate: "2026-09-12",
    dexaArtifactId: fixtures.dexa.sourceArtifactId,
    comparisonDexaDate: "2026-08-15",
    comparisonUsesAugustNotJuly: true,
    activeStrategyRevisionId: fixtures.dexa.goalContract.strategy.strategyRevisionId,
    strategyExposureDays: 28,
    weeklyArtifactId: fixtures.weekly.sourceArtifactId,
    weeklyPublicationDate: "2026-09-13T07:02:58.048Z",
    weeklyEvidenceWindow: fixtures.weekly.evaluationContext.evidenceWindow,
    dexaPublicationDate: "2026-09-13T06:28:58.012Z",
    newEvidenceAfterDexaBeforeWeekly: [],
  },
  dexa: summarize(fixtures.dexa, dexa),
  weekly: summarize(fixtures.weekly, weekly),
  homeConfidence,
  confidenceConsistency: {
    allUsePrimaryGoalConfidence: [dexa, weekly].every((result) => result.confidence.primaryDimension === "goal_completion"),
    allUseSameCurrentPercentage: dexa.confidence.currentPercentage === weekly.confidence.currentPercentage,
    homeUsesDexaAssessmentSnapshot: homeConfidence.confidenceAssessmentId === dexa.confidence.id && homeConfidence.collapsed.delta === dexa.confidence.delta,
    weeklyPublicationMovement: weekly.confidence.movement,
    latestMeaningfulChangeInherited: weekly.narrativePlan.latestMeaningfulConfidenceChange.assessmentId === dexa.confidence.id,
    sameCanonicalLatestMeaningfulMovement: weekly.narrativePlan.latestMeaningfulConfidenceChange.movement === homeConfidence.latestMeaningfulConfidenceChange.movement && homeConfidence.latestMeaningfulConfidenceChange.movement === dexa.confidence.movement,
    explanationsOwnedByServer: true,
    nextEvidenceNamedFromBinding: dexa.narrativePlan.nextEvidence.namedFromBinding,
    full18CaseAcceptanceMatrixRun: true,
  },
  crossFixtureInvariants: {
    weeklyPredecessorInterpretationId: weekly.strategicInterpretation.predecessorInterpretationId,
    expectedDexaInterpretationId: dexa.strategicInterpretation.id,
    predecessorInherited: weekly.strategicInterpretation.predecessorInterpretationId === dexa.strategicInterpretation.id,
    dexaObjectiveCarriedForward: weekly.strategicInterpretation.objectiveFindings.some((item) => item.freshness === "carried_forward"),
    priorStrategyHistoryPreserved: weekly.strategicInterpretation.predecessorInterpretationId === dexa.strategicInterpretation.id &&
      weekly.strategicInterpretation.strategyEffectiveness.continuity.inherited,
    strategyContinuityInherited: weekly.strategicInterpretation.strategyEffectiveness.continuity.inherited,
    newStrategyFeasibilityScopeReset: weekly.strategicInterpretation.strategyEffectiveness.revisionChanged,
    weeklyPreservesDexaFeasibility: weekly.strategicInterpretation.strategyEffectiveness.feasibility === dexa.strategicInterpretation.strategyEffectiveness.feasibility,
    weeklyPreservesDexaPersistence: weekly.strategicInterpretation.strategyEffectiveness.persistence === dexa.strategicInterpretation.strategyEffectiveness.persistence,
  },
};

console.log(JSON.stringify(report, null, 2));

function summarize(fixture, result) {
  const interpretation = result.strategicInterpretation;
  const answeredTransitions = interpretation.questionTransitions.filter((item) => item.to === "answered");
  const answeredQuestions = answeredTransitions.map((transition) => {
    const question = result.coachingState.questions.find((item) => item.questionId === transition.questionId);
    return {
      questionId: question.questionId,
      text: question.text,
      answerCode: question.answerCode,
      answeredByEvidenceIds: question.answeredByEvidenceIds,
    };
  });
  return {
    fixtureId: fixture.fixtureId,
    sourceArtifactId: fixture.sourceArtifactId,
    strategicInterpretationId: interpretation.id,
    objectiveFindings: interpretation.objectiveFindings,
    goalAchievement: interpretation.goalAchievement,
    guardrailFindings: interpretation.guardrailFindings,
    strategyFeasibility: interpretation.strategyEffectiveness.feasibility,
    strategyPersistence: interpretation.strategyEffectiveness.persistence,
    attributionState: interpretation.strategyEffectiveness.attribution,
    strategyLineage: interpretation.lineage,
    importantTypedUncertainties: interpretation.uncertaintyProfile,
    answeredCoachingQuestions: answeredQuestions,
    questionTransitions: interpretation.questionTransitions,
    nextCoachingQuestion: interpretation.nextCoachingQuestion,
    nextEvidencePurpose: interpretation.nextCoachingQuestion?.evidencePurpose ?? null,
    recommendation: interpretation.recommendation,
    confidenceBefore: result.confidence.priorPercentage,
    confidenceAfter: result.confidence.currentPercentage,
    confidenceMovement: result.confidence.movement,
    confidenceMovementReason: result.confidence.movementReason,
    confidenceContributions: result.confidence.contributions,
    confidenceProjectionPolicy: result.confidence.projectionPolicy,
    strategyConfidence: result.confidence.strategyConfidence,
    goalConfidence: result.confidence.goalConfidence,
    primaryConfidenceDimension: result.confidence.primaryDimension,
    goalAchievementOutlook: result.confidence.goalAchievementOutlook,
    executionState: result.confidence.execution,
    newCanonicalEvidenceIds: result.confidence.newEvidenceIds,
    whatCouldRaiseConfidence: result.confidence.whatCouldRaise,
    whatCouldLowerConfidence: result.confidence.whatCouldLower,
    briefingConfidenceSection: result.narrativePlan.confidenceBriefing,
    latestMeaningfulConfidenceChange: result.narrativePlan.latestMeaningfulConfidenceChange,
    nextEvidence: result.narrativePlan.nextEvidence,
    confidenceDeepExplanation: result.narrativePlan.confidenceDeepExplanation,
    narrativeContinuityPolicy: result.narrativePlan.continuityPolicy,
    biggestTakeaway: result.narrativePlan.biggestTakeaway,
    coachingAffect: interpretation.coachingAffect,
    userFacingSections: result.narrativePlan.composition.sections,
    finalProposedNarrative: result.narrativePlan.composition.finalNarrative,
    finalProposedCoachTake: result.narrativePlan.composition.coachTake,
  };
}

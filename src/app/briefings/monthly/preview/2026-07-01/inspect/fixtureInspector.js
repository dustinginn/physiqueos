import { monthlyPreviewFixtures } from "../../../../../../fixtures/monthlyBriefingPreview";
import { composeMonthlyBriefingPreview, MONTHLY_SCORE_WEIGHTS } from "../../../../../../domain/services/MonthlyBriefingPreviewService";

export const DEFAULT_MONTHLY_FIXTURE = "julyContinuation";
export const MONTHLY_INSPECTOR_GENERATED_AT = "2026-07-30T20:00:00.000Z";

export async function resolveMonthlyFixture(searchParams) {
  const resolved = await searchParams;
  const requested = resolved?.fixture;
  const fixtureName = requested === "ordinaryMonth" ? "ordinaryMonth" : DEFAULT_MONTHLY_FIXTURE;
  return { fixtureName, fixture: monthlyPreviewFixtures[fixtureName] };
}

function recordsForFixture(fixture) {
  return [
    ...(fixture.weights ?? []),
    ...(fixture.dexaScans ?? []),
    ...(fixture.progressPhotos ?? []),
    ...(fixture.dailyBriefings ?? []),
    ...(fixture.energyContinuations ?? []),
    ...(fixture.trainingObservations ?? []),
  ];
}

function syntheticRecords(fixture) {
  const continuation = fixture.syntheticContinuation ?? {};
  return [
    ...(continuation.weights ?? []),
    ...(continuation.dexaScans ?? []),
    ...(continuation.progressPhotos ?? []),
    ...(continuation.dailyBriefings ?? []),
    ...(continuation.energyContinuations ?? []),
    ...(continuation.trainingObservations ?? []),
  ];
}

function candidateView(candidate) {
  return {
    storyId: candidate.storyId,
    storyType: candidate.storyType,
    title: candidate.title,
    score: candidate.score,
    scoreRank: candidate.scoreRank,
    included: candidate.included,
    exclusionReason: candidate.exclusionReason,
    renderedOrder: candidate.renderedOrder,
    renderedOrderReason: candidate.renderedOrderReason,
    evidenceStrength: candidate.evidenceStrength,
    scoreContributors: candidate.scoreContributors,
    evidenceRefs: candidate.evidenceRefs,
    sourceClaimRefs: candidate.sourceClaimRefs,
    mergeMetadata: candidate.mergeMetadata,
    syntheticInvolvement: candidate.syntheticInvolvement,
    storyWindow: candidate.storyWindow,
    comparisonWindow: candidate.comparisonWindow,
    carryInContext: candidate.carryInContext,
    provenance: candidate.provenance,
  };
}

export function composeMonthlyFixtureInspection(fixtureName, fixture) {
  const narrative = composeMonthlyBriefingPreview({
    weights: fixture.weights,
    dexaScans: fixture.dexaScans,
    progressPhotos: fixture.progressPhotos,
    dailyBriefings: fixture.dailyBriefings,
    energyContinuations: fixture.energyContinuations,
    trainingObservations: fixture.trainingObservations,
    goal: fixture.goal,
    syntheticContinuation: fixture.syntheticContinuation,
    previewWindow: fixture.previewWindow,
    generatedAt: MONTHLY_INSPECTOR_GENERATED_AT,
  });
  const decision = narrative.editorialDecision;
  const observed = recordsForFixture(fixture);
  const synthetic = syntheticRecords(fixture);
  const syntheticDates = synthetic
    .map((record) => record.measuredAt ?? record.capturedAt ?? record.generatedAt ?? record.date)
    .filter(Boolean)
    .sort();

  return {
    route: "/briefings/monthly/preview/2026-07-01/inspect",
    fixture: {
      name: fixtureName,
      id: fixture.fixtureId,
      version: fixture.fixtureVersion,
      seed: fixture.fixtureSeed,
      monthlyWindow: fixture.previewWindow,
      observedCutoff: fixture.observedCutoff,
      syntheticRange: decision.synthetic.syntheticDateRange,
      observedRecordCount: observed.length,
      syntheticRecordCount: synthetic.length,
      syntheticDates,
    },
    decision: {
      heroThesisCandidateIds: decision.heroThesisCandidateIds,
      boundedMilestoneCandidateIds: decision.boundedMilestoneCandidateIds,
      rankedEditorialStoryIds: decision.rankedEditorialStoryIds,
      selectedStoryCount: decision.selectedStoryCount,
      scoreRankedCandidateIds: decision.scoreRankedCandidateIds,
      renderedCandidateIds: decision.renderedCandidateIds,
      candidates: [...decision.candidates]
        .sort((left, right) => left.scoreRank - right.scoreRank)
        .map(candidateView),
      mergeDecisions: decision.mergeDecisions,
      suppressionDecisions: decision.mergeDiagnostics.suppressed,
      orderingAdjustments: decision.orderingAdjustments,
      scoreWeightTotal: Object.values(MONTHLY_SCORE_WEIGHTS).reduce((total, weight) => total + weight, 0),
      generatedAt: decision.generatedAt,
    },
  };
}

export async function buildMonthlyFixtureInspection(searchParams) {
  const { fixtureName, fixture } = await resolveMonthlyFixture(searchParams);
  return composeMonthlyFixtureInspection(fixtureName, fixture);
}

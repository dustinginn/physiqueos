import { monthlyPreviewFixtures } from "../../../../../../fixtures/monthlyBriefingPreview";
import { FounderRepositories } from "../../../../../../data/repositories/founderRepositories";
import { createMonthlyBriefingPreviewService } from "../../../../../../domain/services/MonthlyBriefingPreviewService";

function toFixtureDecision(fixtureName) {
  if (fixtureName === "ordinaryMonth") return monthlyPreviewFixtures.ordinaryMonth;
  return monthlyPreviewFixtures.julyContinuation;
}

function ordered(candidateList) {
  return [...candidateList]
    .sort((left, right) => {
      const leftScoreRank = left.scoreRank ?? 9999;
      const rightScoreRank = right.scoreRank ?? 9999;
      if (leftScoreRank !== rightScoreRank) return leftScoreRank - rightScoreRank;
      const leftRendered = left.renderedOrder ?? 9999;
      const rightRendered = right.renderedOrder ?? 9999;
      return leftRendered - rightRendered;
    })
    .map((candidate) => ({
      storyId: candidate.storyId,
      storyType: candidate.storyType,
      title: candidate.title,
      score: candidate.score,
      scoreRank: candidate.scoreRank,
      timeWindow: candidate.timeWindow,
      included: candidate.included,
      renderedOrder: candidate.renderedOrder,
      evidenceStrength: candidate.evidenceStrength,
      scoreContributors: candidate.scoreContributors,
      exclusionReason: candidate.exclusionReason || null,
      sourceClaimRefs: candidate.sourceClaimRefs || [],
      mergeMetadata: candidate.mergeMetadata || null,
      syntheticInvolvement: candidate.syntheticInvolvement,
      evidenceRefs: candidate.evidenceRefs || [],
      provenance: candidate.provenance || {},
    }));
}

export default async function MonthlyBriefingPreviewInspectorPage({ searchParams }) {
  const user = await FounderRepositories.users.getCurrentUser();
  const fixtureKey = (searchParams?.fixture || "julyContinuation");
  const selectedFixture = toFixtureDecision(fixtureKey);

  const service = createMonthlyBriefingPreviewService({ repositories: FounderRepositories });
  const baseNarrative = await service.preview({ userId: user.id });
  const fixtureNarrative = await service.preview({ userId: user.id, syntheticContinuation: selectedFixture.syntheticContinuation });

  const decision = fixtureNarrative.editorialDecision;
  const candidateView = ordered(decision.candidates);

  const summary = {
    route: "/briefings/monthly/preview/2026-07-01/inspect",
    fixture: fixtureKey,
    fixtureId: selectedFixture.fixtureId,
    fixtureVersion: selectedFixture.fixtureVersion,
    routeSafePreview: baseNarrative.id,
    selectedStoryCount: decision.selectedStoryCount,
    candidateCount: decision.candidates.length,
    rankedEditorialStoryIds: decision.rankedEditorialStoryIds || [],
    heroThesisCandidateIds: decision.heroThesisCandidateIds,
    boundedMilestoneCandidateIds: decision.boundedMilestoneCandidateIds,
    synthetic: {
      active: decision.synthetic.active,
      candidateCount: decision.synthetic.candidateCount,
      realEvidenceCutoff: decision.synthetic.realEvidenceCutoff,
      syntheticStart: decision.synthetic.syntheticStart,
      syntheticEnd: decision.synthetic.syntheticEnd,
      syntheticDateRange: decision.synthetic.syntheticDateRange,
      fixtureId: decision.synthetic.fixtureId,
      fixtureVersion: decision.synthetic.fixtureVersion,
      fixtureSeed: decision.synthetic.fixtureSeed,
    },
    scoreOrderedIds: decision.scoreRankedCandidateIds,
    renderedOrderedIds: decision.renderedCandidateIds,
    mergeDecisions: decision.mergeDecisions,
    orderingAdjustments: decision.orderingAdjustments,
    candidates: candidateView,
  };

  return (
    <main className="app-surface min-h-screen overflow-x-hidden p-4">
      <section className="mb-4 rounded border bg-[var(--surface-elevated)] p-3">
        <h1 className="text-xl font-bold">Monthly Preview Editorial Decision Inspector</h1>
        <p className="mt-2 text-xs font-semibold text-slate-500">Fixture selector: julyContinuation | ordinaryMonth</p>
        <p className="mt-1 text-sm">
          <a className="mr-3 text-blue-600 underline" href="/briefings/monthly/preview/2026-07-01/inspect?fixture=julyContinuation">July synthetic transition</a>
          <a className="text-blue-600 underline" href="/briefings/monthly/preview/2026-07-01/inspect?fixture=ordinaryMonth">Ordinary-month control</a>
        </p>
      </section>
      <section className="rounded border bg-[var(--surface-elevated)] p-3">
        <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{JSON.stringify(summary, null, 2)}</pre>
      </section>
    </main>
  );
}

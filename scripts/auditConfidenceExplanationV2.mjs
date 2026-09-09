// Read-only production replay. This script intentionally loads the persisted canonical
// snapshot for audit; Founder routes use bounded read stores and never call this script.
const { register } = await import("node:module");
register("file:///app/scripts/sourceModuleResolutionHook.mjs", import.meta.url);

const [{ loadApplicationCanonicalRuntimeSnapshot }, {
  closeProductionApplicationComposition,
}, {
  buildConfidenceExplanationModel,
}, {
  findFounderPresentationLeaks,
}] = await Promise.all([
  import("file:///app/src/application/runtime/ApplicationCanonicalRuntime.js"),
  import("file:///app/src/application/composition/productionApplicationComposition.js"),
  import("file:///app/src/domain/presentation/confidenceExplanationPresentation.js"),
  import("file:///app/src/domain/presentation/productLanguagePresentation.js"),
]);

const MONTHLY_ARTIFACT_ID = "monthly_briefing_user_founder_001_202608";

try {
  const store = await loadApplicationCanonicalRuntimeSnapshot();
  const revisionBefore = store.revision;
  const records = (store.goalConfidenceHistory ?? [])
    .filter((record) => record.assessment?.schemaVersion ===
      "canonical_confidence_assessment_v2");
  const monthlyArtifact = (store.dailyBriefings ?? [])
    .find((artifact) => artifact.id === MONTHLY_ARTIFACT_ID);
  const currentId = monthlyArtifact?.confidencePublication?.assessmentId ??
    monthlyArtifact?.briefing?.confidenceAssessmentId ?? null;
  const current = records.find((record) => record.assessmentId === currentId)
    ?.assessment ?? null;
  const predecessor = records.find((record) =>
    record.assessmentId === current?.priorAssessmentId)?.assessment ?? null;
  assert(current?.currentPercentage === 62, "Current Monthly score changed.");
  assert(current?.confidenceBand === "moderate", "Current Monthly band changed.");
  assert(current?.movement === "no_meaningful_change",
    "Current Monthly movement changed.");
  assert(predecessor?.currentPercentage === 62 &&
    predecessor?.publisherType === "weekly_briefing",
  "Current Monthly predecessor changed.");
  assert(current?.sourceCutoff === "2026-09-01T06:59:59.999Z",
    "Current Monthly cutoff changed.");

  const replay = records.map((record) => {
    const assessment = record.assessment;
    const surface = ({
      weekly_briefing: "weekly",
      midweek_briefing: "midweek",
      monthly_briefing: "monthly",
      dexa_event_briefing: "dexa_event",
      photo_event_briefing: "photo_event",
    })[assessment.publisherType] ?? "detail";
    const model = buildConfidenceExplanationModel({
      assessment,
      surface,
      historicalContext: surface.endsWith("event")
        ? { eventDate: assessment.sourceCutoff } : null,
    });
    return {
      assessmentId: assessment.id,
      publisher: assessment.publisherType,
      score: assessment.currentPercentage,
      prior: assessment.priorPercentage,
      band: assessment.confidenceBand,
      movement: assessment.movement,
      currentMonthly: assessment.id === current.id,
      leakCount: findFounderPresentationLeaks(model).length,
      degradation: model.degradation.status,
    };
  });
  const decreases = replay.filter((item) => item.movement === "decrease");
  const validDecreases = decreases.filter((item) =>
    item.publisher !== "monthly_briefing" || item.currentMonthly);
  assert(replay.length === 19, `Expected 19 V2 assessments; found ${replay.length}.`);
  assert(replay.every((item) => item.leakCount === 0),
    "Founder-facing presentation leakage was detected.");
  assert(validDecreases.length === 0,
    "A valid historical decrease requires manual semantic review.");

  const result = {
    observedAt: new Date().toISOString(),
    deployment: {
      source: process.env.PHYSIQUEOS_GIT_SHA ?? null,
      build: process.env.PHYSIQUEOS_BUILD_ID ?? null,
    },
    assessmentCount: replay.length,
    increaseCount: replay.filter((item) => item.movement === "increase").length,
    validDecreaseCount: validDecreases.length,
    retainedDefectiveDecreaseCount: decreases.length,
    currentMonthly: {
      assessmentId: current.id,
      score: current.currentPercentage,
      band: current.confidenceBand,
      movement: current.movement,
      predecessorAssessmentId: predecessor.id,
      predecessorScore: predecessor.currentPercentage,
      predecessorPublisher: predecessor.publisherType,
      sourceCutoff: current.sourceCutoff,
    },
    zeroPresentationLeaks: replay.every((item) => item.leakCount === 0),
    degradationCounts: replay.reduce((counts, item) => ({
      ...counts,
      [item.degradation]: Number(counts[item.degradation] ?? 0) + 1,
    }), {}),
    replay,
    revisionBefore,
    revisionAfter: store.revision,
    productionMutationPerformed: "NONE",
  };
  process.stdout.write(`CONFIDENCE_EXPLANATION_REPLAY_BEGIN${Buffer.from(
    JSON.stringify(result)).toString("base64")}CONFIDENCE_EXPLANATION_REPLAY_END\n`);
} finally {
  await closeProductionApplicationComposition();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

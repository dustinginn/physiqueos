import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCanonicalConfidenceAssessment } from
  "../confidence/CanonicalConfidenceAssessmentModel";
import { createPairedCalibrationFixtures } from
  "../../fixtures/confidenceNarrativeV3CalibrationFixtures";
import { createCanonicalBriefingConfidencePublicationService } from
  "./CanonicalBriefingConfidencePublicationService";
import { createStrategicInterpretationPublicationServiceV3 } from
  "./StrategicInterpretationPublicationServiceV3";
import { applyNarrativeV3ToBriefingArtifact,
  createBriefingGoalConfidenceBlockFromV3 } from
  "./BriefingGoalConfidencePresentationService";
import { resolveActiveGoalConfidencePresentation } from
  "./ActiveGoalConfidencePresentationReadService";

const directories = [];
afterEach(() => directories.splice(0).forEach((directory) =>
  fs.rmSync(directory, { recursive: true, force: true })));

describe("shared canonical V3 strategic publication", () => {
  it("publishes Sep 12 DEXA at 79 then holds Sep 13 Weekly at 79 without replaying the event", async () => {
    const fixtures = createPairedCalibrationFixtures();
    const setup = fixtureStore(fixtures.dexa.goalContract);
    const event = await publishFixture({ setup, fixture: fixtures.dexa,
      publisherType: "dexa_event_briefing", cadenceOrEventType: "dexa" });
    expect(event.assessment).toMatchObject({
      schemaVersion: "canonical_confidence_assessment_v3",
      priorPercentage: 62,
      currentPercentage: 79,
      feasibilityState: "demonstrated",
      persistenceState: "emerging",
    });

    const afterEvent = JSON.parse(fs.readFileSync(setup.filePath, "utf8"));
    const eventPresentation = resolveActiveGoalConfidencePresentation({
      activeGoal: { id: fixtures.dexa.goalContract.goalId,
        title: "Build 10 lb of lean mass",
        phases: [{ id: fixtures.dexa.goalContract.phase.phaseId,
          status: "active" }] },
      activePhase: { id: fixtures.dexa.goalContract.phase.phaseId,
        name: "Lean Mass Build" },
      store: afterEvent,
    });
    expect(eventPresentation).toMatchObject({ value: 79,
      movementDirection: "increased",
      piVersion: "confidence_v3" });
    expect(eventPresentation.explanationDetail).toMatchObject({
      schemaVersion: "home_confidence_presentation_v3",
      currentPercentage: 79,
      movement: "increased",
      delta: 17,
      whyConfidence: expect.stringMatching(/plan is clearly working/iu),
      whatIncreasedIt: expect.arrayContaining([
        expect.stringMatching(/added 5\.0 lb/iu),
      ]),
      whatCouldRaiseIt: expect.arrayContaining([
        expect.stringMatching(/next DEXA/iu),
      ]),
      nextEvidence: expect.stringMatching(/not whether the plan works/iu),
      coachTake: expect.stringMatching(/exactly what this build needed/iu),
      goal: { id: fixtures.dexa.goalContract.goalId,
        label: "the 10 lb lean-mass goal" },
      phase: { id: fixtures.dexa.goalContract.phase.phaseId,
        label: "Lean Mass Build" },
    });
    const weekly = await publishFixture({ setup, fixture: fixtures.weekly,
      publisherType: "weekly_briefing", cadenceOrEventType: "weekly",
      previous: afterEvent.goalConfidenceHistory.at(-1).assessment });
    expect(weekly.assessment).toMatchObject({
      priorPercentage: 79,
      currentPercentage: 79,
      movement: "no_meaningful_change",
      feasibilityState: "demonstrated",
      persistenceState: "emerging",
    });
    expect(weekly.narrativePlan.continuityPolicy.mode)
      .toBe("recent_event_followup");
    expect(weekly.narrativePlan.composition.finalNarrative)
      .not.toBe(event.narrativePlan.composition.finalNarrative);
    expect(createBriefingGoalConfidenceBlockFromV3({
      assessment: weekly.assessment,
    })).toMatchObject({
      score: 79, band: "moderate", priorScore: 79, delta: 0,
      movementDirection: "held", movementLabel: "No meaningful change",
      presentationExplanation: expect.any(String),
      goalId: fixtures.weekly.goalContract.goalId,
      phaseId: fixtures.weekly.goalContract.phase.phaseId,
      assessmentDate: fixtures.weekly.evaluationContext.evaluatedAt,
      source: "canonical_confidence_v3_snapshot",
    });
    const persisted = JSON.parse(fs.readFileSync(setup.filePath, "utf8"));
    expect(persisted.goalConfidenceHistory).toHaveLength(3);
    expect(persisted.dailyBriefings).toHaveLength(3);
    const weeklyPresentation = resolveActiveGoalConfidencePresentation({
      activeGoal: { id: fixtures.weekly.goalContract.goalId,
        phases: [{ id: fixtures.weekly.goalContract.phase.phaseId,
          status: "active" }] },
      activePhase: { id: fixtures.weekly.goalContract.phase.phaseId },
      store: persisted,
    });
    expect(weeklyPresentation).toMatchObject({
      value: 79, piVersion: "confidence_v3",
      narrativeSummary: expect.any(String),
      narrativeDetail: expect.any(String),
      goalAchievementState: "in_progress",
      strategyEffectiveness: { feasibility: "demonstrated",
        persistence: "emerging" },
    });
    expect(weeklyPresentation.explanationDetail).toMatchObject({
      movement: "held", delta: 0,
      latestMeaningfulMovement: { percentage: 79, delta: 17,
        movement: "increase" },
    });
  });

  it("previews without writing and keeps historical briefing bytes unchanged", async () => {
    const fixture = createPairedCalibrationFixtures().dexa;
    const setup = fixtureStore(fixture.goalContract);
    const before = fs.readFileSync(setup.filePath, "utf8");
    const service = sharedFor(setup, fixture);
    const preview = await service.preview(requestFor({ setup, fixture,
      publisherType: "dexa_event_briefing", cadenceOrEventType: "dexa" }));
    expect(preview.assessment.currentPercentage).toBe(79);
    expect(fs.readFileSync(setup.filePath, "utf8")).toBe(before);
    expect(JSON.parse(before).dailyBriefings[0]).toEqual(
      JSON.parse(fs.readFileSync(setup.filePath, "utf8")).dailyBriefings[0]);
  });

  it.each(["midweek", "weekly", "monthly", "dexa", "photo"])(
    "makes canonical V3 narrative the strategic presentation authority for %s",
    async (publicationType) => {
      const fixture = createPairedCalibrationFixtures().dexa;
      const setup = fixtureStore(fixture.goalContract);
      const preview = await sharedFor(setup, fixture).preview(requestFor({
        setup, fixture, publisherType: "dexa_event_briefing",
        cadenceOrEventType: "dexa",
      }));
      const artifact = briefingShell(publicationType);
      const projected = applyNarrativeV3ToBriefingArtifact({ artifact,
        publicationType, narrativePlan: preview.narrativePlan,
        strategicInterpretation: preview.strategicInterpretation });
      expect(projected.briefing.narrativeV3).toMatchObject({
        summary: preview.narrativePlan.composition.headline,
        detail: preview.narrativePlan.composition.finalNarrative,
        coachTake: preview.narrativePlan.composition.coachTake,
        confidenceExplanation:
          preview.narrativePlan.confidenceDeepExplanation,
        strategicInterpretationId: preview.strategicInterpretation.id,
      });
      if (publicationType === "midweek") {
        expect(projected.briefing.coachTake)
          .toBe(preview.narrativePlan.composition.coachTake);
      }
      if (publicationType === "weekly") {
        expect(projected.briefing.weeklyNarrative.cards.coachInsight)
          .toMatchObject({
            celebration: preview.narrativePlan.composition.sections.result,
            explanation: preview.narrativePlan.composition.coachTake,
            preparation: preview.narrativePlan.composition.sections.watch,
          });
        expect(projected.briefing.weeklyNarrative
          .narrativePresentationSelection.coachInsight.keepBuilding)
          .toBe(preview.narrativePlan.composition.coachTake);
      }
      if (publicationType === "dexa") {
        expect(projected.briefing.dexaEventNarrative.coachInsight.next)
          .toBe(preview.narrativePlan.composition.coachTake);
      }
      if (publicationType === "photo") {
        expect(projected.briefing.photoEventNarrative.cardContent
          .coachInsight.body)
          .toBe(preview.narrativePlan.composition.coachTake);
      }
      expect(JSON.stringify(projected)).not.toContain("legacy strategic conclusion");
    },
  );
});

function briefingShell(type) {
  const common = { id: `artifact-${type}`, briefing: {} };
  if (type === "midweek") return { ...common, briefing: {
    hero: { verdict: "legacy strategic conclusion" },
    coachTake: "legacy strategic conclusion",
  } };
  if (type === "weekly") return { ...common, briefing: { weeklyNarrative: {
    summary: "legacy strategic conclusion", primaryStory: "legacy strategic conclusion",
    cards: { hero: {}, coachInsight: {} },
  } } };
  if (type === "monthly") return { ...common, briefing: {
    monthlyNarrative: { title: "legacy strategic conclusion" },
    monthlyPresentation: { hero: {} },
  } };
  return { ...common, briefing: {
    [type === "dexa" ? "dexaEventNarrative" : "photoEventNarrative"]: {
      hero: { title: "legacy strategic conclusion" },
      ...(type === "dexa"
        ? { coachInsight: { next: "legacy strategic conclusion" } }
        : { cardContent: { coachInsight: {
          body: "legacy strategic conclusion" } } }),
    },
  } };
}

async function publishFixture({ setup, fixture, publisherType,
  cadenceOrEventType, previous = setup.prior }) {
  const service = sharedFor(setup, fixture);
  return service.finalize(requestFor({ setup, fixture, publisherType,
    cadenceOrEventType, previous }));
}

function sharedFor(setup, fixture) {
  return createStrategicInterpretationPublicationServiceV3({
    publicationService: setup.publication,
    buildInput: async () => ({ goalContract: fixture.goalContract,
      observations: fixture.observations }),
    now: () => new Date(fixture.evaluationContext.evaluatedAt),
  });
}

function requestFor({ setup, fixture, publisherType, cadenceOrEventType,
  previous = setup.prior }) {
  const id = fixture.sourceArtifactId;
  return {
    publisherType, cadenceOrEventType,
    userId: "founder", occurrenceId: id, artifactId: id,
    evidenceWindowId: `${id}|window`, idempotencyKey: `confidence_v3|${id}`,
    goal: { id: fixture.goalContract.goalId, title: fixture.goalContract.goalLabel },
    phase: { id: fixture.goalContract.phase.phaseId },
    store: JSON.parse(fs.readFileSync(setup.filePath, "utf8")),
    previousCanonicalAssessment: previous,
    evidenceCutoff: fixture.evaluationContext.evidenceCutoff,
    finalizedAt: fixture.evaluationContext.evaluatedAt,
    evaluationType: fixture.evaluationContext.type,
    surface: fixture.surface,
    composeArtifact: ({ confidenceAssessment, narrativePlan }) => ({
      id, cadence: cadenceOrEventType === "weekly" ? "weekly" : "event",
      generatedAt: fixture.evaluationContext.evaluatedAt,
      evidenceWindow: { id: `${id}|window` },
      briefing: { narrativeV3: narrativePlan.composition },
      confidencePublication: { assessmentId: confidenceAssessment.id },
    }),
  };
}

function fixtureStore(goalContract) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "v3-publication-"));
  directories.push(directory);
  const filePath = path.join(directory, "store.json");
  const prior = priorV2(goalContract);
  const historical = {
    id: "historical-midweek-v2", cadence: "midweek",
    generatedAt: "2026-09-01T12:00:00.000Z",
    briefing: { narrative: "Historical V2 remains immutable.",
      goalConfidence: { score: 62, assessmentId: prior.id } },
  };
  const store = {
    revision: 1, updatedAt: prior.publicationTimestamp,
    lastCommitId: "prior", dailyBriefings: [historical],
    confidenceInitializationArtifacts: [], confidenceActivationArtifacts: [],
    goalConfidenceContinuitySeeds: [],
    goalConfidenceHistory: [{
      id: `history|${prior.id}`, assessmentId: prior.id,
      goalId: prior.goalId, phaseId: prior.phaseId,
      predecessorAssessmentId: null,
      originatingArtifactId: prior.briefingArtifactId,
      publisherType: prior.publisherType, persistedAt: prior.publicationTimestamp,
      commitId: "prior", assessment: prior,
    }],
    goalConfidenceSnapshots: [{
      id: `snapshot|${prior.goalId}|${prior.phaseId}`,
      goalId: prior.goalId, phaseId: prior.phaseId,
      goalContractId: prior.goalContract.id,
      goalContractVersion: prior.goalContract.version,
      currentAssessmentId: prior.id, currentScore: 62,
      scoreBand: prior.confidenceBand, previousCanonicalAssessmentId: null,
      historyRecordId: `history|${prior.id}`,
      originatingArtifactId: prior.briefingArtifactId,
      publisherType: prior.publisherType, evidenceCutoff: prior.sourceCutoff,
      createdAt: prior.publicationTimestamp, updatedAt: prior.publicationTimestamp,
      commitId: "prior",
    }],
  };
  fs.writeFileSync(filePath, `${JSON.stringify(store)}\n`);
  return { filePath, prior,
    publication: createCanonicalBriefingConfidencePublicationService({ filePath }) };
}

function priorV2(goalContract) {
  return createCanonicalConfidenceAssessment({
    goalId: goalContract.goalId, phaseId: goalContract.phase.phaseId,
    goalContractId: "contract-v2", goalContractVersion: "2",
    publisherType: "weekly_briefing", originatingBriefingId: "prior-weekly",
    briefingArtifactId: "prior-weekly", evidenceWindowId: "prior-window",
    projection: { schemaVersion: "numeric_confidence_projection_v2",
      id: "prior-projection", movement: "no_meaningful_change",
      priorPercentage: 62, currentPercentage: 62, movementMagnitude: "none" },
    structuredInterpretation: { id: "prior-interpretation",
      provenance: { inputFingerprint: "prior-i", engineVersion: "v2" } },
    forecastAssessment: { id: "prior-forecast", confidenceBand: "moderate",
      goalForecastStatus: "on_forecast", forecastDirection: "steady",
      forecastExplanation: { text: "steady" },
      remainingUncertainty: { status: "material", items: [] },
      nextDecisiveEvidence: null,
      forecastMetadata: { interpretationSemanticFingerprint: "prior-semantic",
        goalContractFingerprint: "prior-contract", inputFingerprint: "prior-f",
        engineVersion: "v2" } },
    narrativeAssessment: { id: "prior-narrative",
      confidenceExplanation: { text: "Confidence held at 62%." },
      provenance: { inputFingerprint: "prior-n", engineVersion: "v2" } },
    publicationTimestamp: "2026-09-01T00:00:00.000Z",
    sourceCutoff: "2026-09-01T00:00:00.000Z",
    idempotencyKey: "prior-v2",
  });
}

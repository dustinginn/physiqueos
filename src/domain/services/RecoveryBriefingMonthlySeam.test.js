import { describe, expect, it, vi } from "vitest";

// Same harness as MonthlyBriefingV3Wiring.test.js: only the V2 editorial
// composition is stubbed; the Monthly production path (window, preparer,
// evidence intelligence, REAL V3 finalization/Confidence, artifact) is real.
vi.mock("./MonthlyBriefingPreviewService", () => ({
  createMonthlyBriefingPreviewService: () => ({ preview: async () => structuredClone(globalThis.__recoveryMonthlyNarrative) }),
}));
vi.mock("./MonthlyBriefingPresentationService", () => ({
  composeMonthlyBriefingPresentation: () => ({
    hero: { title: "September established the pattern.", thesis: "V2 thesis.", confidence: null },
    energy: { title: "Are calories supporting the work?" },
  }),
}));

import { createMonthlyBriefingService } from "./MonthlyBriefingService.js";
import { createRecoveryBriefingComposerV1 } from "./RecoveryBriefingComposerV1.js";
import { RECOVERY_ASSESSMENT_FIELD } from "./RecoveryBriefingPublicationV1.js";
import { CADENCE_RMR_STRATEGIES, createCadenceEnergyAssessment } from "./CadenceEnergyAssessmentService.js";
import {
  currentGoalAndPhase, fixtures, prepareWeeklyV3, computeCorrectedEnergyObservations, weeklyPiEnvelope,
} from "../../testSupport/briefingFamilyV3Harness.js";
import { canonicalNights, recoveryActivationRecord, recoveryAlgorithmRecord } from "../../testSupport/recoverySleepSynthetic.js";
import { recoveryAuthorityRecord } from "../../testSupport/recoveryBriefingSynthetic.js";

const OWNER = "user_founder_001";
const AT = new Date("2026-10-01T15:00:00.000Z");
// A synthetic Sleep world whose D0 precedes September, so the September
// Monthly (the harness's month) can be Recovery-eligible. No Founder data.
const SYNTHETIC_D0 = "2026-08-01";

async function runMonthly({ recoveryComposer = null } = {}) {
  const { goal, phase } = currentGoalAndPhase();
  const { observations } = computeCorrectedEnergyObservations();
  const predecessor = (await prepareWeeklyV3({ piEnvelope: weeklyPiEnvelope({ energyObservations: observations }) })).assessment;
  const history = { id: predecessor.id, assessmentId: predecessor.id, goalId: goal.id, phaseId: phase.id,
    publisherType: "weekly_briefing", assessment: predecessor, version: 1 };
  const snapshot = { id: `snapshot|${goal.id}|${phase.id}`, goalId: goal.id, phaseId: phase.id,
    currentAssessmentId: predecessor.id, currentScore: predecessor.currentPercentage,
    scoreBand: predecessor.confidenceBand, publisherType: "weekly_briefing" };
  const store = {
    goals: [goal], phaseStrategies: [fixtures.strategyAuthority.phaseStrategy],
    protocols: fixtures.strategyAuthority.protocols, protocolVersions: fixtures.strategyAuthority.protocolVersions,
    dexaScans: fixtures.dexaScans, weightEntries: fixtures.weightEntries, dailyBriefings: [],
    goalConfidenceHistory: [history], goalConfidenceSnapshots: [snapshot], canonicalEvidenceObjects: [], analyses: [],
  };
  const canonical = [...fixtures.nutritionActivity.nutritionDays, ...fixtures.nutritionActivity.activityDays];
  const energy = createCadenceEnergyAssessment({
    cadence: "monthly", timeZone: "America/Los_Angeles",
    window: { startDate: "2026-09-01", endDate: "2026-09-30", timeZone: "America/Los_Angeles" },
    nutritionDays: fixtures.nutritionActivity.nutritionDays, activityDays: fixtures.nutritionActivity.activityDays,
    dexaScans: fixtures.dexaScans, rmrStrategy: CADENCE_RMR_STRATEGIES.LATEST_ELIGIBLE_FOR_WINDOW,
  });
  globalThis.__recoveryMonthlyNarrative = {
    goalConfidence: { assessmentId: predecessor.id },
    monthlyNarrative: { confidence: null },
    editorialDecision: { candidates: [], selectedStoryIds: [], boundedMilestoneCandidateIds: [], semanticDiagnostics: null },
    evidenceFixture: {
      goal, weights: fixtures.weightEntries, dexaScans: fixtures.dexaScans, progressPhotos: [],
      canonicalDependencies: canonical, evidenceResolution: {},
      energyContinuations: [],
      confidenceEvidence: { evidenceWindow: {}, comparisonWindow: null, canonicalTrainingEvidence: [],
        energyDays: energy.dailyRecords, recoveryEvidenceRecords: [], photoSessions: [] },
    },
  };
  let published = null;
  const publicationService = {
    captureBaseline: () => ({ store, revision: 1, semanticDigest: "golden" }),
    publish: async (command) => { published = command; return { status: "published", committed: true, artifact: command.artifact }; },
  };
  const repositories = {
    users: { getUserById: async () => ({ id: OWNER, timeZone: "America/Los_Angeles" }), getCurrentUser: async () => ({ id: OWNER, timeZone: "America/Los_Angeles" }) },
    dailyBriefings: { getBriefingByEvidenceWindow: async () => null },
  };
  const service = createMonthlyBriefingService({ repositories, publicationService, now: () => AT, recoveryComposer });
  const result = await service.generateForCurrentWindow({ userId: OWNER, asOf: AT });
  return { result, published: () => published };
}

function monthlyComposer(period = Array(30).fill(420)) {
  const reads = [];
  return {
    reads,
    composer: createRecoveryBriefingComposerV1({
      readAuthorityRecord: async () => recoveryAuthorityRecord({ effectiveFromPeriodStart: "2026-09-01", recoveryEffectiveSleepDay: SYNTHETIC_D0 }),
      readSleepInputs: async (range) => {
        reads.push(range);
        return {
          sleepDays: [...canonicalNights("2026-08-04", Array(28).fill(420)), ...canonicalNights("2026-09-01", period)]
            .map((day) => ({ ...day, userId: OWNER })),
          activationPolicyRecord: recoveryActivationRecord({ effectiveSleepDay: SYNTHETIC_D0 }),
          algorithmPolicyRecord: recoveryAlgorithmRecord({ effectiveSleepDay: SYNTHETIC_D0 }),
        };
      },
    }),
  };
}

function withoutRecovery(artifact) {
  const { [RECOVERY_ASSESSMENT_FIELD]: _recovery, ...briefing } = artifact.briefing;
  return { ...artifact, briefing };
}

describe("Monthly generator Recovery seam (real V3 finalization)", () => {
  it("adds ONLY the Recovery field; the V3 Confidence assessment and Narrative are identical", async () => {
    const base = await runMonthly();
    const on = monthlyComposer();
    const withRecovery = await runMonthly({ recoveryComposer: on.composer });
    expect(base.result.state).toBe("completed");
    expect(withRecovery.result.state).toBe("completed");
    const a = base.published();
    const b = withRecovery.published();
    expect(Object.prototype.hasOwnProperty.call(a.artifact.briefing, RECOVERY_ASSESSMENT_FIELD)).toBe(false);
    expect(b.artifact.briefing[RECOVERY_ASSESSMENT_FIELD].cadence).toBe("monthly");
    expect(b.artifact.briefing[RECOVERY_ASSESSMENT_FIELD].assessment.status.state).toBe("green");
    expect(on.reads).toEqual([{ ownerUserId: OWNER, startDate: "2026-08-04", endDate: "2026-09-30" }]);
    expect(withoutRecovery(b.artifact)).toEqual(a.artifact);
    expect(b.assessment).toEqual(a.assessment);
    expect(JSON.stringify(b.assessment)).not.toMatch(/recovery_briefing|recoveryAssessment/);
  });

  it("a Red Recovery Monthly changes nothing but its own field", async () => {
    const green = await runMonthly({ recoveryComposer: monthlyComposer().composer });
    const red = await runMonthly({ recoveryComposer: monthlyComposer([...Array(20).fill(300), ...Array(10).fill(420)]).composer });
    const g = green.published();
    const r = red.published();
    expect(r.artifact.briefing[RECOVERY_ASSESSMENT_FIELD].assessment.status.state).toBe("red");
    expect(withoutRecovery(r.artifact)).toEqual(withoutRecovery(g.artifact));
    expect(r.assessment).toEqual(g.assessment);
  });
});

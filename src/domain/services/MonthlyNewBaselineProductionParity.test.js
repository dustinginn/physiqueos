import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FounderRepositories } from "../../data/repositories/founderRepositories";
import { monthlyPreviewFixtures } from "../../fixtures/monthlyBriefingPreview";
import {
  MONTHLY_SCORE_WEIGHTS,
  createMonthlyBriefingPreviewService,
} from "./MonthlyBriefingPreviewService";
import {
  composeMonthlyBriefingPresentation,
} from "./MonthlyBriefingPresentationService";
import { createMonthlyArtifact } from "./MonthlyBriefingService";
import { auditMonthlySectionRoleInventory } from "./MonthlySectionRoleInventoryService";

const runtimePath = process.env.PHYSIQUEOS_RUNTIME_STORE_PATH
  ? path.resolve(process.env.PHYSIQUEOS_RUNTIME_STORE_PATH)
  : new URL("../../../private/founder/runtime-store.json", import.meta.url);
const productionOrchestration = Object.freeze({
  previewWindow: {
    startDate: "2026-07-01",
    endDate: "2026-07-31",
    deliveryDate: "2026-08-01",
    storyWindowStart: "2026-07-01",
  },
  confidenceCutoff: "2026-08-01T06:59:59.999Z",
  generatedAt: "2026-08-01T07:00:02.899Z",
  timeZone: "America/Los_Angeles",
});

function sha(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function candidate(decision, storyType) {
  return decision.candidates.find((item) => item.storyType === storyType);
}

async function composeProductionShape() {
  const user = await FounderRepositories.users.getCurrentUser();
  const narrative = await createMonthlyBriefingPreviewService({ repositories: FounderRepositories }).preview({
    userId: user.id,
    orchestration: productionOrchestration,
    syntheticContinuation: null,
  });
  const presentation = composeMonthlyBriefingPresentation({
    narrative,
    decision: narrative.editorialDecision,
    fixture: narrative.evidenceFixture,
  });
  return { user, narrative, presentation };
}

describe("production-shaped Monthly New Baseline parity", () => {
  it("emits, scores, merges, composes, presents, and would persist the real July baseline without preview annotations", async () => {
    const beforeBytes = fs.readFileSync(runtimePath);
    const beforeStore = JSON.parse(beforeBytes);
    const beforeArtifact = beforeStore.dailyBriefings.find((item) => item.id === "monthly_briefing_user_founder_001_202607");
    const beforeArtifactHash = sha(JSON.stringify(beforeArtifact));
    const beforeConfidenceHash = sha(JSON.stringify({
      snapshots: beforeStore.goalConfidenceSnapshots,
      history: beforeStore.goalConfidenceHistory,
      seeds: beforeStore.goalConfidenceContinuitySeeds,
    }));
    const { user, narrative, presentation } = await composeProductionShape();
    const decision = narrative.editorialDecision;
    const baseline = candidate(decision, "new_baseline");
    const dexa = candidate(decision, "dexa_baseline");
    const completion = candidate(decision, "goal_completion");

    expect(baseline).toMatchObject({
      score: 880.9,
      scoreRank: 1,
      included: true,
      exclusionReason: null,
      provenance: {
        scanDate: "2026-07-18",
        associatedGoalId: "goal_transition_live_goal_visible_abs_at_rest_6353e12e1ef8fbc3_objective_lean_mass",
        associatedPhaseId: "goal_phase_7ab0d230-ea5b-485b-8368-0e695224de08",
        inferenceReason: expect.stringMatching(/completed_goal|existing_canonical/),
      },
    });
    expect(dexa).toMatchObject({
      score: 663.63,
      scoreRank: 5,
      included: false,
      exclusionReason: `merged_into_${baseline.storyId}`,
      mergeMetadata: {
        mergeTargetId: baseline.storyId,
        mergeReason: "goal_transition_or_evidence_overlap",
      },
    });
    expect(completion.provenance.completionDate).toBe("2026-07-18");
    expect(narrative.monthlyNarrative.newBaseline).toBeTruthy();
    expect(presentation.newBaseline).toMatchObject({
      eyebrow: "New Baseline",
      facts: expect.arrayContaining([
        { label: "Reference date", value: "July 18, 2026" },
      ]),
    });
    expect(presentation.hero.highlights.map((item) => item.label)).toEqual([
      "Training",
      "New baseline",
      "Calories",
    ]);
    expect(decision.synthetic.active).toBe(false);
    expect(decision.semanticDiagnostics.newBaseline).toMatchObject({
      status: "canonical_role_resolved",
      candidateOutcome: "candidate_generated_selected_and_merge_owner",
      candidateScore: 880.9,
      candidateRank: 1,
    });

    const futureArtifact = createMonthlyArtifact({
      artifactId: "diagnostic_monthly_202607",
      generatedAt: productionOrchestration.generatedAt,
      narrative,
      presentation,
      userId: user.id,
      window: {
        ...productionOrchestration.previewWindow,
        id: "monthly:2026-07-01:2026-07-31:America/Los_Angeles",
        briefingMonth: "2026-07",
        date: "2026-07-31",
        cutoff: productionOrchestration.confidenceCutoff,
        timeZone: productionOrchestration.timeZone,
      },
    });
    expect(futureArtifact.briefing.selectedEditorialStories.map((story) => story.storyType)).toContain("new_baseline");
    expect(futureArtifact.briefing.monthlyNarrative.newBaseline).toBeTruthy();
    expect(futureArtifact.briefing.monthlyPresentation.newBaseline).toBeTruthy();
    expect(futureArtifact.briefing.provenance.semanticDiagnostics.newBaseline.status).toBe("canonical_role_resolved");

    const afterBytes = fs.readFileSync(runtimePath);
    const afterStore = JSON.parse(afterBytes);
    const afterArtifact = afterStore.dailyBriefings.find((item) => item.id === beforeArtifact.id);
    expect(sha(afterBytes)).toBe(sha(beforeBytes));
    expect(afterStore.revision).toBe(beforeStore.revision);
    expect(afterStore.dailyBriefings).toHaveLength(beforeStore.dailyBriefings.length);
    expect(sha(JSON.stringify(afterArtifact))).toBe(beforeArtifactHash);
    expect(sha(JSON.stringify({
      snapshots: afterStore.goalConfidenceSnapshots,
      history: afterStore.goalConfidenceHistory,
      seeds: afterStore.goalConfidenceContinuitySeeds,
    }))).toBe(beforeConfidenceHash);
  });

  it("classifies equivalent preview and production inputs consistently while leaving scores and confidence untouched", async () => {
    const { narrative: production } = await composeProductionShape();
    const user = await FounderRepositories.users.getCurrentUser();
    const preview = await createMonthlyBriefingPreviewService({ repositories: FounderRepositories }).preview({
      userId: user.id,
      orchestration: {
        ...monthlyPreviewFixtures.julyContinuation,
        generatedAt: "2026-07-30T20:00:00.000Z",
      },
    });
    const productionBaseline = candidate(production.editorialDecision, "new_baseline");
    const previewBaseline = candidate(preview.editorialDecision, "new_baseline");

    expect(productionBaseline.provenance.scanId).toBe(previewBaseline.provenance.scanId);
    expect(productionBaseline.score).toBe(previewBaseline.score);
    expect(productionBaseline.included).toBe(previewBaseline.included);
    expect(production.goalConfidence).toMatchObject({ score: 59, priorScore: 58, delta: 1 });
    expect(Object.values(MONTHLY_SCORE_WEIGHTS).reduce((total, value) => total + value, 0)).toBeCloseTo(1, 12);
  });

  it("selects defining canonical movement records and gives every rendered chapter a distinct editorial job", async () => {
    const { narrative, presentation } = await composeProductionShape();
    const coaching = narrative.monthlyNarrative;
    const stories = coaching.training.selectedPerformanceStories;
    const names = stories.map((story) => story.exerciseName);

    expect(names).toEqual([
      "Single-Leg Leg Press",
      "Shoulder Press Machine",
      "Bench Press",
    ]);
    expect(stories.map((story) => story.eventIds)).toEqual([
      [
        "training_performance_event_3903af049b9e476858f9d862254826b3",
        "training_performance_event_1d9b5728bcff30cd7c75dc8213fbfdb9",
      ],
      [
        "training_performance_event_edfee923439d21e0380e0283dab1d463",
        "training_performance_event_365380bfd9fdde7f4f1f6dce5cdffe31",
      ],
      [
        "training_performance_event_7c5dde62b91e8e57c576af2288fa7cee",
        "training_performance_event_c8e1f11e7dde37a85e8a12b3b96f87f8",
      ],
    ]);
    expect(presentation.training.stats.map((stat) => stat.label)).toEqual(names);
    expect(JSON.stringify(coaching.hero)).not.toMatch(/Single-Leg|Shoulder Press|Bench Press/);
    expect(JSON.stringify(coaching.energy)).not.toMatch(/training is improving|training is responding|progressive overload/i);
    expect(JSON.stringify(coaching.changes)).toMatch(/lead early indicator|context, not a verdict/i);
    expect(JSON.stringify(coaching.changes)).not.toMatch(/training is improving|training is responding|progressive overload/i);
    expect(coaching.training.title).toMatch(/across the program/i);
    expect(coaching.training.summary).toMatch(/progressive overload.*upper- and lower-body.*some lifts advanced more than others/i);
    expect(coaching.training.interpretation).toMatch(/across the training program.*three standout lifts.*does not yet prove muscle gain/i);
    expect(JSON.stringify(coaching.moments)).not.toMatch(/Single-Leg Leg Press|Shoulder Press Machine|Bench Press/);
    expect(JSON.stringify(coaching.monthAhead)).not.toMatch(/Single-Leg Leg Press|Shoulder Press Machine|Bench Press/);
    expect(coaching.monthAhead.guidance.find((item) => item.label === "Training")).toMatchObject({
      value: "Make progression repeatable",
      detail: expect.stringMatching(/across the program.*across the month rather than one session/i),
    });
    expect(coaching.editorialUniquenessAudit).toMatchObject({
      passes: true,
      issues: [],
      selectedTrainingStoryIds: stories.map((story) => story.id),
    });
    expect(coaching.editorialUniquenessAudit.sections).toHaveLength(7);

    const scores = Object.fromEntries(narrative.editorialDecision.candidates
      .filter((item) => ["new_baseline", "goal_completion", "phase_transition", "dexa_baseline"].includes(item.storyType))
      .map((item) => [item.storyType, [item.score, item.scoreRank]]));
    expect(scores).toEqual({
      new_baseline: [880.9, 1],
      goal_completion: [801.81, 2],
      phase_transition: [757.27, 3],
      dexa_baseline: [663.63, 5],
    });
    expect(coaching.confidence).toMatchObject({ score: 59, priorScore: 58, delta: 1 });
    expect(coaching.newBaseline).toMatchObject({
      title: "July established the baseline for building muscle.",
      summary: expect.stringMatching(/established a baseline; it did not prove that you gained muscle/i),
    });
  });

  it("audits every locked section and Hero summary role while keeping weight contextual", async () => {
    const { narrative, presentation } = await composeProductionShape();
    const inventory = auditMonthlySectionRoleInventory({
      decision: narrative.editorialDecision,
      narrative,
      presentation,
    });

    expect(inventory.complete).toBe(true);
    expect(inventory.heroSummaryComplete).toBe(true);
    expect(Object.values(inventory.sections).map((role) => role.classification)).toEqual([
      "present",
      "present",
      "present",
      "present",
      "present",
      "present",
      "present",
      "present",
    ]);
    expect(Object.values(inventory.heroSummary).every((role) => role.present)).toBe(true);
    expect(inventory.weight).toMatchObject({
      selected: true,
      contextualLocations: ["whatChanged", "monthAhead"],
      standaloneSection: false,
      prohibitedIndependentClaim: false,
    });
    expect(JSON.stringify({
      changes: narrative.monthlyNarrative.changes,
      monthAhead: narrative.monthlyNarrative.monthAhead,
    })).not.toMatch(/lean.mass gain (?:is|was) (?:confirmed|proven)/i);
  });

  it("distinguishes intentional dynamic omissions from semantic failures", () => {
    const inventory = auditMonthlySectionRoleInventory({
      decision: {
        candidates: [],
        semanticDiagnostics: { newBaseline: { status: "required_lifecycle_linkage_absent" } },
      },
      narrative: { monthlyNarrative: { hero: {}, changes: null, moments: null, monthAhead: {} } },
      presentation: { hero: { highlights: [] }, changes: null, moments: null, monthAhead: {} },
    });

    expect(inventory.sections.whatChanged.classification).toBe("intentionally_omitted_by_dynamic_composition");
    expect(inventory.sections.definingMoments.classification).toBe("intentionally_omitted_by_dynamic_composition");
    expect(inventory.sections.newBaseline.classification).toBe("absent_semantic_classification_failed");
    expect(inventory.sections.newBaseline.renderState).toBe("suppressed_null_role");
  });
});

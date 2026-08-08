import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  AUGUST_6_AUTHORITATIVE_TOTALS,
  AUGUST_6_NUTRITION_CANONICAL_ID,
  AUGUST_6_NUTRITION_PACKAGE_ID,
  AUGUST_6_NUTRITION_REVIEW_ID,
  AUGUST_6_PI_ENERGY_WORK_ID,
  createAugust6NutritionCanonicalRepairService,
} from "./August6NutritionCanonicalRepairService";
import { createPISemanticFingerprint } from "./PILowerLevelConfidenceContracts";

const directories = [];
afterEach(() => {
  directories.splice(0).forEach((directory) =>
    fs.rmSync(directory, { recursive: true, force: true })
  );
});

describe("August 6 Nutrition canonical repair", () => {
  it("prepares one bounded canonical correction and refreshes PI Energy linkage", () => {
    const fixture = createFixture();
    const service = createAugust6NutritionCanonicalRepairService({
      runtimeStorePath: fixture.storePath,
      liveStore: fixture.store,
      evidenceRoot: fixture.root,
      now: () => new Date("2026-08-07T18:00:00.000Z"),
    });

    const prepared = service.prepare();

    expect(prepared.outcome).toBe("prepared");
    expect(prepared.plan).toEqual(expect.objectContaining({
      canonicalId: AUGUST_6_NUTRITION_CANONICAL_ID,
      authoritativeTotals: AUGUST_6_AUTHORITATIVE_TOTALS,
      piEnergyWorkId: AUGUST_6_PI_ENERGY_WORK_ID,
    }));
    expect(prepared.changedPaths).toEqual(expect.arrayContaining([
      "canonicalEvidenceObjects[0].payload.daily_totals.calories",
      "canonicalEvidenceObjects[0].payload.metadata.daily_totals_scope",
      "piEnergyConfidenceWorkItems[0].sourceLinkageFingerprint",
    ]));
    expect(prepared.changedPaths.some((value) =>
      value.startsWith("evidencePackages") ||
      value.startsWith("evidenceReviews") ||
      value.startsWith("goals") ||
      value.startsWith("goalConfidence") ||
      value.startsWith("dailyBriefings")
    )).toBe(false);
    expect(prepared.plan.expectedSourceFingerprint).toBe(
      fixture.work.expectedSourceFingerprint
    );
    expect(prepared.plan.correctionLinkageFingerprint).not.toBe(
      fixture.work.sourceLinkageFingerprint
    );
  });
});

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "physiqueos-nutrition-repair-"));
  directories.push(root);
  const artifactPath = path.join(root, "evidence", "IMG_1804.jpeg");
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, "retained summary artifact");
  const sourceNutritionId = AUGUST_6_NUTRITION_CANONICAL_ID;
  const sourceActivityId = "activity_day|2026-08-06";
  const work = {
    schemaVersion: "pi_energy_confidence_work_v1",
    id: AUGUST_6_PI_ENERGY_WORK_ID,
    version: "pi_energy_confidence_work_v1",
    triggerType: "energy_interpretation_change",
    goalId: "goal_transition_live_goal_visible_abs_at_rest_6353e12e1ef8fbc3_objective_lean_mass",
    phaseId: "goal_phase_7ab0d230-ea5b-485b-8368-0e695224de08",
    operatingState: "calibration",
    changedLocalDate: "2026-08-06",
    rollingWindowId: "rolling_energy:2026-07-31:2026-08-06:America/Los_Angeles",
    sourceNutritionId,
    sourceActivityId,
    reason: "activity_committed",
    evidenceCutoff: "2026-08-06T23:59:59.999Z",
    expectedSourceFingerprint: createPISemanticFingerprint({
      sourceNutritionId, sourceActivityId, changedLocalDate: "2026-08-06",
    }),
    status: "pending",
    attemptCount: 0,
    lastError: null,
    completionReceiptId: null,
    receiptIds: [],
    createdAt: "2026-08-07T04:26:28.519Z",
    updatedAt: "2026-08-07T05:40:41.748Z",
    processingStartedAt: null,
    completedAt: null,
    sourceCommitLinks: [{
      commitId: "prior-commit",
      canonicalEvidenceId: sourceNutritionId,
      sourceChangeType: "canonical_commit",
      sourceSemanticFingerprint: "sha256_prior",
      linkedCounterpartId: sourceActivityId,
      rmrSourceId: null,
    }],
    sourceLinkageFingerprint: "sha256_prior_linkage",
  };
  const nutritionPayload = createNutritionPayload();
  const nutritionRecord = {
    canonicalId: sourceNutritionId,
    createdAt: "2026-08-07T04:26:28.517Z",
    evidence_type: "nutrition",
    firstObservedAt: "2026-08-06",
    lastObservedAt: "2026-08-06",
    payload: nutritionPayload,
    provenance: {
      evidence_package_ids: [AUGUST_6_NUTRITION_PACKAGE_ID],
      source_artifact_refs: ["IMG_1805.jpeg", "IMG_1804.jpeg", "IMG_1806.png"],
      contributing_evidence_object_ids: [nutritionPayload.id],
    },
    quality: { status: "active" },
    updatedAt: "2026-08-07T04:26:28.517Z",
    userId: "user_founder_001",
  };
  const evidencePackage = {
    package_id: AUGUST_6_NUTRITION_PACKAGE_ID,
    evidence_objects: [nutritionPayload],
    provenance: { source_artifacts: [{
      id: "artifact-summary",
      file_name: "IMG_1804.jpeg",
      observed_date: "2026-08-06",
      storage_path: "evidence/IMG_1804.jpeg",
    }] },
  };
  const store = {
    version: "founder-runtime-v1",
    revision: 83,
    lastCommitId: "prior-store-commit",
    updatedAt: "2026-08-07T13:42:40.009Z",
    user: { id: "user_founder_001" },
    goals: [{
      id: work.goalId,
      userId: "user_founder_001",
      type: "build_lean_mass",
      status: "active",
      primary: true,
      openingApproach: { value: "calibration" },
      phases: [{
        id: work.phaseId,
        goalId: work.goalId,
        name: "Establish Maintenance",
        title: "Establish Maintenance",
        status: "active",
        startDate: "2026-07-19",
        startedAt: "2026-07-19",
        plannedReviewAt: "2026-08-15",
        timingMode: "completion_criteria",
        completionDecisionRequired: true,
        reviewState: "scheduled",
        revision: 0,
      }],
    }],
    evidencePackages: [evidencePackage],
    evidenceReviews: [{
      id: AUGUST_6_NUTRITION_REVIEW_ID,
      status: "confirmed",
      interpretedEvidence: evidencePackage,
    }],
    canonicalEvidenceObjects: [nutritionRecord, {
      canonicalId: sourceActivityId,
      evidence_type: "activity_day",
      payload: { evidence_type: "activity_day", observed_at: "2026-08-06" },
      quality: { status: "active" },
    }],
    piEnergyConfidenceWorkItems: [work],
    piEnergyFinalizationReceipts: [],
    dailyBriefings: [{ id: "protected-midweek" }],
    goalConfidenceSnapshots: [{ id: "protected-confidence", currentScore: 59 }],
    goalConfidenceHistory: [{ id: "protected-forecast" }],
  };
  const storePath = path.join(root, "runtime-store.json");
  fs.writeFileSync(storePath, `${JSON.stringify(store)}\n`);
  return { root, storePath, store, work };
}

function createNutritionPayload() {
  const total = (calories, protein_g, carbs_g, fat_g) => ({
    calories, protein_g, carbs_g, fat_g,
    fiber_g: null, sugar_g: null, sodium_mg: null, cholesterol_mg: null,
  });
  const meals = [
    ["Breakfast", 440, 62, 37, 6],
    ["Lunch", 640, 64, 36, 28],
    ["Dinner", 648, 55, 28, 25],
    ["Snacks", 553, 8, 83, 23],
  ].map(([name, ...values], index) => ({
    id: `meal-${index}`,
    name,
    totals: total(...values),
    foods: [],
  }));
  return {
    id: "nutrition_day_2026-08-06_1",
    evidence_type: "nutrition",
    observed_at: "2026-08-06",
    source: { source_artifact_refs: ["IMG_1805.jpeg", "IMG_1804.jpeg", "IMG_1806.png"] },
    metadata: { date: "2026-08-06" },
    daily_totals: total(1201, 63, 111, 48),
    macro_percentages: {
      protein: { grams: 63, percent_of_calories: 21, goal_percent: null },
      carbohydrates: { grams: 111, percent_of_calories: 37, goal_percent: null },
      fat: { grams: 48, percent_of_calories: 36, goal_percent: null },
    },
    goal_status: Object.fromEntries([
      ["calories", 1201, "cal"], ["protein_g", 63, "g"],
      ["carbs_g", 111, "g"], ["fat_g", 48, "g"],
    ].map(([key, actual, unit]) => [key, { actual, goal: null, difference: actual, unit }])),
    nutrients: [
      ["Calories", 1201, "cal"], ["Protein", 63, "g"],
      ["Carbohydrates", 111, "g"], ["Fat", 48, "g"],
    ].map(([name, value, unit]) => ({ name, total: value, unit,
      provenance_ref: "IMG_1806.png" })),
    meals,
    provenance: { source_artifact_refs: ["IMG_1805.jpeg", "IMG_1804.jpeg", "IMG_1806.png"] },
  };
}

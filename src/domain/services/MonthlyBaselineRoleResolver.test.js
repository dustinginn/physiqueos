import { describe, expect, it, vi } from "vitest";
import { createMonthlyBriefingPreviewService } from "./MonthlyBriefingPreviewService";
import { monthlyPreviewFixtures } from "../../fixtures/monthlyBriefingPreview";
import {
  MONTHLY_BASELINE_ROLE_RESOLVER_VERSION,
  resolveCanonicalGoalCompletion,
  resolveMonthlyDexaBaselineRoles,
} from "./MonthlyBaselineRoleResolver";

const previousGoalId = "goal-cut";
const nextGoalId = "goal-build";
const phaseId = "phase-maintenance";

function goal(overrides = {}) {
  return {
    id: nextGoalId,
    sourceGoalId: previousGoalId,
    completionEvent: {
      id: "completion-cut",
      goalId: previousGoalId,
      completedAt: "2026-07-18",
    },
    phases: [{ id: phaseId, status: "active", startDate: "2026-07-20" }],
    ...overrides,
  };
}

function scan(id, measuredAt, overrides = {}) {
  return {
    id,
    measuredAt,
    bodyFatPercentage: 7.7,
    leanMass: { value: 147.5 },
    fatMass: { value: 12.8 },
    ...overrides,
  };
}

describe("canonical Monthly DEXA baseline-role resolution", () => {
  it("accepts explicitly linked baseline semantics only inside a complete bounded lifecycle", () => {
    const result = resolveMonthlyDexaBaselineRoles({
      goal: goal(),
      dexaScans: [scan("explicit", "2026-07-18", { isNewBaseline: true })],
    });

    expect(result.role).toMatchObject({
      role: "new_baseline",
      sourceDexaId: "explicit",
      associatedGoalId: nextGoalId,
      associatedPhaseId: phaseId,
      effectiveDate: "2026-07-18",
      inferenceReason: "explicit_transition_baseline_with_bounded_lifecycle",
      provenance: {
        source: "canonical_monthly_baseline_role_resolver",
        version: MONTHLY_BASELINE_ROLE_RESOLVER_VERSION,
      },
    });
  });

  it("infers the role from a completed-goal-linked DEXA and the next active phase", () => {
    const result = resolveMonthlyDexaBaselineRoles({
      goal: goal(),
      dexaScans: [scan("closing", "2026-07-18", { relatedGoalIds: [previousGoalId] })],
    });

    expect(result.role).toMatchObject({
      sourceDexaId: "closing",
      inferenceReason: "completed_goal_closing_dexa_establishes_next_goal_reference",
      lifecycleRefs: expect.arrayContaining([previousGoalId, nextGoalId, phaseId, "closing"]),
    });
    expect(result.summary.status).toBe("canonical_role_resolved");
    expect(JSON.stringify(result.summary)).not.toMatch(/bodyFat|leanMass|fatMass/);
  });

  it("honors an explicit completion-to-DEXA lifecycle reference without requiring evidence mutation", () => {
    const linkedGoal = goal({
      completionEvent: {
        id: "completion-cut",
        goalId: previousGoalId,
        completedAt: "2026-07-18",
        evidence: { numericalDexaId: "explicit-link" },
      },
    });
    const result = resolveMonthlyDexaBaselineRoles({
      goal: linkedGoal,
      dexaScans: [scan("explicit-link", "2026-07-18")],
    });

    expect(result.role).toMatchObject({
      sourceDexaId: "explicit-link",
      inferenceReason: "completed_goal_closing_dexa_establishes_next_goal_reference",
    });
  });

  it("does not classify an unrelated latest DEXA merely because it is recent", () => {
    const result = resolveMonthlyDexaBaselineRoles({
      goal: goal(),
      dexaScans: [scan("unrelated", "2026-07-19", { relatedGoalIds: ["other-goal"] })],
    });

    expect(result.role).toBeNull();
    expect(result.summary).toMatchObject({
      status: "semantic_role_not_applicable",
      reason: "scan_does_not_close_prior_goal_transition",
    });
  });

  it("does not let a preview annotation override contradictory canonical semantics", () => {
    const result = resolveMonthlyDexaBaselineRoles({
      goal: goal(),
      dexaScans: [scan("contradicted", "2026-07-18", {
        isNewBaseline: true,
        canonicalBaselineRole: { role: "not_applicable" },
      })],
    });

    expect(result.role).toBeNull();
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      scanId: "contradicted",
      status: "semantic_role_not_applicable",
      reason: "contradictory_canonical_semantics",
    }));
  });

  it("keeps contradictory canonical ownership authoritative through the preview overlay", async () => {
    const canonicalScan = scan("canonical-no", "2026-07-18", {
      canonicalBaselineRole: { role: "not_applicable" },
    });
    const repositories = {
      weights: { listWeightEntries: vi.fn(async () => monthlyPreviewFixtures.julyContinuation.weights) },
      dexaScans: { listDEXAScans: vi.fn(async () => [canonicalScan]) },
      progressPhotos: { listPhotos: vi.fn(async () => monthlyPreviewFixtures.julyContinuation.progressPhotos) },
      dailyBriefings: { listDailyBriefings: vi.fn(async () => monthlyPreviewFixtures.julyContinuation.dailyBriefings) },
      goals: { listGoals: vi.fn(async () => [goal({ type: "build_lean_mass", status: "active" })]) },
      canonicalEvidence: { listCanonicalEvidenceObjects: vi.fn(async () => []) },
      trainingPerformanceEvents: { listTrainingPerformanceEvents: vi.fn(async () => []) },
    };
    const result = await createMonthlyBriefingPreviewService({ repositories }).preview({
      userId: "user",
      orchestration: {
        goal: goal(),
        previewWindow: {
          startDate: "2026-07-01",
          endDate: "2026-07-31",
          deliveryDate: "2026-08-01",
          storyWindowStart: "2026-07-01",
        },
        dexaScans: [scan("preview-annotation", "2026-07-18", { isNewBaseline: true })],
        generatedAt: "2026-08-01T07:00:00.000Z",
      },
      syntheticContinuation: null,
    });

    expect(result.editorialDecision.candidates.some((item) => item.storyType === "new_baseline")).toBe(false);
    expect(result.editorialDecision.semanticDiagnostics.newBaseline).toMatchObject({
      status: "semantic_role_not_applicable",
      candidateOutcome: "semantic_role_not_applicable",
    });
  });

  it("keeps one existing canonical owner and diagnoses duplicate ownership", () => {
    const result = resolveMonthlyDexaBaselineRoles({
      goal: goal(),
      dexaScans: [
        scan("existing", "2026-07-18", {
          monthlyBaselineRole: { role: "new_baseline" },
          relatedGoalIds: [previousGoalId],
        }),
        scan("duplicate", "2026-07-19", { relatedGoalIds: [previousGoalId] }),
      ],
    });

    expect(result.role.sourceDexaId).toBe("existing");
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      scanId: "duplicate",
      status: "another_baseline_already_owns_role",
      reason: "owned_by_existing",
    }));
  });

  it("resolves the effective completion date from bounded canonical closing evidence", () => {
    const resolution = resolveCanonicalGoalCompletion({
      completedGoal: {
        id: previousGoalId,
        completedAt: "2026-07-21T04:53:31.756Z",
      },
      nextGoal: {
        id: nextGoalId,
        phases: [{ id: phaseId, status: "active", startDate: "2026-07-20" }],
      },
      dexaScans: [scan("july-18", "2026-07-18", { relatedGoalIds: [previousGoalId] })],
      timeZone: "America/Los_Angeles",
    });

    expect(resolution).toMatchObject({
      effectiveDate: "2026-07-18",
      recordedCompletionDate: "2026-07-20",
      sourceDexaId: "july-18",
      reason: "bounded_completed_goal_closing_dexa",
    });
  });
});

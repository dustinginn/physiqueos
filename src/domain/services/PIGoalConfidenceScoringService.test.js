import { describe, expect, it, vi } from "vitest";
import { mapPIGoalConfidenceContributors } from "./PIGoalConfidenceContributorMapper";
import {
  createPIGoalConfidenceScoringService,
  PI_GOAL_CONFIDENCE_CONTEXT_MOVEMENT_LIMITS,
} from "./PIGoalConfidenceScoringService";

const base = {
  goalContext: {
    goalId: "goal_build_lean_mass",
    semanticGoalType: "build_lean_mass",
  },
  phaseContext: {
    phaseId: "phase_establish_maintenance",
    semanticPhaseType: "establish_maintenance",
  },
  operatingState: "calibration",
  assessmentContext: {
    type: "weekly_closed_window",
    cadence: "weekly",
    evidenceWindowId: "week_2026_07_19",
    eventId: null,
  },
  evidenceCutoff: "2026-07-26T06:59:59.999Z",
  generatedAt: "2026-07-26T07:00:00.000Z",
  piVersion: "pi_v3",
  evidenceCompleteness: { overall: "complete" },
};
const legacy = {
  source: "legacy_home_presentation",
  assessmentId: null,
  modelVersion: "overall_goal_confidence_v1",
};

function score(domainStates, options = {}) {
  const evidenceCompleteness = options.evidenceCompleteness ?? base.evidenceCompleteness;
  const mapped = mapPIGoalConfidenceContributors({
    ...base, domainStates, evidenceCompleteness,
  });
  return createPIGoalConfidenceScoringService().score({
    ...base,
    ...options,
    evidenceCompleteness,
    contributors: mapped.contributors,
    mapperTrace: mapped.trace,
    priorScoreProvenance: options.priorScore == null
      ? undefined : options.priorScoreProvenance ?? legacy,
  });
}

describe("PIGoalConfidenceScoringService", () => {
  it("creates a canonical initial assessment without a prior", () => {
    const result = score({
      energy: { status: "near_maintenance" },
      training: { status: "stable" },
      photos: { status: "stable" },
    });
    expect(result.score).toMatchObject({ current: 78, band: "high", prior: null });
    expect(result.score.movement).toEqual({ direction: "initial", magnitude: "none" });
    expect(Object.isFrozen(result.assessment)).toBe(true);
  });

  it("supports legacy 44 continuity without biasing the evidence score", () => {
    const input = {
      energy: { status: "near_maintenance" },
      training: { status: "stable" },
      photos: { status: "stable" },
    };
    const initial = score(input);
    const reconciled = score(input, {
      priorScore: 44,
      assessmentContext: { ...base.assessmentContext, type: "controlled_reconciliation" },
    });
    expect(initial.trace.evidenceScore).toBe(reconciled.trace.evidenceScore);
    expect(reconciled.score).toMatchObject({ prior: 44, delta: 20, current: 64 });
    expect(reconciled.score.priorScoreProvenance.source).toBe("legacy_home_presentation");
  });

  it("bounds equivalent Midweek movement below Weekly movement", () => {
    const states = {
      energy: { status: "near_maintenance" },
      training: { status: "broad_constructive" },
      photos: { status: "stable" },
    };
    const midweek = score(states, {
      priorScore: 50,
      assessmentContext: {
        type: "midweek_partial_window", cadence: "midweek",
        evidenceWindowId: "midweek_1", eventId: null,
      },
    });
    const weekly = score(states, { priorScore: 50 });
    expect(midweek.score.delta).toBe(PI_GOAL_CONFIDENCE_CONTEXT_MOVEMENT_LIMITS.midweek_partial_window);
    expect(weekly.score.delta).toBe(PI_GOAL_CONFIDENCE_CONTEXT_MOVEMENT_LIMITS.weekly_closed_window);
  });

  it("constrains Photo Event movement", () => {
    const result = score({
      energy: { status: "near_maintenance" },
      weight: { status: "stable" },
      photos: { status: "stable" },
    }, {
      priorScore: 50,
      assessmentContext: { type: "photo_event", cadence: null, eventId: "photo_1", evidenceWindowId: null },
    });
    expect(result.score.delta).toBe(3);
  });

  it.each([
    ["confirming", 15, "increased"],
    ["contradicting", -15, "decreased"],
  ])("permits authoritative DEXA %s recalibration", (status, delta, direction) => {
    const result = score({ dexa: { status } }, {
      priorScore: 50,
      assessmentContext: { type: "dexa_event", cadence: null, eventId: "dexa_1", evidenceWindowId: null },
    });
    expect(result.score).toMatchObject({ delta, movement: { direction, magnitude: "material" } });
    expect(result.trace.authorityAdjustment).not.toBe(0);
  });

  it("makes identical semantic input deterministic, including identity", () => {
    const states = {
      energy: { status: "near_maintenance", sourceObservationIds: ["energy_1"] },
      training: { status: "stable", sourceClaimIds: ["training_claim"] },
    };
    expect(score(states).assessment.id).toBe(score(states).assessment.id);
    expect(score(states).score).toEqual(score(states).score);
  });

  it("does not create additional movement when identical evidence is reassessed", () => {
    const states = { training: { status: "isolated_pr" } };
    const first = score(states);
    const repeated = score(states, {
      priorScore: first.score.current,
      priorScoreProvenance: {
        source: "canonical_pi_assessment",
        assessmentId: first.assessment.id,
        modelVersion: first.assessment.modelVersion,
      },
    });
    expect(repeated.score.delta).toBe(0);
    expect(repeated.score.movement.direction).toBe("held");
    expect(repeated.trace.holdReason).toBeTruthy();
  });

  it("treats strong Training plus incomplete Energy as a hold or small increase", () => {
    const result = score({
      training: { status: "broad_constructive" },
      energy: { status: "incomplete" },
      photos: { status: "stable" },
    }, {
      priorScore: 60,
      evidenceCompleteness: { overall: "partial" },
    });
    expect(result.score.delta).toBeGreaterThanOrEqual(0);
    expect(result.score.delta).toBeLessThanOrEqual(4);
  });

  it("does not strongly increase for Training plus deficit and falling Weight", () => {
    const result = score({
      training: { status: "broad_constructive" },
      energy: { status: "persistent_deficit" },
      weight: { status: "falling" },
    }, { priorScore: 50 });
    expect(result.score.delta).toBeLessThanOrEqual(0);
    expect(result.primaryReason).toContain("Energy");
  });

  it("increases for stable Training, near-maintenance Energy, and stable Photos", () => {
    expect(score({
      training: { status: "stable" },
      energy: { status: "near_maintenance" },
      photos: { status: "stable" },
    }, { priorScore: 50 }).score.delta).toBe(6);
  });

  it("suppresses confidence for rising Weight and softening Photos", () => {
    expect(score({
      training: { status: "constructive" },
      weight: { status: "rising_with_softening" },
      photos: { status: "softening" },
    }, { priorScore: 55 }).score.delta).toBeLessThanOrEqual(0);
  });

  it("holds for an inconclusive Photo Event", () => {
    const initial = score({ photos: { status: "inconclusive" } });
    const repeated = score({ photos: { status: "inconclusive" } }, {
      priorScore: initial.score.current,
      assessmentContext: { type: "photo_event", cadence: null, eventId: "photo_2", evidenceWindowId: null },
    });
    expect(repeated.score.movement.direction).toBe("held");
  });

  it("keeps one isolated PR to a very small evidence effect", () => {
    const result = score({ training: { status: "isolated_pr" } });
    expect(result.trace.evidenceScore).toBeLessThanOrEqual(54);
  });

  it("does not let one poor session dominate", () => {
    const constructive = score({ training: { status: "broad_constructive" } }).trace.evidenceScore;
    const withPoorSession = score({
      training: { status: "broad_constructive", reason: "One poor session within a constructive week." },
    }).trace.evidenceScore;
    expect(withPoorSession).toBe(constructive);
  });

  it("decreases for broad regression plus persistent deficit", () => {
    expect(score({
      training: { status: "regressing" },
      energy: { status: "persistent_deficit" },
    }, { priorScore: 50 }).score.delta).toBe(-6);
  });

  it("does not penalize missing weekly Photos or absent new DEXA", () => {
    const result = score({
      training: { status: "stable" },
      energy: { status: "near_maintenance" },
      photos: { status: "missing" },
      dexa: { status: "missing" },
    });
    expect(result.trace.domainAdjustments
      .filter((x) => ["photos", "dexa"].includes(x.domain))
      .every((x) => x.points === 0)).toBe(true);
  });

  it("does not reward historical DEXA repeatedly", () => {
    expect(score({ dexa: { status: "historical_baseline" } }).trace.authorityAdjustment).toBe(0);
    expect(score({ dexa: { status: "historical_baseline" } }).trace.evidenceScore).toBe(53);
  });

  it("limits a missing Nutrition day without necessarily preventing increase", () => {
    const result = score({
      energy: { status: "near_maintenance", evidenceCompleteness: "partial" },
      training: { status: "stable" },
      photos: { status: "stable" },
    }, { priorScore: 58, evidenceCompleteness: { overall: "partial" } });
    expect(result.score.delta).toBeGreaterThan(0);
    expect(result.score.current).toBeLessThanOrEqual(64);
  });

  it("gives data presence without interpretation no automatic bonus", () => {
    const result = score({
      training: { status: "unknown" },
      weight: { status: "unknown" },
      protocol: { status: "present" },
    }, { evidenceCompleteness: { overall: "unknown" } });
    expect(result.trace.evidenceScore).toBe(50);
  });

  it("records completeness, corroboration, contradiction, authority, limits, and mapper trace", () => {
    const result = score({
      energy: { status: "near_maintenance" },
      training: { status: "constructive" },
      weight: { status: "falling" },
      dexa: { status: "confirming" },
    }, { priorScore: 50 });
    expect(result.trace).toMatchObject({
      completenessAdjustment: 3,
      corroborationAdjustment: 6,
      contradictionAdjustment: -4,
      authorityAdjustment: 4,
      phaseRelevance: "build_lean_mass:establish_maintenance:calibration",
      contextMovementLimit: 6,
      mapperTrace: { merged: [], suppressed: [] },
    });
  });

  it("completes the isolated current-production dry assessment fixture", () => {
    // Prepared only from explicit Weekly PI states: broad constructive Training,
    // partial Energy, mixed Weight horizons, stable Photos, and no new DEXA.
    const result = score({
      training: {
        status: "broad_constructive",
        sourceObservationIds: ["performance|category|biceps", "performance|category|chest"],
      },
      energy: {
        status: "incomplete",
        sourceObservationIds: ["pi|energy|paired_day_coverage|estimated|weekly.paired_day_coverage"],
      },
      weight: {
        status: "volatile",
        sourceObservationIds: [
          "pi|weight|weight_average_change|body_weight|weekly.average_comparison",
          "pi|weight|weight_short_window_change|body_weight|weekly.short_window",
        ],
      },
      photos: {
        status: "stable",
        sourceObservationIds: ["pi|photos|photo_visual_stability|visual_stability|same_pose:front-relaxed"],
      },
      recovery: { status: "unknown" },
      dexa: { status: "missing" },
    }, {
      priorScore: 44,
      evidenceCompleteness: { overall: "partial" },
    });
    expect(result.trace.evidenceScore).toBe(58);
    expect(result.score).toMatchObject({
      current: 50, prior: 44, delta: 6, band: "moderate",
      movement: { direction: "increased", magnitude: "material" },
    });
    expect(result.unresolvedUncertainty).toEqual(expect.arrayContaining([
      expect.stringContaining("Energy coverage"),
      expect.stringContaining("Weight volatility"),
    ]));
  });

  it("uses plain-language reasons without weighting jargon", () => {
    const reason = score({
      energy: { status: "near_maintenance" },
      training: { status: "stable" },
    }, { priorScore: 50 }).primaryReason;
    expect(reason).not.toMatch(/points|weighting|coefficient|bonus/i);
  });

  it("invokes the assessment service and never persistence", () => {
    const assess = vi.fn(() => ({
      score: { current: 50, prior: null, delta: null, band: "moderate",
        movement: { direction: "initial", magnitude: "none" } },
    }));
    const service = createPIGoalConfidenceScoringService({
      assessmentService: { assess },
    });
    const mapped = mapPIGoalConfidenceContributors({
      ...base, domainStates: {}, evidenceCompleteness: { overall: "unknown" },
    });
    service.score({ ...base, contributors: mapped.contributors });
    expect(assess).toHaveBeenCalledOnce();
    expect(Object.keys(service)).toEqual(["score"]);
  });
});

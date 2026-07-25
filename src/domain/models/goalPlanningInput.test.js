import { describe, expect, it } from "vitest";
import { buildGoalTransitionDraft } from "../services/GoalTransitionService";
import { recommendGoalPhases } from "../services/GoalPhaseRecommendationService";
import {
  GOAL_PLANNING_SCHEMA_VERSION,
  GoalPlanningInputValidationError,
  adaptDirectGoalPlanningInput,
  adaptGoalCreationDraftToPlanningInput,
  adaptGoalTransitionDraftToPlanningInput,
  adaptLegacyGoalToPlanningInput,
  createGoalPlanningInput,
} from "./goalPlanningInput";

function buildPlan(overrides = {}) {
  return {
    goalType: "lean_mass", name: " Build Lean Mass ", purpose: " Add meaningful lean mass while protecting body composition. ",
    primaryOutcome: "Add 10 lb of lean mass",
    target: { type: "numeric_change", metric: "lean_mass", direction: "increase", amount: 10, unit: "lb", targetDate: "2026-10-31", description: "Add 10 lb." },
    timeline: { mode: "target_date", targetDate: "2026-10-31", flexibility: "aspirational", ambition: "ambitious" },
    successCriteria: [{ key: "lean-mass", label: "Add 10 lb of lean mass", scope: "overall_goal", required: true }],
    guardrails: [{ key: "body-fat", label: "Maintain approximately 8–9% body fat", metric: "body_fat", scope: "overall_goal", required: true }],
    currentState: { baselineStatus: "established", capabilityStatus: "established", knownConstraints: [" Protect body composition "], priorRelatedGoalStatus: "completed" },
    planningSignals: { calibrationRequired: true, sequentialDependencies: true, userSuppliedPhaseInterest: true },
    proposedStages: [
      { name: "Lean Mass Build", purpose: "Build toward the supplied outcome.", order: 1, timing: { mode: "target_date", targetDate: "2026-10-31" }, successCriteria: [{ label: "Add 10 lb of lean mass" }], dependencies: [{ order: 0 }], source: "user", userSupplied: true },
      { name: "Establish Maintenance", purpose: "Establish maintenance before building.", order: 0, timing: { mode: "fixed_duration", duration: { value: 4, unit: "weeks" } }, successCriteria: [{ label: "Maintenance reviewed" }], dependencies: [], source: "user", userSupplied: true },
    ],
    coachingPreferences: { tone: "direct", suggestionsAllowed: false }, sourceContext: { type: "direct_planning_input", sourceId: "draft-1" },
    ...overrides,
  };
}

describe("canonical goal planning input", () => {
  it("normalizes a valid versioned plan deterministically without mutation", () => {
    const input = buildPlan(); const before = structuredClone(input);
    const first = createGoalPlanningInput(input);
    expect(createGoalPlanningInput(structuredClone(input))).toEqual(first);
    expect(input).toEqual(before);
    expect(first).toMatchObject({ schemaVersion: GOAL_PLANNING_SCHEMA_VERSION, name: "Build Lean Mass", purpose: "Add meaningful lean mass while protecting body composition." });
    expect(first.proposedStages.map((stage) => stage.name)).toEqual(["Establish Maintenance", "Lean Mass Build"]);
    expect(Object.isFrozen(first.proposedStages[0].timing.duration)).toBe(true);
  });

  it.each([["numeric_change", { amount: 0 }], ["numeric_absolute", { targetValue: 0 }], ["event_completion", {}], ["behavior_consistency", {}], ["qualitative", {}], ["unspecified", {}]])("supports target type %s", (type, required) => {
    expect(createGoalPlanningInput(buildPlan({ target: { type, ...required } })).target.type).toBe(type);
  });

  it.each([
    ["unspecified", {}], ["open_ended", {}], ["fixed_duration", { duration: { value: 6, unit: "weeks" } }],
    ["target_date", { targetDate: "2026-10-31" }], ["event_date", { eventDate: "2027-01-01" }],
  ])("supports timeline mode %s", (mode, values) => {
    expect(createGoalPlanningInput(buildPlan({ proposedStages: [], timeline: { mode, ...values } })).timeline.mode).toBe(mode);
  });

  it("validates timeline flexibility, ambition, duration, and enums explicitly", () => {
    expect(() => createGoalPlanningInput(buildPlan({ timeline: { mode: "open_ended", flexibility: "rigid" } }))).toThrowError(expect.objectContaining({ code: "GOAL_PLANNING_TIMELINE_FLEXIBILITY_UNSUPPORTED" }));
    expect(() => createGoalPlanningInput(buildPlan({ timeline: { mode: "open_ended", ambition: "impossible" } }))).toThrow(GoalPlanningInputValidationError);
    expect(() => createGoalPlanningInput(buildPlan({ timeline: { mode: "fixed_duration", duration: { value: 0, unit: "weeks" } } }))).toThrowError(expect.objectContaining({ code: "GOAL_PLANNING_DURATION_INVALID" }));
    expect(() => createGoalPlanningInput(buildPlan({ target: { type: "mystery" } }))).toThrowError(expect.objectContaining({ code: "GOAL_PLANNING_TARGET_TYPE_UNSUPPORTED" }));
  });

  it("normalizes structured criteria and goal-owned guardrails", () => {
    const plan = createGoalPlanningInput(buildPlan());
    expect(plan.successCriteria[0]).toMatchObject({ key: "lean-mass", label: "Add 10 lb of lean mass", scope: "overall_goal", required: true });
    expect(plan.guardrails[0]).toMatchObject({ key: "body-fat", scope: "overall_goal" });
    expect(plan.proposedStages.every((stage) => stage.guardrails === undefined)).toBe(true);
  });

  it("rejects duplicate local keys, orders, and invalid dependencies", () => {
    expect(() => createGoalPlanningInput(buildPlan({ guardrails: [{ key: "lean-mass", label: "duplicate" }] }))).toThrowError(expect.objectContaining({ code: "GOAL_PLANNING_ITEM_KEY_DUPLICATE" }));
    expect(() => createGoalPlanningInput(buildPlan({ proposedStages: buildPlan().proposedStages.map((stage) => ({ ...stage, order: 0 })) }))).toThrowError(expect.objectContaining({ code: "GOAL_PLANNING_STAGE_ORDER_DUPLICATE" }));
    const stages = buildPlan().proposedStages; stages[1].dependencies = [{ order: 1 }];
    expect(() => createGoalPlanningInput(buildPlan({ proposedStages: stages }))).toThrowError(expect.objectContaining({ code: "GOAL_PLANNING_STAGE_DEPENDENCY_INVALID" }));
  });

  it("normalizes every planning signal and preserves false and numeric zero", () => {
    const plan = createGoalPlanningInput(buildPlan({ target: { type: "numeric_absolute", targetValue: 0, baselineValue: 0 }, planningSignals: { continuousBehavior: false }, coachingPreferences: { suggestionsAllowed: false } }));
    expect(plan.target).toMatchObject({ targetValue: 0, baselineValue: 0 });
    expect(plan.planningSignals.continuousBehavior).toBe(false);
    expect(plan.planningSignals.baselineRequired).toBe(false);
    expect(plan.coachingPreferences.suggestionsAllowed).toBe(false);
  });

  it("normalizes absent optional values without fabricating planning facts", () => {
    const plan = createGoalPlanningInput({});
    expect(plan).toMatchObject({ name: null, purpose: null, primaryOutcome: null, target: { type: "unspecified", targetDate: null }, timeline: { mode: "unspecified", targetDate: null, duration: null }, successCriteria: [], guardrails: [], proposedStages: [] });
  });
});

describe("goal planning source adapters", () => {
  it("adapts a direct or current Goal Creation draft", () => {
    expect(adaptDirectGoalPlanningInput(buildPlan()).sourceContext.type).toBe("direct_planning_input");
    const adapted = adaptGoalCreationDraftToPlanningInput({ id: "create-1", type: "habit", title: "Hydrate", target: { type: "behavior_consistency" }, timeline: { mode: "open_ended" } });
    expect(adapted).toMatchObject({ goalType: "habit", name: "Hydrate", target: { type: "behavior_consistency" }, sourceContext: { type: "goal_creation_draft", sourceId: "create-1" } });
  });

  it("adapts the current transition draft without inventing target, timeline, or stages", () => {
    const draft = buildGoalTransitionDraft({ userId: "u", goal: { id: "old", title: "Old", status: "completed" }, dexa: null, photoEvent: null, protocols: [], weights: [] }, new Date("2026-07-21T00:00:00Z"));
    const plan = adaptGoalTransitionDraftToPlanningInput(draft);
    expect(plan).toMatchObject({ name: "Build Lean Mass", target: { type: "unspecified" }, timeline: { mode: "unspecified" }, proposedStages: [], sourceContext: { type: "goal_transition_draft" } });
    expect(plan.guardrails).toHaveLength(4);
  });

  it("adapts a minimal legacy active Goal honestly", () => {
    const plan = adaptLegacyGoalToPlanningInput({ id: "legacy", title: "Strength", type: "performance", status: "active" });
    expect(plan).toMatchObject({ name: "Strength", target: { type: "unspecified", targetValue: null }, timeline: { mode: "unspecified", targetDate: null }, successCriteria: [], proposedStages: [], currentState: { priorRelatedGoalStatus: "active" } });
  });

  it("represents contrasting planning inputs", () => {
    const tenK = createGoalPlanningInput({ goalType: "running_event", name: "First 10K", target: { type: "event_completion" }, timeline: { mode: "event_date", eventDate: "2027-04-10", flexibility: "firm" }, currentState: { capabilityStatus: "not_established" }, planningSignals: { capacityBuildingRequired: true, eventOrDeadline: true } });
    const hydration = createGoalPlanningInput({ goalType: "hydration", name: "Drink water daily", target: { type: "behavior_consistency" }, timeline: { mode: "open_ended" }, planningSignals: { continuousBehavior: true } });
    const ambiguous = createGoalPlanningInput({ name: "Feel better", target: { type: "qualitative" }, timeline: { mode: "unspecified" }, planningSignals: { uncertainty: true } });
    const strength = createGoalPlanningInput({ goalType: "strength", name: "Get stronger", target: { type: "unspecified" }, timeline: { mode: "open_ended" } });
    expect(tenK.timeline.eventDate).toBe("2027-04-10"); expect(hydration.planningSignals.continuousBehavior).toBe(true);
    expect(ambiguous.target.targetValue).toBeNull(); expect(strength.timeline.mode).toBe("open_ended");
  });
});

describe("phase intelligence canonical compatibility", () => {
  it("uses entirely supplied Build Lean Mass values", () => {
    const plan = createGoalPlanningInput(buildPlan()); const output = recommendGoalPhases(plan);
    expect(output.recommendation).toBe("recommended");
    expect(output.suggestedPhases).toEqual([
      expect.objectContaining({ name: "Establish Maintenance", duration: { value: 4, unit: "weeks" }, order: 0 }),
      expect.objectContaining({ name: "Lean Mass Build", targetDate: "2026-10-31", order: 1 }),
    ]);
    expect(output.suggestedPhases.every((stage) => stage.guardrails.length === 0)).toBe(true);
  });

  it("preserves equivalent recommendations through legacy and canonical paths", () => {
    const legacy = { title: "Drink more water", archetype: "hydration", recurringBehavior: true };
    const canonical = createGoalPlanningInput({ goalType: "hydration", name: "Drink more water", target: { type: "behavior_consistency" }, timeline: { mode: "open_ended" }, planningSignals: { continuousBehavior: true } });
    expect(recommendGoalPhases(canonical)).toMatchObject({ recommendation: recommendGoalPhases(legacy).recommendation, confidence: recommendGoalPhases(legacy).confidence, suggestedPhases: [] });
  });
});

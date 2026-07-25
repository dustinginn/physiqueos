import { describe, expect, it } from "vitest";
import {
  getProductionGoalTransitionEntryPointState,
  getProductionGoalTransitionResumeDestination,
  safelyGetProductionGoalTransitionEntryPointState,
} from "./ProductionGoalTransitionEntryPointService";

describe("ProductionGoalTransitionEntryPointService", () => {
  it("shows Start for the eligible founder state without mutating it", () => {
    const store = eligible();
    const before = JSON.stringify(store);
    expect(getProductionGoalTransitionEntryPointState(store)).toMatchObject({
      href: "/goals/transition",
      label: "Start Goal Transition",
      mode: "start",
      transitionId: null,
    });
    expect(JSON.stringify(store)).toBe(before);
  });

  it("ignores stale preview-era drafts", () => {
    const store = eligible({
      goalTransitionDrafts: [goalDraft({ liveProduction: false, id: "preview" })],
    });
    expect(getProductionGoalTransitionEntryPointState(store)?.label)
      .toBe("Start Goal Transition");
  });

  it("continues the exact in-progress live transition", () => {
    const store = eligible({ goalTransitionDrafts: [goalDraft()] });
    expect(getProductionGoalTransitionEntryPointState(store)).toMatchObject({
      label: "Continue Goal Transition",
      transitionId: "live_1",
    });
    expect(getProductionGoalTransitionResumeDestination(store, "live_1"))
      .toBe("/goals/transition");
  });

  it("continues through protocol review after goal acceptance", () => {
    const store = eligible({
      goalTransitionDrafts: [goalDraft({ status: "ready" })],
    });
    expect(getProductionGoalTransitionEntryPointState(store)?.label)
      .toBe("Continue Goal Transition");
    expect(getProductionGoalTransitionResumeDestination(store, "live_1"))
      .toBe("/goals/transition/protocols");
  });

  it("continues an incomplete protocol review without creating a new identity", () => {
    const store = eligible({
      goalTransitionDrafts: [goalDraft({ status: "ready" })],
      goalProtocolTransitionDrafts: [protocolDraft()],
    });
    const state = getProductionGoalTransitionEntryPointState(store);
    expect(state).toMatchObject({
      label: "Continue Goal Transition",
      transitionId: "live_1",
    });
    expect(getProductionGoalTransitionResumeDestination(store, state.transitionId))
      .toBe("/goals/transition/protocols");
  });

  it("offers final review only when both live drafts are ready", () => {
    const store = eligible({
      goalTransitionDrafts: [goalDraft({ status: "ready" })],
      goalProtocolTransitionDrafts: [
        protocolDraft({ status: "ready", readyForActivation: true }),
      ],
    });
    expect(getProductionGoalTransitionEntryPointState(store)?.label)
      .toBe("Review Goal Transition");
    expect(getProductionGoalTransitionResumeDestination(store, "live_1"))
      .toBe("/goals/transition/review?transitionId=live_1");
  });

  it.each([
    ["no active primary", eligible({ goals: [] })],
    ["multiple active primaries", eligible({ goals: [primary(), primary({ id: "other" })] })],
    ["target already exists", eligible({ goals: [primary(), { id: "target", title: "Build Lean Mass" }] })],
    ["source completed", eligible({ goals: [primary({ completedAt: "2026-07-20T00:00:00Z" })] })],
    ["consumed transition", eligible({ goalTransitionDrafts: [goalDraft({ consumed: true, status: "consumed" })] })],
    ["duplicate live transitions", eligible({
      goalTransitionDrafts: [goalDraft(), goalDraft({ id: "live_2" })],
    })],
  ])("fails closed for %s", (_name, store) => {
    expect(getProductionGoalTransitionEntryPointState(store)).toBeNull();
  });

  it("does not treat supporting active goals as conflicting primaries", () => {
    const store = eligible({
      goals: [primary(), { id: "support", status: "active", primary: false }],
    });
    expect(getProductionGoalTransitionEntryPointState(store)?.label)
      .toBe("Start Goal Transition");
  });

  it("fails closed when transition state cannot be read", () => {
    expect(safelyGetProductionGoalTransitionEntryPointState({
      goals: [primary()],
      goalTransitionDrafts: {},
    })).toBeNull();
  });
});

function eligible(overrides = {}) {
  return {
    goals: [primary()],
    goalTransitionDrafts: [],
    goalProtocolTransitionDrafts: [],
    ...overrides,
  };
}

function primary(overrides = {}) {
  return {
    id: "goal_visible_abs_at_rest",
    userId: "user_founder_001",
    title: "Visible Abs",
    status: "active",
    primary: true,
    ...overrides,
  };
}

function goalDraft(overrides = {}) {
  return {
    id: "live_1",
    userId: "user_founder_001",
    sourceGoalId: "goal_visible_abs_at_rest",
    liveProduction: true,
    status: "draft",
    consumed: false,
    superseded: false,
    updatedAt: "2026-07-20T00:00:00Z",
    ...overrides,
  };
}

function protocolDraft(overrides = {}) {
  return {
    id: "protocol_1",
    goalTransitionDraftId: "live_1",
    status: "draft",
    consumed: false,
    superseded: false,
    readyForActivation: false,
    ...overrides,
  };
}

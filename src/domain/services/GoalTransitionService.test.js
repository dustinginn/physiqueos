import { describe, expect, it, vi } from "vitest";
import { createGoalTransitionRepository } from "../../data/repositories/GoalTransitionRepository";
import { buildGoalTransitionDraft, createGoalTransitionService, validateGoalTransitionDraft } from "./GoalTransitionService";

const goal = { id: "goal_visible_abs_at_rest", userId: "u", title: "Visible Abs", status: "active", primary: true };
const dexa = { id: "dexa-jul18", measuredAt: "2026-07-18", totalMass: { value: 167.4 }, leanMass: { value: 147.5 }, fatMass: { value: 12.8 }, bodyFatPercentage: 7.7 };
const photo = { id: "photo-event", generatedAt: "2026-07-19", trigger: { evidenceType: "photo_session", evidenceId: "photo-session-jul18" }, briefing: { photoEventNarrative: { goalCompletionHandoff: { goalCompletionRecommended: true } } } };
const protocols = [{ id: "nutrition", protocolType: "nutrition", status: "active", name: "Cut Nutrition", currentVersionId: "nutrition-v1" }, { id: "training", protocolType: "training", status: "active", name: "Training" }, { id: "activity", protocolType: "activity", status: "active", name: "Cut Activity" }];

function fixture() {
  const drafts = [];
  const onChange = vi.fn();
  const repositories = {
    goalTransitionDrafts: createGoalTransitionRepository(drafts, { onChange }),
    goals: { getGoalById: vi.fn(async () => structuredClone(goal)), updateGoal: vi.fn(), saveGoal: vi.fn() },
    dexaScans: { listDEXAScans: async () => [structuredClone(dexa)] },
    dailyBriefings: { listDailyBriefings: async () => [structuredClone(photo)] },
    protocols: { listActiveProtocols: async () => structuredClone(protocols), updateProtocol: vi.fn(), saveProtocol: vi.fn() },
    weights: { listWeightEntries: async () => [{ measuredAt: "2026-07-12", weight: { value: 165 } }, { measuredAt: "2026-07-18", weight: { value: 164 } }] },
  };
  return { drafts, onChange, repositories, service: createGoalTransitionService({ repositories, now: () => new Date("2026-07-19T18:00:00Z") }) };
}

describe("GoalTransitionService", () => {
  it("creates a deterministic completion-recommended transition preview without persisting on read", async () => {
    const { service, drafts, repositories } = fixture();
    const draft = await service.getOrPreview({ userId: "u", sourceGoalId: goal.id });
    expect(draft).toMatchObject({ id: "goal_transition_goal_visible_abs_at_rest", status: "draft", primaryObjective: { title: "Build Lean Mass" }, operatingState: { value: "calibration" } });
    expect(draft.openingBaseline).toMatchObject({ bodyFatPercentage: 7.7, leanMass: 147.5, latestPhotoSessionId: "photo-session-jul18" });
    expect(drafts).toHaveLength(0);
    expect(repositories.goals.updateGoal).not.toHaveBeenCalled();
  });

  it("reuses an active draft and preserves unrelated sections during section updates", async () => {
    const { service, drafts } = fixture();
    await service.saveSection({ userId: "u", sourceGoalId: goal.id, section: "objective", patch: { title: "Improve Strength" } });
    const updated = await service.saveSection({ userId: "u", sourceGoalId: goal.id, section: "cadence", patch: { type: "twice_weekly", days: ["wednesday", "sunday"] } });
    expect(drafts).toHaveLength(1);
    expect(updated.primaryObjective.title).toBe("Improve Strength");
    expect(updated.briefingCadence.days).toEqual(["wednesday", "sunday"]);
  });

  it("keeps guardrails distinct from supporting objectives and scale weight non-defining", () => {
    const draft = buildGoalTransitionDraft({ userId: "u", goal, dexa, photoEvent: photo, protocols, weights: [] }, new Date("2026-07-19"));
    expect(draft.guardrails.some((item) => /body fat/i.test(item.text))).toBe(true);
    expect(draft.supportingObjectives.some((item) => /body fat/i.test(item.title))).toBe(false);
    expect(draft.evidenceStrategy.predictiveSignals.find((item) => item.evidenceType === "scale_weight")).toMatchObject({ role: "predictive", importance: "supporting" });
    expect(draft.evidenceStrategy.outcomeMeasures.every((item) => item.role === "outcome")).toBe(true);
    expect(draft.evidenceStrategy.explanatorySignals.every((item) => item.role === "explanatory")).toBe(true);
  });

  it("generates source-linked commitments without mutating protocols", async () => {
    const { service, repositories } = fixture();
    const draft = await service.saveSection({ userId: "u", sourceGoalId: goal.id, section: "strategy", patch: [] });
    expect(draft.generatedCommitments.length).toBeGreaterThan(5);
    expect(draft.generatedCommitments.every((item) => item.sourceProtocolId)).toBe(true);
    expect(repositories.protocols.updateProtocol).not.toHaveBeenCalled();
    expect(repositories.protocols.saveProtocol).not.toHaveBeenCalled();
  });

  it("rejects incomplete readiness and marks a complete draft ready without touching goals", async () => {
    const { service, repositories } = fixture();
    const invalid = buildGoalTransitionDraft({ userId: "u", goal, dexa, photoEvent: photo, protocols, weights: [] }, new Date());
    invalid.primaryObjective.title = "";
    expect(validateGoalTransitionDraft(invalid)).toMatchObject({ valid: false });
    await service.saveSection({ userId: "u", sourceGoalId: goal.id, section: "objective", patch: { title: "Build Lean Mass" } });
    const ready = await service.markReady({ userId: "u", sourceGoalId: goal.id });
    expect(ready.status).toBe("ready");
    expect(repositories.goals.updateGoal).not.toHaveBeenCalled();
    expect(repositories.goals.saveGoal).not.toHaveBeenCalled();
    expect(repositories.protocols.updateProtocol).not.toHaveBeenCalled();
    expect(repositories.protocols.saveProtocol).not.toHaveBeenCalled();
    expect(goal.status).toBe("active");
  });

  it("leaves missing evidence unavailable rather than fabricating values", () => {
    const draft = buildGoalTransitionDraft({ userId: "u", goal, dexa: null, photoEvent: null, protocols: [], weights: [] }, new Date());
    expect(draft.openingBaseline).toMatchObject({ date: null, dexaWeight: null, leanMass: null, fatMass: null, bodyFatPercentage: null, scaleTrend: null, latestPhotoSessionId: null });
  });
});

// The Monthly's phase label comes from the Goal's canonical phase order and
// the phase active at the month's end — never from a fixed ordinal.
import { describe, expect, it } from "vitest";
import { buildMonthlyEnergySeries, phaseLabelOf } from "./MonthlyBriefingPresentationService.js";
import { applyMonthlyReviewToArtifact } from "./MonthlyReviewPresentationService.js";

const goal = {
  id: "goal_x", status: "active", currentPhaseId: "phase_b",
  phases: [
    { id: "phase_a", name: "Establish Maintenance", order: 0, status: "completed", startDate: "2026-07-19", startedAt: "2026-07-19", endDate: "2026-08-14" },
    { id: "phase_b", name: "Lean Mass Build", order: 1, status: "active", startDate: "2026-08-15", startedAt: "2026-08-15" },
  ],
};
const month = (startDate, endDate) => buildMonthlyEnergySeries({ goal, energyContinuations: [],
  previewWindow: { startDate, endDate, deliveryDate: "2026-10-01" }, observedCutoff: `${endDate}T23:59:59Z` }).window;

describe("Monthly phase label authority", () => {
  it("names the phase by its canonical order, never a fixed ordinal", () => {
    expect(phaseLabelOf(goal, goal.phases[0])).toBe("Establish Maintenance · Phase 1");
    expect(phaseLabelOf(goal, goal.phases[1])).toBe("Lean Mass Build · Phase 2");
    // Without an explicit order, the phases' start dates decide.
    const unordered = { phases: goal.phases.map(({ order: _order, ...phase }) => phase).reverse() };
    expect(phaseLabelOf(unordered, unordered.phases[0])).toBe("Lean Mass Build · Phase 2");
  });

  it("a month entirely inside the second phase is labelled with it", () => {
    expect(month("2026-09-01", "2026-09-30").label).toBe("Lean Mass Build · Phase 2");
  });

  it("a month spanning the transition is labelled with the phase active at its end, from that phase's start", () => {
    const window = month("2026-08-01", "2026-08-31");
    expect(window.label).toBe("Lean Mass Build · Phase 2");
    expect(window.startDate).toBe("2026-08-15");
  });

  it("a month entirely inside the first phase is labelled with it", () => {
    const earlier = { ...goal, currentPhaseId: "phase_a", phases: [{ ...goal.phases[0], status: "active", endDate: null }, { ...goal.phases[1], status: "planned" }] };
    const window = buildMonthlyEnergySeries({ goal: earlier, energyContinuations: [],
      previewWindow: { startDate: "2026-07-19", endDate: "2026-07-31", deliveryDate: "2026-08-01" }, observedCutoff: "2026-07-31T23:59:59Z" }).window;
    expect(window.label).toBe("Establish Maintenance · Phase 1");
  });

  it("a stored Monthly keeps the label it was published with", () => {
    const stored = { briefing: { monthlyPresentation: { hero: {}, energy: { phaseLabel: "Lean Mass Build · Phase 1" } }, monthlyNarrative: {} } };
    const copy = structuredClone(stored);
    expect(applyMonthlyReviewToArtifact({ artifact: copy, narrativePlan: { holisticSynthesis: { realized: false } } })).toEqual(stored);
  });
});

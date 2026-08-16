import { describe, expect, it } from "vitest";
import { resolveWeeklyBriefingPhaseBoundary } from "./WeeklyBriefingPhaseBoundaryReadService";

function artifact({ endDate = "2026-08-15", activePhaseId = "phase-1" } = {}) {
  return { briefing: { weeklyNarrative: { context: {
    evidenceWindow: { endDate }, activePhase: { id: activePhaseId },
  } } } };
}
function goal({ phase1Status = "completed", phase2Status = "active", phase2Start = "2026-08-15" } = {}) {
  return { phases: [
    { id: "phase-1", name: "Establish Maintenance", status: phase1Status, order: 0 },
    { id: "phase-2", name: "Lean Mass Build", status: phase2Status, order: 1, startDate: phase2Start,
      strategicReviewCadence: "monthly", strategicReviewAnchor: "dexa_body_composition" },
  ] };
}

describe("resolveWeeklyBriefingPhaseBoundary", () => {
  it("resolves a genuine boundary week: snapshot phase now completed, next phase now active nearby", () => {
    const result = resolveWeeklyBriefingPhaseBoundary({ artifact: artifact(), goal: goal() });
    expect(result).toEqual({
      priorPhaseName: "Establish Maintenance", phaseName: "Lean Mass Build", effectiveDate: "2026-08-15",
      strategicReviewCadence: "monthly", strategicReviewAnchor: "dexa_body_composition",
    });
  });

  it("returns null when the snapshot phase is still active live (no transition yet)", () => {
    expect(resolveWeeklyBriefingPhaseBoundary({ artifact: artifact(), goal: goal({ phase1Status: "active" }) })).toBeNull();
  });

  it("returns null when the next phase has not started live", () => {
    expect(resolveWeeklyBriefingPhaseBoundary({ artifact: artifact(), goal: goal({ phase2Status: "upcoming" }) })).toBeNull();
  });

  it("returns null when the next phase's start date is far from this week's evidence window", () => {
    expect(resolveWeeklyBriefingPhaseBoundary({ artifact: artifact({ endDate: "2026-06-01" }), goal: goal() })).toBeNull();
  });

  it("returns null for an unrelated earlier week even though the goal has since transitioned", () => {
    expect(resolveWeeklyBriefingPhaseBoundary({ artifact: artifact({ endDate: "2026-07-01", activePhaseId: "phase-1" }), goal: goal() })).toBeNull();
  });

  it("returns null without a goal, artifact, or evidence window", () => {
    expect(resolveWeeklyBriefingPhaseBoundary({})).toBeNull();
    expect(resolveWeeklyBriefingPhaseBoundary({ artifact: artifact(), goal: null })).toBeNull();
    expect(resolveWeeklyBriefingPhaseBoundary({ artifact: {}, goal: goal() })).toBeNull();
  });
});

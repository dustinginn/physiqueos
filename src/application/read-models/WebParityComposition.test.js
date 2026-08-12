import { describe, expect, it } from "vitest";
import { mapGoalSummary as mapWebGoalSummary } from "../../screens/GoalsHubScreen.jsx";
import { buildOperatingPlan as buildWebOperatingPlan } from "../../screens/OperatingPlanScreen.jsx";
import { mapGoalSummary } from "../goals/GoalsHubReadService.js";
import { buildOperatingPlan } from "../plan/OperatingPlanReadService.js";
import { projectPendingReviews } from "../log/LogReadService.js";

describe("deterministic web/application read parity", () => {
  it("preserves Goal entities, state, phase, confidence value/source, and navigation meaning", () => {
    const summary = { id: "goal-build-lean", title: "Lean Mass", primary: true, lifecycleState: "active", presentation: {} };
    const evaluation = { projection: { completionStageLabel: "Entering Target Range" } };
    const source = { id: summary.id, type: "build_lean_mass", status: "active", phases: [{ id: "phase-one", name: "Build", status: "active", startedAt: "2026-08-01", plannedReviewAt: "2026-09-01" }] };
    const confidence = { value: 82, band: "high", source: { briefingId: "brief-one" }, explanation: "Published evidence" };
    const application = mapGoalSummary(summary, evaluation, source, confidence);
    const web = mapWebGoalSummary(summary, evaluation, source, confidence);
    expect(web).toMatchObject(application);
    expect(application).toMatchObject({ title: "Preserve Lean Mass", statusLabel: "Entering Target Range", confidence: { value: 82, source: { briefingId: "brief-one" } }, phase: { id: "phase-one" } });
  });

  it("uses the same Operating Plan composition for web and application clients", () => {
    const input = { energyStrategy: null, executionItems: [], nutritionContext: { estimatedDailyCaloricIntake: { min: 2200, max: 2400, unit: "kcal" }, activeProtocolId: "nutrition-one" }, protocols: [{ id: "peptide-one", name: "Tesamorelin", category: "peptide", status: "active" }], reminders: [], trainingProtocol: null };
    expect(buildWebOperatingPlan(input)).toEqual(buildOperatingPlan(input));
    expect(buildOperatingPlan(input).map((section) => section.title)).toEqual(["Energy Strategy", "Nutrition", "Training", "Recovery", "Peptides", "Tracking"]);
  });

  it("preserves pending-review ordering, state, duplicate meaning, and calendar date", () => {
    const review = (id, createdAt) => ({ id, status: "pending", createdAt, interpretedEvidence: { observed_at: "2026-08-10", evidence_objects: [{ evidence_type: "weight", observed_at: "2026-08-10", value: 180 }] }, itemDecisions: [] });
    const result = projectPendingReviews([review("older", "2026-08-10T10:00:00Z"), review("newer", "2026-08-10T11:00:00Z")]);
    expect(result.map((item) => item.id)).toEqual(["newer", "older"]);
    expect(result.map((item) => item.likelyDuplicate)).toEqual([false, true]);
    expect(result[0]).toMatchObject({ localDate: "2026-08-10", date: "Monday, August 10" });
  });
});

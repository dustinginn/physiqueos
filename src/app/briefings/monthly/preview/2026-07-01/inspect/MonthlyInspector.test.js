import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { monthlyPreviewFixtures } from "../../../../../../fixtures/monthlyBriefingPreview";
import MonthlyBriefingPreviewInspectorPage from "./page";
import {
  buildMonthlyFixtureInspection,
  composeMonthlyFixtureInspection,
  resolveMonthlyFixture,
} from "./fixtureInspector";

const forbiddenOrdinaryTypes = [
  "goal_completion",
  "goal_start",
  "phase_transition",
  "dexa_baseline",
  "dexa_comparison",
  "dexa_contradiction",
  "new_baseline",
  "interruption",
  "contradiction",
  "risk_signal",
];

describe("Monthly fixture inspector", () => {
  it("awaits query parameters and resolves supported and fallback fixtures", async () => {
    const then = vi.fn((resolve) => resolve({ fixture: "ordinaryMonth" }));
    expect((await resolveMonthlyFixture({ then })).fixtureName).toBe("ordinaryMonth");
    expect((await resolveMonthlyFixture(Promise.resolve({ fixture: "julyContinuation" }))).fixtureName).toBe("julyContinuation");
    expect((await resolveMonthlyFixture(Promise.resolve({}))).fixtureName).toBe("julyContinuation");
    expect((await resolveMonthlyFixture(Promise.resolve({ fixture: "unknown" }))).fixtureName).toBe("julyContinuation");
    expect(then).toHaveBeenCalled();
  });

  it("composes isolated fixture decisions without a repository dependency", async () => {
    const july = await buildMonthlyFixtureInspection(Promise.resolve({ fixture: "julyContinuation" }));
    const ordinary = await buildMonthlyFixtureInspection(Promise.resolve({ fixture: "ordinaryMonth" }));
    expect(july.fixture.name).toBe("julyContinuation");
    expect(ordinary.fixture.name).toBe("ordinaryMonth");
    expect(july.decision.scoreRankedCandidateIds).not.toEqual(ordinary.decision.scoreRankedCandidateIds);
    expect(july.fixture.monthlyWindow).not.toEqual(ordinary.fixture.monthlyWindow);
  });

  it("models July completion explicitly and keeps the July 18 DEXA observed", () => {
    const fixture = monthlyPreviewFixtures.julyContinuation;
    const dexa = fixture.dexaScans.find((record) => record.measuredAt === "2026-07-18");
    expect(fixture.goal.completionEvent).toMatchObject({
      id: "goal-completion-visible-abs-2026-07-18",
      completedAt: "2026-07-18",
      source: "fixture_owned_completed_goal",
    });
    expect(dexa).toMatchObject({
      bodyFatPercentage: { value: 7.7, unit: "%" },
      leanMass: { value: 147.5, unit: "lb" },
      fatMass: { value: 12.8, unit: "lb" },
      isSynthetic: false,
    });
    expect(fixture.syntheticContinuation.dexaScans).toEqual([]);
    expect(JSON.stringify(fixture.syntheticContinuation)).not.toMatch(/lean.?mass.?progress/i);
  });

  it("produces the July baseline and bounded completion from observed evidence", () => {
    const inspection = composeMonthlyFixtureInspection("julyContinuation", monthlyPreviewFixtures.julyContinuation);
    const completion = inspection.decision.candidates.find((candidate) => candidate.storyType === "goal_completion");
    const baseline = inspection.decision.candidates.find((candidate) => candidate.storyType === "new_baseline");
    expect(completion.provenance).toMatchObject({
      completionEventId: "goal-completion-visible-abs-2026-07-18",
      completionDate: "2026-07-18",
    });
    expect(inspection.decision.boundedMilestoneCandidateIds).toContain(completion.storyId);
    expect(baseline.evidenceRefs).toContain("dexa-jul-18-observed");
    expect(baseline.syntheticInvolvement).toBe(false);
  });

  it("reports an exact, chronological synthetic range after the observed cutoff", () => {
    const inspection = composeMonthlyFixtureInspection("julyContinuation", monthlyPreviewFixtures.julyContinuation);
    const { observedCutoff, syntheticDates, syntheticRange } = inspection.fixture;
    expect(observedCutoff).toBe("2026-07-28");
    expect(syntheticDates).toEqual([...syntheticDates].sort());
    expect(syntheticDates.every((date) => date > observedCutoff)).toBe(true);
    expect(syntheticRange.startDate).toBe(syntheticDates[0]);
    expect(syntheticRange.endDate).toBe(syntheticDates.at(-1));
    expect(syntheticRange).toMatchObject({ startDate: "2026-07-29", endDate: "2026-07-31" });

    const observedIds = new Set([
      ...monthlyPreviewFixtures.julyContinuation.weights,
      ...monthlyPreviewFixtures.julyContinuation.dexaScans,
      ...monthlyPreviewFixtures.julyContinuation.progressPhotos,
      ...monthlyPreviewFixtures.julyContinuation.energyContinuations,
      ...monthlyPreviewFixtures.julyContinuation.trainingObservations,
    ].map((record) => record.id));
    const syntheticIds = [
      ...monthlyPreviewFixtures.julyContinuation.syntheticContinuation.weights,
      ...monthlyPreviewFixtures.julyContinuation.syntheticContinuation.progressPhotos,
      ...monthlyPreviewFixtures.julyContinuation.syntheticContinuation.energyContinuations,
      ...monthlyPreviewFixtures.julyContinuation.syntheticContinuation.trainingObservations,
    ].map((record) => record.id);
    expect(syntheticIds.some((id) => observedIds.has(id))).toBe(false);
  });

  it("keeps the ordinary control free of transition-specific candidates", () => {
    const inspection = composeMonthlyFixtureInspection("ordinaryMonth", monthlyPreviewFixtures.ordinaryMonth);
    const types = inspection.decision.candidates.map((candidate) => candidate.storyType);
    forbiddenOrdinaryTypes.forEach((type) => expect(types).not.toContain(type));
    expect(types).toContain("training_evolution");
    expect(types).toContain("energy_trend");
    expect(inspection.fixture.monthlyWindow).toEqual(monthlyPreviewFixtures.ordinaryMonth.previewWindow);
  });

  it("exposes the corrected candidate contract and diagnostics without placeholder IDs", () => {
    const inspection = composeMonthlyFixtureInspection("julyContinuation", monthlyPreviewFixtures.julyContinuation);
    expect(JSON.stringify(inspection)).not.toContain("record_");
    expect(inspection.decision.heroThesisCandidateIds.length).toBeGreaterThan(0);
    expect(inspection.decision.scoreWeightTotal).toBeCloseTo(1, 12);
    expect(inspection.decision.generatedAt).toBe("2026-07-30T20:00:00.000Z");
    inspection.decision.candidates.forEach((candidate) => {
      expect(candidate.scoreRank).toBeGreaterThan(0);
      if (candidate.included) expect(candidate.renderedOrderReason).toBeTruthy();
      if (candidate.exclusionReason?.startsWith("merged_into_")) {
        expect(candidate.mergeMetadata.mergeReason).toBeTruthy();
      }
    });
  });

  it("renders different active fixture identities and candidate sets", async () => {
    const julyMarkup = renderToStaticMarkup(await MonthlyBriefingPreviewInspectorPage({
      searchParams: Promise.resolve({ fixture: "julyContinuation" }),
    }));
    const ordinaryMarkup = renderToStaticMarkup(await MonthlyBriefingPreviewInspectorPage({
      searchParams: Promise.resolve({ fixture: "ordinaryMonth" }),
    }));
    expect(julyMarkup).toContain("Active fixture: julyContinuation");
    expect(ordinaryMarkup).toContain("Active fixture: ordinaryMonth");
    expect(julyMarkup).toContain("goal_completion");
    expect(ordinaryMarkup).not.toContain("goal_completion");
  });

  it("preserves fixture selection through the compatibility redirect", async () => {
    vi.resetModules();
    const redirect = vi.fn();
    vi.doMock("next/navigation", () => ({ redirect }));
    const { default: CompatibilityPage } = await import("../inspector/page");
    await CompatibilityPage({ searchParams: Promise.resolve({ fixture: "ordinaryMonth" }) });
    expect(redirect).toHaveBeenCalledWith("/briefings/monthly/preview/2026-07-01/inspect?fixture=ordinaryMonth");
    vi.doUnmock("next/navigation");
  });
});

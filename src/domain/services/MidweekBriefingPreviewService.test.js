import { describe, expect, it } from "vitest";
import { createMidweekEvidenceWindow, createWeeklyEvidenceWindow } from "./BriefingEvidenceWindowService";
import { composeMidweekBriefingPreview, createMidweekBriefingPreviewService, MIDWEEK_BRIEFING_VERSION } from "./MidweekBriefingPreviewService";
import { midweekPreviewFixtures } from "../../fixtures/midweekBriefingPreview";

const window = createMidweekEvidenceWindow({ now: new Date("2026-07-22T19:00:00Z"), timeZone: "America/Los_Angeles" });
const compose = (fixture) => composeMidweekBriefingPreview({ ...fixture, window, generatedAt: "2026-07-22T19:00:00.000Z" });

describe("Wednesday Midweek Briefing preview", () => {
  it("resolves Sunday through Tuesday and excludes Wednesday", () => {
    expect(window).toMatchObject({ briefingDate: "2026-07-22", startDate: "2026-07-19", endDate: "2026-07-21", sameDayEvidenceExcluded: true });
    const result = compose({ ...midweekPreviewFixtures.current, canonicalObjects: [...midweekPreviewFixtures.current.canonicalObjects, { evidence_type: "nutrition", payload: { observed_at: "2026-07-22", daily_totals: { calories: 9999 } } }] });
    expect(result.energyBalance.totalIntake).toBe(7450);
    expect(result.charts.energy.points).toHaveLength(3);
  });

  it.each([
    ["2026-01-01T07:30:00Z", "America/Los_Angeles", "2025-12-31", "2025-12-28", "2025-12-30"],
    ["2026-04-01T19:00:00Z", "America/Los_Angeles", "2026-04-01", "2026-03-29", "2026-03-31"],
  ])("uses date-only timezone boundaries for %s", (now, timeZone, briefingDate, startDate, endDate) => {
    expect(createMidweekEvidenceWindow({ now: new Date(now), timeZone })).toMatchObject({ briefingDate, startDate, endDate });
  });

  it("leaves Sunday Weekly coverage as the complete prior Sunday through Saturday", () => {
    expect(createWeeklyEvidenceWindow({ now: new Date("2026-07-26T19:00:00Z"), timeZone: "America/Los_Angeles" })).toMatchObject({ startDate: "2026-07-19", endDate: "2026-07-25", cadence: "weekly" });
  });

  it("uses latest DEXA RMR plus Apple Watch active calories with no multiplier", () => {
    const result = compose(midweekPreviewFixtures.current);
    expect(result).toMatchObject({ briefingVersion: MIDWEEK_BRIEFING_VERSION, preview: true, persistence: { artifactPersisted: false, threadsPersisted: false, lifecycleAdvanced: false } });
    expect(result.energyBalance).toMatchObject({ averageIntake: 2483.3, totalIntake: 7450, averageActiveEnergy: 740, totalActiveEnergy: 2220, restingEnergyBasis: 1836, completeNutritionDays: 3, completeActivityDays: 3, reliability: "moderate" });
    expect(result.energyBalance.estimatedAverageExpenditure).toBe(2576);
    expect(result.energyBalance.estimatedAverageDailyBalance).toBe(-92.7);
    expect(result.energyBalance.cumulativeBalance).toBe(-278.1);
    expect(result.energyBalance.chartPoints[0]).toMatchObject({ expenditure: 2556, balance: -76 });
    expect(result.energyBalance).not.toHaveProperty("uncertainty");
  });

  it("qualifies missing energy evidence without calling active calories total expenditure", () => {
    const result = compose(midweekPreviewFixtures.missingEnergy);
    expect(result.energyBalance.reliability).toBe("limited");
    expect(result.coachingDecision.type).toBe("hold_and_gather");
    expect(result.energyBalance.warnings.join(" ")).toMatch(/incomplete/i);
  });

  it("does not use the fallback when a DEXA exists without an RMR", () => {
    const dexaWithoutRmr = { ...midweekPreviewFixtures.current.dexaScans[0], restingMetabolicRate: null };
    const result = composeMidweekBriefingPreview({ ...midweekPreviewFixtures.current, dexaScans: [dexaWithoutRmr], window, restingEnergyFallback: 1900 });
    expect(result.energyBalance.restingEnergyBasis).toBeNull();
    expect(result.energyBalance.chartPoints.every((point) => point.complete === false)).toBe(true);
  });

  it("keeps all three calendar days visible when only one estimate is defensible", () => {
    const result = compose(midweekPreviewFixtures.missingEnergy);
    expect(result.charts.energy.points).toHaveLength(3);
    expect(result.charts.energy.points.filter((point) => point.complete)).toHaveLength(1);
    expect(result.energyBalance.comparableDays).toBe(1);
  });

  it("reports training signals without fabricating unsupported volume", () => {
    const result = compose(midweekPreviewFixtures.trainingImprovement);
    expect(result.training).toMatchObject({ sessionsCompleted: 2, performanceTrend: "improving" });
    expect(result.training.highlights.map((item)=>item.exercise).join(" ")).toMatch(/Pull-Up|Row/);
    expect(result.training.highlights[0]).toMatchObject({ kind: "Record", label: "New volume-load record", value: 2200, previous: 2000, delta: 200, percentChange: 10 });
    expect(result.training.prioritySignals.find((signal) => signal.key === "lower_body").status).toBe("The trend is still forming.");
    expect(result.charts.training).toBeNull();
  });

  it("turns plateaus and regressions into constructive watch guidance", () => {
    const result = compose(midweekPreviewFixtures.trainingWatch);
    expect(result.training.watch.map((item)=>item.status)).toEqual(expect.arrayContaining(["plateauing","regressing"]));
    expect(result.training.watch.map((item)=>item.message).join(" ")).toMatch(/increase difficulty|recovery and execution/i);
  });

  it("keeps weight concise and never emits a weight chart", () => {
    const result = compose(midweekPreviewFixtures.current);
    expect(result.weightContext).toMatchObject({ averageWeight: 165.7, observations: 3, chart: null });
    expect(result.charts.weight).toBeNull();
    expect(result.weightContext.interpretation).not.toMatch(/adjust/i);
  });

  it("promotes a new DEXA and otherwise avoids an empty body-composition section", () => {
    expect(compose(midweekPreviewFixtures.newDexa).bodyComposition).toMatchObject({ prominent: true, newScan: true, leanMass: 148, bodyFatPercentage: 8.2 });
    expect(compose(midweekPreviewFixtures.current).bodyComposition).toMatchObject({ prominent: false, newScan: false });
  });

  it("selects one evidence-linked decision and at most three priorities without mutating protocols", () => {
    const result = compose(midweekPreviewFixtures.underMaintenance);
    expect(result.coachingDecision).toMatchObject({ type: "small_intake_adjustment", protocolChangeRecommended: false });
    expect(result.coachingDecision.supportingEvidence.length).toBeGreaterThan(1);
    expect(result.prioritiesThroughSunday.length).toBeLessThanOrEqual(3);
  });

  it("emits preview-only open threads for full-week Sunday resolution", () => {
    const result = compose(midweekPreviewFixtures.current);
    expect(result.openCoachingThreads.every((thread) => thread.status === "open" && thread.lifecycle.persisted === false)).toBe(true);
    expect(result.openCoachingThreads[0].lifecycle.allowedSundayStates).toEqual(["confirmed", "revised", "unresolved", "retired"]);
    expect(result.sundayContinuity).toMatchObject({ coverage: "Sunday through Saturday" });
    expect(result.sundayContinuity.approach).toMatch(/without repeating/i);
  });

  it("is deterministic and immutable", () => {
    const first = compose(midweekPreviewFixtures.current), second = compose(midweekPreviewFixtures.current);
    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("reads repositories without invoking a write boundary", async () => {
    let writes = 0;
    const repositories = { users: { getCurrentUser: async()=>({id:"u",timeZone:"America/Los_Angeles"}) }, canonicalEvidence: { listCanonicalEvidenceObjects: async()=>midweekPreviewFixtures.current.canonicalObjects }, weights: { listWeightEntries: async()=>midweekPreviewFixtures.current.weights }, dexaScans: { listDEXAScans: async()=>midweekPreviewFixtures.current.dexaScans }, goals: { getActiveGoal: async()=>midweekPreviewFixtures.current.goal }, dailyBriefings: { createDailyBriefing: async()=>{writes+=1;} } };
    const result = await createMidweekBriefingPreviewService({ repositories, now:()=>new Date("2026-07-22T19:00:00Z") }).preview({userId:"u"});
    expect(result.preview).toBe(true);
    expect(writes).toBe(0);
  });
});

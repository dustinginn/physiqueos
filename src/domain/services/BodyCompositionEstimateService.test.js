import { describe, expect, it } from "vitest";
import { createBodyCompositionEstimate, formatBodyCompositionRange } from "./BodyCompositionEstimateService";

const dexa = { id: "dexa", measuredAt: "2026-06-20", totalMass: { value: 171.7 }, fatMass: { value: 18.4 }, leanMass: { value: 146.2 } };
const weights = Array.from({ length: 8 }, (_, index) => ({ measuredAt: `2026-07-${String(index + 5).padStart(2, "0")}`, weight: { value: 165.4 - index * 0.2 } }));
const photos = ["2026-06-01", "2026-06-15", "2026-07-01", "2026-07-11"].map((date) => ({ date, conditions: { morning: true, fasted: true, postWorkout: false, pump: false, sameLighting: true } }));
const photoAnalyses = photos.map((photo, index) => ({ createdAt: photo.date, metadata: { structuredObservations: [
  { type: "regional_review", region: "Midsection", confidence: "high", supportsGoal: true, change: `mid-${index}` },
  { type: "regional_review", region: "Upper body", confidence: "moderate", supportsGoal: true, change: `upper-${index}` },
] } }));
function performance({ sessions = 10, statuses = ["improving", "stable", "plateauing", "stable"], prs = 1 } = {}) {
  return { summary: { resistance_sessions_last_30_days: sessions, recent_pr_count: prs }, overallObservation: { evidence_date_range: { end: "2026-07-12" } }, exerciseObservations: statuses.map((status) => ({ status })) };
}
function estimate(overrides = {}) { return createBodyCompositionEstimate({ latestDEXA: dexa, weightEntries: weights, now: new Date("2026-07-13T12:00:00"), ...overrides }); }

describe("BodyCompositionEstimateService", () => {
  it("keeps DEXA plus scale-only uncertainty broad", () => {
    const result = estimate();
    expect(result.upperBodyFatPercent - result.lowerBodyFatPercent).toBeCloseTo(1.2, 2);
    expect(result.photoConstraint.eligible).toBe(false);
  });
  it("narrows with consistent photos and maintained performance without moving the anchor", () => {
    const base = estimate(); const result = estimate({ progressPhotos: photos, photoAnalyses, trainingPerformance: performance() });
    expect(result.upperBodyFatPercent - result.lowerBodyFatPercent).toBeLessThan(base.upperBodyFatPercent - base.lowerBodyFatPercent);
    expect(result.anchorDEXAId).toBe(base.anchorDEXAId);
    expect(result.pointEstimateBodyFatPercent).toBe(base.pointEstimateBodyFatPercent);
  });
  it("does not narrow for conflicting or low-confidence photos", () => {
    const result = estimate({ progressPhotos: photos, photoAnalyses: photoAnalyses.map((a) => ({ ...a, metadata: { structuredObservations: a.metadata.structuredObservations.map((o) => ({ ...o, confidence: "low" })) } })) });
    expect(result.photoConstraint.eligible).toBe(false);
  });
  it("does not overstate preservation during broad regression", () => {
    expect(estimate({ trainingPerformance: performance({ statuses: ["regressing", "regressing", "stable"] }) }).performanceConstraint.eligible).toBe(false);
  });
  it("does not let an isolated PR narrow the range", () => {
    expect(estimate({ trainingPerformance: performance({ sessions: 2, statuses: ["improving"], prs: 1 }) }).performanceConstraint.eligible).toBe(false);
  });
  it("retains a non-zero uncertainty floor as the DEXA ages", () => {
    const result = estimate({ progressPhotos: photos, photoAnalyses, trainingPerformance: performance() });
    expect(result.upperBodyFatPercent - result.lowerBodyFatPercent).toBeGreaterThanOrEqual(0.68);
  });
  it("narrows a Founder-like fixture through explicit constraints", () => {
    const base = estimate(); const result = estimate({ progressPhotos: photos, photoAnalyses, trainingPerformance: performance() });
    expect(result.photoConstraint.upperReduction).toBeGreaterThan(0);
    expect(result.performanceConstraint.upperReduction).toBeGreaterThan(0);
    expect(formatBodyCompositionRange(result)).not.toBe(formatBodyCompositionRange(base));
  });
  it("provides a stable shared estimate identity and range contract", () => {
    const result = estimate({ progressPhotos: photos, photoAnalyses, trainingPerformance: performance() });
    expect(result.id).toContain(result.anchorDEXAId); expect(formatBodyCompositionRange(result)).toMatch(/^~\d+\.\d-\d+\.\d%$/);
  });
  it("is a pure read model that does not alter historical inputs", () => {
    const historical = { currentBodyFatRange: "~7.6-8.8%" }; estimate({ progressPhotos: photos, photoAnalyses, trainingPerformance: performance() });
    expect(historical.currentBodyFatRange).toBe("~7.6-8.8%");
  });
  it("is deterministic and idempotent", () => {
    const input = { progressPhotos: photos, photoAnalyses, trainingPerformance: performance() };
    expect(estimate(input)).toEqual(estimate(input));
  });
});

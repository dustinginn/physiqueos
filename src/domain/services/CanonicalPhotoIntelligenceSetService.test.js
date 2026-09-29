import { describe, expect, it } from "vitest";
import {
  createCanonicalPhotoIntelligenceSetFromSession,
  createCanonicalPhotoIntelligenceSetResult,
  matchPhotoSetViews,
} from "./CanonicalPhotoIntelligenceSetService.js";

describe("Canonical Photo Intelligence set contract", () => {
  it("matches only like-for-like views and does not turn absent views into no change", () => {
    const result = matchPhotoSetViews({
      baselineImages: [
        image("baseline-front", "front", "relaxed"),
        image("baseline-back", "back", "double-biceps"),
      ],
      comparisonImages: [
        image("comparison-front", "front", "relaxed"),
        image("comparison-side", "side", "relaxed"),
      ],
    });
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]).toMatchObject({
      key: "front:relaxed",
      baselineImage: { sourceId: "baseline-front" },
      comparisonImage: { sourceId: "comparison-front" },
    });
    expect(result.unmatched).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: "baseline-back", setId: "set", date: "2026-06-01", reason: "no_comparison_like_for_like_view" }),
      expect.objectContaining({ sourceId: "comparison-side", setId: "set", date: "2026-06-01", reason: "no_prior_like_for_like_view" }),
    ]));
    expect(JSON.stringify(result.unmatched)).not.toMatch(/no.change/i);
  });

  it("preserves each image, view result, and observation beneath one set assessment", () => {
    const result = createCanonicalPhotoIntelligenceSetResult({
      setId: "case-3",
      baselineSet: { id: "june-set", date: "2026-06-13" },
      comparisonSet: { id: "july-set", date: "2026-07-18" },
      goalContext: { activeGoal: { title: "Visible Abs" } },
      replayLabel: "MULTI-VIEW DEVELOPMENT CASE",
      setPhotoBriefingCopy: "Your back is visibly leaner and more defined.",
      viewComparisons: [{
        id: "back-flexed",
        view: "back",
        pose: "double-biceps",
        baselineImage: image("june-back", "back", "double-biceps", "2026-06-13", "june-set"),
        comparisonImage: image("july-back", "rear", "double-biceps", "2026-07-18", "july-set"),
        photoIntelligenceInput: {
          comparability: { overall: "moderate" },
          visualChange: {
            dominantStory: "The back appears leaner and more defined.",
            overallApparentMagnitude: "moderate",
            regions: [finding("upper_back", "definition", "increased")],
            goalRelativeInterpretation: {
              direction: "supportive", strength: "strong_visual_support",
              interpretation: "Back conditioning supports Visible Abs.",
            },
          },
          confidenceAndLimitations: { overallReliability: "moderate" },
          unsupportedConclusions: ["lat growth"],
          photoBriefingCopy: "Your back is visibly leaner and more defined.",
        },
      }],
    });
    expect(result).toMatchObject({
      schemaVersion: "canonical_photo_intelligence_set_v1",
      overallMagnitude: "moderate",
      comparability: { overall: "moderate", matchedViewCount: 1, unmatchedViewCount: 0 },
      provenance: {
        evidenceClass: "photo_only",
        nonPhotoEvidenceUsed: false,
        unmatchedViewsTreatedAsNoChange: false,
      },
    });
    expect(result.viewComparisons[0]).toMatchObject({
      view: "back", pose: "double-biceps", matchStatus: "like_for_like",
      baselineImage: { sourceId: "june-back", setId: "june-set" },
      comparisonImage: { sourceId: "july-back", setId: "july-set" },
    });
    expect(result.observations[0]).toMatchObject({
      region: "upper_back", supportingViewIds: ["back-flexed"],
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("strengthens only genuinely corroborated conclusions and exposes conflicts", () => {
    const build = (id, view, direction) => ({
      id, view, pose: "relaxed",
      baselineImage: image(`${id}-before`, view, "relaxed", "2026-06-01", "before"),
      comparisonImage: image(`${id}-after`, view, "relaxed", "2026-07-01", "after"),
      photoIntelligenceInput: {
        visualChange: {
          dominantStory: `${view} waist observation.`, overallApparentMagnitude: "moderate",
          regions: [finding("waist", "apparent_leanness", direction)],
          goalRelativeInterpretation: {
            direction: direction === "increased" ? "supportive" : "counter_directional",
            strength: "moderate_visual_support", interpretation: `${view} direction.`,
          },
        },
        confidenceAndLimitations: { overallReliability: "moderate" },
      },
    });
    const aligned = createCanonicalPhotoIntelligenceSetResult({
      setId: "aligned", baselineSet: { id: "before", date: "2026-06-01" },
      comparisonSet: { id: "after", date: "2026-07-01" },
      viewComparisons: [build("front", "front", "increased"), build("back", "back", "increased")],
    });
    expect(aligned.crossViewCorroboration).toEqual([
      expect.objectContaining({
        metric: "apparent_leanness", supportingViewIds: ["back", "front"],
        confidenceEffect: "set_interpretation_strengthened",
        viewConfidenceChanged: false,
      }),
    ]);
    expect(aligned.confidence).toMatchObject({
      overallReliability: "moderate",
      setInterpretationEffect: "conclusion_scoped_corroboration",
      globallyStrengthened: false,
    });
    expect(aligned.exactPhotoBriefingCopy).toMatch(/^Across the matched front and back views,/);

    const conflict = createCanonicalPhotoIntelligenceSetResult({
      setId: "conflict", baselineSet: { id: "before", date: "2026-06-01" },
      comparisonSet: { id: "after", date: "2026-07-01" },
      viewComparisons: [build("front", "front", "increased"), build("back", "back", "decreased")],
    });
    expect(conflict.crossViewConflicts).toEqual([
      expect.objectContaining({ metric: "apparent_leanness", status: "mixed_across_views" }),
    ]);
    expect(conflict.confidence.setInterpretationEffect).toBe("mixed_across_views");
    expect(conflict.goalRelativeInterpretation.direction).toBe("mixed");
    expect(conflict.overallMagnitude).toBe("unknown");
    expect(conflict.magnitudeReconciliation.status).toBe("mixed_across_views");
    expect(conflict.exactPhotoBriefingCopy).toMatch(/give a mixed picture/i);
    expect(conflict.exactPhotoBriefingCopy).toMatch(/do not support a single overall call/i);
  });

  it("does not treat the same generic metric in unrelated regions as corroboration", () => {
    const comparison = (id, view, region) => ({
      id, view, pose: "relaxed",
      baselineImage: image(`${id}-before`, view, "relaxed", "2026-06-01", "before"),
      comparisonImage: image(`${id}-after`, view, "relaxed", "2026-07-01", "after"),
      photoIntelligenceInput: {
        visualChange: {
          dominantStory: `${region} definition increased.`,
          overallApparentMagnitude: "moderate",
          regions: [finding(region, "definition", "increased")],
        },
        confidenceAndLimitations: { overallReliability: "moderate" },
      },
    });
    const result = createCanonicalPhotoIntelligenceSetResult({
      setId: "unrelated-regions",
      baselineSet: { id: "before", date: "2026-06-01" },
      comparisonSet: { id: "after", date: "2026-07-01" },
      viewComparisons: [
        comparison("front", "front", "abdomen"),
        comparison("back", "back", "upper_back"),
      ],
    });
    expect(result.crossViewCorroboration).toEqual([]);
    expect(result.crossViewConflicts).toEqual([]);
    expect(result.confidence.setInterpretationEffect).toBe("unchanged");
  });

  it("writes a complete uncertainty fallback when no view has a directional finding", () => {
    const comparison = (id, view) => ({
      id, view, pose: "relaxed",
      baselineImage: image(`${id}-before`, view, "relaxed", "2026-06-01", "before"),
      comparisonImage: image(`${id}-after`, view, "relaxed", "2026-07-01", "after"),
      photoIntelligenceInput: {
        visualChange: {
          dominantStory: `${view} view is visually stable.`,
          overallApparentMagnitude: "none",
          regions: [finding("torso", "shape", "stable")],
        },
        confidenceAndLimitations: { overallReliability: "moderate" },
      },
    });
    const result = createCanonicalPhotoIntelligenceSetResult({
      setId: "stable", baselineSet: { id: "before", date: "2026-06-01" },
      comparisonSet: { id: "after", date: "2026-07-01" },
      viewComparisons: [comparison("front", "front"), comparison("back", "back")],
    });
    expect(result.exactPhotoBriefingCopy).toBe(
      "Across the matched front and back views, front view is visually stable. back view is visually stable."
    );
  });

  it("rejects a supplied canonical view result carrying non-photo evidence", () => {
    const contaminated = createCanonicalPhotoIntelligenceSetResult.bind(null, {
      setId: "contaminated",
      baselineSet: { id: "before", date: "2026-06-01" },
      comparisonSet: { id: "after", date: "2026-07-01" },
      viewComparisons: [{
        id: "front", view: "front", pose: "relaxed",
        baselineImage: image("before", "front", "relaxed", "2026-06-01", "before"),
        comparisonImage: image("after", "front", "relaxed", "2026-07-01", "after"),
        photoIntelligence: {
          schemaVersion: "canonical_photo_intelligence_v1",
          provenance: {
            producer: "canonical_photo_intelligence_service",
            evidenceClass: "photo_only", nonPhotoEvidenceUsed: false,
          },
          comparability: { overall: "moderate" }, observations: [],
          confidence: { overallReliability: "moderate" },
          dexa: { leanMassChange: 2.1 },
        },
      }],
    });
    expect(contaminated).toThrow(/rejects non-photo evidence/);
  });

  it("adapts existing single-view sessions without requiring new poses", () => {
    const result = createCanonicalPhotoIntelligenceSetFromSession({
      goalContext: { activeGoal: { id: "goal", title: "Visible Abs" } },
      session: {
        id: "current-set", captureDate: "2026-07-18",
        synthesis: { observations: [] },
        views: [{
          canonicalViewId: "current-front", canonicalPhotoId: "current-front-photo",
          poseId: "front-relaxed", comparisonStatus: "comparable",
          conditionDifferences: [], provenance: { sourceIds: ["current-front-photo"] },
          comparison: {
            previousDate: "2026-06-13", previousCanonicalViewId: "prior-front",
            previousSessionId: "prior-set",
          },
          structuredFindings: [{
            region: "waist", metric: "apparent_leanness", direction: "increased",
            magnitude: "moderate", confidence: "moderate", change: "Waist appears leaner.",
          }],
        }],
      },
    });
    expect(result.schemaVersion).toBe("canonical_photo_intelligence_set_v1");
    expect(result.viewComparisons).toHaveLength(1);
    expect(result.viewComparisons[0]).toMatchObject({
      view: "front", pose: "front-relaxed", matchStatus: "like_for_like",
    });
  });

  it("preserves distinct prior-set identities instead of inventing one baseline", () => {
    const makeView = (view, previousDate, previousSessionId) => ({
      canonicalViewId: `current-${view}`, canonicalPhotoId: `current-${view}-photo`,
      poseId: `${view}-relaxed`, comparisonStatus: "comparable",
      conditionDifferences: [], provenance: { sourceIds: [`current-${view}-photo`] },
      comparison: {
        previousDate, previousCanonicalViewId: `prior-${view}`, previousSessionId,
      },
      structuredFindings: [{
        region: "waist", metric: "apparent_leanness", direction: "increased",
        magnitude: "moderate", confidence: "moderate", change: "Waist appears leaner.",
      }],
    });
    const result = createCanonicalPhotoIntelligenceSetFromSession({
      session: {
        id: "current-set", captureDate: "2026-07-18",
        synthesis: { observations: [] },
        views: [
          makeView("front", "2026-06-01", "prior-front-set"),
          makeView("back", "2026-06-13", "prior-back-set"),
        ],
      },
    });
    expect(result.sets.baseline).toMatchObject({
      identityStatus: "composite",
      dates: ["2026-06-01", "2026-06-13"],
      sourceSetIds: ["prior-back-set", "prior-front-set"],
    });
    expect(result.comparison).toMatchObject({ baselineDate: null, daysElapsed: null });
    expect(result.viewComparisons.map((item) => item.baselineImage.setId)).toEqual([
      "prior-front-set", "prior-back-set",
    ]);
  });
});

function image(sourceId, view, pose, date = "2026-06-01", setId = "set") {
  return { sourceId, view, pose, date, setId, visibleRegions: ["waist"] };
}

function finding(region, metric, direction) {
  return {
    region, metric, direction, apparent_magnitude: "moderate", confidence: "moderate",
    observation: `${region} ${metric} ${direction}.`,
  };
}

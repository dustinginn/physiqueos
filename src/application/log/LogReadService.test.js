import { describe, expect, it } from "vitest";
import {
  overlayAcceptedProcessing,
  projectPendingReviews,
  projectProcessingReviews,
} from "./LogReadService.js";

const nutritionReview = (status) => ({
  id: `review-${status}`,
  status,
  createdAt: "2026-09-16T23:00:00.000Z",
  version: 1,
  interpretedEvidence: {
    observed_at: "2026-09-16",
    evidence_objects: [{ evidence_type: "nutrition", observed_at: "2026-09-16" }],
  },
  itemDecisions: [],
});

describe("Log accepted-processing evidence semantics", () => {
  it("keeps only Founder-actionable reviews in Ready to Review", () => {
    const reviews = [
      nutritionReview("pending"),
      nutritionReview("commit_failed"),
      nutritionReview("committing"),
      nutritionReview("partially_committed"),
      nutritionReview("confirmed"),
    ];
    expect(projectPendingReviews(reviews).map((review) => review.id).sort()).toEqual([
      "review-commit_failed", "review-partially_committed", "review-pending",
    ]);
    expect(projectProcessingReviews(reviews).map((review) => review.id)).toEqual([
      "review-committing",
    ]);
  });

  it("projects accepted Nutrition processing without fabricating a logged record", () => {
    const loggedToday = {
      dateKey: "2026-09-16",
      rows: [
        { id: "training", summary: "Nothing logged yet", context: null, recordId: null },
        { id: "nutrition", summary: "Nothing logged yet", context: null, recordId: null },
        { id: "activity", summary: "Nothing logged yet", context: null, recordId: null },
      ],
    };
    const result = overlayAcceptedProcessing(
      loggedToday,
      projectProcessingReviews([nutritionReview("committing")]),
      "2026-09-16",
    );
    expect(result.rows[1]).toEqual({
      id: "nutrition",
      summary: "Nutrition processing",
      context: "Confirmation accepted · No action required",
      recordId: null,
      processing: true,
    });
  });

  it("lets durable canonical state replace processing automatically", () => {
    const durable = {
      dateKey: "2026-09-16",
      rows: [{ id: "nutrition", summary: "4 meals · 2484 calories", context: null, recordId: "nutrition-day" }],
    };
    expect(overlayAcceptedProcessing(
      durable,
      projectProcessingReviews([nutritionReview("committing")]),
      "2026-09-16",
    ).rows[0]).toEqual(durable.rows[0]);
  });

  it("covers Activity and generic Evidence without making either actionable", () => {
    const reviews = [
      { ...nutritionReview("committing"), id: "review-activity", interpretedEvidence: { observed_at: "2026-09-16", evidence_objects: [{ evidence_type: "activity_day", observed_at: "2026-09-16" }] } },
      { ...nutritionReview("committing"), id: "review-generic", interpretedEvidence: { observed_at: "2026-09-16", evidence_objects: [{ evidence_type: "labs", observed_at: "2026-09-16" }] } },
    ];
    expect(projectPendingReviews(reviews)).toEqual([]);
    expect(projectProcessingReviews(reviews)).toMatchObject([
      { id: "review-activity", domain: "activity", status: "accepted_processing" },
      { id: "review-generic", domain: "evidence", status: "accepted_processing" },
    ]);
  });
});

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
  it("projects one typed ambiguous workout reconciliation item without treating it as evidence intake", () => {
    const projected = projectPendingReviews([{
      schemaVersion: "healthkit-workout-reconciliation-v1",
      reviewKind: "healthkit_workout_reconciliation",
      id: "healthkit_workout_reconciliation_one",
      status: "pending",
      localDate: "2026-09-23",
      createdAt: "2026-09-23T23:00:00.000Z",
      version: 1,
      candidates: [{ loggerSessionCanonicalId: "a" }, { loggerSessionCanonicalId: "b" }],
    }]);
    expect(projected).toEqual([expect.objectContaining({
      id: "healthkit_workout_reconciliation_one",
      kind: "healthkit_workout_reconciliation",
      localDate: "2026-09-23",
      title: "Match Apple Health workout",
      summary: "2 possible Logger sessions",
    })]);
  });

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

  it("uses the Founder timezone when UTC has already crossed into the next day", () => {
    const review = {
      ...nutritionReview("committing"),
      createdAt: "2026-09-17T00:30:00.000Z",
      interpretedEvidence: {
        evidence_objects: [{ evidence_type: "nutrition", observed_at: "2026-09-17T00:30:00.000Z" }],
      },
    };
    const projected = projectProcessingReviews([review], "America/Los_Angeles");
    expect(projected[0].localDate).toBe("2026-09-16");
    const loggedToday = {
      rows: [{ id: "nutrition", summary: "Nothing logged yet", context: null, href: null, recordId: null }],
    };
    expect(overlayAcceptedProcessing(loggedToday, projected, "2026-09-16").rows[0].processing).toBe(true);
  });

  it("does not hide populated multi-session Training when its singular recordId is null", () => {
    const loggedToday = {
      rows: [{
        id: "training", summary: "Traditional Strength Training · Outdoor Walk",
        context: null, href: "/progress/training", recordId: null,
      }],
    };
    const processing = [{ id: "review", localDate: "2026-09-16", domain: "training" }];
    expect(overlayAcceptedProcessing(loggedToday, processing, "2026-09-16").rows[0])
      .toEqual(loggedToday.rows[0]);
  });
});

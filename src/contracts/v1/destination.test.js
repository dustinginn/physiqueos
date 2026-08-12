import { describe, expect, it } from "vitest";
import { createDestination, destinationFromWebHref, destinationToWebHref, DestinationId } from "./destination.js";

describe("typed destination registry", () => {
  const cases = [
    ["/", DestinationId.HOME, {}], ["/log", DestinationId.LOG, {}],
    ["/check-in/morning", DestinationId.CHECK_IN, { checkInType: "morning" }],
    ["/evidence/review/review-1", DestinationId.EVIDENCE_REVIEW, { reviewId: "review-1" }],
    ["/goals/goal-1", DestinationId.GOAL_DETAIL, { goalId: "goal-1" }],
    ["/goals", DestinationId.GOALS, {}],
    ["/goals/transition", DestinationId.GOAL_TRANSITION, {}],
    ["/profile/operating-plan", DestinationId.OPERATING_PLAN, {}],
    ["/profile/operating-plan/strategy/training/protocol-1", DestinationId.OPERATING_PLAN_STRATEGY, { strategyType: "training", strategyId: "protocol-1" }],
    ["/profile/protocols/protocol-1?from=operating-plan", DestinationId.OPERATING_PLAN_SUPPORT, { supportType: "protocol", supportId: "protocol-1" }],
    ["/priorities/priority-1", DestinationId.PRIORITY_DETAIL, { priorityId: "priority-1" }],
    ["/briefings/review/briefing-1", DestinationId.BRIEFING_DETAIL, { briefingId: "briefing-1" }],
    ["/briefings/review", DestinationId.BRIEFING_LIST, {}],
    ["/progress/training/session/session-1", DestinationId.TRAINING_SESSION, { sessionId: "session-1" }],
    ["/progress/training/library/exercise-1", DestinationId.TRAINING_EXERCISE, { exerciseId: "exercise-1" }],
    ["/evidence/photos", DestinationId.PHOTO_UPLOAD, {}], ["/evidence/dexa", DestinationId.DEXA_UPLOAD, {}],
    ["/profile", DestinationId.PROFILE, {}], ["/progress", DestinationId.PROGRESS_STREAM, { streamId: "all" }],
    ["/progress/nutrition/reporting/calories", DestinationId.PROGRESS_STREAM, { streamId: "nutrition/reporting/calories" }],
  ];

  it.each(cases)("maps %s without making the web route canonical", (href, id, parameters) => {
    expect(destinationFromWebHref(href)).toEqual(createDestination(id, parameters));
  });

  it("maps destinations back to current web routes", () => {
    expect(destinationToWebHref(createDestination(DestinationId.TRAINING_SESSION, { sessionId: "session 1" }))).toBe("/progress/training/session/session%201");
    expect(destinationToWebHref(createDestination(DestinationId.OPERATING_PLAN_SUPPORT, { supportType: "tracking", supportId: "current" }))).toBe("/profile/operating-plan/tracking");
  });

  it("rejects unknown and incomplete destinations", () => {
    expect(destinationFromWebHref("https://example.com/log")).toBeNull();
    expect(() => createDestination(DestinationId.PRIORITY_DETAIL)).toThrow("priorityId");
  });
});

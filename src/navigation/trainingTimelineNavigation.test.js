import { describe, expect, it } from "vitest";
import {
  getTrainingRootHref,
  isSafeTrainingReturnPath,
  normalizeTrainingContextId,
  resolveTrainingReturnPath,
  withTrainingTimelineContext,
} from "./trainingTimelineNavigation";

describe("Training timeline navigation", () => {
  it("builds only validated main Training destinations", () => {
    expect(getTrainingRootHref("build-lean-mass")).toBe(
      "/progress/training?context=build-lean-mass"
    );
    expect(getTrainingRootHref("visible-abs")).toBe(
      "/progress/training?context=visible-abs"
    );
    expect(getTrainingRootHref("all")).toBe(
      "/progress/training?context=all"
    );
    expect(getTrainingRootHref(undefined)).toBe("/progress/training");
    expect(getTrainingRootHref("unexpected")).toBe("/progress/training");
    expect(getTrainingRootHref("https://example.com")).toBe(
      "/progress/training"
    );
  });

  it("defaults missing or malformed contexts to All Training", () => {
    expect(normalizeTrainingContextId(undefined)).toBe("all");
    expect(normalizeTrainingContextId("unexpected")).toBe("all");
    expect(normalizeTrainingContextId("visible-abs")).toBe("visible-abs");
  });

  it("preserves the selected context on Training destinations", () => {
    expect(
      withTrainingTimelineContext(
        "/progress/training/library/biceps/spider-curls",
        "visible-abs"
      )
    ).toBe(
      "/progress/training/library/biceps/spider-curls?context=visible-abs"
    );
  });

  it("adds an allowlisted return path only to Workout Detail", () => {
    const returnTo =
      "/progress/training/library/biceps/spider-curls?context=all";
    const href = withTrainingTimelineContext(
      "/progress/training/session/workout-1",
      "all",
      { returnTo }
    );
    expect(href).toContain("context=all");
    expect(href).toContain(`returnTo=${encodeURIComponent(returnTo)}`);
  });

  it("returns from Workout Detail to a date-based Training Day", () => {
    const dayHref = "/progress/training/day/2026-08-10?context=all";
    const href = withTrainingTimelineContext(
      "/progress/training/session/workout-1",
      "all",
      { returnTo: dayHref }
    );
    expect(href).toContain(`returnTo=${encodeURIComponent(dayHref)}`);
    expect(resolveTrainingReturnPath({ contextId: "all", returnTo: dayHref }))
      .toBe(dayHref);
  });

  it("rejects external and nested session return destinations", () => {
    expect(isSafeTrainingReturnPath("https://example.com")).toBe(false);
    expect(
      resolveTrainingReturnPath({
        contextId: "visible-abs",
        returnTo: "https://example.com",
      })
    ).toBe("/progress/training?context=visible-abs");
    expect(
      resolveTrainingReturnPath({
        contextId: "all",
        returnTo: "/progress/training/session/workout-2",
      })
    ).toBe("/progress/training?context=all");
  });
});

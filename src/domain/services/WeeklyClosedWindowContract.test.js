import { describe, expect, it } from "vitest";
import {
  artifactIdForWeeklyWindow,
  createWeeklyClosedWindowContract,
} from "./WeeklyClosedWindowContract";

const valid = {
  cadence: "weekly",
  startDate: "2026-07-19",
  endDate: "2026-07-25",
  briefingDate: "2026-07-26",
  timeZone: "America/Los_Angeles",
  expectedArtifactId: "weekly_briefing_2026-07-19_2026-07-25",
};
const now = new Date("2026-07-27T18:00:00Z");
const create = (patch = {}, at = now) => createWeeklyClosedWindowContract({ ...valid, ...patch }, { now: at });

describe("explicit Weekly closed-window contract", () => {
  it("accepts the canonical July 19-25 window and derives deterministic identity", () => {
    const result = create();
    expect(result).toMatchObject({
      status: "valid",
      contract: {
        expectedArtifactId: "weekly_briefing_2026-07-19_2026-07-25",
        window: { id: "weekly:2026-07-19:2026-07-25:America/Los_Angeles" },
      },
    });
    expect(artifactIdForWeeklyWindow("2026-07-19", "2026-07-25")).toBe(valid.expectedArtifactId);
  });
  it.each([
    [{ startDate: "2026-07-20" }, "start_must_be_sunday"],
    [{ endDate: "2026-07-24" }, "end_must_be_saturday"],
    [{ endDate: "2026-08-01" }, "window_must_span_seven_days"],
    [{ briefingDate: "2026-07-27" }, "briefing_date_must_follow_window"],
    [{ timeZone: "Invalid/Zone" }, "invalid_timezone"],
    [{ timeZone: "UTC" }, "invalid_timezone"],
  ])("rejects malformed weekly periods", (patch, error) => {
    expect(create(patch)).toMatchObject({ errors: expect.arrayContaining([error]), contract: null });
  });
  it("rejects a still-open or future window", () => {
    expect(create({}, new Date("2026-07-25T18:00:00Z"))).toMatchObject({ status: "window_not_closed" });
  });
  it("rejects a supplied artifact identity mismatch", () => {
    expect(create({ expectedArtifactId: "weekly_wrong" })).toMatchObject({ status: "artifact_identity_mismatch" });
  });
});

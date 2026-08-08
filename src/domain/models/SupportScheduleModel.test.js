import { describe, expect, it } from "vitest";
import {
  formatSupportSchedulePreview,
  hydrateSupportSchedule,
  normalizeSupportSchedule,
  supportScheduleToExecution,
  supportScheduleToReminder,
  validateSupportSchedule,
} from "./SupportScheduleModel";
import { scheduleAppliesOnDate } from "../services/ExecutionPriorityProjectionService";

describe("Support schedule model", () => {
  it.each([
    ["daily", { frequency: "daily", startDate: "2026-08-06", timing: "morning" }],
    ["weekly", { frequency: "weekly", daysOfWeek: ["thursday"], startDate: "2026-08-06", timing: "specific", specificTime: "21:45" }],
    ["specific days", { frequency: "specific_days", daysOfWeek: ["monday", "thursday"], startDate: "2026-08-06", timing: "afternoon" }],
    ["every X days", { frequency: "every_x_days", intervalDays: 3, startDate: "2026-08-06", timing: "evening" }],
  ])("normalizes a valid %s schedule", (_label, input) => {
    expect(validateSupportSchedule(input)).toEqual([]);
    expect(supportScheduleToExecution(input).preferredSchedule.startDate).toBe("2026-08-06");
    expect(supportScheduleToReminder(input).timeOfDay).toBe(
      input.timing === "specific" ? input.specificTime : input.timing
    );
  });

  it("preserves local date, exact local time, and an optional end date", () => {
    const schedule = normalizeSupportSchedule({
      frequency: "weekly",
      daysOfWeek: ["thursday"],
      timing: "specific",
      specificTime: "21:45",
      startDate: "2026-05-21",
      endDate: "2026-12-31",
    });
    expect(formatSupportSchedulePreview(schedule)).toBe(
      "Thursdays at 9:45 PM, starting May 21, 2026, ending Dec 31, 2026."
    );
  });

  it("renders an until-changed preview without manufacturing an end date", () => {
    expect(formatSupportSchedulePreview({
      frequency: "daily",
      timing: "morning",
      startDate: "2026-08-06",
    })).toContain("until changed");
  });

  it("hydrates a legacy multi-day weekly schedule as specific days", () => {
    const schedule = hydrateSupportSchedule({
      cadence: { type: "weekly" },
      preferredSchedule: {
        daysOfWeek: ["sunday", "monday", "tuesday", "wednesday", "thursday"],
        timeOfDay: "21:45",
        startDate: "2026-05-24",
        endDate: null,
      },
    });

    expect(schedule).toMatchObject({
      frequency: "specific_days",
      startDate: "2026-05-24",
      timing: "specific",
      specificTime: "21:45",
    });
    expect(formatSupportSchedulePreview(schedule)).toBe(
      "Sun–Thu at 9:45 PM, starting May 24, 2026, until changed."
    );
  });

  it("projects every-X-day occurrences from the date-only anchor", () => {
    const schedule = { type: "every_x_days", anchorDate: "2026-08-06", interval: 3, startDate: "2026-08-06" };
    expect(scheduleAppliesOnDate(schedule, "2026-08-06")).toBe(true);
    expect(scheduleAppliesOnDate(schedule, "2026-08-07")).toBe(false);
    expect(scheduleAppliesOnDate(schedule, "2026-08-09")).toBe(true);
  });
});

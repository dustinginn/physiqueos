import { describe, expect, it } from "vitest";
import { formatGoalStartDate } from "./goalStartDate";

describe("Goal start-date presentation", () => {
  it("presents date-only domain values without a timezone shift", () => {
    expect(formatGoalStartDate("2026-07-20")).toBe("July 20, 2026");
  });

  it("fails closed for absent or malformed values", () => {
    expect(formatGoalStartDate(null)).toBeNull();
    expect(formatGoalStartDate("not-a-date")).toBeNull();
  });
});

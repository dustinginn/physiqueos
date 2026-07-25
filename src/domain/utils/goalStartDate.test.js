import { describe, expect, it } from "vitest";
import { formatGoalStartDate } from "./goalStartDate";

describe("Goal start-date presentation", () => {
  it("presents the canonical UTC date instant in the app timezone", () => {
    expect(formatGoalStartDate("2026-07-20")).toBe("July 19, 2026");
  });

  it("fails closed for absent or malformed values", () => {
    expect(formatGoalStartDate(null)).toBeNull();
    expect(formatGoalStartDate("not-a-date")).toBeNull();
  });
});

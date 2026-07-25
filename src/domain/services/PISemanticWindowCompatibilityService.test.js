import { describe, expect, it } from "vitest";
import { assessPISemanticWindowCompatibility } from "./PISemanticWindowCompatibilityService";

describe("PI semantic window compatibility", () => {
  it.each([
    [window("2026-07-24", "2026-07-24"), window("2026-07-24", "2026-07-24"), "exact_match"],
    [window("2026-07-19", "2026-07-22"), window("2026-07-20", "2026-07-22"), "overlap_only"],
    [window("2026-07-19", "2026-07-22"), window("2026-07-23", "2026-07-25"), "adjacent"],
    [window("2026-07-19", "2026-07-20"), window("2026-07-23", "2026-07-25"), "disjoint"],
    [null, window("2026-07-23", "2026-07-25"), "unknown"],
  ])("classifies %s deterministically", (left, right, expected) => {
    const result = assessPISemanticWindowCompatibility(left, right);
    expect(result.state).toBe(expected);
    expect(result.authoritativeEligible).toBe(expected === "exact_match");
    expect(result).toMatchObject({ repositoryReads: 0, runtimeClockReads: 0 });
  });

  it("rejects otherwise exact windows with different timezones", () => {
    expect(assessPISemanticWindowCompatibility(
      window("2026-07-24", "2026-07-24", "America/Los_Angeles"),
      window("2026-07-24", "2026-07-24", "UTC")
    ).state).toBe("unknown");
  });
});
function window(startDate, endDate, timeZone = "America/Los_Angeles") {
  return { startDate, endDate, timeZone };
}

import { describe, expect, it } from "vitest";
import { COMBINED_CUTOVER_AP_MAP } from "./combinedCutoverAPMap.js";

describe("source-owned A-P phase map", () => {
  it("defines every letter exactly once in order", () => {
    expect(COMBINED_CUTOVER_AP_MAP.map((entry) => entry.letter)).toEqual("ABCDEFGHIJKLMNOP".split(""));
  });
  it("keeps B/L/M/N/O approval-bound and M onward irreversible", () => {
    expect(COMBINED_CUTOVER_AP_MAP.filter((entry) => entry.founderAuthorizationRequired).map((entry) => entry.letter)).toEqual(["B","L","M","N","O"]);
    expect(COMBINED_CUTOVER_AP_MAP.filter((entry) => entry.irreversible).map((entry) => entry.letter)).toEqual(["M","N","O","P"]);
  });
  it("does not treat P as a sleep timer", () => {
    expect(COMBINED_CUTOVER_AP_MAP.find((entry) => entry.letter === "P").recovery).toContain("Explicit health/readiness");
  });
});

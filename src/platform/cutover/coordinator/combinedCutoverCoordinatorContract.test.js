import { describe, expect, it } from "vitest";
import { validateCoordinatorRunState } from "./combinedCutoverCoordinatorContract.js";

const base = Object.freeze({
  schemaVersion: 1,
  currentStep: "C_D",
  stepStatus: "NOT_STARTED",
  completedSteps: ["A", "B"],
  bSnapshot: { safe: true },
  bSnapshotDigest: "a".repeat(64),
  mBoundaryCrossed: false,
  failureCode: null,
});

describe("coordinator durable state validation", () => {
  it("accepts an exact A-P prefix", () => {
    expect(validateCoordinatorRunState(base)).toBe(base);
  });

  it.each([
    ["B before A", { completedSteps: ["B"], currentStep: "A", bSnapshot: null, bSnapshotDigest: null }],
    ["skipped C/D", { completedSteps: ["A", "B", "E"], currentStep: "C_D" }],
    ["duplicate B", { completedSteps: ["A", "B", "B"], currentStep: "C_D" }],
    ["current phase drift", { currentStep: "L" }],
    ["M marker without M", { mBoundaryCrossed: true }],
    ["M without marker", { completedSteps: ["A", "B", "C_D", "E", "F_G", "H_I_J", "K", "L", "M"], currentStep: "N_O", mBoundaryCrossed: false }],
    ["B completion without snapshot", { bSnapshot: null, bSnapshotDigest: null }],
  ])("fails closed for %s", (_label, patch) => {
    expect(() => validateCoordinatorRunState({ ...base, ...patch })).toThrow(expect.objectContaining({ code: "COORDINATOR_IDENTITY_MISMATCH" }));
  });
});

import { describe, expect, it } from "vitest";
import { founderOperatingRhythm } from "../../data/founderSeed/operatingRhythm.js";
import { addFounderNoncanonicalReadContext } from "./phase4PostgresComposition.js";

describe("Phase 4 noncanonical read context", () => {
  it("preserves the Founder operating-rhythm read projection without inventing persisted collections", () => {
    const canonicalRuntime = Object.freeze({ user: { id: founderOperatingRhythm.userId }, goals: [] });
    const composed = addFounderNoncanonicalReadContext(canonicalRuntime, founderOperatingRhythm.userId);
    expect(composed.operatingRhythm).toBe(founderOperatingRhythm);
    expect(composed).not.toHaveProperty("adaptiveTrustProfile");
    expect(composed).not.toHaveProperty("milestones");
    expect(canonicalRuntime).not.toHaveProperty("operatingRhythm");
  });

  it("does not apply Founder-specific context to another owner", () => {
    const canonicalRuntime = Object.freeze({ user: { id: "another-user" }, goals: [] });
    expect(addFounderNoncanonicalReadContext(canonicalRuntime, "another-user")).toBe(canonicalRuntime);
  });
});

import { describe, expect, test } from "vitest";
import { classifyEvidenceAuthority, DirectOutcomeAuthority } from "./EvidenceAuthorityService.js";

describe("classifyEvidenceAuthority — default table (documentation/fixtures only)", () => {
  test("DEXA is authoritative_direct for a lean-mass Goal", () => {
    const result = classifyEvidenceAuthority({ evidenceDomain: "dexa", goalOutcomeMetric: "lean_mass" });
    expect(result.directOutcomeAuthority).toBe(DirectOutcomeAuthority.AUTHORITATIVE_DIRECT);
    expect(result.source).toBe("default_table");
  });
  test("scale weight is high_frequency_direct", () => {
    expect(classifyEvidenceAuthority({ evidenceDomain: "weight", goalOutcomeMetric: "body_weight" }).directOutcomeAuthority).toBe(DirectOutcomeAuthority.HIGH_FREQUENCY_DIRECT);
  });
  test("training is supporting_proxy by default", () => {
    expect(classifyEvidenceAuthority({ evidenceDomain: "training", goalOutcomeMetric: "lean_mass" }).directOutcomeAuthority).toBe(DirectOutcomeAuthority.SUPPORTING_PROXY);
  });
  test("nutrition is behavioral", () => {
    expect(classifyEvidenceAuthority({ evidenceDomain: "nutrition" }).directOutcomeAuthority).toBe(DirectOutcomeAuthority.BEHAVIORAL);
  });
  test("unresolvable domain returns null, never a guessed default", () => {
    const result = classifyEvidenceAuthority({ evidenceDomain: "unknown_future_domain" });
    expect(result.directOutcomeAuthority).toBe(null);
    expect(result.source).toBe("unresolved");
  });
  test("no domain at all returns unresolved without throwing", () => {
    expect(classifyEvidenceAuthority({}).directOutcomeAuthority).toBe(null);
  });
});

describe("Goal-declared overrides always win — authority is Goal/evidence-pair specific, not fixed domain prestige", () => {
  test("a strength Goal can declare training as authoritative_direct for its own metric", () => {
    const result = classifyEvidenceAuthority({
      evidenceDomain: "training",
      goalOutcomeMetric: "one_rep_max",
      goalAuthorityOverrides: { "training:one_rep_max": DirectOutcomeAuthority.AUTHORITATIVE_DIRECT },
    });
    expect(result.directOutcomeAuthority).toBe(DirectOutcomeAuthority.AUTHORITATIVE_DIRECT);
    expect(result.source).toBe("goal_declared");
  });
  test("the SAME evidence domain remains supporting_proxy for a different Goal's metric with no override", () => {
    const result = classifyEvidenceAuthority({ evidenceDomain: "training", goalOutcomeMetric: "lean_mass" });
    expect(result.directOutcomeAuthority).toBe(DirectOutcomeAuthority.SUPPORTING_PROXY);
  });
  test("a wildcard override downgrades an entire domain for one Goal without touching the shared default table", () => {
    const result = classifyEvidenceAuthority({
      evidenceDomain: "dexa",
      goalOutcomeMetric: "lean_mass",
      goalAuthorityOverrides: { "dexa:*": DirectOutcomeAuthority.SUPPORTING_PROXY },
    });
    expect(result.directOutcomeAuthority).toBe(DirectOutcomeAuthority.SUPPORTING_PROXY);
    // Default table itself is frozen and therefore provably untouched.
    expect(classifyEvidenceAuthority({ evidenceDomain: "dexa", goalOutcomeMetric: "lean_mass" }).directOutcomeAuthority).toBe(DirectOutcomeAuthority.AUTHORITATIVE_DIRECT);
  });
});

describe("genericity", () => {
  test("no Build-Lean-Mass or Establish-Maintenance literal in source", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync(new URL("./EvidenceAuthorityService.js", import.meta.url), "utf8");
    expect(source).not.toMatch(/build[_ -]?lean[_ -]?mass/i);
    expect(source).not.toMatch(/establish[_ -]?maintenance/i);
  });
});

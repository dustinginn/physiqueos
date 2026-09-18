import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { classifyEvidenceAuthority, DirectOutcomeAuthority } from "./EvidenceAuthorityService.js";

describe("classifyEvidenceAuthority — default table (documentation/fixtures only)", () => {
  test("DEXA is authoritative_direct for a lean-mass Goal", () => {
    const result = classifyEvidenceAuthority({ evidenceDomain: "dexa", goalOutcomeMetric: "lean_mass" });
    assert.equal(result.directOutcomeAuthority, DirectOutcomeAuthority.AUTHORITATIVE_DIRECT);
    assert.equal(result.source, "default_table");
  });
  test("scale weight is high_frequency_direct", () => {
    assert.equal(
      classifyEvidenceAuthority({ evidenceDomain: "weight", goalOutcomeMetric: "body_weight" }).directOutcomeAuthority,
      DirectOutcomeAuthority.HIGH_FREQUENCY_DIRECT
    );
  });
  test("training is supporting_proxy by default", () => {
    assert.equal(
      classifyEvidenceAuthority({ evidenceDomain: "training", goalOutcomeMetric: "lean_mass" }).directOutcomeAuthority,
      DirectOutcomeAuthority.SUPPORTING_PROXY
    );
  });
  test("nutrition is behavioral", () => {
    assert.equal(
      classifyEvidenceAuthority({ evidenceDomain: "nutrition" }).directOutcomeAuthority,
      DirectOutcomeAuthority.BEHAVIORAL
    );
  });
  test("unresolvable domain returns null, never a guessed default", () => {
    const result = classifyEvidenceAuthority({ evidenceDomain: "unknown_future_domain" });
    assert.equal(result.directOutcomeAuthority, null);
    assert.equal(result.source, "unresolved");
  });
  test("no domain at all returns unresolved without throwing", () => {
    assert.equal(classifyEvidenceAuthority({}).directOutcomeAuthority, null);
  });
});

describe("Goal-declared overrides always win — authority is Goal/evidence-pair specific, not fixed domain prestige", () => {
  test("a strength Goal can declare training as authoritative_direct for its own metric", () => {
    const result = classifyEvidenceAuthority({
      evidenceDomain: "training",
      goalOutcomeMetric: "one_rep_max",
      goalAuthorityOverrides: { "training:one_rep_max": DirectOutcomeAuthority.AUTHORITATIVE_DIRECT },
    });
    assert.equal(result.directOutcomeAuthority, DirectOutcomeAuthority.AUTHORITATIVE_DIRECT);
    assert.equal(result.source, "goal_declared");
  });
  test("the SAME evidence domain remains supporting_proxy for a different Goal's metric with no override", () => {
    const result = classifyEvidenceAuthority({ evidenceDomain: "training", goalOutcomeMetric: "lean_mass" });
    assert.equal(result.directOutcomeAuthority, DirectOutcomeAuthority.SUPPORTING_PROXY);
  });
  test("a wildcard override downgrades an entire domain for one Goal without touching the shared default table", () => {
    const result = classifyEvidenceAuthority({
      evidenceDomain: "dexa",
      goalOutcomeMetric: "lean_mass",
      goalAuthorityOverrides: { "dexa:*": DirectOutcomeAuthority.SUPPORTING_PROXY },
    });
    assert.equal(result.directOutcomeAuthority, DirectOutcomeAuthority.SUPPORTING_PROXY);
    // Default table itself is frozen and therefore provably untouched.
    assert.equal(
      classifyEvidenceAuthority({ evidenceDomain: "dexa", goalOutcomeMetric: "lean_mass" }).directOutcomeAuthority,
      DirectOutcomeAuthority.AUTHORITATIVE_DIRECT
    );
  });
});

describe("genericity", () => {
  test("no Build-Lean-Mass or Establish-Maintenance literal in source", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync(new URL("./EvidenceAuthorityService.js", import.meta.url), "utf8");
    assert.doesNotMatch(source, /build[_ -]?lean[_ -]?mass/i);
    assert.doesNotMatch(source, /establish[_ -]?maintenance/i);
  });
});

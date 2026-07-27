import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync("scripts/midweekControlledRegeneration.js", "utf8");

describe("controlled Midweek regeneration command", () => {
  it("is dry-run by default and requires exact guards plus explicit execution", () => {
    for (const value of [
      '"target-artifact-id"', '"expected-hash"', '"expected-revision"',
      '"expected-target-digest"', '"reason"', '"backup-path"',
    ]) expect(source).toContain(value);
    expect(source).toContain('item === "--execute"');
    expect(source).toContain('mode: "dry_run"');
  });

  it("uses prepared canonical regeneration once without retry or catch-up", () => {
    expect(source).toContain("prepareRegeneration");
    expect(source).toContain("executePreparedRegeneration");
    expect(source).toContain("semanticScope");
    expect(source).not.toMatch(/catchUp|retry|setTimeout|generateForCurrentWindow/);
  });
});

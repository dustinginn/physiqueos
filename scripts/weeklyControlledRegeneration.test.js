import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.resolve(process.cwd(), "scripts/weeklyControlledRegeneration.js"),
  "utf8"
);

describe("controlled Weekly regeneration command", () => {
  it("defaults to dry-run and requires explicit execute", () => {
    expect(source).toContain('mode: "dry_run"');
    expect(source).toContain('item === "--execute"');
  });

  it("requires the exact baseline and target digest", () => {
    expect(source).toContain('"expected-hash"');
    expect(source).toContain('"expected-revision"');
    expect(source).toContain('"expected-target-digest"');
    expect(source).toContain('"target-artifact-id"');
  });

  it("uses only prepared canonical regeneration without retry or catch-up", () => {
    expect(source).toContain("prepareRegeneration");
    expect(source).toContain("executePreparedRegeneration");
    expect(source).not.toMatch(/catchUp|retry|setTimeout|generateForCurrentWindow/);
  });
});

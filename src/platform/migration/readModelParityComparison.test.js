// Focused smoke coverage for the relocated parity-comparison module itself. The exhaustive
// scenario matrix (volatile-field exclusion, frozen-clock equivalence, resourceVersion alignment,
// bounded/non-dumping diagnostics, and every "genuine difference still fails" case) already lives
// in scripts/productionMigrationEnvironmentAdapters.test.js, which now imports these exact exports
// via that script's backward-compatible re-export - so it continues to prove this implementation
// directly rather than a copy. This file only proves the module is independently importable and
// wired correctly, without re-duplicating that full suite.
import { describe, expect, it } from "vitest";
import {
  computeBoundedSemanticDifference,
  compareRepresentativeReads,
  readModelsSemanticallyEqual,
  semanticReadModelProjection,
} from "./readModelParityComparison.js";
import { createApplicationReadModel } from "../../application/read-models/readModel.js";
import { createPhase3ReadModelService } from "../../application/read-models/Phase3ReadModelService.js";

function envelope(overrides = {}) {
  return createApplicationReadModel({ model: "home.v1", data: { greeting: "hi" }, ...overrides });
}

describe("readModelParityComparison (relocated module)", () => {
  it("semanticReadModelProjection excludes exactly generatedAt/freshThrough/etag", () => {
    const projected = semanticReadModelProjection(envelope());
    expect(projected).not.toHaveProperty("generatedAt");
    expect(projected).not.toHaveProperty("freshThrough");
    expect(projected).not.toHaveProperty("etag");
    expect(projected).toMatchObject({ contractVersion: "1", model: "home.v1" });
  });

  it("readModelsSemanticallyEqual passes despite differing generatedAt and fails on real data differences", () => {
    expect(readModelsSemanticallyEqual(
      envelope({ generatedAt: "2026-01-01T00:00:00.000Z" }),
      envelope({ generatedAt: "2026-01-02T00:00:00.000Z" }),
    )).toBe(true);
    expect(readModelsSemanticallyEqual(envelope({ data: { greeting: "hi" } }), envelope({ data: { greeting: "bye" } }))).toBe(false);
  });

  it("computeBoundedSemanticDifference reports a bounded, path-only diagnostic", () => {
    const { differingPaths, truncated } = computeBoundedSemanticDifference({ a: 1 }, { a: 2 });
    expect(truncated).toBe(false);
    expect(differingPaths).toEqual([{ path: "$.a", kind: "value-mismatch", leftType: "number", rightType: "number" }]);
  });

  it("compareRepresentativeReads passes under a shared frozen clock and fails on a genuine mismatch", async () => {
    const runtime = { user: { timeZone: "UTC" }, evidenceReviews: [], executionItems: [] };
    const principal = { userId: "founder", deviceId: "d", sessionId: "s" };
    const now = () => new Date("2026-01-01T00:00:00.000Z");
    const loaders = (label) => Object.fromEntries([
      "home.v1", "log.v1", "evidence-review.v1", "goals.v1", "operating-plan.v1", "priorities.v1",
      "progress.v1", "confidence.v1", "briefings.v1", "training.v1", "profile.v1",
    ].map((model) => [model, async () => ({ label })]));

    const passing = await compareRepresentativeReads({
      legacy: createPhase3ReadModelService({ loaders: loaders("same"), now }),
      postgres: createPhase3ReadModelService({ loaders: loaders("same"), now }),
      principal, runtime,
    });
    expect(Object.values(passing).every((value) => value === "pass")).toBe(true);

    await expect(compareRepresentativeReads({
      legacy: createPhase3ReadModelService({ loaders: loaders("left"), now }),
      postgres: createPhase3ReadModelService({ loaders: loaders("right"), now }),
      principal, runtime,
    })).rejects.toThrow("Application read parity failed for home.");
  });
});

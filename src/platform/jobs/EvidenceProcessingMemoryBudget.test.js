import { describe, expect, it } from "vitest";
import {
  createEvidenceProcessingMemoryBudget,
  resetSharedEvidenceProcessingMemoryBudgetForTests,
} from "./EvidenceProcessingMemoryBudget.js";

describe("evidence processing memory admission", () => {
  it("serializes concurrent high-memory work and reports measured headroom", async () => {
    resetSharedEvidenceProcessingMemoryBudgetForTests();
    let rss = 200;
    let active = 0;
    let maximumActive = 0;
    const state = { tail: Promise.resolve(), active: 0 };
    const budget = createEvidenceProcessingMemoryBudget({
      serviceLimitBytes: 1_000,
      targetFraction: 0.75,
      hardFraction: 0.85,
      maximumWaitMs: 5_000,
      sampleMemory: () => ({ rss, heapUsed: rss / 2 }),
      state,
    });
    const task = async (name) => budget.run({ operation: name, estimatedWorkingSetBytes: 300 }, async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      rss += 200;
      await Promise.resolve();
      rss -= 200;
      active -= 1;
      return name;
    });
    const [first, second] = await Promise.all([task("dexa"), task("cadence")]);
    expect([first.value, second.value]).toEqual(["dexa", "cadence"]);
    expect(maximumActive).toBe(1);
    expect(first.measurement.peakRssFraction).toBeLessThanOrEqual(0.75);
    expect(second.measurement.serialized).toBe(true);
  });

  it("fails retryably before allocation when projected RSS exceeds the target", async () => {
    const budget = createEvidenceProcessingMemoryBudget({
      serviceLimitBytes: 1_000,
      targetFraction: 0.70,
      hardFraction: 0.85,
      sampleMemory: () => ({ rss: 600, heapUsed: 300 }),
      state: { tail: Promise.resolve(), active: 0 },
    });
    await expect(budget.run({
      operation: "dexa-briefing",
      estimatedWorkingSetBytes: 150,
    }, async () => "never"))
      .rejects.toMatchObject({
        code: "EVIDENCE_PROCESSING_MEMORY_BUDGET_DEFERRED",
        retryable: true,
      });
  });
});

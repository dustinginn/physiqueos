import { describe, expect, it, vi } from "vitest";
import {
  advanceComposition, COMPOSITION_RUN_ID, createProductionCoordinatorCompositionHarness,
} from "./testSupport/productionCoordinatorCompositionHarness.js";

describe("local production coordinator composition harness", () => {
  it("runs A-P through the real coordinator and PostgreSQL CAS store without live I/O", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("LIVE_NETWORK_DISABLED"));
    try {
      const harness = await createProductionCoordinatorCompositionHarness();
      for (let count = 0; count < 11; count += 1) await advanceComposition(harness);
      const report = await harness.coordinator.inspect({ runId: COMPOSITION_RUN_ID, input: harness.input });
      expect(report).toMatchObject({ durablePhase: "COMPLETE", mOccurred: true, routingRole: "provider", workerRole: "provider" });
      expect(report.completedSteps).toEqual(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P"]);
      expect(harness.postgres.mutationCount()).toBeGreaterThan(11);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });

  it("uses PostgreSQL-store CAS to allow one same-version advancement", async () => {
    const harness = await createProductionCoordinatorCompositionHarness();
    const results = await Promise.allSettled([advanceComposition(harness), advanceComposition(harness)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")[0].reason).toMatchObject({ code: "COORDINATOR_STALE_STATE" });
    expect(harness.deterministic.counts().A).toBe(1);
  });
});

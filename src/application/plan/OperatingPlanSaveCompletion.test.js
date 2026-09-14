import { describe, expect, it, vi } from "vitest";
import { finishDurableOperatingPlanSave } from "./OperatingPlanSaveCompletion.js";

describe("Operating Plan durable save completion", () => {
  it("deduplicates and refreshes every derived read surface after durability", () => {
    const revalidate = vi.fn();
    const result = finishDurableOperatingPlanSave({
      paths: ["/profile/operating-plan", "/", "/"],
      revalidate,
    });

    expect(result).toEqual({ refreshed: true, failedPaths: [] });
    expect(revalidate.mock.calls).toEqual([
      ["/profile/operating-plan", "page"],
      ["/", "page"],
    ]);
  });

  it("preserves durable success when a derived refresh fails", () => {
    const result = finishDurableOperatingPlanSave({
      paths: ["/profile/operating-plan", "/", "/priorities/reminder"],
      revalidate(path) {
        if (path === "/") throw new Error("refresh unavailable");
      },
    });

    expect(result).toEqual({ refreshed: false, failedPaths: ["/"] });
  });
});

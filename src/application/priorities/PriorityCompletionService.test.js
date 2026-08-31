import { describe, expect, it, vi } from "vitest";
import { createPriorityCompletionService } from "./PriorityCompletionService.js";

describe("PriorityCompletionService", () => {
  it("uses one bounded reminder-only mutation", async () => {
    const mutateCanonicalRuntime = vi.fn(async (options) => {
      const candidate = { reminders: [{ id: "reminder", active: true }] };
      const result = await options.mutate(candidate);
      return { result, changedCollections: ["reminders"], revision: 2 };
    });
    const result = await createPriorityCompletionService({
      mutateCanonicalRuntime,
      now: () => new Date("2026-08-31T12:00:00Z"),
    }).complete({ priorityId: "reminder" });
    expect(result.status).toBe("completed");
    expect(result.completion.completedAt).toBe("2026-08-31T12:00:00.000Z");
    expect(mutateCanonicalRuntime).toHaveBeenCalledWith(expect.objectContaining({
      allowedCollections: ["reminders"],
      readCollections: ["reminders"],
      readApplicationContext: false,
      readImportMetadata: false,
    }));
  });

  it("preserves deterministic scheduled completion identity and JSON-safe evidence linkage", async () => {
    let candidate;
    const mutateCanonicalRuntime = async (options) => {
      candidate = { reminders: [{ id: "reminder", active: true }] };
      const result = await options.mutate(candidate);
      return { result, changedCollections: ["reminders"] };
    };
    await createPriorityCompletionService({ mutateCanonicalRuntime }).complete({
      priorityId: "reminder",
      occurrenceDate: "2026-08-31",
      dose: "0.5 mg",
      protocolId: "protocol",
    });
    expect(candidate.reminders[0]).toMatchObject({
      completedByEvidenceId: null,
      completionHistory: [{ id: "reminder:2026-08-31", canonicalEvidenceId: null }],
    });
    expect(JSON.stringify(candidate)).not.toContain("undefined");
  });

  it("returns an idempotent result without rewriting a same-date completion", async () => {
    const original = {
      id: "reminder",
      active: true,
      completedAt: "2026-08-31T15:12:06.241Z",
    };
    const mutateCanonicalRuntime = vi.fn(async (options) => {
      const candidate = { reminders: [structuredClone(original)] };
      const before = JSON.stringify(candidate);
      const result = await options.mutate(candidate);
      return {
        result,
        changedCollections: before === JSON.stringify(candidate) ? [] : ["reminders"],
        revision: 10,
      };
    });
    const result = await createPriorityCompletionService({
      mutateCanonicalRuntime,
      now: () => new Date("2026-08-31T16:00:00Z"),
    }).complete({
      priorityId: "reminder",
      occurrenceDate: "2026-08-31",
      timeZone: "America/Los_Angeles",
    });

    expect(result).toMatchObject({
      status: "already_completed",
      changedCollections: [],
      completion: { completedAt: original.completedAt },
    });
  });

  it("allows a genuinely new occurrence without treating the prior day as complete", async () => {
    let candidate;
    const mutateCanonicalRuntime = async (options) => {
      candidate = {
        reminders: [{
          id: "reminder",
          active: true,
          completedAt: "2026-08-30T16:00:00Z",
        }],
      };
      const result = await options.mutate(candidate);
      return { result, changedCollections: ["reminders"], revision: 11 };
    };
    const result = await createPriorityCompletionService({
      mutateCanonicalRuntime,
      now: () => new Date("2026-08-31T16:00:00Z"),
    }).complete({
      priorityId: "reminder",
      occurrenceDate: "2026-08-31",
      timeZone: "America/Los_Angeles",
    });

    expect(result.status).toBe("completed");
    expect(candidate.reminders[0].completedAt).toBe("2026-08-31T16:00:00.000Z");
  });
});

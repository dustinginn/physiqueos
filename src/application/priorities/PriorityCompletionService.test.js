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
});

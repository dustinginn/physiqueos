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
    expect(result.completion.completionHistory).toEqual([
      expect.objectContaining({
        id: "reminder:2026-08-31",
        occurrenceDate: "2026-08-31",
        satisfactionType: "manual_priority_completion",
      }),
    ]);
    expect(mutateCanonicalRuntime).toHaveBeenCalledWith(expect.objectContaining({
      allowedCollections: ["reminders"],
      readCollections: ["reminders", "executionItems"],
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
    expect(candidate.reminders[0].completionHistory).toEqual([
      expect.objectContaining({ id: "reminder:2026-08-31" }),
    ]);
  });

  it("preserves earlier occurrence history when a later day completes", async () => {
    let candidate;
    const mutateCanonicalRuntime = async (options) => {
      candidate = {
        reminders: [{
          id: "reminder",
          active: true,
          completedAt: "2026-08-30T16:00:00Z",
          completionHistory: [{
            id: "reminder:2026-08-30",
            occurrenceDate: "2026-08-30",
            completedAt: "2026-08-30T16:00:00Z",
          }],
        }],
      };
      return { result: await options.mutate(candidate), changedCollections: ["reminders"] };
    };

    await createPriorityCompletionService({
      mutateCanonicalRuntime,
      now: () => new Date("2026-08-31T16:00:00Z"),
    }).complete({ priorityId: "reminder", occurrenceDate: "2026-08-31" });

    expect(candidate.reminders[0].completionHistory.map((item) => item.id)).toEqual([
      "reminder:2026-08-30",
      "reminder:2026-08-31",
    ]);
  });

  it("serializes concurrent same-occurrence completion into one canonical history record", async () => {
    let state = { reminders: [{ id: "reminder", active: true }] };
    let queue = Promise.resolve();
    const mutateCanonicalRuntime = (options) => {
      const operation = queue.then(async () => {
        const candidate = structuredClone(state);
        const before = JSON.stringify(candidate);
        const result = await options.mutate(candidate);
        state = candidate;
        return {
          result,
          changedCollections: before === JSON.stringify(candidate) ? [] : ["reminders"],
        };
      });
      queue = operation.then(() => undefined, () => undefined);
      return operation;
    };
    const service = createPriorityCompletionService({
      mutateCanonicalRuntime,
      now: () => new Date("2026-08-31T16:00:00Z"),
    });

    const results = await Promise.all([
      service.complete({ priorityId: "reminder", occurrenceDate: "2026-08-31" }),
      service.complete({ priorityId: "reminder", occurrenceDate: "2026-08-31" }),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([
      "already_completed",
      "completed",
    ]);
    expect(state.reminders[0].completionHistory).toHaveLength(1);
  });
});

describe("PriorityCompletionService honours peptide pause windows (S3)", () => {
  function candidateWith(scheduleSuspensions) {
    return {
      reminders: [{ id: "reminder", type: "protocol_reminder", linkedEntityId: "protocol", active: true }],
      executionItems: [{
        id: "execution", type: "peptide", protocolRootId: "protocol", active: true,
        ...(scheduleSuspensions === undefined ? {} : { scheduleSuspensions }),
      }],
    };
  }

  it("refuses a paused occurrence with PRIORITY_OCCURRENCE_PAUSED (422) before touching the reminder", async () => {
    const candidate = candidateWith([{ pausedFrom: "2026-08-31", resumedOn: null }]);
    const before = JSON.stringify(candidate);
    const mutateCanonicalRuntime = vi.fn(async (options) => ({ result: await options.mutate(candidate), changedCollections: [] }));
    await expect(createPriorityCompletionService({
      mutateCanonicalRuntime, now: () => new Date("2026-08-31T16:00:00Z"),
    }).complete({ priorityId: "reminder", occurrenceDate: "2026-08-31", dose: "0.25 mg", protocolId: "protocol" }))
      .rejects.toMatchObject({ code: "PRIORITY_OCCURRENCE_PAUSED", status: 422, pausedFrom: "2026-08-31" });
    expect(JSON.stringify(candidate)).toBe(before);
    expect(mutateCanonicalRuntime).toHaveBeenCalledWith(expect.objectContaining({
      allowedCollections: ["reminders"],
      readCollections: ["reminders", "executionItems"],
    }));
  });

  it("completes outside the window, on the resumedOn day, and when the record carries no windows", async () => {
    for (const [windows, date] of [
      [[{ pausedFrom: "2026-09-01", resumedOn: null }], "2026-08-31"],
      [[{ pausedFrom: "2026-08-20", resumedOn: "2026-08-31" }], "2026-08-31"],
      [undefined, "2026-08-31"],
    ]) {
      const candidate = candidateWith(windows);
      const result = await createPriorityCompletionService({
        mutateCanonicalRuntime: async (options) => ({ result: await options.mutate(candidate), changedCollections: ["reminders"] }),
        now: () => new Date("2026-08-31T16:00:00Z"),
      }).complete({ priorityId: "reminder", occurrenceDate: date, dose: "0.25 mg", protocolId: "protocol" });
      expect(result.status).toBe("completed");
      expect(candidate.reminders[0].completionHistory).toEqual([expect.objectContaining({ id: `reminder:${date}` })]);
    }
  });
});

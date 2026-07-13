import { describe, expect, it } from "vitest";
import { createReminderRepository } from "../../data/repositories/ReminderRepository";
import { createDEXAInterpretation } from "./DEXAInterpretationService";

describe("real downstream execution", () => {
  it("persists one canonical-evidence completion and remains idempotent", async () => {
    const repository = createReminderRepository([{ id: "reminder_morning_weight", userId: "user" }]);
    const completion = { id: "completion_1", completedAt: "2026-07-12T12:00:00.000Z", canonicalEvidenceId: "weight_1" };
    await repository.completeReminderFromEvidence("reminder_morning_weight", completion);
    await repository.completeReminderFromEvidence("reminder_morning_weight", completion);
    const reminder = await repository.getReminderById("reminder_morning_weight");
    expect(reminder.completionHistory).toHaveLength(1);
    expect(reminder.completedByEvidenceId).toBe("weight_1");
  });

  it("creates a stable rich DEXA interpretation with confirmed deltas", () => {
    const current = { canonicalId: "dexa_2", lastObservedAt: "2026-07-12", updatedAt: "v2", payload: { observed_at: "2026-07-12", metadata: { bodyFatPercentage: 10, leanMass: 150, restingMetabolicRate: 1800 }, source_file: "scan.pdf" } };
    const prior = { canonicalId: "dexa_1", lastObservedAt: "2026-06-12", payload: { metadata: { bodyFatPercentage: 11, leanMass: 149 } } };
    const first = createDEXAInterpretation({ canonicalScan: current, priorScan: prior });
    const second = createDEXAInterpretation({ canonicalScan: current, priorScan: prior });
    expect(first.id).toBe(second.id);
    expect(first.metadata.deltas).toEqual({ bodyFatPercentage: -1, leanMass: 1 });
    expect(first.metadata.sourceFile).toBe("scan.pdf");
  });
});

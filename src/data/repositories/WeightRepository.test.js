import { describe, expect, it } from "vitest";
import { createWeightRepository } from "./WeightRepository.js";
import {
  canonicalWeightDate,
  canonicalWeightEntryId,
} from "../../domain/weight/canonicalWeight.js";

describe("WeightRepository canonical day semantics", () => {
  it("returns one deterministic correction per user and measured calendar day", async () => {
    const entries = [
      weightEntry({ id: "weight_legacy_old", value: 168.4, updatedAt: "2026-09-01T14:00:00.000Z" }),
      weightEntry({ id: "weight_legacy_corrected", value: 169.1, updatedAt: "2026-09-01T15:00:00.000Z" }),
      weightEntry({ id: "weight_other_day", date: "2026-08-30", value: 169.5 }),
      weightEntry({ id: "weight_other_user", userId: "other-user", value: 200 }),
    ];
    const repository = createWeightRepository(entries);

    await expect(repository.listWeightEntries("user")).resolves.toEqual([
      expect.objectContaining({ id: "weight_other_day" }),
      expect.objectContaining({ id: "weight_legacy_corrected", weight: { value: 169.1, unit: "lb" } }),
    ]);
    await expect(repository.getLatestWeightEntry("user")).resolves.toMatchObject({
      id: "weight_legacy_corrected",
      weight: { value: 169.1, unit: "lb" },
    });
  });

  it("replaces a same-day value with one canonical id and correction history", async () => {
    const entries = [weightEntry({ id: "weight_submission_old", value: 168.4 })];
    const repository = createWeightRepository(entries);

    await repository.addWeightEntry(weightEntry({
      id: "weight_2026_08_31",
      value: 169.1,
      updatedAt: "2026-09-01T16:00:00.000Z",
    }));

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: "weight_2026_08_31",
      weight: { value: 169.1, unit: "lb" },
      correctionHistory: [
        expect.objectContaining({ previousEntry: expect.objectContaining({ id: "weight_submission_old" }) }),
      ],
    });
  });

  it("owns the explicit calendar prefix even in a timezone far ahead of UTC", () => {
    const measuredAt = "2026-01-01T00:15:00+14:00";
    expect(canonicalWeightDate(measuredAt)).toBe("2026-01-01");
    expect(canonicalWeightEntryId(measuredAt)).toBe("weight_2026_01_01");
  });
});

function weightEntry({
  id,
  userId = "user",
  date = "2026-08-31",
  value,
  updatedAt = "2026-09-01T14:00:00.000Z",
}) {
  return {
    id,
    userId,
    measuredAt: date,
    weight: { value, unit: "lb" },
    createdAt: "2026-09-01T13:00:00.000Z",
    updatedAt,
  };
}

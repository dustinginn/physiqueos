import { describe, expect, it, vi } from "vitest";
import {
  RECOVERY_EVIDENCE_WINDOW_LIMIT,
  createCanonicalEvidenceRepository,
} from "./CanonicalEvidenceRepository";
import {
  createCanonicalRecoveryEvidenceObject,
  createRecoveryEvidenceRecord,
} from "../../domain/models/RecoveryEvidenceModel";

describe("canonical Recovery evidence repository", () => {
  it("saves, reads, filters, bounds, isolates users, and orders deterministically", async () => {
    const objects = [];
    const repository = createCanonicalEvidenceRepository(objects);
    await repository.saveRecoveryEvidence(record({ metric: "soreness", value: "mild", unit: "category" }));
    await repository.saveRecoveryEvidence(record());
    await repository.saveRecoveryEvidence(record({ userId: "other", sourceRecordId: "other:sleep" }));
    expect(await repository.listRecoveryEvidenceInWindow("user", window(), {
      metrics: ["sleep_duration"],
      limit: 1,
    })).toMatchObject([{ metric: "sleep_duration", userId: "user" }]);
    expect(await repository.listRecoveryEvidenceInWindow("other", window()))
      .toHaveLength(1);
    expect(() => repository.listRecoveryEvidenceInWindow("user", window(), {
      limit: RECOVERY_EVIDENCE_WINDOW_LIMIT + 1,
    })).rejects.toThrow("cannot exceed");
  });

  it("collapses exact retries and rejects an implicit value rewrite", async () => {
    const objects = [];
    const onChange = vi.fn();
    const repository = createCanonicalEvidenceRepository(objects, { onChange });
    const input = record();
    await repository.saveRecoveryEvidence(input);
    await repository.saveRecoveryEvidence(input);
    expect(objects).toHaveLength(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    await expect(repository.saveRecoveryEvidence(record({ value: 8 })))
      .rejects.toThrow("explicit correction");
  });

  it("keeps independent sources distinct", async () => {
    const manual = createRecoveryEvidenceRecord(record());
    const imported = {
      ...manual,
      id: `${manual.id}|independent`,
      sourceRecordId: "independent",
      source: { ...manual.source, name: "Independent manual import" },
    };
    const objects = [
      createCanonicalRecoveryEvidenceObject(manual),
      { ...createCanonicalRecoveryEvidenceObject(manual), canonicalId: imported.id, payload: imported },
    ];
    const repository = createCanonicalEvidenceRepository(objects);
    expect(await repository.listRecoveryEvidenceInWindow("user", window()))
      .toHaveLength(2);
  });

  it("appends a correction, preserves history, and excludes the superseded record", async () => {
    const objects = [];
    const repository = createCanonicalEvidenceRepository(objects);
    const original = await repository.saveRecoveryEvidence(record());
    const correction = await repository.saveRecoveryEvidence(record({
      sourceRecordId: "checkin:sleep:v2",
      value: 8,
      correctsEvidenceId: original.id,
      supersedesEvidenceId: original.id,
    }));
    expect(objects).toHaveLength(2);
    expect(await repository.getRecoveryEvidenceById("user", original.id))
      .toMatchObject({ status: "superseded", supersededByEvidenceId: correction.id });
    expect(await repository.listRecoveryEvidenceInWindow("user", window()))
      .toEqual([correction]);
    expect(await repository.listRecoveryEvidenceInWindow("user", window(), {
      includeSuperseded: true,
    })).toHaveLength(2);
  });

  it.each([
    ["cross-user", { userId: "other" }, "cannot cross users"],
    ["metric mismatch", { metric: "soreness", value: "mild", unit: "category" }, "metric scope"],
  ])("rejects %s correction lineage without a partial write", async (_name, override, message) => {
    const objects = [];
    const repository = createCanonicalEvidenceRepository(objects);
    const original = await repository.saveRecoveryEvidence(record());
    const before = structuredClone(objects);
    await expect(repository.saveRecoveryEvidence(record({
      ...override,
      sourceRecordId: `corrected:${_name}`,
      correctsEvidenceId: original.id,
      supersedesEvidenceId: original.id,
    }))).rejects.toThrow(message);
    expect(objects).toEqual(before);
  });
});

function record(overrides = {}) {
  const recordedAt = "2026-07-25T07:00:00-07:00";
  return {
    userId: "user",
    metric: "sleep_duration",
    value: 7.5,
    unit: "hours",
    evidenceDate: "2026-07-25",
    recordedAt,
    timezone: "America/Los_Angeles",
    source: {
      kind: "manual_check_in",
      name: "Morning Check-In",
      ingestionPath: "morning_check_in_recovery",
      recordedAt,
      confidence: "normal",
    },
    sourceRecordId: "checkin:sleep:v1",
    sourceEvidenceIds: ["checkin"],
    createdAt: recordedAt,
    updatedAt: recordedAt,
    ...overrides,
  };
}

function window() {
  return { startDate: "2026-07-25", endDate: "2026-07-25" };
}

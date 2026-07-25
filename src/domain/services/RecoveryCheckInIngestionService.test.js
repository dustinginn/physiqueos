import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createFounderStoreUnitOfWork,
} from "../../data/repositories/FounderStoreUnitOfWork";
import { createRecoveryCheckInIngestionService } from "./RecoveryCheckInIngestionService";

const directories = [];
afterEach(() => {
  directories.splice(0).forEach((directory) =>
    fs.rmSync(directory, { recursive: true, force: true })
  );
});

describe("Recovery check-in ingestion", () => {
  it.each([
    ["sleep only", { sleepDuration: 7.5 }, ["sleep_duration"]],
    ["subjective only", { subjectiveRecovery: "good" }, ["subjective_recovery"]],
    ["soreness only", { soreness: "moderate" }, ["soreness"]],
    ["all fields", {
      sleepDuration: 7.5,
      subjectiveRecovery: "good",
      soreness: "mild",
    }, ["sleep_duration", "soreness", "subjective_recovery"]],
  ])("atomically saves %s", async (_name, values, metrics) => {
    const fixture = setup();
    const result = await fixture.service.save({ ...input(), ...values });
    expect(result.status).toBe("saved");
    expect(fixture.liveStore.dailyCheckIns).toHaveLength(1);
    expect(fixture.liveStore.canonicalEvidenceObjects.map(
      (item) => item.payload.metric
    ).sort()).toEqual(metrics);
    expect(read(fixture.filePath).canonicalEvidenceObjects).toEqual(
      fixture.liveStore.canonicalEvidenceObjects
    );
  });

  it("keeps omitted Recovery optional and writes nothing", async () => {
    const fixture = setup();
    expect(await fixture.service.save(input())).toMatchObject({
      status: "omitted",
      evidenceIds: [],
    });
    expect(fixture.liveStore).toEqual(fixture.before);
  });

  it("makes retry idempotent and edit an explicit correction", async () => {
    const fixture = setup();
    const first = await fixture.service.save({
      ...input(),
      sleepDuration: 7.5,
    });
    const retry = await fixture.service.save({
      ...input(),
      sleepDuration: 7.5,
    });
    expect(retry.status).toBe("unchanged");
    expect(fixture.liveStore.canonicalEvidenceObjects).toHaveLength(1);
    const edited = await fixture.service.save({
      ...input({ recordedAt: "2026-07-25T08:00:00-07:00" }),
      sleepDuration: 8,
    });
    expect(edited.status).toBe("saved");
    expect(fixture.liveStore.canonicalEvidenceObjects).toHaveLength(2);
    expect(fixture.liveStore.canonicalEvidenceObjects[0].payload)
      .toMatchObject({
        status: "superseded",
        supersededByEvidenceId: edited.evidenceIds[0],
      });
    expect(first.evidenceIds[0]).not.toBe(edited.evidenceIds[0]);
  });

  it("ignores legacy notes because they are not an ingestion input", async () => {
    const fixture = setup({
      dailyCheckIns: [{
        id: "legacy",
        userId: "user",
        date: "2026-07-25",
        recovery: { sleepHours: null, notes: "poor sleep and tired" },
      }],
    });
    expect(await fixture.service.save(input())).toMatchObject({ status: "omitted" });
    expect(fixture.liveStore.canonicalEvidenceObjects).toEqual([]);
    expect(fixture.liveStore.dailyCheckIns[0].recovery.notes)
      .toBe("poor sleep and tired");
  });

  it("rolls back both check-in and evidence when persistence fails", async () => {
    const fixture = setup({ serialize: () => { throw new Error("disk failed"); } });
    await expect(fixture.service.save({
      ...input(),
      sleepDuration: 7.5,
    })).rejects.toThrow();
    expect(fixture.liveStore).toEqual(fixture.before);
    expect(read(fixture.filePath)).toEqual(fixture.before);
  });
});

function setup({ dailyCheckIns = [], serialize } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "recovery-ingestion-"));
  directories.push(directory);
  const filePath = path.join(directory, "runtime-store.json");
  const liveStore = {
    revision: 0,
    user: { id: "user" },
    dailyCheckIns: structuredClone(dailyCheckIns),
    canonicalEvidenceObjects: [],
  };
  fs.writeFileSync(filePath, JSON.stringify(liveStore));
  const before = structuredClone(liveStore);
  const unitOfWork = createFounderStoreUnitOfWork({
    filePath,
    liveStore,
    ...(serialize ? { serialize } : {}),
    now: () => new Date("2026-07-25T14:00:00.000Z"),
    createCommitId: () => "commit",
    createTransactionId: () => "transaction",
  });
  return {
    filePath,
    liveStore,
    before,
    service: createRecoveryCheckInIngestionService({ unitOfWork }),
  };
}

function input(overrides = {}) {
  return {
    userId: "user",
    date: "2026-07-25",
    recordedAt: "2026-07-25T07:00:00-07:00",
    timezone: "America/Los_Angeles",
    ...overrides,
  };
}

function read(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

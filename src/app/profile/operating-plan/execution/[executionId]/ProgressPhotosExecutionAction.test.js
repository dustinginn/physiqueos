import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { saveProgressPhotosExecution } from "./actions";
import {
  createProgressPhotosExecutionScheduleService,
} from "../../../../../domain/services/ProgressPhotosExecutionScheduleService";

const directories = [];

afterEach(() => {
  directories.splice(0).forEach((directory) =>
    fs.rmSync(directory, { recursive: true, force: true }));
});

describe("Progress Photos execution server-action boundary", () => {
  it("saves Every 2 weeks through the action path on an isolated revision-32 clone", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "photos-action-"));
    directories.push(directory);
    const runtimeStorePath = path.join(directory, "runtime-store.json");
    const production = fs.readFileSync("private/founder/runtime-store.json");
    fs.writeFileSync(runtimeStorePath, production);
    const persisted = JSON.parse(production);
    const service = createProgressPhotosExecutionScheduleService({
      runtimeStorePath,
      liveStore: structuredClone(persisted),
    });
    const hydration = service.hydrate();
    const formData = createFormData(hydration);
    const repositories = {
      executionItems: {
        getExecutionItemById: async () => persisted.executionItems.find(
          (item) => item.id === "execution_progress_photos",
        ),
      },
      users: { getCurrentUser: async () => persisted.user },
    };
    const result = await saveProgressPhotosExecution(formData, {
      repositories,
      runtimeStorePath,
      liveStore: structuredClone(persisted),
    });

    expect(result).toMatchObject({
      outcome: "success", committed: true, revision: 33,
      nextOccurrence: { scheduledLocalDate: "2026-08-08" },
    });
    const after = JSON.parse(fs.readFileSync(runtimeStorePath, "utf8"));
    const root = after.protocols.find((item) =>
      item.status === "active" && item.protocolType === "photos");
    const versions = after.protocolVersions.filter((item) => item.protocolId === root.id);
    expect(versions).toHaveLength(2);
    expect(versions.filter((item) => item.status === "active")).toHaveLength(1);
    expect(root.currentVersionId).toMatch(/_v2$/);
    expect(after.reminders.find(
      (item) => item.id === "reminder_weekly_progress_photo_set",
    ).completionHistory).toHaveLength(1);
  }, 60_000);

  it("passes typed service conflicts through without throwing", async () => {
    const formData = new FormData();
    formData.set("id", "execution_progress_photos");
    formData.set("cadence", "weekly_interval_2");
    const result = await saveProgressPhotosExecution(formData, {
      repositories: {
        executionItems: { getExecutionItemById: async () => ({ id: "execution_progress_photos" }) },
        users: { getCurrentUser: async () => ({ id: "founder", name: "Founder" }) },
      },
      runtimeStorePath: "isolated",
      liveStore: {},
      createService: () => ({
        save: async () => ({
          outcome: "baseline_conflict",
          committed: false,
          reason: "Reload before saving.",
        }),
      }),
    });
    expect(result).toEqual({
      outcome: "baseline_conflict",
      committed: false,
      reason: "Reload before saving.",
    });
  });
});

function createFormData(hydration) {
  const formData = new FormData();
  const values = {
    id: "execution_progress_photos",
    cadence: "weekly_interval_2",
    days: "saturday",
    timeChoice: "afternoon",
    protocolId: hydration.context.protocolId,
    expectedCurrentVersionId: hydration.context.expectedCurrentVersionId,
    expectedRevision: String(hydration.context.expectedRevision),
    expectedSemanticDigest: hydration.context.expectedSemanticDigest,
    expectedLastCommitId: hydration.context.expectedLastCommitId,
    expectedFileHash: hydration.context.expectedFileHash,
    anchorDate: "2026-07-25",
    timezone: "America/Los_Angeles",
    effectiveDate: "2026-08-08",
  };
  Object.entries(values).forEach(([key, value]) => formData.set(key, value));
  return formData;
}

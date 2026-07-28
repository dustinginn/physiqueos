import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createProtocolRecurrenceIdentity,
  hydrateCadenceFromRecurrence,
  normalizeProtocolRecurrence,
} from "./ProtocolRecurrenceNormalizationService";
import {
  getNextProtocolOccurrence,
  isProtocolDateOnCycle,
  resolveProtocolOccurrence,
} from "./ProtocolOccurrenceResolver";
import {
  createProgressPhotosExecutionHydrationModel,
  createProgressPhotosExecutionScheduleService,
  prepareProgressPhotosScheduleSuccessor,
  readProgressPhotosPersistedBaseline,
} from "./ProgressPhotosExecutionScheduleService";
import { createFounderRuntimeSemanticDigest } from "./FounderRuntimeSemanticDigest";
import { resolveExecutionSupportLabel } from "./ExecutionSupportLabelService";
import { createDailyFocusService } from "./DailyFocusService";
import { evaluatePhotoPrioritySatisfaction } from "./PhotoPrioritySatisfactionService";
import { createFounderStoreUnitOfWork } from "../../data/repositories/FounderStoreUnitOfWork";

const directories = [];
afterEach(() => directories.splice(0).forEach((directory) =>
  fs.rmSync(directory, { recursive: true, force: true })));

const intervalTwo = () => normalizeProtocolRecurrence({
  frequency: "weekly",
  interval: 2,
  weekdays: ["saturday"],
  timeOfDay: "afternoon",
  timezone: "America/Los_Angeles",
  anchorDate: "2026-07-25",
});

describe("canonical protocol recurrence", () => {
  it("normalizes and resolves without mutating caller-owned recurrence input", () => {
    const input = {
      frequency: "weekly", interval: 2, weekdays: ["saturday"],
      timeOfDay: "afternoon", timezone: "America/Los_Angeles",
      anchorDate: "2026-07-25",
    };
    const before = structuredClone(input);
    const recurrence = normalizeProtocolRecurrence(input);
    getNextProtocolOccurrence(recurrence, recurrence.anchorDate);
    expect(input).toEqual(before);
  });
  it("normalizes legacy weekly shapes and defaults the interval", () => {
    const options = { fallbackTimezone: "America/Los_Angeles", fallbackAnchorDate: "2026-07-25" };
    expect(normalizeProtocolRecurrence({
      type: "weekly", daysOfWeek: ["saturday"], timeOfDay: "afternoon",
    }, options)).toMatchObject({ frequency: "weekly", interval: 1, weekdays: ["saturday"] });
    expect(normalizeProtocolRecurrence({
      cadence: "weekly", interval: 2, preferredDay: "saturday", daypart: "afternoon",
    }, options)).toEqual(intervalTwo());
  });

  it.each([0, -1, 1.5])("rejects malformed interval %s", (interval) => {
    expect(() => normalizeProtocolRecurrence({
      frequency: "weekly", interval, weekdays: ["saturday"],
      timezone: "America/Los_Angeles", anchorDate: "2026-07-25",
    })).toThrow(/positive integer/i);
  });

  it("rejects ambiguous biweekly and orders weekdays deterministically", () => {
    expect(() => normalizeProtocolRecurrence({ frequency: "biweekly" }))
      .toThrow(/ambiguous/i);
    expect(normalizeProtocolRecurrence({
      frequency: "weekly", weekdays: ["sunday", "monday", "friday"],
      timezone: "America/Los_Angeles", anchorDate: "2026-07-20",
    }).weekdays).toEqual(["monday", "friday", "sunday"]);
  });

  it("hydrates weekly intervals and creates deterministic identity", () => {
    expect(hydrateCadenceFromRecurrence({ frequency: "weekly", interval: 1 })).toBe("weekly");
    expect(hydrateCadenceFromRecurrence(intervalTwo())).toBe("weekly_interval_2");
    expect(hydrateCadenceFromRecurrence({ frequency: "weekly", interval: 3 })).toBe("custom");
    expect(createProtocolRecurrenceIdentity(intervalTwo()))
      .toBe(createProtocolRecurrenceIdentity(intervalTwo()));
  });
});

describe("local-calendar occurrence resolution", () => {
  it("keeps July 25 as anchor and skips August 1", () => {
    const recurrence = intervalTwo();
    expect(isProtocolDateOnCycle(recurrence, "2026-07-25")).toBe(true);
    expect(isProtocolDateOnCycle(recurrence, "2026-08-01")).toBe(false);
    expect(isProtocolDateOnCycle(recurrence, "2026-08-08")).toBe(true);
    expect(isProtocolDateOnCycle(recurrence, "2026-08-22")).toBe(true);
    expect(getNextProtocolOccurrence(recurrence, "2026-07-25").scheduledLocalDate)
      .toBe("2026-08-08");
  });

  it.each(["2026-03-07", "2026-10-31", "2026-12-26"])(
    "preserves Saturday and daypart across boundary anchored at %s", (anchorDate) => {
      const recurrence = normalizeProtocolRecurrence({
        ...intervalTwo(), anchorDate,
      });
      const next = getNextProtocolOccurrence(recurrence, anchorDate);
      expect(new Date(`${next.scheduledLocalDate}T12:00:00Z`).getUTCDay()).toBe(6);
      expect(next.scheduledDaypart).toBe("afternoon");
    });

  it("does not derive the cycle from page-open time", () => {
    const recurrence = intervalTwo();
    const first = resolveProtocolOccurrence({
      recurrence, evaluationTimestamp: "2026-08-01T20:00:00Z",
    });
    const second = resolveProtocolOccurrence({
      recurrence, evaluationTimestamp: "2026-08-08T20:00:00Z",
    });
    expect(first).toMatchObject({ offWeek: true, onCycle: false });
    expect(second).toMatchObject({ onCycle: true, dueState: "due" });
  });
});

describe("Progress Photos successor schedule", () => {
  it("uses canonical support labels instead of an Energy association fallback", () => {
    expect(resolveExecutionSupportLabel({
      id: "execution_progress_photos",
      linkedStrategyIds: ["strategy_energy"],
    })).toBe("Supports your Progress Photos Strategy");
    expect(resolveExecutionSupportLabel({
      id: "execution_morning_weigh_in",
      linkedStrategyIds: ["strategy_energy"],
    })).toBe("Supports your Energy Strategy");
    expect(resolveExecutionSupportLabel({
      id: "execution_unknown",
      linkedStrategyIds: [],
    })).not.toMatch(/Energy Strategy/);
  });

  it("exposes the unambiguous option only through the capable shared editor", () => {
    const screen = fs.readFileSync("src/screens/ExecutionItemBuilderScreen.jsx", "utf8");
    const action = fs.readFileSync(
      "src/app/profile/operating-plan/execution/[executionId]/actions.js", "utf8");
    expect(screen).toContain('["weekly_interval_2","Every 2 weeks"]');
    expect(screen).toContain("supportsWeeklyInterval");
    expect(screen).not.toContain("Biweekly");
    expect(screen).toMatch(/grid-cols-2/);
    expect(screen).toMatch(/min-h-12/);
    expect(action).toContain("createProgressPhotosExecutionScheduleService");
    expect(action.indexOf('id==="execution_progress_photos"'))
      .toBeLessThan(action.indexOf("saveExecutionItem(item)"));
  });

  it("hydrates production v1 without mutating production", () => {
    const before = fs.readFileSync("private/founder/runtime-store.json");
    const store = JSON.parse(before);
    const hydration = createProgressPhotosExecutionHydrationModel(store);
    expect(hydration.item).toMatchObject({
      cadence: { type: "weekly", interval: 1 },
      preferredSchedule: {
        daysOfWeek: ["saturday"], timeOfDay: "afternoon",
        timezone: "America/Los_Angeles", anchorDate: "2026-07-25",
      },
    });
    expect(hydration.item.schedulePreviews).toEqual({
      weekly: {
        summary: "Once a week · Saturday afternoon",
        next: "Next: Saturday, August 1 · Afternoon",
      },
      weekly_interval_2: {
        summary: "Every 2 weeks · Saturday afternoon",
        next: "Next: Saturday, August 8 · Afternoon",
      },
    });
    expect(fs.readFileSync("private/founder/runtime-store.json")).toEqual(before);
  }, 40_000);

  it("locks hydration to the persisted baseline, not a normalized live view", () => {
    const baseline = readProgressPhotosPersistedBaseline(
      "private/founder/runtime-store.json",
    );
    const normalizedLiveView = structuredClone(baseline.store);
    normalizedLiveView.executionItems[0] = {
      ...normalizedLiveView.executionItems[0],
      readModelOnlyField: true,
    };
    const service = createProgressPhotosExecutionScheduleService({
      runtimeStorePath: "private/founder/runtime-store.json",
      liveStore: normalizedLiveView,
    });
    const hydration = service.hydrate();
    expect(hydration.context).toMatchObject({
      expectedRevision: baseline.revision,
      expectedSemanticDigest: baseline.semanticDigest,
      expectedLastCommitId: baseline.lastCommitId,
      expectedFileHash: baseline.fileHash,
    });
    expect(hydration.context.expectedSemanticDigest)
      .not.toBe(createFounderRuntimeSemanticDigest(normalizedLiveView));
  }, 40_000);

  it("keeps preparation referentially safe and permits a distinct candidate digest", () => {
    const store = compactProgressPhotosStore();
    const before = structuredClone(store);
    const hydration = createProgressPhotosExecutionHydrationModel(store);
    const prepared = prepareProgressPhotosScheduleSuccessor(store, {
      ...hydration.context,
      effectiveDate: "2026-08-08",
      recurrence: intervalTwo(),
      author: { type: "user", id: store.user.id, displayName: "Founder" },
    }, new Date("2026-07-27T14:00:00Z"));
    expect(prepared).toMatchObject({ ok: true, outcome: "ready" });
    expect(store).toEqual(before);
    const candidate = structuredClone(store);
    candidate.protocolVersions.push(structuredClone(prepared.successorTransition.successor));
    expect(createFounderRuntimeSemanticDigest(candidate))
      .not.toBe(createFounderRuntimeSemanticDigest(store));
  });

  it("appends v2 atomically, reconciles projections, and replays unchanged", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "photos-recurrence-"));
    directories.push(directory);
    const file = path.join(directory, "runtime-store.json");
    const store = JSON.parse(fs.readFileSync("private/founder/runtime-store.json", "utf8"));
    fs.writeFileSync(file, JSON.stringify(store));
    const hydration = createProgressPhotosExecutionHydrationModel(store);
    const command = {
      ...hydration.context,
      effectiveDate: "2026-08-08",
      recurrence: intervalTwo(),
      author: { type: "user", id: store.user.id, displayName: "Founder" },
    };
    const service = createProgressPhotosExecutionScheduleService({
      runtimeStorePath: file, liveStore: store,
      now: () => new Date("2026-07-27T14:00:00Z"),
    });
    const result = await service.save(command);
    expect(result).toMatchObject({ outcome: "success", committed: true, revision: 33 });
    const after = JSON.parse(fs.readFileSync(file, "utf8"));
    const root = after.protocols.find((item) => item.id === command.protocolId);
    const versions = after.protocolVersions.filter((item) => item.protocolId === root.id);
    expect(root.currentVersionId).toMatch(/_v2$/);
    expect(versions).toHaveLength(2);
    expect(versions.find((item) => item.id === command.expectedCurrentVersionId))
      .toMatchObject({ status: "superseded", endedAt: "2026-08-08" });
    expect(versions.filter((item) => item.status === "active")).toHaveLength(1);
    expect(after.executionItems.find((item) => item.id === "execution_progress_photos"))
      .toMatchObject({ cadence: { type: "weekly", interval: 2 } });
    const reminder = after.reminders.find((item) => item.id === "reminder_weekly_progress_photo_set");
    expect(reminder).toMatchObject({
      active: true, nextDueAt: "2026-08-08",
      schedule: { interval: 2, anchorDate: "2026-07-25" },
    });
    expect(reminder.completionHistory).toHaveLength(1);

    const replayHydration = createProgressPhotosExecutionHydrationModel(after);
    const beforeReplay = fs.readFileSync(file);
    const replay = createProgressPhotosExecutionScheduleService({
      runtimeStorePath: file, liveStore: after,
    });
    expect(await replay.save({
      ...replayHydration.context,
      effectiveDate: "2026-08-08",
      recurrence: intervalTwo(),
      author: command.author,
    })).toMatchObject({ outcome: "unchanged", committed: false });
    expect(fs.readFileSync(file)).toEqual(beforeReplay);
  }, 40_000);

  it("allows only one successor under duplicate concurrent invocation", async () => {
    const { file, store } = isolatedCompactStore();
    const hydration = createProgressPhotosExecutionScheduleService({
      runtimeStorePath: file, liveStore: store,
    }).hydrate();
    const command = intervalTwoCommand(hydration, store);
    const results = await Promise.all([
      createProgressPhotosExecutionScheduleService({
        runtimeStorePath: file, liveStore: structuredClone(store),
      }).save(command),
      createProgressPhotosExecutionScheduleService({
        runtimeStorePath: file, liveStore: structuredClone(store),
      }).save(command),
    ]);
    expect(results.filter((result) => result.outcome === "success")).toHaveLength(1);
    expect(results.filter((result) =>
      ["baseline_conflict", "current_version_conflict"].includes(result.outcome)))
      .toHaveLength(1);
    const persisted = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(persisted.protocolVersions).toHaveLength(2);
    expect(persisted.revision).toBe(33);
  });

  it("returns a typed conflict and preserves a genuine competing write", async () => {
    const { file, store } = isolatedCompactStore();
    const service = createProgressPhotosExecutionScheduleService({
      runtimeStorePath: file,
      liveStore: store,
      createUnitOfWork(options) {
        const unit = createFounderStoreUnitOfWork(options);
        return {
          ...unit,
          begin() {
            const transaction = unit.begin();
            const commit = transaction.commit.bind(transaction);
            transaction.commit = async (commitOptions) => {
              const competing = JSON.parse(fs.readFileSync(file, "utf8"));
              competing.revision += 1;
              competing.lastCommitId = "competing-commit";
              competing.competitionMarker = true;
              fs.writeFileSync(file, `${JSON.stringify(competing)}\n`);
              return commit(commitOptions);
            };
            return transaction;
          },
        };
      },
    });
    const hydration = service.hydrate();
    const result = await service.save(intervalTwoCommand(hydration, store));
    expect(result).toMatchObject({ outcome: "baseline_conflict", committed: false });
    const persisted = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(persisted).toMatchObject({
      revision: 33, lastCommitId: "competing-commit", competitionMarker: true,
    });
    expect(persisted.protocolVersions).toHaveLength(1);
    expect(persisted.reminders[0].schedule.interval ?? 1).toBe(1);
  });

  it("rejects stale baseline and current-version locks before staging", async () => {
    const { file, store } = isolatedCompactStore();
    const service = createProgressPhotosExecutionScheduleService({
      runtimeStorePath: file, liveStore: store,
    });
    const hydration = service.hydrate();
    const command = intervalTwoCommand(hydration, store);
    expect(await service.save({
      ...command, expectedRevision: command.expectedRevision - 1,
    })).toMatchObject({ outcome: "baseline_conflict", committed: false });
    expect(await service.save({
      ...command, expectedSemanticDigest: "stale",
    })).toMatchObject({ outcome: "baseline_conflict", committed: false });
    expect(await service.save({
      ...command, expectedCurrentVersionId: "stale-version",
    })).toMatchObject({ outcome: "current_version_conflict", committed: false });
    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual(store);
  });

  it("reports committed truth when publication fails after durable replacement", async () => {
    const { file, store } = isolatedCompactStore();
    const service = createProgressPhotosExecutionScheduleService({
      runtimeStorePath: file,
      liveStore: store,
      createUnitOfWork: (options) => createFounderStoreUnitOfWork({
        ...options,
        publish() {
          throw new Error("simulated publication failure");
        },
      }),
    });
    const hydration = service.hydrate();
    const result = await service.save(intervalTwoCommand(hydration, store));
    expect(result).toMatchObject({
      outcome: "committed_publication_failure", committed: true,
    });
    expect(JSON.parse(fs.readFileSync(file, "utf8"))).toMatchObject({
      revision: 33,
    });
  });
});

describe("interval-aware prompting and satisfaction", () => {
  const reminder = () => ({
    id: "reminder_weekly_progress_photo_set",
    title: "Weekly Progress Photo Set",
    type: "evidence_reminder",
    linkedEntityType: "progress_photo_set",
    linkedEvidenceType: "progress_photo",
    active: true,
    schedule: {
      type: "weekly", cadence: "weekly", interval: 2,
      daysOfWeek: ["saturday"], timeOfDay: "afternoon",
      timezone: "America/Los_Angeles", anchorDate: "2026-07-25",
    },
    expectedViews: [],
  });
  const session = (date) => ({
    canonicalId: `session-${date}`,
    lastObservedAt: date,
    quality: { status: "confirmed" },
    payload: {
      captureDate: date,
      photos: [{ categoryId: "front-relaxed", confirmation: { userConfirmed: true } }],
    },
  });

  it("does not prompt off week and prompts the due Saturday", () => {
    const service = createDailyFocusService();
    expect(service.getDailyFocus({
      reminders: [reminder()], now: new Date("2026-08-01T21:00:00Z"),
    }).some((item) => /photo/i.test(item.label))).toBe(false);
    expect(service.getDailyFocus({
      reminders: [reminder()], now: new Date("2026-08-08T21:00:00Z"),
    }).some((item) => /photo/i.test(item.label)
      || item.sessionItems?.some((sessionItem) => /photo/i.test(sessionItem.label)))).toBe(true);
  });

  it("accepts only on-cycle canonical sessions and remains idempotent by session", () => {
    expect(evaluatePhotoPrioritySatisfaction({
      reminder: reminder(), canonicalSession: session("2026-08-01"), evidenceDate: "2026-08-01",
    }).eligible).toBe(false);
    const due = evaluatePhotoPrioritySatisfaction({
      reminder: reminder(), canonicalSession: session("2026-08-08"), evidenceDate: "2026-08-08",
    });
    expect(due).toMatchObject({ eligible: true, occurrenceKey: expect.stringContaining("2026-08-08") });
    expect(evaluatePhotoPrioritySatisfaction({
      reminder: reminder(), canonicalSession: session("2026-08-08"), evidenceDate: "2026-08-08",
    }).idempotencyKey).toBe(due.idempotencyKey);
  });
});

function compactProgressPhotosStore() {
  const full = JSON.parse(fs.readFileSync("private/founder/runtime-store.json", "utf8"));
  const root = full.protocols.find((item) =>
    item.status === "active" && item.protocolType === "photos");
  return {
    version: full.version,
    revision: 32,
    lastCommitId: "revision-32-test",
    updatedAt: full.updatedAt,
    user: structuredClone(full.user),
    protocols: [structuredClone(root)],
    protocolVersions: [structuredClone(full.protocolVersions.find(
      (item) => item.id === root.currentVersionId,
    ))],
    executionItems: [structuredClone(full.executionItems.find(
      (item) => item.id === "execution_progress_photos",
    ))],
    reminders: [structuredClone(full.reminders.find(
      (item) => item.id === "reminder_weekly_progress_photo_set",
    ))],
  };
}

function isolatedCompactStore() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "photos-save-stabilization-"));
  directories.push(directory);
  const file = path.join(directory, "runtime-store.json");
  const store = compactProgressPhotosStore();
  fs.writeFileSync(file, `${JSON.stringify(store)}\n`);
  return { file, store };
}

function intervalTwoCommand(hydration, store) {
  return {
    ...hydration.context,
    effectiveDate: "2026-08-08",
    recurrence: intervalTwo(),
    author: { type: "user", id: store.user.id, displayName: "Founder" },
  };
}

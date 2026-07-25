import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CoachingUpdatesTransactionOutcome as O,
  createCoachingUpdatesTransactionService,
} from "./CoachingUpdatesTransactionService";
import {
  resolveCoachingUpdatesReadModel,
  resolveNextEligibleCoachingUpdates,
} from "./CoachingUpdatesReadService";
import { selectScheduledBriefingCadence } from "./BriefingEvidenceWindowService";
import { resolveHomeBriefingSelection } from "./HomeBriefingRoutingService";

const directories = [];
afterEach(() => directories.splice(0).forEach((directory) =>
  fs.rmSync(directory, { recursive: true, force: true })));

describe("Coaching Updates canonical transaction", () => {
  it("resolves repaired legacy V1 as Wednesday, Sunday, and Daily Off", () => {
    const store = baseStore();
    const model = currentModel(store);
    expect(model).toMatchObject({
      midweek: { enabled: true, day: "wednesday", localTime: "00:00" },
      weekly: { enabled: true, day: "sunday", localTime: "00:00" },
      daily: { enabled: false },
      notificationPreference: "available_without_notification",
      eventBriefings: { photo: true, dexa: true },
    });
    expect(model.compatibility.dailyEvidenceCollection).toBe(true);
  });

  it("creates one successor and makes cadence, Home, and notifications resolve atomically", async () => {
    const fixture = createFixture();
    const history = structuredClone(fixture.liveStore.dailyBriefings);
    const execution = structuredClone(fixture.liveStore.executionItems);
    const result = await fixture.service.update(command());
    expect(result).toMatchObject({ outcome: O.SUCCESS, committed: true, previousVersionId: "coaching-v1", successorVersionId: "coaching_v2" });
    expect(fixture.liveStore.protocolVersions).toHaveLength(2);
    expect(fixture.liveStore.protocolVersions.filter((item) => item.status === "active")).toHaveLength(1);
    const model = currentModel(fixture.liveStore);
    expect(model).toMatchObject({
      midweek: { enabled: true, day: "tuesday", localTime: "08:30" },
      weekly: { enabled: true, day: "saturday", localTime: "09:15" },
      daily: { enabled: false },
      notificationPreference: "notify_when_ready",
      scheduleApplication: { status: "active", appliesTo: "future_eligible_runs" },
    });
    expect(selectScheduledBriefingCadence({ now: at("2026-07-21T09:00"), timeZone: model.timeZone, coachingUpdates: model })).toBe("midweek");
    expect(selectScheduledBriefingCadence({ now: at("2026-07-25T09:30"), timeZone: model.timeZone, coachingUpdates: model })).toBe("weekly");
    expect(resolveHomeBriefingSelection({ now: at("2026-07-21T09:00"), timeZone: model.timeZone, coachingUpdates: model }).reason).toContain("midweek");
    expect(resolveNextEligibleCoachingUpdates(model, {
      now: at("2026-07-20T12:00"),
      timeZone: model.timeZone,
    })).toMatchObject({
      midweek: { localDate: "2026-07-21", localTime: "08:30", day: "tuesday" },
      weekly: { localDate: "2026-07-25", localTime: "09:15", day: "saturday" },
      dailyAvailable: false,
    });
    expect(fixture.liveStore.dailyBriefings).toEqual(history);
    expect(fixture.liveStore.executionItems).toEqual(execution);
  });

  it("keeps a selected local time on its selected local calendar day", () => {
    const model = { ...currentModel(baseStore()), midweek: { enabled: true, day: "tuesday", localTime: "08:30" } };
    expect(selectScheduledBriefingCadence({ now: at("2026-07-21T08:29"), timeZone: model.timeZone, coachingUpdates: model })).toBe("none");
    expect(selectScheduledBriefingCadence({ now: at("2026-07-21T08:30"), timeZone: model.timeZone, coachingUpdates: model })).toBe("midweek");
    expect(selectScheduledBriefingCadence({ now: at("2026-07-22T08:30"), timeZone: model.timeZone, coachingUpdates: model })).toBe("none");
  });

  it.each([
    ["Daily disallowed", O.DAILY_NOT_PERMITTED, { daily: { enabled: true } }],
    ["no routine surface", O.NO_ROUTINE_SURFACE, { midweek: { enabled: false, day: "wednesday", localTime: "08:00" }, weekly: { enabled: false, day: "sunday", localTime: "08:00" } }],
    ["invalid Midweek", O.INVALID_MIDWEEK_SCHEDULE, { midweek: { enabled: true, day: "noday", localTime: "08:00" } }],
    ["invalid Weekly", O.INVALID_WEEKLY_SCHEDULE, { weekly: { enabled: true, day: "sunday", localTime: "25:00" } }],
    ["invalid notification", O.INVALID_NOTIFICATION_PREFERENCE, { notificationPreference: "push_everything" }],
    ["stale version", O.EXPECTED_VERSION_CONFLICT, { expectedCurrentVersionId: "stale" }],
  ])("rejects %s without partial writes", async (_label, expected, patch) => {
    const fixture = createFixture();
    const before = snapshot(fixture);
    expect((await fixture.service.update({ ...command(), ...patch })).outcome).toBe(expected);
    expect(snapshot(fixture)).toBe(before);
  });

  it("rejects unchanged and duplicate configurations without writes", async () => {
    const unchanged = createFixture();
    const legacy = command({
      midweek: { enabled: true, day: "wednesday", localTime: "00:00" },
      weekly: { enabled: true, day: "sunday", localTime: "00:00" },
      notificationPreference: "available_without_notification",
    });
    const before = snapshot(unchanged);
    expect((await unchanged.service.update(legacy)).outcome).toBe(O.UNCHANGED_CONFIGURATION);
    expect(snapshot(unchanged)).toBe(before);

    const duplicateVersion = {
      ...version(),
      id: "coaching-duplicate",
      versionNumber: 2,
      status: "superseded",
      effectiveAt: "2026-07-26",
      endedAt: "2026-07-27",
      coachingUpdates: canonical(command()),
    };
    const duplicate = createFixture({ versions: [version(), duplicateVersion] });
    const duplicateBefore = snapshot(duplicate);
    expect((await duplicate.service.update(command())).outcome).toBe(O.DUPLICATE_CONFIGURATION);
    expect(snapshot(duplicate)).toBe(duplicateBefore);
  });

  it.each([
    ["scheduler", O.SCHEDULER_APPLICATION_FAILURE, { schedulerApplication: () => { throw new Error("scheduler"); } }],
    ["Home", O.HOME_RESOLUTION_FAILURE, { homeResolution: () => { throw new Error("home"); } }],
    ["verification", O.VERIFICATION_FAILURE, { finalVerification: () => { throw new Error("verify"); } }],
  ])("rolls back successor and all state after %s failure", async (_label, expected, faults) => {
    const fixture = createFixture({ faults });
    const before = snapshot(fixture);
    expect((await fixture.service.update(command())).outcome).toBe(expected);
    expect(snapshot(fixture)).toBe(before);
    expect(fixture.liveStore.protocolVersions).toHaveLength(1);
  });
});

function createFixture({ versions = [version()], faults = {} } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "coaching-transaction-"));
  directories.push(directory);
  const filePath = path.join(directory, "runtime-store.json");
  const liveStore = baseStore({ versions });
  fs.writeFileSync(filePath, `${JSON.stringify(liveStore)}\n`);
  return {
    filePath,
    liveStore,
    service: createCoachingUpdatesTransactionService({
      runtimeStorePath: filePath,
      liveStore,
      faults,
      now: () => new Date("2026-07-26T12:00:00.000Z"),
    }),
  };
}

function baseStore({ versions = [version()] } = {}) {
  return {
    revision: 7,
    user: { id: "user", timeZone: "America/Los_Angeles" },
    goals: [{ id: "goal-build", userId: "user", type: "build_lean_mass", status: "active", primary: true }],
    protocols: [{
      id: "coaching", userId: "user", protocolType: "briefings", category: "briefings",
      status: "active", currentVersionId: "coaching-v1", currentGoalIds: ["goal-build"],
      relatedGoalIds: ["goal-build"], effectiveStrategy: legacy(),
    }],
    protocolVersions: structuredClone(versions),
    dailyBriefings: [{ id: "historical", cadence: "weekly", briefing: { version: "locked" } }],
    executionItems: [],
    reminders: [{ id: "event", status: "pending_after_commit" }],
    operatingPlan: { coachingCadence: { type: "twice_weekly", days: ["wednesday", "sunday"] } },
  };
}

function version() {
  return {
    id: "coaching-v1", protocolId: "coaching", versionNumber: 1, status: "active",
    effectiveAt: "2026-07-21", endedAt: null,
    change: { reason: "Activation", previousVersionId: null, reviewedChanges: legacy() },
    goalLinks: [{ goalId: "goal-build", relationship: "supports" }],
    confirmation: { authority: "accepted_goal_transition" },
  };
}
function legacy() {
  return { cadence: "Twice weekly", days: ["Wednesday", "Sunday"], dailyEvidenceCollection: true };
}
function command(patch = {}) {
  return {
    protocolId: "coaching",
    expectedCurrentVersionId: "coaching-v1",
    effectiveDate: "2026-07-26",
    timeZone: "America/Los_Angeles",
    midweek: { enabled: true, day: "tuesday", localTime: "08:30" },
    weekly: { enabled: true, day: "saturday", localTime: "09:15" },
    daily: { enabled: false },
    notificationPreference: "notify_when_ready",
    goalAssociation: { goalId: "goal-build", relationship: "supports" },
    provenance: {
      author: { type: "user", id: "user", displayName: "Founder" },
      reason: "Update Coaching Updates cadence.",
      confirmation: { confirmedByUser: true },
      details: { source: "isolated_test" },
    },
    ...patch,
  };
}
function canonical(value) {
  return {
    schemaVersion: "coaching_updates_schedule_v1",
    timeZone: value.timeZone,
    midweek: value.midweek,
    weekly: value.weekly,
    daily: value.daily,
    notificationPreference: value.notificationPreference,
    scheduleApplication: { status: "active", appliesTo: "future_eligible_runs" },
  };
}
function currentModel(store) {
  const protocol = store.protocols[0];
  const current = store.protocolVersions.find((item) => item.id === protocol.currentVersionId);
  return resolveCoachingUpdatesReadModel({ protocol, version: current, goal: store.goals[0], timeZone: store.user.timeZone });
}
function at(local) {
  return new Date(`${local}:00-07:00`);
}
function snapshot(fixture) {
  return JSON.stringify({ live: fixture.liveStore, persisted: JSON.parse(fs.readFileSync(fixture.filePath, "utf8")) });
}

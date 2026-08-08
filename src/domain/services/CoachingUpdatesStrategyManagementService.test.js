import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getFounderStoreRevision } from "../../data/repositories/FounderStoreUnitOfWork";
import { createFounderRuntimeSemanticDigest } from "./FounderRuntimeSemanticDigest";
import { createCoachingUpdatesStrategyManagementService } from "./CoachingUpdatesStrategyManagementService";
import { filterEligibleEventBriefingTypes, resolveCoachingUpdatesReadModel, resolveEventBriefingPreferencesFromStore } from "./CoachingUpdatesReadService";
import { createProgressPhotosExecutionHydrationModel } from "./ProgressPhotosExecutionScheduleService";

const directories = [];
afterEach(() => directories.splice(0).forEach((directory) =>
  fs.rmSync(directory, { recursive: true, force: true })));

describe("Coaching Updates cross-owner strategy save", () => {
  it("atomically updates coaching, the canonical photo recurrence, and the canonical DEXA appointment", async () => {
    const fixture = setup();
    const before = protectedSnapshot(fixture.live);
    const result = await fixture.service.save(command(fixture.live));

    expect(result).toMatchObject({
      outcome: "success", committed: true,
      coachingChanged: true, photosChanged: true, photoReminderChanged: true, dexaChanged: true,
    });
    expect(protectedSnapshot(fixture.live)).toBe(before);
    expect(resolveEventBriefingPreferencesFromStore(fixture.live)).toEqual({ photo: false, dexa: true });
    expect(filterEligibleEventBriefingTypes(
      ["photo_session", "dexa"],
      resolveEventBriefingPreferencesFromStore(fixture.live),
    )).toEqual(["dexa"]);

    const coachingRoot = fixture.live.protocols.find((item) => item.id === "coaching");
    const coachingVersion = fixture.live.protocolVersions.find((item) => item.id === coachingRoot.currentVersionId);
    expect(resolveCoachingUpdatesReadModel({
      protocol: coachingRoot,
      version: coachingVersion,
      goal: fixture.live.goals[0],
    })).toMatchObject({
      midweek: { enabled: true, day: "wednesday", localTime: "00:00" },
      weekly: { enabled: true, day: "sunday", localTime: "00:00" },
      monthly: { enabled: true, dayOfMonth: 1, localTime: "08:15" },
      notificationPreference: "notify_when_ready",
      eventBriefings: { photo: false, dexa: true },
    });

    const photo = createProgressPhotosExecutionHydrationModel(fixture.live);
    expect(photo.item.recurrence).toMatchObject({
      interval: 2,
      weekdays: ["sunday"],
      timeOfDay: "evening",
      timezone: "America/Los_Angeles",
      anchorDate: "2026-07-25",
    });
    expect(fixture.live.executionItems.filter((item) => item.id === "execution_progress_photos")).toHaveLength(1);
    expect(fixture.live.reminders.filter((item) => item.id === "reminder_weekly_progress_photo_set")).toHaveLength(1);
    expect(fixture.live.reminders.find((item) => item.id === "reminder_weekly_progress_photo_set"))
      .toMatchObject({
        active: false,
        completionHistory: [{ evidenceDate: "2026-07-25" }],
        schedule: {
          interval: 2,
          daysOfWeek: ["sunday"],
          timeOfDay: "evening",
          timezone: "America/Los_Angeles",
          anchorDate: "2026-07-25",
        },
      });
    expect(fixture.live.executionItems.find((item) => item.id === "execution_next_dexa")).toMatchObject({
      preferredSchedule: { date: "2026-08-22", timeOfDay: "08:30" },
      preparationNote: "Use the updated clinic note.",
      reminderPreferences: ["week_before", "morning_of"],
      uploadReminder: false,
    });

    const reminderOnly = await fixture.service.save(currentCommand(fixture.live, true));
    expect(reminderOnly).toMatchObject({
      outcome: "success",
      committed: true,
      coachingChanged: false,
      photosChanged: false,
      photoReminderChanged: true,
      dexaChanged: false,
    });
    expect(resolveEventBriefingPreferencesFromStore(fixture.live)).toEqual({
      photo: false,
      dexa: true,
    });
    expect(fixture.live.reminders.find((item) => item.id === "reminder_weekly_progress_photo_set"))
      .toMatchObject({
        active: true,
        completionHistory: [{ evidenceDate: "2026-07-25" }],
        schedule: { interval: 2, daysOfWeek: ["sunday"], timeOfDay: "evening" },
      });
  });

  it("validates every owner before mutation and rejects an invalid DEXA date without a partial save", async () => {
    const fixture = setup();
    const beforeLive = JSON.stringify(fixture.live);
    const beforeFile = fs.readFileSync(fixture.file, "utf8");
    const request = command(fixture.live);
    request.dexa.draft.plannedDate = "2026-08-07";

    expect(await fixture.service.save(request)).toMatchObject({ outcome: "invalid", committed: false });
    expect(JSON.stringify(fixture.live)).toBe(beforeLive);
    expect(fs.readFileSync(fixture.file, "utf8")).toBe(beforeFile);
  });
});

function setup() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "coaching-strategy-"));
  directories.push(directory);
  const file = path.join(directory, "runtime-store.json");
  const live = store();
  fs.writeFileSync(file, `${JSON.stringify(live)}\n`);
  return {
    file,
    live,
    service: createCoachingUpdatesStrategyManagementService({
      runtimeStorePath: file,
      liveStore: live,
      now: () => new Date("2026-08-07T19:00:00.000Z"),
    }),
  };
}

function command(live) {
  const digest = createFounderRuntimeSemanticDigest(live);
  return {
    expectedRevision: getFounderStoreRevision(live),
    expectedSemanticDigest: digest,
    coaching: {
      protocolId: "coaching",
      expectedCurrentVersionId: "coaching-v1",
      effectiveDate: "2026-08-08",
      timeZone: "America/Los_Angeles",
      midweek: { enabled: true, day: "wednesday", localTime: "00:00" },
      weekly: { enabled: true, day: "sunday", localTime: "00:00" },
      monthly: { enabled: true, dayOfMonth: 1, localTime: "08:15" },
      daily: { enabled: false },
      eventBriefings: { photo: false, dexa: true },
      notificationPreference: "notify_when_ready",
      goalAssociation: { goalId: "goal", relationship: "supports" },
      provenance: provenance(),
    },
    photos: {
      protocolId: "photos",
      expectedCurrentVersionId: "photos-v1",
      expectedRevision: getFounderStoreRevision(live),
      expectedSemanticDigest: digest,
      effectiveDate: "2026-08-08",
      recurrence: {
        frequency: "weekly", interval: 2, weekdays: ["sunday"],
        timeOfDay: "evening", timezone: "America/Los_Angeles",
        anchorDate: "2026-07-25",
      },
      reminderEnabled: false,
      author: provenance().author,
    },
    dexa: {
      userId: "user",
      goalId: "goal",
      timezone: "America/Los_Angeles",
      expectedRevision: 1,
      draft: {
        plannedDate: "2026-08-22",
        localTime: "08:30",
        reminderPreferences: ["week_before", "morning_of"],
        uploadReminder: false,
        preparationNote: "Use the updated clinic note.",
      },
      author: provenance().author,
    },
  };
}

function currentCommand(live, reminderEnabled) {
  const coachingRoot = live.protocols.find((item) => item.id === "coaching");
  const coachingVersion = live.protocolVersions.find(
    (item) => item.id === coachingRoot.currentVersionId,
  );
  const coaching = resolveCoachingUpdatesReadModel({
    protocol: coachingRoot,
    version: coachingVersion,
    goal: live.goals[0],
  });
  const photos = createProgressPhotosExecutionHydrationModel(live);
  const dexa = live.executionItems.find((item) => item.id === "execution_next_dexa");

  return {
    expectedRevision: getFounderStoreRevision(live),
    expectedSemanticDigest: createFounderRuntimeSemanticDigest(live),
    coaching: {
      protocolId: coachingRoot.id,
      expectedCurrentVersionId: coachingVersion.id,
      effectiveDate: "2026-08-08",
      timeZone: coaching.timeZone,
      midweek: coaching.midweek,
      weekly: coaching.weekly,
      monthly: coaching.monthly,
      daily: coaching.daily,
      eventBriefings: coaching.eventBriefings,
      notificationPreference: coaching.notificationPreference,
      goalAssociation: { goalId: "goal", relationship: "supports" },
      provenance: provenance(),
    },
    photos: {
      ...photos.context,
      effectiveDate: "2026-08-08",
      recurrence: photos.item.recurrence,
      reminderEnabled,
      author: provenance().author,
    },
    dexa: {
      userId: "user",
      goalId: "goal",
      timezone: "America/Los_Angeles",
      expectedRevision: dexa.executionRevision,
      draft: {
        plannedDate: dexa.preferredSchedule.date,
        localTime: dexa.preferredSchedule.timeOfDay,
        reminderPreferences: dexa.reminderPreferences,
        uploadReminder: dexa.uploadReminder,
        preparationNote: dexa.preparationNote,
      },
      author: provenance().author,
    },
  };
}

function store() {
  const recurrence = {
    recurrenceVersion: "protocol_recurrence_v1",
    frequency: "weekly", interval: 2, weekdays: ["saturday"],
    timeOfDay: "afternoon", localTime: null, timezone: "America/Los_Angeles",
    anchorDate: "2026-07-25", effectiveAt: "2026-07-25", endDate: null,
  };
  return {
    revision: 85,
    user: { id: "user", timeZone: "America/Los_Angeles" },
    goals: [{ id: "goal", userId: "user", type: "build_lean_mass", status: "active" }],
    protocols: [
      { id: "coaching", userId: "user", protocolType: "briefings", category: "briefings", status: "active", currentVersionId: "coaching-v1", currentGoalIds: ["goal"], relatedGoalIds: ["goal"], effectiveStrategy: legacy() },
      { id: "photos", userId: "user", protocolType: "photos", category: "photos", status: "active", currentVersionId: "photos-v1", currentGoalIds: ["goal"], relatedGoalIds: ["goal"], activatedAt: "2026-07-25" },
    ],
    protocolVersions: [
      version({ id: "coaching-v1", protocolId: "coaching", intent: { summary: "Provide useful coaching updates." }, change: { reviewedChanges: legacy() } }),
      version({ id: "photos-v1", protocolId: "photos", intent: { summary: "Capture comparable progress photos." }, recurrence, change: { reviewedChanges: { recurrence } } }),
    ],
    executionItems: [
      { id: "execution_progress_photos", active: true, cadence: { type: "weekly", interval: 2 }, preferredSchedule: { daysOfWeek: ["saturday"], timeOfDay: "afternoon", timezone: "America/Los_Angeles", anchorDate: "2026-07-25" }, completionHistory: [{ evidenceDate: "2026-07-25" }], notes: "Preserve this note." },
      { id: "execution_next_dexa", userId: "user", type: "dexa_appointment", active: true, preferredSchedule: { date: "2026-08-15", timeOfDay: "07:30", daysOfWeek: [] }, timezone: "America/Los_Angeles", reminderPreferences: ["day_before"], uploadReminder: true, preparationNote: "Arrive fasted and hydrated.", status: "scheduled", linkedGoalIds: ["goal"], linkedStrategyIds: [], linkedEvidenceTypes: [], executionRevision: 1, createdAt: "2026-07-25T00:00:00.000Z" },
      { id: "execution_dexa", completedAt: "2026-07-18", completionHistory: [{ scanId: "scan" }] },
    ],
    reminders: [{ id: "reminder_weekly_progress_photo_set", active: true, schedule: recurrence, completionHistory: [{ evidenceDate: "2026-07-25" }], nextDueAt: "2026-08-08" }],
    dexaScans: [{ id: "scan", measuredAt: "2026-07-18" }],
    progressPhotos: [{ id: "photo", date: "2026-07-25" }],
    canonicalEvidenceObjects: [{ canonicalId: "evidence" }],
    evidenceReviews: [{ id: "review", status: "committed" }],
    dailyBriefings: [{ id: "briefing", cadence: "weekly" }],
  };
}
function version(overrides) { return { versionNumber: 1, status: "active", effectiveAt: "2026-07-25", endedAt: null, author: { type: "user", id: "user", displayName: "Founder" }, expectations: [], evaluationWindows: [], coachingPolicy: {}, reviewTriggers: [], evidenceBasis: {}, goalLinks: [{ goalId: "goal", relationship: "supports" }], confirmation: { confirmedByUser: true }, createdAt: "2026-07-25T00:00:00.000Z", ...overrides }; }
function legacy() { return { cadence: "Twice weekly", days: ["Wednesday", "Sunday"], dailyEvidenceCollection: true }; }
function provenance() { return { author: { type: "user", id: "user", displayName: "Founder" }, reason: "Update Coaching Updates.", confirmation: { confirmedByUser: true }, details: { source: "test" } }; }
function protectedSnapshot(value) { return JSON.stringify({ dexaScans: value.dexaScans, progressPhotos: value.progressPhotos, canonicalEvidenceObjects: value.canonicalEvidenceObjects, evidenceReviews: value.evidenceReviews, dailyBriefings: value.dailyBriefings, histories: value.executionItems.map((item) => item.completionHistory).filter(Boolean), reminderHistory: value.reminders[0].completionHistory }); }

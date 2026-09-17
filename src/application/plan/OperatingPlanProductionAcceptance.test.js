import { describe, expect, it } from "vitest";
import { createCoreNavigationReadService } from "../core/CoreNavigationReadService.js";
import { createCanonicalPersistenceCommandPorts } from "../commands/CanonicalPersistenceCommandPorts.js";
import { createInMemoryCanonicalRecordStore } from "../../platform/database/Phase4CanonicalRecordStore.js";
import { createRepositoryCoreNavigationReadStore } from "../../platform/database/PostgresCoreNavigationReadStore.js";
import { buildOperatingPlan } from "./OperatingPlanReadService.js";
import { createTransactionBoundPorts } from "../../platform/database/phase4PostgresComposition.js";
import { createInMemoryFoundationTransactionStore } from "../../platform/commands/InMemoryFoundationTransactionStore.js";
import { createPhase3CommandService, Phase3Command } from "../commands/Phase3CommandService.js";
import { createDailyFocusService } from "../../domain/services/DailyFocusService.js";

const OWNER = "founder-build33-test";
const NOW = new Date("2026-09-15T19:00:00.000Z");

describe("Build 33 production-shaped Operating Plan acceptance", () => {
  it("keeps unconfigured canonical domains tappable without inventing fixture strategies", () => {
    const sections = buildOperatingPlan({ protocols: [], executionItems: [], reminders: [] });
    for (const item of sections.flatMap((section) => section.items)) {
      expect(item.destination).not.toBeNull();
      if (!item.href) expect(item.destination).toMatchObject({
        id: "native.operating-plan.status",
        parameters: { title: item.title, detail: item.detail },
      });
    }
  });
  it("projects all eight canonical landing destinations on the server", () => {
    const runtime = source();
    const sections = buildOperatingPlan({
      energyStrategy: { protocolId: "energy", selectedPace: "maintenance_calibration" },
      nutritionContext: { activeProtocolId: "nutrition" },
      trainingProtocol: { protocolId: "training", trainingStrategy: { weeklyFrequencies: { chest: 2 }, progression: { pace: "moderate" } } },
      protocols: runtime.protocols,
      executionItems: runtime.executionItems,
      reminders: runtime.reminders,
    });
    expect(sections.map((section) => section.title)).toEqual([
      "Energy Strategy", "Nutrition", "Training", "Recovery", "Peptides", "Supplements", "Tracking", "Coaching Updates",
    ]);
    expect(sections.flatMap((section) => section.items).map((item) => item.destination)).toEqual([
      { id: "plan.strategy", parameters: { strategyType: "energy", strategyId: "energy" } },
      { id: "plan.strategy", parameters: { strategyType: "nutrition", strategyId: "nutrition" } },
      { id: "plan.strategy", parameters: { strategyType: "training", strategyId: "training" } },
      { id: "plan.support", parameters: { supportType: "protocol", supportId: "recovery" } },
      { id: "plan.support", parameters: { supportType: "protocol", supportId: "peptide" } },
      { id: "plan.support", parameters: { supportType: "protocol", supportId: "supplement" } },
      { id: "plan.support", parameters: { supportType: "tracking", supportId: "current" } },
      { id: "plan.strategy", parameters: { strategyType: "briefings", strategyId: "coaching" } },
    ]);
  });

  it("reads Energy's real canonical strategy while intentionally withholding edits", async () => {
    const fixture = setup();
    const detail = await fixture.reads().getEnergyStrategyDetail({ strategyId: "energy" });
    expect(detail).toMatchObject({ protocolId: "energy", intentionallyReadOnly: true, editLabel: null });
    expect(detail.fields).toContainEqual({ label: "Plan Type", value: "Adjusting gradually from weekly signals" });
    expect(await fixture.reads().getEnergyStrategyDetail({ strategyId: "coaching" })).toBeNull();
    expect(Object.keys(detail)).not.toContain("protocolVersions");
  });

  it.each([
    ["valid IANA", { timeZone: "Pacific/Auckland" }],
    ["missing", {}],
    ["undefined", { timeZone: undefined, timezone: undefined }],
    ["production absent timeZone/null timezone", { timezone: null }],
    ["both null", { timeZone: null, timezone: null }],
    ["existing invalid-zone fallback", { timezone: "not-an-IANA-zone" }],
  ])("follows all eight production-shaped landing destinations with %s owner timezone", async (_label, timezoneFields) => {
    const fixture = setup({ timezoneFields });
    const reads = fixture.reads();
    const runtime = fixture.snapshot();
    const sections = buildOperatingPlan({
      energyStrategy: { protocolId: "energy", selectedPace: "maintenance_calibration" },
      nutritionContext: { activeProtocolId: "nutrition" },
      trainingProtocol: { protocolId: "training", trainingStrategy: { weeklyFrequencies: { chest: 2 } } },
      protocols: runtime.protocols, executionItems: runtime.executionItems, reminders: runtime.reminders,
    });
    const strategyReads = {
      energy: (strategyId) => reads.getEnergyStrategyDetail({ strategyId }),
      nutrition: (strategyId) => reads.getNutritionStrategyDetail({ strategyId }),
      training: (strategyId) => reads.getTrainingStrategyDetail({ strategyId }),
      briefings: (strategyId) => reads.getCoachingUpdatesDetail({ strategyId }),
    };
    for (const section of sections) {
      const destination = section.items[0].destination;
      const parameters = destination.parameters;
      if (destination.id === "plan.strategy") {
        expect(await strategyReads[parameters.strategyType](parameters.strategyId)).toMatchObject({ protocolId: parameters.strategyId });
      } else if (parameters.supportType === "tracking") {
        const tracking = await reads.getTracking();
        expect(tracking.morningWeighIn.executionItem.id).toBe("execution_morning_weigh_in");
        expect(await reads.getRecurringSupport({ executionId: tracking.morningWeighIn.executionItem.id })).not.toBeNull();
      } else {
        const domain = await reads.getOperatingPlanProtocolDomain({ protocolId: parameters.supportId });
        const method = domain.methods.find((item) => item.protocolId === parameters.supportId);
        expect(method.editDestination).not.toBeNull();
        if (domain.category === "recovery") expect(await reads.getRecurringSupport({ executionId: method.editDestination.parameters.executionId })).not.toBeNull();
        if (domain.category === "peptide") expect(await reads.getPeptideSupport({ protocolId: method.protocolId })).not.toBeNull();
        if (domain.category === "supplement") expect(await reads.getSupplementSupport({ protocolId: method.protocolId })).not.toBeNull();
      }
    }
    expect(sections).toHaveLength(8);
  });

  it("reads four active Supplement daypart/legacy schedules with null owner timezone without normalizing persisted state", async () => {
    const runtime = source(); delete runtime.user.timeZone; runtime.user.timezone = null;
    const baseRoot = runtime.protocols.find(item => item.id === "supplement");
    const baseVersion = runtime.protocolVersions.find(item => item.protocolId === "supplement");
    const baseExecution = runtime.executionItems.find(item => item.id === "execution-supplement");
    const baseReminder = runtime.reminders.find(item => item.id === "reminder-supplement");
    runtime.protocols = runtime.protocols.filter(item => item.category !== "supplement");
    runtime.protocolVersions = runtime.protocolVersions.filter(item => item.protocolId !== "supplement");
    runtime.executionItems = runtime.executionItems.filter(item => item.type !== "supplement");
    runtime.reminders = runtime.reminders.filter(item => item.type !== "supplement_reminder");
    for (const [index, name] of ["Tongkat Ali", "Fadogia Agrestis", "Multivitamin", "Electrolytes"].entries()) {
      const id = `supplement-${index}`, startDate = index === 1 ? "2026-07-25" : "";
      runtime.protocols.push({ ...baseRoot, id, name, currentVersionId: `${id}-v1`, startDate: "" });
      runtime.protocolVersions.push({ ...baseVersion, id: `${id}-v1`, protocolId: id });
      runtime.executionItems.push({ ...structuredClone(baseExecution), id: `execution-${id}`, protocolRootId: id, supplementVersionId: `${id}-v1`,
        cadence: { type: index === 1 ? "every_other_day" : "daily" }, preferredSchedule: { timeOfDay: "morning", daysOfWeek: [], startDate, endDate: null } });
      runtime.reminders.push({ ...structuredClone(baseReminder), id: `reminder-${id}`, linkedEntityId: id, linkedExecutionId: `execution-${id}`,
        schedule: { type: "daily", timeOfDay: "morning", startDate, timezone: null } });
    }
    const before = JSON.stringify(runtime);
    const reads = createCoreNavigationReadService({ now: () => NOW,
      store: createRepositoryCoreNavigationReadStore({ readRuntimeStore: () => runtime }) });
    expect((await reads.getOperatingPlanProtocolDomain({ protocolId: "supplement-0" })).methods).toHaveLength(4);
    for (let i = 0; i < 4; i++) expect(await reads.getSupplementSupport({ protocolId: `supplement-${i}` })).toMatchObject({
      executionRevision: 1, supportSchedule: { timing: "morning", endDate: null } });
    expect(await reads.getSupplementStrategyEditor()).toMatchObject({ mode: "create", startDate: "2026-09-15" });
    expect(JSON.stringify(runtime)).toBe(before);
  });

  it("round-trips Supplement dose/schedule/reminder edits with dual concurrency and preserved history", async () => {
    const fixture = setup();
    const detail = await fixture.reads().getSupplementSupport({ protocolId: "supplement" });
    expect(detail).toMatchObject({ supplementVersionId: "supplement-v1", executionRevision: 1, doseAmount: "1", doseUnit: "capsule" });
    const before = fixture.snapshot();
    const draft = supplementDraft("2026-12-31");
    const saved = await fixture.ports.saveSupplementSupport(context({
      protocolId: detail.protocolId, supplementVersionId: detail.supplementVersionId, draft,
    }, detail.executionRevision));
    expect(saved.result).toMatchObject({ status: "updated", executionRevision: 2 });
    const after = fixture.snapshot();
    const execution = after.executionItems.find((item) => item.id === "execution-supplement");
    const reminder = after.reminders.find((item) => item.id === "reminder-supplement");
    expect(execution).toMatchObject({ dose: { amount: "2", unit: "capsules" }, preferredSchedule: { timeOfDay: "08:40", endDate: "2026-12-31" } });
    expect(reminder).toMatchObject({ id: "reminder-supplement", active: true, schedule: { timeOfDay: "08:40", endDate: "2026-12-31" } });
    expect(execution.timeline).toEqual(before.executionItems.find((item) => item.id === execution.id).timeline);
    expect(execution.completionHistory).toEqual(before.executionItems.find((item) => item.id === execution.id).completionHistory);
    expect(reminder.completionHistory).toEqual(before.reminders.find((item) => item.id === reminder.id).completionHistory);
    const homePriority = createDailyFocusService().getDailyFocus({
      ...after, now: new Date("2026-09-17T15:00:00.000Z"), timeZone: "America/Los_Angeles",
    }).find((item) => item.protocolId === "supplement");
    expect(homePriority.notificationAction).toMatchObject({
      scheduledTime: "08:40", classification: "specialized_workflow_required",
      completionCommand: { commandType: "priority.complete.v1", payload: { protocolId: "supplement" } },
    });
    expect(await fixture.reads().getSupplementSupport({ protocolId: "supplement" })).toMatchObject({
      doseAmount: "2", doseUnit: "capsules", supportSchedule: { specificTime: "08:40", endDate: "2026-12-31" },
    });
    const snapshot = JSON.stringify(fixture.snapshot());
    await expect(fixture.ports.saveSupplementSupport(context({ protocolId: "supplement", supplementVersionId: "supplement-v1", draft }, 1)))
      .rejects.toMatchObject({ code: "STALE_VERSION" });
    await expect(fixture.ports.saveSupplementSupport(context({ protocolId: "supplement", supplementVersionId: "stale", draft }, 2)))
      .rejects.toMatchObject({ code: "STALE_VERSION" });
    expect(JSON.stringify(fixture.snapshot())).toBe(snapshot);
    await fixture.ports.saveSupplementSupport(context({ protocolId: "supplement", supplementVersionId: "supplement-v1", draft: supplementDraft(null) }, 2));
    expect(await fixture.reads().getSupplementSupport({ protocolId: "supplement" })).toMatchObject({ supportSchedule: { endDate: null } });
  });

  it("uses canonical Supplement creation/successor/lifecycle semantics and includes paused methods in readback", async () => {
    const fixture = setup();
    const editor = await fixture.reads().getSupplementStrategyEditor();
    expect(editor).toMatchObject({ mode: "create", goalId: "goal" });
    const draft = { name: "Creatine Monohydrate", purpose: "Training support", role: "Support output", goalId: "goal", startDate: "2026-09-15", initialStatus: "active" };
    const created = await fixture.ports.saveSupplementStrategy(context({ operation: "create", draft }));
    const protocolId = created.result.protocolId;
    const versionId = created.result.currentVersionId;
    expect(await fixture.reads().getSupplementStrategyEditor({ protocolId })).toMatchObject({ expectedCurrentVersionId: versionId, name: draft.name });
    const beforeExecution = fixture.snapshot().executionItems;
    fixture.advanceDay();
    await fixture.ports.changeSupplementLifecycle(context({ protocolId, operation: "pause", expectedCurrentVersionId: versionId }));
    expect((await fixture.reads().getOperatingPlanProtocolDomain({ protocolId })).methods).toEqual(expect.arrayContaining([
      expect.objectContaining({ protocolId, lifecycleState: "paused", currentVersionId: versionId }),
    ]));
    expect(await fixture.reads().getSupplementStrategyEditor({ protocolId })).toBeNull();
    fixture.advanceDay();
    const restored = await fixture.ports.changeSupplementLifecycle(context({ protocolId, operation: "restore", expectedCurrentVersionId: versionId }));
    expect(restored.result.currentVersionId).not.toBe(versionId);
    fixture.advanceDay();
    const edited = await fixture.ports.saveSupplementStrategy(context({ operation: "edit", draft: {
      ...draft, protocolId, expectedCurrentVersionId: restored.result.currentVersionId, purpose: "Strength support",
    } }));
    expect(edited.result.currentVersionId).not.toBe(restored.result.currentVersionId);
    expect(await fixture.reads().getSupplementStrategyEditor({ protocolId })).toMatchObject({ purpose: "Strength support" });
    expect(fixture.snapshot().executionItems).toEqual(beforeExecution);
    await expect(fixture.ports.changeSupplementLifecycle(context({ protocolId, operation: "pause", expectedCurrentVersionId: versionId })))
      .rejects.toMatchObject({ code: "STALE_VERSION" });
    await expect(fixture.ports.saveSupplementStrategy(context({ operation: "create", draft: { ...draft, name: " creatine   monohydrate " } })))
      .rejects.toMatchObject({ code: "SUPPLEMENT_STRATEGY_DUPLICATE" });
  });

  it("keeps canonical Restore reachable when every Supplement is paused", async () => {
    const fixture = setup();
    await fixture.ports.changeSupplementLifecycle(context({ protocolId: "supplement", operation: "pause", expectedCurrentVersionId: "supplement-v1" }));
    const plan = await fixture.reads().getOperatingPlan();
    const section = plan.sections.find((item) => item.title === "Supplements");
    expect(section).toMatchObject({ subtitle: "0 active · 1 paused", items: [expect.objectContaining({ status: "Paused", destination: { id: "plan.support", parameters: { supportType: "protocol", supportId: "supplement" } } })] });
    const domain = await fixture.reads().getOperatingPlanProtocolDomain({ protocolId: section.items[0].destination.parameters.supportId });
    expect(domain.methods[0]).toMatchObject({ protocolId: "supplement", lifecycleState: "paused", currentVersionId: "supplement-v1" });
    expect(buildOperatingPlan({ protocols: fixture.snapshot().protocols }).find((item) => item.title === "Supplements")).toBeUndefined();
  });

  it("atomically round-trips Coaching Updates, Progress Photos, reminder, and DEXA with every concurrency fence", async () => {
    const fixture = setup();
    const detail = await fixture.reads().getCoachingUpdatesDetail({ strategyId: "coaching" });
    expect(detail.context).toMatchObject({ expectedRevision: 85, expectedCurrentVersionId: "coaching-v1", photoExpectedCurrentVersionId: "photos-v1", dexaExpectedRevision: 1 });
    expect(detail.editor.photos).toMatchObject({ cadence: "weekly_interval_2", day: "saturday", reminderEnabled: true });
    const before = protectedSnapshot(fixture.snapshot());
    const draft = structuredClone(detail.editor);
    draft.monthly.localTime = "08:15";
    draft.photos.day = "sunday";
    draft.photos.timeOfDay = "evening";
    draft.photos.reminderEnabled = false;
    draft.dexa = { plannedDate: "2026-10-22", localTime: "08:30", reminderPreferences: ["week_before", "morning_of"], uploadReminder: false, preparationNote: "Updated clinic note" };
    draft.photoEventBriefingEnabled = false;
    draft.notificationPreference = "notify_when_ready";
    const payload = { protocolId: detail.protocolId, ...detail.context, draft };
    delete payload.expectedRevision;
    const saved = await fixture.ports.saveCoachingUpdates(context(payload, detail.context.expectedRevision));
    expect(saved.result).toMatchObject({ status: "updated", revision: 86, coachingChanged: true, photosChanged: true, photoReminderChanged: true, dexaChanged: true });
    expect(protectedSnapshot(fixture.snapshot())).toBe(before);
    const readback = await fixture.reads().getCoachingUpdatesDetail({ strategyId: "coaching" });
    expect(readback.editor).toEqual(draft);
    expect(readback.context).toMatchObject({ expectedRevision: 86, dexaExpectedRevision: 2 });
    expect(readback.context.expectedCurrentVersionId).not.toBe("coaching-v1");
    expect(fixture.snapshot().reminders.find((item) => item.id === "reminder_weekly_progress_photo_set"))
      .toMatchObject({ active: false, schedule: { daysOfWeek: ["sunday"], timeOfDay: "evening", anchorDate: "2026-07-25" } });
    const homePriorities = createDailyFocusService().getDailyFocus({
      ...fixture.snapshot(), now: new Date("2026-10-22T14:00:00.000Z"), timeZone: "America/Los_Angeles",
    });
    expect(homePriorities.find((item) => item.executionId === "execution_next_dexa").notificationAction)
      .toMatchObject({ scheduledTime: "08:30", classification: "specialized_workflow_required", completionCommand: null });
    const snapshot = JSON.stringify(fixture.snapshot());
    await expect(fixture.ports.saveCoachingUpdates(context(payload, 85))).rejects.toMatchObject({ code: "STALE_VERSION" });
    for (const patch of [
      { expectedSemanticDigest: "stale" },
      { expectedCurrentVersionId: "stale" },
      { photoExpectedSemanticDigest: "stale" },
      { photoExpectedCurrentVersionId: "missing" },
      { dexaExpectedRevision: 1 },
    ]) {
      const currentPayload = { protocolId: "coaching", ...readback.context, draft: { ...draft, notificationPreference: "available_without_notification" }, ...patch };
      delete currentPayload.expectedRevision;
      await expect(fixture.ports.saveCoachingUpdates(context(currentPayload, 86))).rejects.toMatchObject({ status: expect.any(Number) });
      expect(JSON.stringify(fixture.snapshot())).toBe(snapshot);
    }
    const invalid = structuredClone(draft);
    invalid.dexa.plannedDate = "2026-09-15";
    const invalidPayload = { protocolId: "coaching", ...readback.context, draft: invalid };
    delete invalidPayload.expectedRevision;
    await expect(fixture.ports.saveCoachingUpdates(context(invalidPayload, 86))).rejects.toMatchObject({ code: "COACHING_UPDATES_INVALID" });
    expect(JSON.stringify(fixture.snapshot())).toBe(snapshot);
  });

  it("treats a completed historical DEXA as history and saves Coaching with the production null-timezone owner shape", async () => {
    const fixture = setup({
      timezoneFields: { timezone: null },
      completedDexa: true,
    });
    const detail = await fixture.reads().getCoachingUpdatesDetail({ strategyId: "coaching" });
    expect(detail.editor.dexa).toMatchObject({
      plannedDate: "",
      localTime: "",
      reminderPreferences: [],
      uploadReminder: false,
      preparationNote: "",
    });
    const draft = structuredClone(detail.editor);
    draft.weekly.localTime = "08:15";
    const payload = { protocolId: detail.protocolId, ...detail.context, draft };
    delete payload.expectedRevision;

    const saved = await fixture.ports.saveCoachingUpdates(
      context(payload, detail.context.expectedRevision)
    );

    expect(saved.result).toMatchObject({ status: "updated", coachingChanged: true });
    const readback = await fixture.reads().getCoachingUpdatesDetail({ strategyId: "coaching" });
    expect(readback.editor.weekly.localTime).toBe("08:15");
  });

  it("persists Midweek, Weekly, and Monthly edits independently on one local day without equal-date successors", async () => {
    const fixture = setup();
    const initial = await fixture.reads().getCoachingUpdatesDetail({ strategyId: "coaching" });
    const midweek = structuredClone(initial.editor);
    midweek.midweek.localTime = "05:30";
    const midweekPayload = { protocolId: initial.protocolId, ...initial.context, draft: midweek };
    delete midweekPayload.expectedRevision;
    await fixture.ports.saveCoachingUpdates(context(midweekPayload, initial.context.expectedRevision));

    const afterMidweek = await fixture.reads().getCoachingUpdatesDetail({ strategyId: "coaching" });
    const effectiveVersionId = afterMidweek.context.expectedCurrentVersionId;
    const weekly = structuredClone(afterMidweek.editor);
    weekly.weekly.localTime = "06:45";
    const weeklyPayload = { protocolId: afterMidweek.protocolId, ...afterMidweek.context, draft: weekly };
    delete weeklyPayload.expectedRevision;
    await fixture.ports.saveCoachingUpdates(context(weeklyPayload, afterMidweek.context.expectedRevision));

    const afterWeekly = await fixture.reads().getCoachingUpdatesDetail({ strategyId: "coaching" });
    expect(afterWeekly.context.expectedCurrentVersionId).toBe(effectiveVersionId);
    expect(afterWeekly.editor).toMatchObject({
      midweek: { day: "wednesday", localTime: "05:30" },
      weekly: { day: "sunday", localTime: "06:45" },
      monthly: { dayOfMonth: 1 },
    });

    const monthly = structuredClone(afterWeekly.editor);
    monthly.monthly.localTime = "07:15";
    const monthlyPayload = { protocolId: afterWeekly.protocolId, ...afterWeekly.context, draft: monthly };
    delete monthlyPayload.expectedRevision;
    await fixture.ports.saveCoachingUpdates(context(monthlyPayload, afterWeekly.context.expectedRevision));

    const final = await fixture.reads().getCoachingUpdatesDetail({ strategyId: "coaching" });
    expect(final.context.expectedCurrentVersionId).toBe(effectiveVersionId);
    expect(final.editor).toMatchObject({
      midweek: { enabled: true, day: "wednesday", localTime: "05:30" },
      weekly: { enabled: true, day: "sunday", localTime: "06:45" },
      monthly: { enabled: true, dayOfMonth: 1, localTime: "07:15" },
    });
    const runtime = fixture.snapshot();
    const coachingVersions = runtime.protocolVersions.filter((item) => item.protocolId === "coaching");
    expect(coachingVersions.filter((item) => item.status === "active" && !item.endedAt)).toHaveLength(1);
    expect(coachingVersions.find((item) => item.id === effectiveVersionId)?.change?.sameDayAmendments)
      .toHaveLength(2);

    // A second editor loaded before the Weekly save is still rejected after
    // the same-record amendment because its semantic digest is stale.
    const staleMonthly = structuredClone(afterMidweek.editor);
    staleMonthly.monthly.localTime = "09:00";
    const stalePayload = { protocolId: afterMidweek.protocolId, ...afterMidweek.context, draft: staleMonthly };
    delete stalePayload.expectedRevision;
    await expect(fixture.ports.saveCoachingUpdates(
      context(stalePayload, afterMidweek.context.expectedRevision)
    )).rejects.toMatchObject({ code: "STALE_VERSION" });
  });

  it("rolls back a mid-persistence composite failure and replays one durable save without duplicate versions", async () => {
    const initial = setup();
    const detail = await initial.reads().getCoachingUpdatesDetail({ strategyId: "coaching" });
    let durable = initial.snapshot();
    let revision = detail.context.expectedRevision;
    let failPutAt = 2;
    const receipts = createInMemoryFoundationTransactionStore();
    const runner = {
      async run(work) {
        const base = createInMemoryCanonicalRecordStore(durable, { runtimeMetadata: { revision, version: 1 } });
        let puts = 0;
        const staged = {
          ...base,
          async put(input) {
            puts += 1;
            if (puts === failPutAt) throw new Error("Injected second canonical write failure");
            return base.put(input);
          },
        };
        const result = await receipts.run((transaction) => work({
          ...transaction, canonicalRecords: staged, client: { query: async () => ({ rows: [] }) },
        }));
        durable = base.snapshot();
        revision = (await base.getRuntimeMetadata()).revision;
        return result;
      },
    };
    const boundPorts = createTransactionBoundPorts({
      now: () => NOW,
      compatibilityMode: false,
      authorityStore: { claimCanonicalWriteBoundary: async () => null },
    });
    const service = createPhase3CommandService({ transactionRunner: runner, ports: boundPorts });
    const draft = structuredClone(detail.editor);
    draft.photos.day = "sunday";
    draft.dexa.plannedDate = "2026-10-22";
    draft.notificationPreference = "notify_when_ready";
    const payload = { protocolId: detail.protocolId, ...detail.context, draft };
    delete payload.expectedRevision;
    const request = {
      commandType: Phase3Command.SAVE_COACHING_UPDATES,
      principal: { userId: OWNER, deviceId: "test-device", sessionId: "test-session" },
      metadata: { commandId: "01911111-1111-7111-8111-111111111119", idempotencyKey: "build33-atomic-composite-once", expectedVersion: "85" },
      payload,
    };
    const before = JSON.stringify(durable);
    await expect(service.execute(request)).rejects.toThrow("Injected second canonical write failure");
    expect(JSON.stringify(durable)).toBe(before);
    expect(revision).toBe(85);
    expect(receipts.inspect().commandReceipts.size).toBe(0);
    failPutAt = -1;
    const first = await service.execute(request);
    expect(first.outcome).toBe("committed");
    expect(first.receipt.result.revision).toBe(86);
    const committed = JSON.stringify(durable);
    const replay = await service.execute(request);
    expect(replay.outcome).toBe("replayed");
    expect(replay.receipt.result).toEqual(first.receipt.result);
    expect(JSON.stringify(durable)).toBe(committed);
    expect(revision).toBe(86);
  });

  it("advances the global composite fence for an independent Native Supplement save", async () => {
    const fixture = setup();
    const boundPorts = createTransactionBoundPorts({
      now: () => NOW, compatibilityMode: false,
      authorityStore: { claimCanonicalWriteBoundary: async () => null },
    });
    await boundPorts.saveSupplementSupport({
      ...context({ protocolId: "supplement", supplementVersionId: "supplement-v1", draft: supplementDraft(null) }, 1),
      transaction: { canonicalRecords: fixture.records, client: { query: async () => ({ rows: [] }) } },
    });
    expect((await fixture.records.getRuntimeMetadata()).revision).toBe(86);
  });
});

function setup({ timezoneFields, completedDexa = false } = {}) {
  const runtime = source();
  if (timezoneFields) {
    delete runtime.user.timeZone;
    Object.assign(runtime.user, timezoneFields);
    for (const reminder of runtime.reminders) reminder.schedule.timezone = null;
  }
  if (completedDexa) {
    const dexa = runtime.executionItems.find((item) => item.id === "execution_next_dexa");
    dexa.active = false;
    dexa.status = "completed";
    dexa.completedAt = "2026-08-15T15:00:00.000Z";
    dexa.preferredSchedule.date = "2026-08-15";
  }
  let clock = NOW;
  let revision = runtime.revision;
  const { revision: _revision, ...collections } = runtime;
  const baseRecords = createInMemoryCanonicalRecordStore(collections, { runtimeMetadata: { revision, version: 1 } });
  const records = {
    ...baseRecords,
    async advanceRuntimeMetadata(command) {
      const result = await baseRecords.advanceRuntimeMetadata(command);
      revision = result.revision;
      return result;
    },
  };
  const snapshot = () => records.snapshot();
  return {
    records, snapshot,
    advanceDay() { clock = new Date(clock.getTime() + 86400000); },
    ports: createCanonicalPersistenceCommandPorts({ records, now: () => clock }),
    reads: () => createCoreNavigationReadService({
      now: () => clock,
      store: createRepositoryCoreNavigationReadStore({ readRuntimeStore: () => ({
        ...snapshot(), user: snapshot().user[0], revision,
      }) }),
    }),
  };
}

function context(payload, expectedVersion = null) {
  return { ownerUserId: OWNER, payload, metadata: { expectedVersion: expectedVersion == null ? null : String(expectedVersion), commandId: "build33-test-command" } };
}

function supplementDraft(endDate) {
  return {
    dose: { amount: "2", unit: "capsules" },
    supportSchedule: { frequency: "specific_days", daysOfWeek: ["monday", "thursday"], intervalDays: 1, timing: "specific", specificTime: "08:40", startDate: "2026-07-25", endDate },
    reminderPreference: "remind", notes: "With breakfast",
  };
}

function source() {
  const recurrence = { recurrenceVersion: "protocol_recurrence_v1", frequency: "weekly", interval: 2, weekdays: ["saturday"], timeOfDay: "afternoon", localTime: null, timezone: "America/Los_Angeles", anchorDate: "2026-07-25", effectiveAt: "2026-07-25", endDate: null };
  return {
    revision: 85,
    user: { id: OWNER, displayName: "Founder", timeZone: "America/Los_Angeles" },
    goals: [{ id: "goal", userId: OWNER, primary: true, type: "build_lean_mass", status: "active", title: "Build Lean Mass" }],
    protocols: [
      root("energy", "energy", { effectiveStrategy: { mode: "Maintenance Calibration", calorieStrategy: "calibrate", activityStrategy: "consistent" } }),
      root("nutrition", "nutrition"), root("training", "training"), root("recovery", "recovery"), root("peptide", "peptide"),
      root("supplement", "supplement", { name: "Tongkat Ali", startDate: "2026-07-25" }),
      root("coaching", "briefings", { effectiveStrategy: legacy() }), root("photos", "photos", { activatedAt: "2026-07-25" }),
      root("weight", "weight"),
    ],
    protocolVersions: [
      version("energy", {}), version("nutrition", { effectiveStrategy: { proteinBasis: "body_weight", proteinRatio: 1, carbohydrateStrategy: "performance", fatStrategy: "sustainable_minimum" } }),
      version("training", { trainingStrategy: { weeklyFrequencies: { chest: 2 }, priorities: ["chest"], progression: { pace: "moderate" } } }), version("recovery", {}), version("peptide", {}),
      version("supplement", { supplementStrategy: { name: "Tongkat Ali", purpose: "Recovery support", role: "Daily support" } }),
      version("coaching", { change: { reviewedChanges: legacy() } }),
      version("photos", { recurrence, change: { reviewedChanges: { recurrence } } }),
    ],
    executionItems: [
      { id: "execution-recovery", userId: OWNER, type: "recovery", title: "Foam Rolling", active: true, linkedProtocolId: "recovery", cadence: { type: "daily" }, preferredSchedule: { timeOfDay: "17:00", startDate: "2026-07-25", daysOfWeek: [] }, executionRevision: 1 },
      { id: "execution_morning_weigh_in", userId: OWNER, type: "weight", title: "Morning Weigh-In", active: true, linkedProtocolId: "weight", cadence: { type: "daily" }, preferredSchedule: { timeOfDay: "07:00", startDate: "2026-07-25", daysOfWeek: [] }, executionRevision: 1 },
      { id: "execution-supplement", userId: OWNER, type: "supplement", title: "Tongkat Ali", active: true, protocolRootId: "supplement", supplementVersionId: "supplement-v1", linkedStrategyIds: ["supplement"], linkedGoalIds: ["goal"], dose: { amount: "1", unit: "capsule" }, cadence: { type: "daily" }, preferredSchedule: { daysOfWeek: [], timeOfDay: "morning", startDate: "2026-07-25", endDate: null }, reminderPreference: "remind", priority: "high", notes: "", timeline: [{ startDate: "2026-01-01", notes: "Historical" }], completionHistory: [{ occurrenceDate: "2026-07-01", status: "completed" }], executionRevision: 1, createdAt: "2026-07-25T19:00:00Z" },
      { id: "execution_progress_photos", userId: OWNER, active: true, cadence: { type: "weekly", interval: 2 }, preferredSchedule: { daysOfWeek: ["saturday"], timeOfDay: "afternoon", timezone: "America/Los_Angeles", anchorDate: "2026-07-25" }, completionHistory: [{ evidenceDate: "2026-07-25" }] },
      { id: "execution_next_dexa", userId: OWNER, type: "dexa_appointment", active: true, preferredSchedule: { date: "2026-10-15", timeOfDay: "07:30", daysOfWeek: [] }, timezone: "America/Los_Angeles", reminderPreferences: ["day_before"], uploadReminder: true, preparationNote: "Arrive hydrated", status: "scheduled", linkedGoalIds: ["goal"], linkedStrategyIds: [], linkedEvidenceTypes: [], executionRevision: 1, createdAt: "2026-07-25T00:00:00Z", completionHistory: [{ date: "2026-01-01" }] },
      { id: "execution_dexa", userId: OWNER, completedAt: "2026-07-18", completionHistory: [{ scanId: "scan" }] },
    ],
    reminders: [
      { id: "reminder-recovery", userId: OWNER, type: "recovery_reminder", linkedEntityType: "protocol", linkedEntityId: "recovery", active: true, schedule: { type: "daily", timeOfDay: "17:00" } },
      { id: "reminder_morning_weight", userId: OWNER, type: "protocol_reminder", linkedEntityType: "protocol", linkedEntityId: "weight", active: true, schedule: { type: "daily", timeOfDay: "07:00" } },
      { id: "reminder-supplement", userId: OWNER, type: "supplement_reminder", linkedEntityType: "protocol", linkedEntityId: "supplement", linkedExecutionId: "execution-supplement", active: true, schedule: { type: "daily", cadence: "daily", timeOfDay: "morning", startDate: "2026-07-25" }, completionHistory: [{ occurrenceDate: "2026-07-30", status: "completed" }] },
      { id: "reminder_weekly_progress_photo_set", userId: OWNER, active: true, schedule: recurrence, completionHistory: [{ evidenceDate: "2026-07-25" }], nextDueAt: "2026-09-19" },
    ],
    dexaScans: [{ id: "scan", measuredAt: "2026-07-18" }],
    progressPhotos: [{ id: "photo", date: "2026-07-25" }],
    evidenceReviews: [{ id: "review", status: "committed" }],
  };
}

function root(id, category, extra = {}) { return { id, userId: OWNER, name: id, category, protocolType: category, status: "active", currentVersionId: `${id}-v1`, currentGoalIds: ["goal"], relatedGoalIds: ["goal"], ...extra }; }
function version(protocolId, extra) { return { id: `${protocolId}-v1`, protocolId, versionNumber: 1, status: "active", effectiveAt: "2026-07-25", endedAt: null, author: { type: "user", id: OWNER, displayName: "Founder" }, intent: { summary: "Support the current Goal" }, expectations: [], evaluationWindows: [], coachingPolicy: {}, reviewTriggers: [], evidenceBasis: {}, goalLinks: [{ goalId: "goal", relationship: "supports" }], confirmation: { confirmedByUser: true }, createdAt: "2026-07-25T00:00:00Z", ...extra }; }
function legacy() { return { cadence: "Twice weekly", days: ["Wednesday", "Sunday"], dailyEvidenceCollection: true }; }
function protectedSnapshot(runtime) { return JSON.stringify({ dexaScans: runtime.dexaScans, progressPhotos: runtime.progressPhotos, evidenceReviews: runtime.evidenceReviews, histories: runtime.executionItems.map((item) => item.completionHistory), reminderHistories: runtime.reminders.map((item) => item.completionHistory) }); }

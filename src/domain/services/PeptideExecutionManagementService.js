import { createFounderStoreUnitOfWork, FounderStoreUnitOfWorkErrorCode } from "../../data/repositories/FounderStoreUnitOfWork";
import {
  hydrateSupportSchedule,
  normalizeSupportSchedule,
  supportScheduleToExecution,
  supportScheduleToReminder,
  validateSupportSchedule,
} from "../models/SupportScheduleModel";
import {
  generatePeptideDosingTimeline,
  hydratePeptideDosingStrategy,
  normalizePeptideDosingStrategy,
} from "../models/PeptideDosingStrategyModel";
export {
  formatPeptideDose,
  formatPeptideExecutionSummary,
  resolvePeptideDose,
} from "./ExecutionPhaseResolver";

export const PeptideExecutionOutcome = Object.freeze({
  SUCCESS: "success", UNCHANGED: "unchanged", INVALID: "invalid", NOT_FOUND: "not_found",
  VERSION_CONFLICT: "version_conflict", PERSISTENCE_FAILURE: "persistence_failure", PUBLICATION_FAILURE: "publication_failure",
});
export const PeptideExecutionState = Object.freeze({
  UNCONFIGURED:"unconfigured",LEGACY_COMPATIBLE:"legacy_compatible",CANONICAL:"canonical",INVALID:"invalid",
});

export function classifyPeptideExecutionState({protocol,executionItems=[]}={}) {
  if(!protocol?.id||protocol.category!=="peptide")return{state:PeptideExecutionState.INVALID,record:null,reason:"invalid_protocol"};
  const compatible=executionItems.filter((item)=>item?.userId===protocol.userId&&(
    item.type==="peptide"&&item.protocolRootId===protocol.id||
    item.type==="protocol"&&(item.protocolRootId===protocol.id||(!item.protocolRootId&&item.title===protocol.name))
  ));
  if(compatible.length>1)return{state:PeptideExecutionState.INVALID,record:null,reason:"ambiguous_records"};
  const record=compatible[0]??null;
  if(!record)return{state:PeptideExecutionState.UNCONFIGURED,record:null,reason:null};
  const canonical=record.type==="peptide"&&record.protocolRootId===protocol.id&&Number.isSafeInteger(record.executionRevision)&&record.executionRevision>0&&record.cadence?.type&&record.preferredSchedule&&Array.isArray(record.timeline);
  return{state:canonical?PeptideExecutionState.CANONICAL:PeptideExecutionState.LEGACY_COMPATIBLE,record,reason:null};
}

export function createPeptideExecutionManagementService({ runtimeStorePath, liveStore, now = () => new Date(), createUnitOfWork = (options) => createFounderStoreUnitOfWork(options), faults = {} } = {}) {
  if (!runtimeStorePath || !liveStore) throw new Error("Peptide Execution management requires a bound Founder store.");
  return { async save(command = {}) {
    const transaction = createUnitOfWork({ filePath: runtimeStorePath, liveStore, now, stageFrom: liveStore }).begin();
    try {
      let prepared;
      const staged = await transaction.mutate((store) => {
        prepared = preparePeptideExecutionTransition(store, command, now());
        if (!prepared.ok) throw typed(prepared.outcome, prepared.reason);
        const result = applyPreparedPeptideExecutionTransition(store, prepared);
        faults.afterWrite?.(store, prepared.executionCandidate);
        return result;
      });
      const committed = await transaction.commit({ validateFinalized(store) {
        faults.beforeVerification?.(store);
        return verifyPreparedPeptideExecutionTransition(store, prepared);
      } });
      return { outcome: PeptideExecutionOutcome.SUCCESS, committed: true, revision: committed.revision, ...staged };
    } catch (error) {
      const own = findTyped(error);
      if (own) return { outcome: own.outcome, committed: false, reason: own.message };
      if (error?.committed) return { outcome: PeptideExecutionOutcome.PUBLICATION_FAILURE, committed: true, reason: "The schedule saved but could not refresh." };
      return { outcome: error?.code === FounderStoreUnitOfWorkErrorCode.REVISION_CONFLICT ? PeptideExecutionOutcome.VERSION_CONFLICT : PeptideExecutionOutcome.PERSISTENCE_FAILURE, committed: false, reason: "We could not update this schedule. Nothing was changed." };
    }
  } };
}

/// The single transport-independent peptide mutation. Web's file/runtime
/// transaction and Native's bounded canonical command both prepare, apply,
/// and verify this exact transition; neither transport owns dosing,
/// timeline-history, executionRevision, or reminder synchronization rules.
export function preparePeptideExecutionTransition(store, command = {}, at = new Date()) {
  const protocol = store?.protocols?.find((item) =>
    item.id === command.protocolId && item.userId === command.userId && item.category === "peptide"
  );
  if (!protocol || protocol.status !== "active") {
    return rejectedTransition(PeptideExecutionOutcome.NOT_FOUND, "The active peptide is unavailable.");
  }
  const draft = normalizePeptideExecutionDraft(command.draft);
  const errors = validatePeptideExecutionDraft(draft);
  if (errors.length) return rejectedTransition(PeptideExecutionOutcome.INVALID, errors[0]);
  const classification = classifyPeptideExecutionState({ protocol, executionItems: store.executionItems ?? [] });
  if (classification.state === PeptideExecutionState.INVALID) {
    return rejectedTransition(PeptideExecutionOutcome.INVALID, "This peptide schedule is not available to edit right now.");
  }
  const existing = classification.record;
  if (existing && Number(command.expectedRevision) !== Number(existing.executionRevision ?? 1)) {
    return rejectedTransition(PeptideExecutionOutcome.VERSION_CONFLICT, "This schedule changed while you were editing it. Review the latest version and try again.");
  }
  if (!existing && command.expectedRevision != null && command.expectedRevision !== "") {
    return rejectedTransition(PeptideExecutionOutcome.VERSION_CONFLICT, "This schedule changed while you were editing it. Review the latest version and try again.");
  }
  const goalIds = [...new Set([...(protocol.currentGoalIds ?? []), ...(protocol.relatedGoalIds ?? [])])];
  const timestamp = new Date(at).toISOString();
  const recordId = existing?.id ?? `execution_peptide_${protocol.id}`;
  const nextTimeline = draft.timelineOperation === "preserve"
    ? normalizeTimeline(existing?.timeline ?? [])
    : draft.timeline;
  const timelineChanged = JSON.stringify(normalizeTimeline(existing?.timeline ?? [])) !== JSON.stringify(nextTimeline);
  const timelineHistory = command.preserveTimelineHistory && existing && timelineChanged
    ? [
        ...(existing.timelineHistory ?? []),
        {
          archivedAt: timestamp,
          executionRevision: existing.executionRevision ?? 1,
          timeline: normalizeTimeline(existing.timeline ?? []),
        },
      ]
    : existing?.timelineHistory;
  const executionCandidate = {
    ...(existing ?? {}), id: recordId, userId: command.userId, type: "peptide", title: protocol.name,
    description: "Peptide Execution", active: true, protocolRootId: protocol.id,
    linkedStrategyIds: [protocol.id], linkedGoalIds: goalIds, linkedEvidenceTypes: [],
    cadence: draft.cadence, preferredSchedule: draft.preferredSchedule, timingContext: draft.timingContext,
    reminderPreference: draft.reminderPreference,
    priority: command.preservePriority ? (existing?.priority ?? draft.priority) : draft.priority,
    notes: draft.notes,
    timeline: nextTimeline,
    ...(timelineHistory ? { timelineHistory } : {}),
    dosingStrategy: draft.dosingStrategyOperation === "clear"
      ? null
      : draft.dosingStrategy ?? existing?.dosingStrategy ?? null,
    executionRevision: (existing?.executionRevision ?? 0) + 1,
    author: command.author, createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp,
  };
  const executionChanged = classification.state !== PeptideExecutionState.CANONICAL ||
    semantic(normalizeCanonicalRecord(existing)) !== semantic(executionCandidate);
  let reminder = null;
  let reminderCandidate = null;
  let reminderChanged = false;
  let preservedReminderHistory = null;
  if (command.synchronizeReminder) {
    const matches = (store.reminders ?? []).filter((item) =>
      item.userId === command.userId && item.type === "protocol_reminder" && item.linkedEntityId === protocol.id
    );
    if (matches.length > 1) {
      return rejectedTransition(PeptideExecutionOutcome.INVALID, "This reminder is not available to edit right now.");
    }
    reminder = matches[0] ?? null;
    preservedReminderHistory = reminder ? reminderHistory(reminder) : null;
    const reminderSchedule = supportScheduleToReminder(draft.supportSchedule, draft.timingContext);
    reminderCandidate = {
      ...(reminder ?? {}),
      id: reminder?.id ?? `reminder_${protocol.id}`,
      userId: command.userId,
      title: protocol.name,
      type: "protocol_reminder",
      linkedEntityType: "protocol",
      linkedEntityId: protocol.id,
      relatedGoalIds: goalIds,
      schedule: { ...reminderSchedule, timezone: reminder?.schedule?.timezone ?? null },
      active: draft.reminderPreference === "remind",
      createdAt: reminder?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    reminderChanged = !reminder || reminderSemantic(reminder) !== reminderSemantic(reminderCandidate);
  }
  if (!executionChanged && !reminderChanged) {
    return rejectedTransition(PeptideExecutionOutcome.UNCHANGED, "No changes to save.");
  }
  return Object.freeze({
    ok: true,
    protocolId: protocol.id,
    userId: command.userId,
    created: !existing,
    existingExecutionId: existing?.id ?? null,
    executionCandidate,
    executionChanged,
    existingReminderId: reminder?.id ?? null,
    reminderCandidate,
    reminderChanged,
    synchronizeReminder: command.synchronizeReminder === true,
    preservedReminderHistory,
  });
}

export function applyPreparedPeptideExecutionTransition(store, prepared) {
  if (!prepared?.ok) throw new Error("A prepared peptide transition is required.");
  store.executionItems ??= [];
  if (prepared.executionChanged) {
    const index = prepared.existingExecutionId
      ? store.executionItems.findIndex((item) => item.id === prepared.existingExecutionId)
      : -1;
    if (index >= 0) store.executionItems[index] = structuredClone(prepared.executionCandidate);
    else store.executionItems.push(structuredClone(prepared.executionCandidate));
  }
  if (prepared.synchronizeReminder && prepared.reminderChanged) {
    store.reminders ??= [];
    const index = prepared.existingReminderId
      ? store.reminders.findIndex((item) => item.id === prepared.existingReminderId)
      : -1;
    if (index >= 0) store.reminders[index] = structuredClone(prepared.reminderCandidate);
    else store.reminders.push(structuredClone(prepared.reminderCandidate));
  }
  return {
    created: prepared.created,
    executionId: prepared.executionCandidate.id,
    executionRevision: prepared.executionCandidate.executionRevision,
  };
}

export function verifyPreparedPeptideExecutionTransition(store, prepared) {
  if (!prepared?.ok) return false;
  const matches = (store.executionItems ?? []).filter((item) =>
    item.type === "peptide" && item.protocolRootId === prepared.protocolId
  );
  if (!(matches.length === 1 && matches[0].id === prepared.executionCandidate.id &&
      semantic(matches[0]) === semantic(prepared.executionCandidate))) return false;
  if (!prepared.synchronizeReminder) return true;
  const reminders = (store.reminders ?? []).filter((item) =>
    item.userId === prepared.userId && item.type === "protocol_reminder" && item.linkedEntityId === prepared.protocolId
  );
  return reminders.length === 1 &&
    reminderSemantic(reminders[0]) === reminderSemantic(prepared.reminderCandidate) &&
    (!prepared.preservedReminderHistory || reminderHistory(reminders[0]) === prepared.preservedReminderHistory);
}

export function buildPeptideExecutionDraftFromFormData(formData) {
  const get = (key) => String(formData.get(key) ?? "").trim();
  const timelineOperation = get("timelineOperation") || "preserve";
  let timeline;
  if (timelineOperation === "replace") {
    try {
      const parsed = JSON.parse(get("timelineJson") || "[]");
      if (!Array.isArray(parsed)) throw new Error("Timeline payload must be an array.");
      timeline = parsed;
    } catch {
      timeline = [{ malformed: true }];
    }
  }
  return normalizePeptideExecutionDraft({
    cadence: { type: get("cadence") }, preferredSchedule: { daysOfWeek: get("days").split(",").filter(Boolean), timeOfDay: get("timing") === "specific" ? get("specificTime") : get("timing"), startDate: get("startDate"), endDate: get("endDate") },
    timingContext: get("timingContext"), reminderPreference: get("reminderPreference"), priority: get("priority"), notes: get("notes"),
    timelineOperation,
    timeline,
  });
}

export function buildPeptideSupportDraftFromFormData(formData) {
  const get = (key) => String(formData.get(key) ?? "").trim();
  let schedule;
  let strategy;
  let legacyTimeline;
  try {
    schedule = normalizeSupportSchedule(JSON.parse(get("supportScheduleJson")));
    strategy = normalizePeptideDosingStrategy(JSON.parse(get("dosingStrategyJson")));
    legacyTimeline = JSON.parse(get("legacyTimelineJson") || "[]");
  } catch {
    return normalizePeptideExecutionDraft({ malformedSupport: true });
  }
  return buildPeptideSupportDraft({
    supportSchedule: schedule,
    dosingStrategy: strategy,
    legacyTimeline,
    timingContext: get("timingContext"),
    reminderPreference: get("reminderPreference"),
    priority: get("legacyPriority"),
    notes: get("notes"),
  });
}

/// Shared Web/Native adapter from the Support editor's structured values to
/// the canonical execution draft. In particular, custom dosing clears the
/// generated strategy while preserving the existing manually-authored
/// timeline; every other pattern regenerates its dated phases server-side.
export function buildPeptideSupportDraft(value = {}) {
  const schedule = normalizeSupportSchedule(value.supportSchedule);
  const strategy = normalizePeptideDosingStrategy(value.dosingStrategy);
  let generated;
  try {
    generated = strategy.pattern === "custom" ? null : generatePeptideDosingTimeline(strategy);
  } catch {
    return normalizePeptideExecutionDraft({ malformedSupport: true });
  }
  return normalizePeptideExecutionDraft({
    ...supportScheduleToExecution(schedule),
    supportSchedule: schedule,
    dosingStrategy: strategy.pattern === "custom" ? null : strategy,
    dosingStrategyOperation: strategy.pattern === "custom" ? "clear" : "replace",
    timingContext: value.timingContext,
    reminderPreference: value.reminderPreference,
    priority: value.priority,
    notes: value.notes,
    timelineOperation: strategy.pattern === "custom" ? "preserve" : "replace",
    timeline: strategy.pattern === "custom" ? value.legacyTimeline : generated,
  });
}

export function normalizePeptideExecutionDraft(value = {}) {
  return {
    cadence: {
      type: normalizeCadence(value.cadence?.type),
      ...(normalizeCadence(value.cadence?.type) === "every_x_days"
        ? { interval: Number(value.cadence?.interval ?? value.supportSchedule?.intervalDays ?? 1) }
        : {}),
    },
    preferredSchedule: {
      daysOfWeek: [...new Set(value.preferredSchedule?.daysOfWeek ?? [])],
      timeOfDay: normalizeTime(value.preferredSchedule?.timeOfDay),
      startDate: String(value.preferredSchedule?.startDate ?? ""),
      endDate: value.preferredSchedule?.endDate || null,
      ...(normalizeCadence(value.cadence?.type) === "every_x_days"
        ? {
            anchorDate: String(value.preferredSchedule?.anchorDate ?? value.preferredSchedule?.startDate ?? ""),
            intervalDays: Number(value.preferredSchedule?.intervalDays ?? value.cadence?.interval ?? 1),
          }
        : {}),
    },
    timingContext: String(value.timingContext ?? ""),
    reminderPreference: ["remind", "in_app"].includes(value.reminderPreference) ? "remind" : "none",
    priority: ["high", "normal", "low"].includes(value.priority) ? value.priority : "normal",
    notes: String(value.notes ?? "").trim().slice(0, 1000),
    timelineOperation: value.timelineOperation === "preserve" ? "preserve" : "replace",
    timeline: normalizeTimeline(value.timeline ?? []),
    ...(value.supportSchedule ? { supportSchedule: normalizeSupportSchedule(value.supportSchedule) } : {}),
    ...(value.dosingStrategy ? { dosingStrategy: normalizePeptideDosingStrategy(value.dosingStrategy) } : {}),
    ...(value.dosingStrategyOperation === "clear" ? { dosingStrategyOperation: "clear" } : {}),
    ...(value.malformedSupport === true ? { malformedSupport: true } : {}),
  };
}

export function validatePeptideExecutionDraft(value) {
  value = normalizePeptideExecutionDraft(value);
  const errors = [];
  if (value.malformedSupport) return ["Review the Support settings and try again."];
  if (!["daily", "weekly", "specific_days", "every_x_days"].includes(value.cadence.type)) errors.push("Choose a supported frequency.");
  if (["weekly", "specific_days"].includes(value.cadence.type) && !value.preferredSchedule.daysOfWeek.length) errors.push("Choose at least one scheduled day.");
  if (!value.preferredSchedule.startDate) errors.push("Choose a valid schedule start date.");
  if (value.preferredSchedule.endDate && value.preferredSchedule.endDate < value.preferredSchedule.startDate) errors.push("Schedule end date must follow its start date.");
  if (value.timelineOperation === "replace") {
    value.timeline.forEach((phase, index) => {
      if (phase.malformed || !isDateOnly(phase.startDate)) errors.push("Review each dosing phase and try again.");
      if (!phase.dose?.amount || !phase.dose?.unit) errors.push("Add a dose and unit for every phase.");
      if (phase.endDate && (!isDateOnly(phase.endDate) || phase.endDate < phase.startDate)) errors.push("Check the start and end dates for each phase.");
      if (!phase.endDate && index !== value.timeline.length - 1) errors.push("Only the final dosing phase can continue until changed.");
      if (index && phase.startDate < value.timeline[index - 1].startDate) errors.push("Arrange dosing phases in chronological order.");
      if (index && (!value.timeline[index - 1].endDate || phase.startDate <= value.timeline[index - 1].endDate)) errors.push("Dosing phases cannot overlap.");
    });
    const fingerprints=value.timeline.map((phase)=>JSON.stringify(phase));
    if(new Set(fingerprints).size!==fingerprints.length)errors.push("Review each dosing phase and try again.");
  }
  if (value.supportSchedule) errors.push(...validateSupportSchedule(value.supportSchedule));
  return [...new Set(errors)];
}

export function createPeptideExecutionHydrationModel({ executionItem, protocol } = {}) {
  if (executionItem) {
    const draft = normalizePeptideExecutionDraft({
      ...executionItem,
      cadence: { ...executionItem.cadence, type: executionItem.cadence?.type ?? protocol?.schedule?.type ?? protocol?.schedule?.frequency },
      preferredSchedule: {
        ...executionItem.preferredSchedule,
        daysOfWeek: executionItem.preferredSchedule?.daysOfWeek?.length
          ? executionItem.preferredSchedule.daysOfWeek
          : protocol?.schedule?.daysOfWeek ?? protocol?.frequency?.daysOfWeek ?? [],
        timeOfDay: executionItem.preferredSchedule?.timeOfDay || protocol?.schedule?.timeOfDay || "",
        startDate: executionItem.preferredSchedule?.startDate || protocol?.startDate || "",
        endDate: executionItem.preferredSchedule?.endDate || protocol?.endDate || null,
      },
      timingContext: executionItem.timingContext || protocol?.schedule?.timingContext || "",
    });
    return { configured: Boolean(draft.timeline.length), draft: { ...draft, timelineOperation: "replace" }, executionRevision: executionItem.executionRevision ?? 1 };
  }
  return { configured: false, executionRevision: null, draft: normalizePeptideExecutionDraft({
    cadence: { type: protocol?.schedule?.type === "weekly" ? "weekly" : "specific_days" },
    preferredSchedule: { daysOfWeek: protocol?.schedule?.daysOfWeek ?? protocol?.frequency?.daysOfWeek ?? [], timeOfDay: protocol?.schedule?.timeOfDay ?? "", startDate: protocol?.startDate ?? "", endDate: protocol?.endDate ?? null },
    timingContext: protocol?.schedule?.timingContext ?? "", reminderPreference: "none", priority: "normal", notes: "", timelineOperation: "replace", timeline: [],
  }) };
}

export function createPeptideSupportHydrationModel({ executionItem, protocol, reminder } = {}) {
  const base = createPeptideExecutionHydrationModel({ executionItem, protocol });
  const schedule = hydrateSupportSchedule(executionItem, protocol);
  const dosing = hydratePeptideDosingStrategy(executionItem);
  return {
    ...base,
    supportSchedule: schedule,
    dosingStrategy: dosing.strategy,
    dosingMode: dosing.mode,
    legacyTimeline: dosing.timeline,
    reminderPreference: reminder ? (reminder.active ? "remind" : "none") : executionItem?.reminderPreference === "remind" ? "remind" : "none",
    legacyPriority: executionItem?.priority ?? base.draft.priority,
    notes: executionItem?.notes ?? "",
    timingContext: executionItem?.timingContext ?? protocol?.schedule?.timingContext ?? "",
  };
}

function semantic(item) { return JSON.stringify({ cadence: item.cadence, preferredSchedule: item.preferredSchedule, timingContext: item.timingContext, reminderPreference: item.reminderPreference, priority: item.priority, notes: item.notes, timeline: item.timeline, dosingStrategy: item.dosingStrategy ?? null }); }
function normalizeCanonicalRecord(item){const draft=normalizePeptideExecutionDraft({...item,timelineOperation:"replace"});return{...item,...draft};}
function normalizeTimeline(timeline) { return (Array.isArray(timeline)?timeline:[]).map((phase)=>phase?.malformed?{malformed:true}:({startDate:String(phase?.startDate??""),endDate:phase?.endDate?String(phase.endDate):null,dose:{amount:String(phase?.dose?.amount??"").trim(),unit:String(phase?.dose?.unit??"").trim()},notes:String(phase?.notes??"").trim().slice(0,500)})); }
function isDateOnly(value) { if(!/^\d{4}-\d{2}-\d{2}$/.test(value??""))return false;const[year,month,day]=value.split("-").map(Number);if(month<1||month>12||day<1||day>31)return false;const daysInMonth=new Date(Date.UTC(year,month,0)).getUTCDate();return day<=daysInMonth; }
function normalizeCadence(value) { const cadence=String(value??"").trim().toLowerCase().replace(/[\s-]+/g,"_"); return ["specific_weekdays","weekly_days"].includes(cadence)?"specific_days":cadence; }
function normalizeTime(value) { const raw = String(value ?? ""); return raw === "night" ? "before_bed" : raw; }
function reminderSemantic(item) { return JSON.stringify({ active: item.active, schedule: item.schedule }); }
function reminderHistory(item) { return JSON.stringify({ completedAt: item.completedAt ?? null, completionHistory: item.completionHistory ?? null }); }
function rejectedTransition(outcome, reason) { return Object.freeze({ ok: false, outcome, reason }); }
function typed(outcome, message) { const error = new Error(message); error.peptideExecutionOutcome = outcome; return error; }
function findTyped(error) { let current=error; while(current){if(current.peptideExecutionOutcome)return{outcome:current.peptideExecutionOutcome,message:current.message};current=current.cause;} return null; }

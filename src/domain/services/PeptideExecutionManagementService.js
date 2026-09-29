import { createFounderStoreUnitOfWork, FounderStoreUnitOfWorkErrorCode } from "../../data/repositories/FounderStoreUnitOfWork";
import {
  hydrateSupportSchedule,
  normalizeSupportSchedule,
  supportScheduleToExecution,
  supportScheduleToReminder,
  validateSupportSchedule,
} from "../models/SupportScheduleModel";
import {
  composeTimelineWithStrategy,
  formatDecimal,
  generatePeptideDosingTimeline,
  hydratePeptideDosingStrategy,
  normalizePeptideDosingStrategy,
  normalizeScheduleSuspensions,
} from "../models/PeptideDosingStrategyModel";
export {
  formatPeptideDose,
  formatPeptideExecutionSummary,
  resolvePeptideDose,
} from "./ExecutionPhaseResolver";

export const PeptideExecutionOutcome = Object.freeze({
  SUCCESS: "success", UNCHANGED: "unchanged", INVALID: "invalid", NOT_FOUND: "not_found",
  VERSION_CONFLICT: "version_conflict", PERSISTENCE_FAILURE: "persistence_failure", PUBLICATION_FAILURE: "publication_failure",
  NOT_ACTIVE: "not_active", NOT_PAUSED: "not_paused",
});
/// Machine-readable rejection codes carried next to the outcome so transports
/// can map them (400 PEPTIDE_PLAN_REWRITES_HISTORY, 409 lifecycle codes).
export const PeptideExecutionRejectionCode = Object.freeze({
  PLAN_REWRITES_HISTORY: "PEPTIDE_PLAN_REWRITES_HISTORY",
  LIFECYCLE_NOT_ACTIVE: "PEPTIDE_LIFECYCLE_NOT_ACTIVE",
  LIFECYCLE_NOT_PAUSED: "PEPTIDE_LIFECYCLE_NOT_PAUSED",
});
export const PeptideLifecycleOperation = Object.freeze({ PAUSE: "pause", RESUME: "resume" });
/// timelineHistory keeps only the newest archived timelines so a record that
/// changes dose often stays bounded.
export const PEPTIDE_TIMELINE_HISTORY_LIMIT = 24;
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
        if (!prepared.ok) throw typed(prepared.outcome, prepared.reason, prepared.code);
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
      if (own) return { outcome: own.outcome, committed: false, reason: own.message, ...(own.code ? { code: own.code } : {}) };
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
  const existingTimeline = normalizeTimeline(existing?.timeline ?? []);
  const strategyBearing = draft.timelineOperation === "replace" && Boolean(draft.dosingStrategy) &&
    draft.dosingStrategyOperation !== "clear" && draft.dosingStrategy.pattern !== "custom";
  let nextTimeline;
  if (strategyBearing) {
    // S1: a strategy-bearing save never rewrites the stored past. The plan is
    // regenerated with the record's closed suspension windows and composed onto
    // the phases that started before it; the composed timeline is validated.
    let generated;
    try {
      generated = generatePeptideDosingTimeline(draft.dosingStrategy, { suspensions: normalizeScheduleSuspensions(existing) });
    } catch (error) {
      return rejectedTransition(PeptideExecutionOutcome.INVALID, error.message);
    }
    nextTimeline = normalizeTimeline(composeTimelineWithStrategy({ existingTimeline, strategy: draft.dosingStrategy, generated }));
    const composedErrors = validateTimelinePhases(nextTimeline);
    if (composedErrors.length) return rejectedTransition(PeptideExecutionOutcome.INVALID, composedErrors[0]);
  } else {
    nextTimeline = draft.timelineOperation === "preserve" ? existingTimeline : draft.timeline;
  }
  const timelineChanged = JSON.stringify(existingTimeline) !== JSON.stringify(nextTimeline);
  const today = isDateOnly(command.today) ? command.today : null;
  // S1 guard: only what the save would change BEFORE today rewrites history.
  // A first-time configuration, a future-only edit (an end date, an upcoming
  // step) or a re-save of a synthesized stay ("2.0" vs "2") passes; a
  // backdated plan that alters a phase already taken is refused unless the
  // draft carries rewriteHistory (the Advanced editor, after confirmation).
  if (strategyBearing && today && draft.rewriteHistory !== true && rewritesHistoryBeforeDate(existingTimeline, nextTimeline, today)) {
    return rejectedTransition(
      PeptideExecutionOutcome.INVALID,
      "This plan starts before today and would rewrite your dose history. Start a new plan from today, or confirm the rewrite.",
      PeptideExecutionRejectionCode.PLAN_REWRITES_HISTORY,
    );
  }
  const timelineHistory = command.preserveTimelineHistory && existing && timelineChanged
    ? archiveTimeline(existing, timestamp)
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

/// S3: Pause/Resume as a dated suspension window on the execution item. The
/// prepared result has the same shape as a save transition, so transports
/// apply and verify it with applyPreparedPeptideExecutionTransition /
/// verifyPreparedPeptideExecutionTransition. Nothing but scheduleSuspensions,
/// executionRevision, updatedAt and (on a resume with a structured plan) the
/// timeline changes; the reminder record is never rebuilt.
export function preparePeptideLifecycleTransition({
  protocol, executionItem = null, executionItems, reminder = null, operation, effectiveDate, now = new Date(), reason = null, expectedRevision,
} = {}) {
  if (!protocol?.id || protocol.category !== "peptide" || protocol.status !== "active") {
    return rejectedTransition(PeptideExecutionOutcome.NOT_FOUND, "The active peptide is unavailable.");
  }
  if (!Object.values(PeptideLifecycleOperation).includes(operation)) {
    return rejectedTransition(PeptideExecutionOutcome.INVALID, "Choose whether to pause or resume this peptide.");
  }
  if (!isDateOnly(effectiveDate)) return rejectedTransition(PeptideExecutionOutcome.INVALID, "Choose a valid effective date.");
  const classification = classifyPeptideExecutionState({
    protocol, executionItems: Array.isArray(executionItems) ? executionItems : executionItem ? [executionItem] : [],
  });
  if (classification.state === PeptideExecutionState.INVALID) {
    return rejectedTransition(PeptideExecutionOutcome.INVALID, "This peptide schedule is not available to edit right now.");
  }
  const existing = classification.record;
  if (!existing) return rejectedTransition(PeptideExecutionOutcome.NOT_FOUND, "This peptide has no schedule to pause or resume yet.");
  if (classification.state !== PeptideExecutionState.CANONICAL) {
    return rejectedTransition(PeptideExecutionOutcome.INVALID, "Set up this peptide's schedule before pausing or resuming it.");
  }
  const currentRevision = existing.executionRevision ?? 1;
  if (Number(expectedRevision) !== Number(currentRevision)) {
    return rejectedTransition(PeptideExecutionOutcome.VERSION_CONFLICT, "This schedule changed while you were editing it. Review the latest version and try again.");
  }
  const suspensions = normalizeScheduleSuspensions(existing);
  const last = suspensions.at(-1) ?? null;
  const open = last && last.resumedOn === null ? last : null;
  const timestamp = new Date(now).toISOString();
  let nextSuspensions;
  if (operation === PeptideLifecycleOperation.PAUSE) {
    if (open) return rejectedTransition(PeptideExecutionOutcome.NOT_ACTIVE, "This peptide is already paused.", PeptideExecutionRejectionCode.LIFECYCLE_NOT_ACTIVE);
    if (last?.resumedOn && effectiveDate < last.resumedOn) {
      return rejectedTransition(PeptideExecutionOutcome.INVALID, "Choose a pause date on or after the last resume.");
    }
    const note = String(reason ?? "").trim().slice(0, 500);
    nextSuspensions = [...suspensions, {
      pausedFrom: effectiveDate, resumedOn: null, pausedAt: timestamp, resumedAt: null,
      reason: note || null, pausedExecutionRevision: currentRevision, resumedExecutionRevision: null,
    }];
  } else {
    if (!open) return rejectedTransition(PeptideExecutionOutcome.NOT_PAUSED, "This peptide is not paused.", PeptideExecutionRejectionCode.LIFECYCLE_NOT_PAUSED);
    // A resume before the pause took effect closes the window empty.
    const resumedOn = effectiveDate < open.pausedFrom ? open.pausedFrom : effectiveDate;
    nextSuspensions = [...suspensions.slice(0, -1), { ...open, resumedOn, resumedAt: timestamp, resumedExecutionRevision: currentRevision }];
  }
  const existingTimeline = normalizeTimeline(existing.timeline ?? []);
  let nextTimeline = existingTimeline;
  if (operation === PeptideLifecycleOperation.RESUME) {
    nextTimeline = resumedTimeline(existing, existingTimeline, suspensions, nextSuspensions);
  }
  const timelineChanged = JSON.stringify(existingTimeline) !== JSON.stringify(nextTimeline);
  const executionCandidate = {
    ...existing,
    scheduleSuspensions: nextSuspensions,
    ...(timelineChanged ? { timeline: nextTimeline, timelineHistory: archiveTimeline(existing, timestamp) } : {}),
    executionRevision: currentRevision + 1,
    updatedAt: timestamp,
  };
  return Object.freeze({
    ok: true,
    operation,
    protocolId: protocol.id,
    userId: existing.userId,
    created: false,
    existingExecutionId: existing.id,
    executionCandidate,
    executionChanged: true,
    timelineChanged,
    existingReminderId: reminder?.id ?? null,
    reminderCandidate: null,
    reminderChanged: false,
    synchronizeReminder: false,
    preservedReminderHistory: reminder ? reminderHistory(reminder) : null,
    lifecycle: resolvePeptideLifecycleState(executionCandidate),
  });
}

/// Reader helper: `state` is paused when the last suspension is open; `since`
/// is that pause date, or the last resume date when active; `history` lists
/// every pause/resume in stored order. An absent field reads as never paused.
export function resolvePeptideLifecycleState(executionItem) {
  const suspensions = normalizeScheduleSuspensions(executionItem);
  const last = suspensions.at(-1) ?? null;
  const paused = Boolean(last && last.resumedOn === null);
  const history = suspensions.flatMap((window) => [
    { state: "paused", effectiveDate: window.pausedFrom, at: window.pausedAt, reason: window.reason },
    ...(window.resumedOn ? [{ state: "active", effectiveDate: window.resumedOn, at: window.resumedAt, reason: null }] : []),
  ]);
  return { state: paused ? "paused" : "active", since: paused ? last.pausedFrom : last?.resumedOn ?? null, history };
}

/// On resume, a record whose stored strategy faithfully reproduces its current
/// timeline (with the windows known before the resume) is regenerated with the
/// newly closed window and composed per S1, so later phase boundaries shift by
/// the pause length. Anything else (custom, synthesized stay, drifted records)
/// keeps its literal dates.
function resumedTimeline(existing, existingTimeline, suspensions, nextSuspensions) {
  if (!existing.dosingStrategy) return existingTimeline;
  const hydration = hydratePeptideDosingStrategy(existing, { suspensions });
  if (hydration.mode !== "structured" || !hydration.generated) return existingTimeline;
  const stored = normalizePeptideDosingStrategy(existing.dosingStrategy);
  if (JSON.stringify(stored) !== JSON.stringify(hydration.strategy) || stored.pattern === "custom") return existingTimeline;
  let generated;
  try {
    generated = generatePeptideDosingTimeline(stored, { suspensions: nextSuspensions });
  } catch {
    return existingTimeline;
  }
  const composed = normalizeTimeline(composeTimelineWithStrategy({ existingTimeline, strategy: stored, generated }));
  return validateTimelinePhases(composed).length ? existingTimeline : composed;
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
    generated = strategy.pattern === "custom" ? null : generatePeptideDosingTimeline(strategy, { suspensions: normalizeScheduleSuspensions(value.scheduleSuspensions ?? []) });
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
    rewriteHistory: value.rewriteHistory === true,
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
    ...(value.rewriteHistory === true ? { rewriteHistory: true } : {}),
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
  if (value.timelineOperation === "replace") errors.push(...validateTimelinePhases(value.timeline));
  if (value.supportSchedule) errors.push(...validateSupportSchedule(value.supportSchedule));
  return [...new Set(errors)];
}

/// Phase-level rules shared by draft validation and the composed (S1) and
/// resumed (S3) timelines: dated, dosed, chronological, non-overlapping, and
/// only the final phase open-ended.
export function validateTimelinePhases(timeline) {
  const phases = Array.isArray(timeline) ? timeline : [];
  const errors = [];
  phases.forEach((phase, index) => {
    if (phase.malformed || !isDateOnly(phase.startDate)) errors.push("Review each dosing phase and try again.");
    if (!phase.dose?.amount || !phase.dose?.unit) errors.push("Add a dose and unit for every phase.");
    if (phase.endDate && (!isDateOnly(phase.endDate) || phase.endDate < phase.startDate)) errors.push("Check the start and end dates for each phase.");
    if (!phase.endDate && index !== phases.length - 1) errors.push("Only the final dosing phase can continue until changed.");
    if (index && phase.startDate < phases[index - 1].startDate) errors.push("Arrange dosing phases in chronological order.");
    if (index && (!phases[index - 1].endDate || phase.startDate <= phases[index - 1].endDate)) errors.push("Dosing phases cannot overlap.");
  });
  const fingerprints = phases.map((phase) => JSON.stringify(phase));
  if (new Set(fingerprints).size !== fingerprints.length) errors.push("Review each dosing phase and try again.");
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
    generatedTimeline: dosing.generated,
    scheduleSuspensions: normalizeScheduleSuspensions(executionItem),
    lifecycle: resolvePeptideLifecycleState(executionItem),
    reminderPreference: reminder ? (reminder.active ? "remind" : "none") : executionItem?.reminderPreference === "remind" ? "remind" : "none",
    legacyPriority: executionItem?.priority ?? base.draft.priority,
    notes: executionItem?.notes ?? "",
    timingContext: executionItem?.timingContext ?? protocol?.schedule?.timingContext ?? "",
  };
}

function semantic(item) { return JSON.stringify({ cadence: item.cadence, preferredSchedule: item.preferredSchedule, timingContext: item.timingContext, reminderPreference: item.reminderPreference, priority: item.priority, notes: item.notes, timeline: item.timeline, dosingStrategy: item.dosingStrategy ?? null, scheduleSuspensions: normalizeScheduleSuspensions(item) }); }
function archiveTimeline(existing, timestamp) { return [...(existing.timelineHistory ?? []), { archivedAt: timestamp, executionRevision: existing.executionRevision ?? 1, timeline: normalizeTimeline(existing.timeline ?? []) }].slice(-PEPTIDE_TIMELINE_HISTORY_LIMIT); }
function normalizeCanonicalRecord(item){const draft=normalizePeptideExecutionDraft({...item,timelineOperation:"replace"});return{...item,...draft};}
/// True when the stored record has a phase that started before `today` and the
/// two timelines differ once both are clipped to the dates before today:
/// phases starting on/after today are dropped, open or later end dates are
/// truncated to yesterday, and dose amounts/notes are normalized so equal
/// values written differently ("2.0" / "2") never count as a rewrite.
function rewritesHistoryBeforeDate(storedTimeline, composedTimeline, today) {
  const stored = clipTimelineBeforeDate(storedTimeline, today);
  if (stored.length === 0) return false;
  return JSON.stringify(stored) !== JSON.stringify(clipTimelineBeforeDate(composedTimeline, today));
}
function clipTimelineBeforeDate(timeline, today) {
  const yesterday = new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  return normalizeTimeline(timeline)
    .filter((phase) => !phase.malformed && phase.startDate < today)
    .map((phase) => ({
      startDate: phase.startDate,
      endDate: !phase.endDate || phase.endDate >= today ? yesterday : phase.endDate,
      dose: { amount: formatDecimal(phase.dose.amount), unit: phase.dose.unit },
      notes: phase.notes,
    }));
}
function normalizeTimeline(timeline) { return (Array.isArray(timeline)?timeline:[]).map((phase)=>phase?.malformed?{malformed:true}:({startDate:String(phase?.startDate??""),endDate:phase?.endDate?String(phase.endDate):null,dose:{amount:String(phase?.dose?.amount??"").trim(),unit:String(phase?.dose?.unit??"").trim()},notes:String(phase?.notes??"").trim().slice(0,500)})); }
function isDateOnly(value) { if(!/^\d{4}-\d{2}-\d{2}$/.test(value??""))return false;const[year,month,day]=value.split("-").map(Number);if(month<1||month>12||day<1||day>31)return false;const daysInMonth=new Date(Date.UTC(year,month,0)).getUTCDate();return day<=daysInMonth; }
function normalizeCadence(value) { const cadence=String(value??"").trim().toLowerCase().replace(/[\s-]+/g,"_"); return ["specific_weekdays","weekly_days"].includes(cadence)?"specific_days":cadence; }
function normalizeTime(value) { const raw = String(value ?? ""); return raw === "night" ? "before_bed" : raw; }
function reminderSemantic(item) { return JSON.stringify({ active: item.active, schedule: item.schedule }); }
function reminderHistory(item) { return JSON.stringify({ completedAt: item.completedAt ?? null, completionHistory: item.completionHistory ?? null }); }
function rejectedTransition(outcome, reason, code = null) { return Object.freeze({ ok: false, outcome, reason, ...(code ? { code } : {}) }); }
function typed(outcome, message, code = null) { const error = new Error(message); error.peptideExecutionOutcome = outcome; if (code) error.peptideExecutionCode = code; return error; }
function findTyped(error) { let current=error; while(current){if(current.peptideExecutionOutcome)return{outcome:current.peptideExecutionOutcome,message:current.message,code:current.peptideExecutionCode??null};current=current.cause;} return null; }

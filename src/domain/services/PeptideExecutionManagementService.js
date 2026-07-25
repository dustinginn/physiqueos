import { createFounderStoreUnitOfWork, FounderStoreUnitOfWorkErrorCode } from "../../data/repositories/FounderStoreUnitOfWork";

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
      let recordId;
      let expectedCanonical;
      const staged = await transaction.mutate((store) => {
        const protocol = store.protocols?.find((item) => item.id === command.protocolId && item.userId === command.userId && item.category === "peptide");
        if (!protocol || protocol.status !== "active") throw typed(PeptideExecutionOutcome.NOT_FOUND, "The active peptide is unavailable.");
        const draft = normalizePeptideExecutionDraft(command.draft);
        const errors = validatePeptideExecutionDraft(draft);
        if (errors.length) throw typed(PeptideExecutionOutcome.INVALID, errors[0]);
        store.executionItems ??= [];
        const classification=classifyPeptideExecutionState({protocol,executionItems:store.executionItems});
        if(classification.state===PeptideExecutionState.INVALID)throw typed(PeptideExecutionOutcome.INVALID,"This peptide schedule is not available to edit right now.");
        const existing=classification.record;
        if (existing && Number(command.expectedRevision) !== Number(existing.executionRevision ?? 1)) throw typed(PeptideExecutionOutcome.VERSION_CONFLICT, "This schedule changed while you were editing it. Review the latest version and try again.");
        if (!existing && command.expectedRevision != null && command.expectedRevision !== "") throw typed(PeptideExecutionOutcome.VERSION_CONFLICT, "This schedule changed while you were editing it. Review the latest version and try again.");
        const goalIds = [...new Set([...(protocol.currentGoalIds ?? []), ...(protocol.relatedGoalIds ?? [])])];
        const timestamp = now().toISOString();
        recordId = existing?.id ?? `execution_peptide_${protocol.id}`;
        const candidate = {
          ...(existing ?? {}), id: recordId, userId: command.userId, type: "peptide", title: protocol.name,
          description: "Peptide Execution", active: true, protocolRootId: protocol.id,
          linkedStrategyIds: [protocol.id], linkedGoalIds: goalIds, linkedEvidenceTypes: [],
          cadence: draft.cadence, preferredSchedule: draft.preferredSchedule, timingContext: draft.timingContext,
          reminderPreference: draft.reminderPreference, priority: draft.priority, notes: draft.notes,
          timeline: draft.timelineOperation === "preserve" ? normalizeTimeline(existing?.timeline ?? []) : draft.timeline,
          executionRevision: (existing?.executionRevision ?? 0) + 1,
          author: command.author, createdAt: existing?.createdAt ?? timestamp, updatedAt: timestamp,
        };
        if (classification.state===PeptideExecutionState.CANONICAL && semantic(normalizeCanonicalRecord(existing)) === semantic(candidate)) throw typed(PeptideExecutionOutcome.UNCHANGED, "No changes to save.");
        expectedCanonical = semantic(candidate);
        const index = existing ? store.executionItems.findIndex((item) => item.id === existing.id) : -1;
        if (index >= 0) store.executionItems[index] = candidate; else store.executionItems.push(candidate);
        faults.afterWrite?.(store, candidate);
        return { created: !existing, executionId: recordId, executionRevision: candidate.executionRevision };
      });
      const committed = await transaction.commit({ validateFinalized(store) {
        faults.beforeVerification?.(store);
        const matches = store.executionItems.filter((item) => item.type === "peptide" && item.protocolRootId === command.protocolId);
        return matches.length === 1 && matches[0].id === recordId && semantic(matches[0]) === expectedCanonical;
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

export function normalizePeptideExecutionDraft(value = {}) {
  return {
    cadence: { type: normalizeCadence(value.cadence?.type) },
    preferredSchedule: {
      daysOfWeek: [...new Set(value.preferredSchedule?.daysOfWeek ?? [])],
      timeOfDay: normalizeTime(value.preferredSchedule?.timeOfDay),
      startDate: String(value.preferredSchedule?.startDate ?? ""),
      endDate: value.preferredSchedule?.endDate || null,
    },
    timingContext: String(value.timingContext ?? ""),
    reminderPreference: ["remind", "in_app"].includes(value.reminderPreference) ? "remind" : "none",
    priority: ["high", "normal", "low"].includes(value.priority) ? value.priority : "normal",
    notes: String(value.notes ?? "").trim().slice(0, 1000),
    timelineOperation: value.timelineOperation === "preserve" ? "preserve" : "replace",
    timeline: normalizeTimeline(value.timeline ?? []),
  };
}

export function validatePeptideExecutionDraft(value) {
  value = normalizePeptideExecutionDraft(value);
  const errors = [];
  if (!["weekly", "specific_days"].includes(value.cadence.type)) errors.push("Choose a supported frequency.");
  if (!value.preferredSchedule.daysOfWeek.length) errors.push("Choose at least one scheduled day.");
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
  return [...new Set(errors)];
}

export function createPeptideExecutionHydrationModel({ executionItem, protocol } = {}) {
  if (executionItem) {
    const draft = normalizePeptideExecutionDraft({
      ...executionItem,
      cadence: { type: executionItem.cadence?.type ?? protocol?.schedule?.type ?? protocol?.schedule?.frequency },
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

export function resolvePeptideDose(item, localDate) {
  const date = String(localDate);
  const current = item?.timeline?.find((phase) => phase.startDate <= date && (!phase.endDate || date <= phase.endDate)) ?? null;
  const next = item?.timeline?.find((phase) => phase.startDate > date) ?? null;
  return { current, next };
}

export function formatPeptideExecutionSummary(item, localDate) {
  if (!item) return "Not configured";
  const days = formatDays(item.preferredSchedule?.daysOfWeek);
  const time = formatTime(item.preferredSchedule?.timeOfDay);
  const { current } = resolvePeptideDose(item, localDate);
  const dose = current ? `${current.dose.amount} ${current.dose.unit}` : "";
  return [days, time, dose].filter(Boolean).join(" · ") || "Not configured";
}

function semantic(item) { return JSON.stringify({ cadence: item.cadence, preferredSchedule: item.preferredSchedule, timingContext: item.timingContext, reminderPreference: item.reminderPreference, priority: item.priority, notes: item.notes, timeline: item.timeline }); }
function normalizeCanonicalRecord(item){const draft=normalizePeptideExecutionDraft({...item,timelineOperation:"replace"});return{...item,...draft};}
function normalizeTimeline(timeline) { return (Array.isArray(timeline)?timeline:[]).map((phase)=>phase?.malformed?{malformed:true}:({startDate:String(phase?.startDate??""),endDate:phase?.endDate?String(phase.endDate):null,dose:{amount:String(phase?.dose?.amount??"").trim(),unit:String(phase?.dose?.unit??"").trim()},notes:String(phase?.notes??"").trim().slice(0,500)})); }
function isDateOnly(value) { if(!/^\d{4}-\d{2}-\d{2}$/.test(value??""))return false;const[year,month,day]=value.split("-").map(Number);if(month<1||month>12||day<1||day>31)return false;const daysInMonth=new Date(Date.UTC(year,month,0)).getUTCDate();return day<=daysInMonth; }
function normalizeCadence(value) { const cadence=String(value??"").trim().toLowerCase().replace(/[\s-]+/g,"_"); return ["specific_weekdays","weekly_days"].includes(cadence)?"specific_days":cadence; }
function normalizeTime(value) { const raw = String(value ?? ""); return raw === "night" ? "before_bed" : raw; }
function formatDays(days = []) { const short = { sunday:"Sun",monday:"Mon",tuesday:"Tue",wednesday:"Wed",thursday:"Thu",friday:"Fri",saturday:"Sat" }; const labels=days.map((day)=>short[day]).filter(Boolean); return labels.join(",") === "Sun,Mon,Tue,Wed,Thu" ? "Sun–Thu" : labels.join(", "); }
function formatTime(value) { if (/^\d{2}:\d{2}$/.test(value ?? "")) { const [h,m]=value.split(":").map(Number); return new Date(2000,0,1,h,m).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}); } return String(value ?? "").replaceAll("_"," ").replace(/\b\w/g,(letter)=>letter.toUpperCase()); }
function typed(outcome, message) { const error = new Error(message); error.peptideExecutionOutcome = outcome; return error; }
function findTyped(error) { let current=error; while(current){if(current.peptideExecutionOutcome)return{outcome:current.peptideExecutionOutcome,message:current.message};current=current.cause;} return null; }

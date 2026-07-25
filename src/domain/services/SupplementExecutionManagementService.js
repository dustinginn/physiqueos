import { createFounderStoreUnitOfWork, FounderStoreUnitOfWorkErrorCode } from "../../data/repositories/FounderStoreUnitOfWork";

export const SupplementExecutionOutcome = Object.freeze({
  SUCCESS: "success", UNCHANGED: "unchanged", INVALID: "invalid", NOT_FOUND: "not_found",
  VERSION_CONFLICT: "version_conflict", PERSISTENCE_FAILURE: "persistence_failure", PUBLICATION_FAILURE: "publication_failure",
});

export function createSupplementExecutionManagementService({ runtimeStorePath, liveStore, now = () => new Date(), createUnitOfWork = (options) => createFounderStoreUnitOfWork(options), faults = {} } = {}) {
  if (!runtimeStorePath || !liveStore) throw new Error("Supplement Execution management requires a bound Founder store.");
  return {
    async save(command = {}) {
      const transaction = createUnitOfWork({ filePath: runtimeStorePath, liveStore, now, stageFrom: liveStore }).begin();
      try {
        let recordId;
        let expectedCanonical;
        const staged = await transaction.mutate((store) => {
          const protocol = store.protocols?.find((item) => item.id === command.protocolId && item.userId === command.userId && item.category === "supplement");
          if (!protocol || protocol.status !== "active") throw typed(SupplementExecutionOutcome.NOT_FOUND, "The active supplement is unavailable.");
          if (!protocol.currentVersionId || protocol.currentVersionId !== command.supplementVersionId ||
              !store.protocolVersions?.some((item) => item.id === protocol.currentVersionId && item.status === "active" && !item.endedAt)) {
            throw typed(SupplementExecutionOutcome.VERSION_CONFLICT, "The supplement strategy changed before save.");
          }
          const goalId = command.goalId;
          if (![...(protocol.currentGoalIds ?? []), ...(protocol.relatedGoalIds ?? [])].includes(goalId) ||
              !store.goals?.some((goal) => goal.id === goalId && goal.userId === command.userId && goal.status === "active")) {
            throw typed(SupplementExecutionOutcome.INVALID, "The supported Goal is unavailable.");
          }
          const normalized = normalizeDraft(command.draft);
          const errors = validateDraft(normalized);
          if (errors.length) throw typed(SupplementExecutionOutcome.INVALID, errors.join(" "));
          recordId = `execution_supplement_${protocol.id}`;
          store.executionItems ??= [];
          const index = store.executionItems.findIndex((item) => item.id === recordId);
          const existing = index >= 0 ? store.executionItems[index] : null;
          if (existing && Number(command.expectedRevision) !== Number(existing.executionRevision ?? 1)) {
            throw typed(SupplementExecutionOutcome.VERSION_CONFLICT, "The supplement schedule changed before save.");
          }
          if (!existing && command.expectedRevision !== null && command.expectedRevision !== undefined && command.expectedRevision !== "") {
            throw typed(SupplementExecutionOutcome.VERSION_CONFLICT, "The supplement schedule changed before save.");
          }
          const timestamp = now().toISOString();
          const candidate = {
            ...(existing ?? {}),
            id: recordId,
            userId: command.userId,
            type: "supplement",
            title: protocol.name,
            description: "Supplement Execution",
            active: true,
            protocolRootId: protocol.id,
            supplementVersionId: protocol.currentVersionId,
            linkedStrategyIds: [protocol.id],
            linkedGoalIds: [goalId],
            dose: normalized.dose,
            cadence: normalized.cadence,
            preferredSchedule: normalized.preferredSchedule,
            reminderPreference: normalized.reminderPreference,
            priority: normalized.priority,
            notes: normalized.notes,
            timeline: normalized.timeline,
            executionRevision: (existing?.executionRevision ?? 0) + 1,
            author: command.author,
            createdAt: existing?.createdAt ?? timestamp,
            updatedAt: timestamp,
          };
          if (existing && semantic(existing) === semantic(candidate)) throw typed(SupplementExecutionOutcome.UNCHANGED, "No changes to save.");
          expectedCanonical=semantic(candidate);
          if (index >= 0) store.executionItems[index] = candidate; else store.executionItems.push(candidate);
          faults.afterWrite?.(store, candidate);
          return { created: !existing, executionId: recordId, executionRevision: candidate.executionRevision };
        });
        const committed = await transaction.commit({ validateFinalized(candidate) {
          faults.beforeVerification?.(candidate);
          const matches = candidate.executionItems.filter((item) => item.protocolRootId === command.protocolId && item.type === "supplement");
          if (matches.length !== 1 || matches[0].id !== recordId) return false;
          const normalizedPersisted=normalizeDraft(matches[0]);
          const finalErrors = validateDraft(normalizedPersisted);
          if (finalErrors.length) throw typed(SupplementExecutionOutcome.INVALID, finalErrors.join(" "));
          if(semantic(normalizedPersisted)!==expectedCanonical)throw typed(SupplementExecutionOutcome.INVALID,"Committed supplement Execution differs from the canonical candidate.");
          return true;
        } });
        return { outcome: SupplementExecutionOutcome.SUCCESS, committed: true, revision: committed.revision, ...staged };
      } catch (error) {
        const own = findTyped(error);
        if (own) return fail(own.outcome, own.message);
        if (error?.committed) return fail(SupplementExecutionOutcome.PUBLICATION_FAILURE, "The schedule committed but could not refresh.");
        return fail(error?.code === FounderStoreUnitOfWorkErrorCode.REVISION_CONFLICT ? SupplementExecutionOutcome.VERSION_CONFLICT : SupplementExecutionOutcome.PERSISTENCE_FAILURE, "Nothing was changed.");
      }
    },
  };
}

export function normalizeSupplementExecutionDraft(value = {}) {
  return normalizeDraft(value);
}
export function buildSupplementExecutionDraftFromFormData(formData) {
  const get = (key) => clean(formData.get(key));
  const timing = get("timing");
  const starts=formData.getAll("phaseStart").map(clean),ends=formData.getAll("phaseEnd").map(clean),amounts=formData.getAll("phaseDose").map(clean),units=formData.getAll("phaseUnit").map(clean),notes=formData.getAll("phaseNotes").map(clean);
  return normalizeDraft({
    dose: { amount: get("doseAmount"), unit: get("doseUnit") },
    cadence: { type: get("cadence") },
    preferredSchedule: {
      daysOfWeek: get("days").split(",").filter(Boolean),
      timeOfDay: timing === "specific" ? get("specificTime") : timing,
      startDate: get("startDate"),
      endDate: get("endDate"),
    },
    reminderPreference: get("reminderPreference"),
    priority: get("priority"),
    notes: get("notes"),
    timeline: starts.map((startDate,index)=>({startDate,endDate:ends[index]??"",dose:{amount:amounts[index]??"",unit:units[index]??""},notes:notes[index]??""})),
  });
}
export function validateSupplementExecutionDraft(value = {}) {
  return validateDraft(normalizeDraft(value));
}
export function createSupplementExecutionHydrationModel({ executionItem = null, protocol = null } = {}) {
  if (executionItem) {
    return Object.freeze({
      configured: true,
      draft: normalizeDraft(executionItem),
      executionRevision: executionItem.executionRevision ?? null,
      source: "canonical_execution",
      legacyHints: null,
    });
  }
  const legacyHints = {
    cadence: normalizeCadence(protocol?.schedule?.type ?? protocol?.schedule?.frequency ?? protocol?.frequency?.unit),
    timing: normalizeTiming(protocol?.schedule?.timeOfDay),
    dose: protocol?.dose ?? null,
  };
  return Object.freeze({
    configured: false,
    draft: normalizeDraft({
      dose: { amount: "", unit: "" },
      cadence: { type: "daily" },
      preferredSchedule: { daysOfWeek: [], timeOfDay: "morning", startDate: "", endDate: null },
      reminderPreference: "none", priority: "normal", notes: "", timeline: [],
    }),
    executionRevision: null,
    source: "unconfigured",
    legacyHints: Object.freeze(legacyHints),
  });
}
export function formatSupplementExecutionSummary(item) {
  if (!item) return "Not configured";
  const cadence = item.cadence?.type === "daily" ? "Daily"
    : item.cadence?.type === "every_other_day" ? "Every other day"
    : ["specific_days","specific_weekdays"].includes(item.cadence?.type) ? formatDays(item.preferredSchedule?.daysOfWeek)
      : item.cadence?.type === "weekly" ? `Weekly${item.preferredSchedule?.daysOfWeek?.length ? ` · ${formatDays(item.preferredSchedule.daysOfWeek)}` : ""}`
        : item.cadence?.type === "as_needed" ? "As needed" : "Custom";
  const timing = formatTiming(item.preferredSchedule?.timeOfDay);
  return [cadence, timing].filter(Boolean).join(" · ") || "Not configured";
}
function normalizeDraft(value) {
  const timeline = Array.isArray(value.timeline) ? value.timeline.filter((phase) => phase?.startDate || phase?.dose?.amount).map((phase) => ({
    startDate: clean(phase.startDate), endDate: clean(phase.endDate) || null,
    dose: { amount: clean(phase.dose?.amount), unit: clean(phase.dose?.unit) },
    notes: clean(phase.notes).slice(0, 500),
  })) : [];
  return {
    dose: { amount: clean(value.dose?.amount), unit: clean(value.dose?.unit) },
    cadence: { type: normalizeCadence(value.cadence?.type) },
    preferredSchedule: {
      daysOfWeek: [...new Set(value.preferredSchedule?.daysOfWeek ?? [])],
      timeOfDay: normalizeTiming(value.preferredSchedule?.timeOfDay),
      startDate: clean(value.preferredSchedule?.startDate),
      endDate: clean(value.preferredSchedule?.endDate) || null,
    },
    reminderPreference: clean(value.reminderPreference),
    priority: clean(value.priority),
    notes: clean(value.notes).slice(0, 1000),
    timeline,
  };
}
function validateDraft(value) {
  const errors = [];
  if (!value.dose.amount && !value.cadence.type && !value.preferredSchedule.timeOfDay && !value.notes && !value.timeline.length) errors.push("Add at least one Execution detail.");
  if (!["daily", "every_other_day", "specific_days", "weekly", "as_needed", "custom"].includes(value.cadence.type)) errors.push("Choose a supported cadence.");
  if (value.cadence.type === "every_other_day" && !value.preferredSchedule.startDate) errors.push("Choose a start date for every-other-day scheduling.");
  if (value.cadence.type === "specific_days" && !value.preferredSchedule.daysOfWeek.length) errors.push("Choose at least one day.");
  if (value.preferredSchedule.timeOfDay === "specific") errors.push("Choose a valid local time.");
  if (value.preferredSchedule.timeOfDay && !["morning", "afternoon", "evening", "before_bed", "with_breakfast", "with_lunch", "with_dinner"].includes(value.preferredSchedule.timeOfDay) && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.preferredSchedule.timeOfDay)) errors.push("Choose a valid local time.");
  if (value.preferredSchedule.startDate && value.preferredSchedule.endDate && value.preferredSchedule.endDate < value.preferredSchedule.startDate) errors.push("End date must follow start date.");
  if (!["remind", "none"].includes(value.reminderPreference)) errors.push("Choose a reminder preference.");
  if (!["high", "normal", "low"].includes(value.priority)) errors.push("Choose a priority.");
  value.timeline.forEach((phase) => {
    if (!phase.startDate || !phase.dose.amount) errors.push("Timeline phases require a start date and dose.");
    if (phase.endDate && phase.endDate < phase.startDate) errors.push("Timeline phase end dates must follow start dates.");
  });
  const sorted = [...value.timeline].sort((a, b) => a.startDate.localeCompare(b.startDate));
  for (let index = 1; index < sorted.length; index += 1) if (!sorted[index - 1].endDate || sorted[index].startDate <= sorted[index - 1].endDate) errors.push("Timeline phases cannot overlap.");
  return [...new Set(errors)];
}
function semantic(item) { return JSON.stringify({ dose: item.dose, cadence: item.cadence, preferredSchedule: item.preferredSchedule, reminderPreference: item.reminderPreference, priority: item.priority, notes: item.notes, timeline: item.timeline }); }
function normalizeCadence(value) {
  const cadence=clean(value).toLowerCase().replace(/[\s-]+/g,"_");
  if(cadence==="specific_weekdays")return"specific_days";
  return cadence === "every_other_day" ? "every_other_day" : cadence;
}
function normalizeTiming(value) {
  const raw=clean(value);
  if(/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(raw))return raw;
  const key=raw.toLowerCase().replace(/[\s-]+/g,"_");
  const aliases={breakfast:"with_breakfast",lunch:"with_lunch",dinner:"with_dinner",bedtime:"before_bed",night:"before_bed",specific:"specific_time"};
  return aliases[key]??key;
}
function formatDays(days = []) {
  const order=["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
  const names={monday:"Mon",tuesday:"Tue",wednesday:"Wed",thursday:"Thu",friday:"Fri",saturday:"Sat",sunday:"Sun"};
  const indexes=[...new Set(days.map((day)=>order.indexOf(day)).filter((index)=>index>=0))].sort((a,b)=>a-b);
  if(indexes.length>=3&&indexes.every((value,index)=>index===0||value===indexes[index-1]+1))return`${names[order[indexes[0]]]}–${names[order[indexes.at(-1)]]}`;
  return indexes.map((index)=>names[order[index]]).join(", ");
}
function formatTiming(value) { if (!value) return ""; if (/^\d{2}:\d{2}$/.test(value)) { const [h,m]=value.split(":").map(Number); return new Date(2000,0,1,h,m).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}); } return value.replaceAll("_"," ").replace(/\b\w/g,(letter)=>letter.toUpperCase()); }
function clean(value) { return String(value ?? "").trim().replace(/\s+/g, " "); }
function typed(outcome, message) { const error=new Error(message); error.supplementExecutionOutcome=outcome; return error; }
function findTyped(error) { let current=error; while(current){if(current.supplementExecutionOutcome)return{outcome:current.supplementExecutionOutcome,message:current.message};current=current.cause;} return null; }
function fail(outcome, reason) { return { outcome, committed: false, reason }; }

import { createFounderStoreUnitOfWork, FounderStoreUnitOfWorkErrorCode } from "../../data/repositories/FounderStoreUnitOfWork";

export const DEXA_APPOINTMENT_ID = "execution_next_dexa";
export const DexaAppointmentOutcome = Object.freeze({ SUCCESS:"success", UNCHANGED:"unchanged", INVALID:"invalid", VERSION_CONFLICT:"version_conflict", PERSISTENCE_FAILURE:"persistence_failure", PUBLICATION_FAILURE:"publication_failure" });

export function createDexaAppointmentManagementService({ runtimeStorePath, liveStore, now=()=>new Date(), createUnitOfWork=(options)=>createFounderStoreUnitOfWork(options), faults={} }={}) {
  return { async save(command={}) {
    const transaction=createUnitOfWork({filePath:runtimeStorePath,liveStore,now,stageFrom:liveStore}).begin();
    try {
      let expectedCanonical;
      const staged=await transaction.mutate((store)=>{
        const prepared=prepareDexaAppointmentUpdate(store,command,now());
        if(!prepared.ok)throw typed(prepared.outcome,prepared.reason);
        expectedCanonical=prepared.candidate?semantic(prepared.candidate):null;
        applyPreparedDexaAppointmentUpdate(store,prepared);
        faults.afterWrite?.(store,prepared.candidate);
        return{created:prepared.created,cleared:prepared.cleared,executionId:DEXA_APPOINTMENT_ID,executionRevision:prepared.candidate?.executionRevision};
      });
      const committed=await transaction.commit({validateFinalized(store){faults.beforeVerification?.(store);if(staged.cleared)return!store.executionItems.some((item)=>item.id===DEXA_APPOINTMENT_ID);const item=store.executionItems.find((entry)=>entry.id===DEXA_APPOINTMENT_ID);return item&&semantic(item)===expectedCanonical;}});
      return{outcome:DexaAppointmentOutcome.SUCCESS,committed:true,revision:committed.revision,...staged};
    }catch(error){const own=findTyped(error);if(own)return{outcome:own.outcome,committed:false,reason:own.message};if(error?.committed)return{outcome:DexaAppointmentOutcome.PUBLICATION_FAILURE,committed:true,reason:"The schedule saved but could not refresh."};return{outcome:error?.code===FounderStoreUnitOfWorkErrorCode.REVISION_CONFLICT?DexaAppointmentOutcome.VERSION_CONFLICT:DexaAppointmentOutcome.PERSISTENCE_FAILURE,committed:false,reason:"We could not update this schedule. Nothing was changed."};}
  }};
}
export function prepareDexaAppointmentUpdate(store,command={},timestamp=new Date(),{requireAppointment=false,preserveExistingFields=false}={}){
  const executionItems=store.executionItems??[];
  const index=executionItems.findIndex((item)=>item.id===DEXA_APPOINTMENT_ID);
  const existing=index>=0?executionItems[index]:null;
  if(existing&&Number(command.expectedRevision)!==Number(existing.executionRevision??1))return rejectedDexa(DexaAppointmentOutcome.VERSION_CONFLICT,"This schedule changed while you were editing it. Review the latest version and try again.");
  const requested=normalizeDexaAppointmentDraft(command.draft);
  const draft=preserveExistingFields&&existing?{...requested,reminderPreferences:structuredClone(existing.reminderPreferences??[]),uploadReminder:Boolean(existing.uploadReminder),preparationNote:String(existing.preparationNote??"")}:requested;
  if(requireAppointment&&!draft.plannedDate)return rejectedDexa(DexaAppointmentOutcome.INVALID,"Choose a future date for your next DEXA.");
  const errors=validateDexaAppointmentDraft(draft,{today:localDate(timestamp,command.timezone)});
  if(errors.length)return rejectedDexa(DexaAppointmentOutcome.INVALID,errors[0]);
  if(!draft.plannedDate){
    if(!existing)return rejectedDexa(DexaAppointmentOutcome.UNCHANGED,"No changes to save.");
    return{ok:true,cleared:true,index,existing,candidate:null,created:false};
  }
  const iso=timestamp.toISOString();
  const candidate={...(existing??{}),id:DEXA_APPOINTMENT_ID,userId:command.userId,type:"dexa_appointment",title:"Next DEXA Scan",description:"Future DEXA appointment",active:true,
    cadence:{type:"scheduled_date"},preferredSchedule:{date:draft.plannedDate,timeOfDay:draft.localTime,daysOfWeek:[]},timezone:command.timezone,
    reminderPreferences:draft.reminderPreferences,uploadReminder:draft.uploadReminder,preparationNote:draft.preparationNote,status:"scheduled",
    linkedGoalIds:command.goalId?[command.goalId]:[],linkedStrategyIds:existing?.linkedStrategyIds??[],linkedEvidenceTypes:existing?.linkedEvidenceTypes??[],executionRevision:(existing?.executionRevision??0)+1,
    author:command.author,createdAt:existing?.createdAt??iso,updatedAt:iso,
    completedAt:null,completedByEvidenceId:null,completedEvidenceDate:null};
  if(existing&&semantic(existing)===semantic(candidate))return rejectedDexa(DexaAppointmentOutcome.UNCHANGED,"No changes to save.");
  return{ok:true,cleared:false,index,existing,candidate,created:!existing};
}
export function applyPreparedDexaAppointmentUpdate(store,prepared){store.executionItems??=[];if(prepared.cleared){store.executionItems.splice(prepared.index,1);return;}if(prepared.index>=0)store.executionItems[prepared.index]=prepared.candidate;else store.executionItems.push(prepared.candidate);}
export function verifyPreparedDexaAppointmentUpdate(store,prepared){const item=store.executionItems.find((entry)=>entry.id===DEXA_APPOINTMENT_ID);return prepared.cleared?!item:Boolean(item&&semantic(item)===semantic(prepared.candidate));}
export function normalizeDexaAppointmentDraft(value={}){return{plannedDate:String(value.plannedDate??value.preferredSchedule?.date??""),localTime:String(value.localTime??value.preferredSchedule?.timeOfDay??""),reminderPreferences:[...new Set(value.reminderPreferences??[])].filter((item)=>["week_before","day_before","morning_of"].includes(item)),uploadReminder:Boolean(value.uploadReminder),preparationNote:String(value.preparationNote??"").trim().slice(0,1000)};}
export function buildDexaAppointmentDraftFromFormData(formData){return normalizeDexaAppointmentDraft({plannedDate:formData.get("plannedDate"),localTime:formData.get("localTime"),reminderPreferences:formData.getAll("reminders"),uploadReminder:formData.get("uploadReminder")==="on",preparationNote:formData.get("preparationNote")});}
export function validateDexaAppointmentDraft(value,{today}={}){if(!value.plannedDate)return[];if(!/^\d{4}-\d{2}-\d{2}$/.test(value.plannedDate)||value.plannedDate<=today)return["Choose a future date for your next DEXA."];if(value.localTime&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.localTime))return["Choose a valid local appointment time."];return[];}
export function formatDexaAppointmentSummary(item){if(!item)return"Not scheduled";const date=new Date(`${item.preferredSchedule.date}T12:00:00`).toLocaleDateString("en-US",{month:"long",day:"numeric"});const time=item.preferredSchedule.timeOfDay?new Date(`2000-01-01T${item.preferredSchedule.timeOfDay}:00`).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}):"";return[date,time].filter(Boolean).join(" · ");}
function localDate(date,timezone){return new Intl.DateTimeFormat("en-CA",{timeZone:timezone||"UTC",year:"numeric",month:"2-digit",day:"2-digit"}).format(date);}
function semantic(item){return JSON.stringify({preferredSchedule:item.preferredSchedule,timezone:item.timezone,reminderPreferences:item.reminderPreferences,uploadReminder:item.uploadReminder,preparationNote:item.preparationNote,status:item.status,active:item.active,completedAt:item.completedAt??null,completedByEvidenceId:item.completedByEvidenceId??null,completedEvidenceDate:item.completedEvidenceDate??null,linkedGoalIds:item.linkedGoalIds});}
function typed(outcome,message){const error=new Error(message);error.dexaAppointmentOutcome=outcome;return error;}
function findTyped(error){let current=error;while(current){if(current.dexaAppointmentOutcome)return{outcome:current.dexaAppointmentOutcome,message:current.message};current=current.cause;}return null;}
function rejectedDexa(outcome,reason){return{ok:false,outcome,reason};}

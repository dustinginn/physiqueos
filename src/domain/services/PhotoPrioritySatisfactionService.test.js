import { describe, expect, it, vi } from "vitest";
import { evaluatePhotoPrioritySatisfaction, satisfyPhotoPriorityFromCanonicalSession } from "./PhotoPrioritySatisfactionService";

const reminder={id:"reminder_weekly_progress_photo_set",active:true,linkedEvidenceType:"progress_photo",linkedEntityType:"progress_photo_set",schedule:{type:"weekly",daysOfWeek:["saturday"]},completionHistory:[]};
const canonical=(date="2026-07-18")=>({canonicalId:`session-${date}`,quality:{status:"active"},payload:{captureDate:date,provisional:false,photos:[{id:"view",orientation:"front",contractionState:"flexed",poseVariant:"standard",identityStatus:"confirmed",userConfirmedIdentity:true,status:"active",storage_path:"view.jpg"}]}});

describe("photo priority satisfaction",()=>{
  it("accepts one confirmed usable pose without requiring Front Relaxed or an event",()=>{
    expect(evaluatePhotoPrioritySatisfaction({reminder,canonicalSession:canonical(),evidenceDate:"2026-07-18"})).toMatchObject({eligible:true,satisfactionType:"progress_photo_session_confirmed"});
  });
  it("rejects unconfirmed, hidden-only, future, and historical mismatches",()=>{
    const unconfirmed=canonical();unconfirmed.payload.photos[0].identityStatus="suggested";
    expect(evaluatePhotoPrioritySatisfaction({reminder,canonicalSession:unconfirmed,evidenceDate:"2026-07-18"}).eligible).toBe(false);
    expect(evaluatePhotoPrioritySatisfaction({reminder,canonicalSession:canonical("2026-07-19"),evidenceDate:"2026-07-19"}).eligible).toBe(false);
  });
  it("persists one stable satisfaction record and is idempotent",async()=>{
    const history=[];const completeReminderFromEvidence=vi.fn(async(_id,record)=>{history.push(record);return record;});
    const repositories={reminders:{listActiveReminders:async()=>[{...reminder,completionHistory:history}],completeReminderFromEvidence}};
    const first=await satisfyPhotoPriorityFromCanonicalSession({repositories,userId:"u",canonicalSession:canonical(),evidenceDate:"2026-07-18",confirmedAt:"2026-07-18T20:00:00Z"});
    const second=await satisfyPhotoPriorityFromCanonicalSession({repositories,userId:"u",canonicalSession:canonical(),evidenceDate:"2026-07-18",confirmedAt:"later"});
    expect(first.persisted).toBe(true);expect(second.idempotent).toBe(true);expect(completeReminderFromEvidence).toHaveBeenCalledTimes(1);
  });
});

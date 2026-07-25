import { describe, expect, it } from "vitest";
import { createDailyFocusService } from "./DailyFocusService";

const base={id:"reminder_weekly_progress_photo_set",userId:"u",title:"Weekly Progress Photo Set",active:true,linkedEvidenceType:"progress_photo",linkedEntityType:"progress_photo_set",expectedViews:["front-relaxed","back-relaxed","back-flexed"],schedule:{type:"weekly",daysOfWeek:["saturday"],timeOfDay:"afternoon"}};
const now=new Date(2026,6,18,15,0,0);

describe("Home photo-priority aggregation",()=>{
  it("reads persisted PhotoSession satisfaction as 1/1 and completes Afternoon Check-in",()=>{
    const reminder={...base,completionHistory:[{id:"one",satisfactionType:"progress_photo_session_confirmed",evidenceDate:"2026-07-18"}]};
    const focus=createDailyFocusService().getDailyFocus({now,reminders:[reminder],progressPhotos:[]});
    const afternoon=focus.find((item)=>item.id==="afternoon-check-in");
    expect(afternoon).toMatchObject({completed:true,metadata:"1/1 complete"});
    expect(afternoon.sessionItems).toEqual([{id:base.id,label:base.title,completed:true,satisfiedByEvidence:true}]);
  });

  it("does not complete from an unrelated or historical satisfaction",()=>{
    const reminder={...base,completionHistory:[{id:"old",satisfactionType:"progress_photo_session_confirmed",evidenceDate:"2026-07-11"}]};
    const focus=createDailyFocusService().getDailyFocus({now,reminders:[reminder],progressPhotos:[]});
    expect(focus.find((item)=>item.id==="afternoon-check-in")).toMatchObject({completed:false,metadata:"0/1 complete"});
  });
});

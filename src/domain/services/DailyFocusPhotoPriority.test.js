import { describe, expect, it } from "vitest";
import { createDailyFocusService } from "./DailyFocusService";

const base={id:"reminder_weekly_progress_photo_set",userId:"u",title:"Weekly Progress Photo Set",active:true,linkedEvidenceType:"progress_photo",linkedEntityType:"progress_photo_set",expectedViews:["front-relaxed","back-relaxed","back-flexed"],schedule:{type:"weekly",daysOfWeek:["saturday"],timeOfDay:"afternoon"}};
const now=new Date(2026,6,18,15,0,0);

describe("Home photo-priority projection",()=>{
  it("keeps the confirmed PhotoSession occurrence independent from daypart check-ins",()=>{
    const reminder={...base,completionHistory:[{id:"one",satisfactionType:"progress_photo_session_confirmed",evidenceDate:"2026-07-18"}]};
    const focus=createDailyFocusService().getDailyFocus({now,reminders:[reminder],progressPhotos:[]});
    expect(focus.find((item)=>item.id==="afternoon-check-in")).toBeUndefined();
    expect(focus.find((item)=>item.id===base.id)).toBeUndefined();
  });

  it("projects an outstanding photo set independently with its typed destination",()=>{
    const reminder={...base,completionHistory:[{id:"old",satisfactionType:"progress_photo_session_confirmed",evidenceDate:"2026-07-11"}]};
    const focus=createDailyFocusService().getDailyFocus({now,reminders:[reminder],progressPhotos:[]});
    expect(focus.find((item)=>item.id==="afternoon-check-in")).toBeUndefined();
    expect(focus.find((item)=>item.id===base.id)).toMatchObject({
      completed:false,
      href:"/evidence/photos?session=afternoon&view=front",
      executionContract:{workflow:"progress_photos",destination:"/evidence/photos"},
    });
  });

  it("does not let a photo set contribute to Morning Check-in completion",()=>{
    const reminder={...base,schedule:{...base.schedule,timeOfDay:"morning"}};
    const focus=createDailyFocusService().getDailyFocus({now,reminders:[reminder],progressPhotos:[]});
    const morning=focus.find((item)=>item.id==="morning-check-in");
    expect(morning?.sessionItems).not.toContainEqual(expect.objectContaining({id:base.id}));
    expect(morning?.href).toBe("/check-in/morning");
    expect(focus.find((item)=>item.id===base.id)).toMatchObject({completed:false});
  });
});

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createSupplementExecutionEditorModel } from "./SupplementExecutionEditorScreen";
import { formatSupplementExecutionSummary } from "../domain/services/SupplementExecutionManagementService";

describe("supplement Execution save and hydration", () => {
  it("hydrates every saved field from the authoritative record", () => {
    const item={
      id:"execution_supplement_protocol",executionRevision:2,
      dose:{amount:"",unit:""},cadence:{type:"every_other_day"},
      preferredSchedule:{daysOfWeek:[],timeOfDay:"17:00",startDate:"2026-07-25",endDate:null},
      reminderPreference:"remind",priority:"high",notes:"With food.",
      timeline:[{startDate:"2026-07-25",endDate:null,dose:{amount:"2",unit:"capsules"},notes:"Until changed"}],
    };
    const model=createSupplementExecutionEditorModel(item);
    expect(model).toMatchObject(item);
    expect(formatSupplementExecutionSummary(model)).toBe("Every other day · 5:00 PM");
  });
  it("preserves hydration for existing cadence values", () => {
    ["daily","specific_days","weekly","as_needed","custom"].forEach((type)=>{
      expect(createSupplementExecutionEditorModel({cadence:{type}}).cadence.type).toBe(type);
    });
    expect(createSupplementExecutionEditorModel({cadence:{type:"specific_weekdays"}}).cadence.type).toBe("specific_days");
  });
  it("uses one authoritative reload, revalidation sequence, and detail redirect", () => {
    const source=fs.readFileSync(path.join(process.cwd(),"src/app/profile/operating-plan/execution/supplements/[protocolId]/actions.js"),"utf8");
    expect(source).toContain("getExecutionItemById(result.executionId)");
    expect(source).toContain('revalidatePath(path,"page")');
    expect(source).toContain('revalidatePath("/profile/operating-plan","page")');
    expect(source).toContain("redirect(path)");
    expect(source.match(/redirect\(/g)).toHaveLength(1);
    expect(source.indexOf("getExecutionItemById")).toBeLessThan(source.indexOf("redirect(path)"));
  });
});

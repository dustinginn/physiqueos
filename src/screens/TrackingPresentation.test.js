import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("Tracking presentation", () => {
  it("keeps dedicated utility navigation after the standalone Execution sunset", () => {
    const plan = fs.readFileSync(new URL("./OperatingPlanScreen.jsx", import.meta.url), "utf8");
    expect(plan).toContain('title: "Tracking"');
    expect(plan).toContain('href: "/profile/operating-plan/tracking"');
    expect(plan).not.toContain('title: "Execution"');
    expect(plan).not.toContain("OperatingPlanDrawer");
    expect(plan).not.toContain("recurring commitments");
  });

  it("renders Morning Weigh-In as evidence-driven Support without strategy or priority controls", () => {
    const tracking = fs.readFileSync(new URL("./TrackingScreen.jsx", import.meta.url), "utf8");
    const editor = fs.readFileSync(new URL("./RecurringSupportEditorScreen.jsx", import.meta.url), "utf8");
    const schedule = fs.readFileSync(new URL("./SupportScheduleEditor.jsx", import.meta.url), "utf8");
    expect(tracking).toContain("Current Tracking Routines");
    expect(tracking).toContain("Morning Weigh-In");
    expect(tracking).toContain("Current Support");
    expect(tracking).toContain("Automatically satisfied when today's valid weight is recorded.");
    expect(tracking).toContain("Edit Support");
    expect(tracking).not.toContain("Strategy");
    expect(schedule).toContain('title="Schedule"');
    for (const section of ['title="Reminder"', 'title="Execution Notes"']) expect(editor).toContain(section);
    expect(editor).not.toContain('title="Priority"');
  });
});

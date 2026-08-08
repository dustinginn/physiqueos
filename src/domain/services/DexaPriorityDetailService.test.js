import { describe, expect, it } from "vitest";
import { createDexaPriorityId, DexaPriorityStage } from "./DexaAppointmentLifecycleService";
import { createPriorityDetailService } from "./PriorityDetailService";

describe("DEXA Priority Detail", () => {
  it("shows a saved preparation note and routes pre-appointment priorities to appointment detail", async () => {
    const detail = await service(appointment({ preparationNote: "Use the saved clinic instructions." }))
      .getPriorityDetail(createDexaPriorityId("2026-08-15", DexaPriorityStage.DAY_BEFORE));
    expect(detail).toMatchObject({
      id: "dexa-appointment:2026-08-15:day-before",
      title: "DEXA tomorrow",
      completable: false,
      action: {
        label: "View DEXA Appointment",
        href: "/profile/operating-plan/execution/dexa",
      },
    });
    expect(section(detail, "Preparation").items[0].detail).toBe("Use the saved clinic instructions.");
    expect(section(detail, "When").items[0].label).toContain("7:30 AM");
  });

  it("fabricates no preparation note when none was saved", async () => {
    const detail = await service(appointment())
      .getPriorityDetail(createDexaPriorityId("2026-08-15", DexaPriorityStage.MORNING_OF));
    expect(section(detail, "Preparation")).toBeUndefined();
  });

  it("uses upload copy and the existing evidence route after the appointment without stale prep guidance", async () => {
    const detail = await service(appointment({ preparationNote: "Do not surface this after the scan." }))
      .getPriorityDetail(createDexaPriorityId("2026-08-15", DexaPriorityStage.UPLOAD_RESULTS));
    expect(detail).toMatchObject({
      title: "Upload DEXA results",
      status: "Action needed",
      action: { label: "Upload DEXA Results", href: "/evidence/dexa" },
    });
    expect(section(detail, "What").items[0].detail).toContain("scheduled scan time has passed");
    expect(section(detail, "Preparation")).toBeUndefined();
  });

  it("does not resolve a stale derived priority after the appointment is completed", async () => {
    const detail = await service(appointment({ active: false, status: "completed" }))
      .getPriorityDetail(createDexaPriorityId("2026-08-15", DexaPriorityStage.UPLOAD_RESULTS));
    expect(detail).toBeNull();
  });
});

function service(dexa) {
  return createPriorityDetailService({ repositories: {
    users: { getCurrentUser: async () => ({ id: "user", timeZone: "America/Los_Angeles" }) },
    goals: { listGoals: async () => [{ id: "goal", title: "Build Lean Mass", status: "active" }] },
    reminders: { getReminderById: async () => null },
    protocols: { listProtocols: async () => [] },
    operatingPlan: { getOperatingPlan: async () => null },
    operatingRhythm: { getOperatingRhythm: async () => null },
    executionItems: { listExecutionItems: async () => [dexa] },
  } });
}

function appointment(overrides = {}) {
  return {
    id: "execution_next_dexa",
    userId: "user",
    type: "dexa_appointment",
    active: true,
    status: "scheduled",
    preferredSchedule: { date: "2026-08-15", timeOfDay: "07:30", daysOfWeek: [] },
    timezone: "America/Los_Angeles",
    reminderPreferences: ["day_before"],
    uploadReminder: true,
    preparationNote: "",
    linkedGoalIds: ["goal"],
    executionRevision: 1,
    ...overrides,
  };
}

function section(detail, title) {
  return detail.sections.find((item) => item.title === title);
}

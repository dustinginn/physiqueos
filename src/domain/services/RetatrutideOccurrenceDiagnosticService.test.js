import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  diagnoseRetatrutideOccurrences,
  resolveDoseForDate,
} from "./RetatrutideOccurrenceDiagnosticService";
import { createPriorityDetailService } from "./PriorityDetailService";
import { createReminderRepository } from "../../data/repositories/ReminderRepository";

const file = path.resolve(process.cwd(), "private/founder/runtime-store.json");
const read = () => JSON.parse(fs.readFileSync(file, "utf8"));

describe("Retatrutide occurrence-source diagnostic", () => {
  it("distinguishes stable execution and dose-change source identities without writing", () => {
    const before = fs.readFileSync(file, "utf8");
    const result = diagnoseRetatrutideOccurrences(JSON.parse(before));
    expect(result.tiles.execution).toMatchObject({
      priorityId: "reminder_retatrutide",
      sourceProtocolId: "protocol_retatrutide_founder",
      sourceReminderId: "reminder_retatrutide",
      sourceCommitmentId: "execution_retatrutide",
      occurrenceType: "scheduled_protocol_execution",
      completionBearing: true,
      detailResolverBranch: "protocol_reminder",
    });
    expect(result.tiles.doseChange).toMatchObject({
      priorityId: "dose-change-protocol_retatrutide_founder-2026-07-23",
      sourceProtocolId: "protocol_retatrutide_founder",
      sourceReminderId: null,
      sourceCommitmentId: null,
      sourceScheduleOrTaperStepId: "week_10_taper",
      occurrenceType: "dose_change_notice",
      completionBearing: false,
      detailResolverBranch: "fallback_no_persisted_reminder",
    });
    expect(fs.readFileSync(file, "utf8")).toBe(before);
  });

  it("resolves the effective dose by occurrence date", () => {
    const protocol = read().protocols.find((item) => item.id === "protocol_retatrutide_founder");
    expect(resolveDoseForDate(protocol, "2026-07-22")).toMatchObject({ dose: 2, doseUnit: "mg" });
    expect(resolveDoseForDate(protocol, "2026-07-23")).toMatchObject({ dose: 1.5, doseUnit: "mg" });
    expect(resolveDoseForDate(protocol, "2026-07-30")).toMatchObject({ dose: 1, doseUnit: "mg" });
  });

  it("identifies one completion owner and the stale stored dose", () => {
    const result = diagnoseRetatrutideOccurrences(read());
    expect(result.completion).toMatchObject({
      ownerType: "reminder",
      ownerId: "reminder_retatrutide",
      commitmentId: "execution_retatrutide",
      executionCompletesIntendedHistory: true,
      doseChangeCompletesIntendedHistory: false,
      doseChangeHasCompletionAction: false,
      duplicateCompletionRiskToday: false,
    });
    expect(result.protocol).toMatchObject({
      storedDose: { value: 2, unit: "mg" },
      effectiveDose: { dose: 1.5, doseUnit: "mg", startDate: "2026-07-23" },
      previousDose: { dose: 2, doseUnit: "mg" },
      nextDose: { dose: 1, doseUnit: "mg", startDate: "2026-07-30" },
    });
    expect(result.staleReadModels.storedDoseStaleForDate).toBe(true);
  });

  it("detects current Build Lean Mass ownership and stale detail goal selection", () => {
    const result = diagnoseRetatrutideOccurrences(read());
    expect(result.protocol).toMatchObject({
      hasBuildLeanMassRelationship: true,
      hasBodyFatGuardrail: true,
      hasVisibleAbsHistory: true,
    });
    expect(result.staleReadModels).toMatchObject({
      operatingPlanPrimaryGoalId: "goal_visible_abs_at_rest",
      protocolCurrentGoalId:
        "goal_transition_live_goal_visible_abs_at_rest_6353e12e1ef8fbc3_objective_lean_mass",
      priorityDetailPrimaryGoalStale: true,
      executionCommitmentGoalIds: [
        "goal_transition_live_goal_visible_abs_at_rest_6353e12e1ef8fbc3_objective_lean_mass",
        "goal_maintain_8_9_body_fat",
        "goal_visible_abs_at_rest",
      ],
    });
  });

  it("explains canonical Execution routing versus the generic fallback", async () => {
    const store = read();
    const service = createPriorityDetailService({
      repositories: repositories(store),
      now: () => new Date("2026-07-23T12:00:00"),
    });
    const execution = await service.getPriorityDetail("reminder_retatrutide");
    const doseChange = await service.getPriorityDetail(
      "dose-change-protocol_retatrutide_founder-2026-07-23"
    );
    expect(execution).toMatchObject({
      id: "reminder_retatrutide",
      title: "Retatrutide",
      completable: true,
      sections: expect.arrayContaining([
          expect.objectContaining({ title: "Dose", items: [expect.objectContaining({
            label: "1.5 mg",
            detail: "2026-07-23 – 2026-07-29",
          })] }),
        expect.objectContaining({ title: "Related Goals", items: expect.arrayContaining([
          expect.objectContaining({ label: "Primary Goal", detail: "Build Lean Mass" }),
          expect.objectContaining({ label: "Guardrail", detail: "8-9% Body Fat" }),
        ]) }),
        expect.objectContaining({ title: "Next Execution Change", items: [
          expect.objectContaining({ label: "None scheduled", detail: "No upcoming Execution phase is scheduled." }),
        ] }),
      ]),
    });
    expect(doseChange).toMatchObject({
      id: "dose-change-protocol_retatrutide_founder-2026-07-23",
      title: "Priority",
      sections: [{ title: "Why it matters" }],
    });
    expect(doseChange).not.toHaveProperty("completable");
  });

  it("routes the sole completion action to the persisted reminder", async () => {
    const store = read();
    const reminders = structuredClone(store.reminders);
    let writes = 0;
    const repository = createReminderRepository(reminders, {
      onChange: () => {
        writes += 1;
      },
    });
    const completedAt = "2026-07-23T21:45:00-07:00";

    expect(await repository.completeReminder("reminder_retatrutide", completedAt)).toMatchObject({
      id: "reminder_retatrutide",
      completedAt,
    });
    expect(
      await repository.completeReminder(
        "dose-change-protocol_retatrutide_founder-2026-07-23",
        completedAt
      )
    ).toBeNull();
    expect(writes).toBe(1);
  });

  it("keeps the priority GET page read-only", () => {
    const page = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/priorities/[priorityId]/page.js"),
      "utf8"
    );
    expect(page).toContain("service.getPriorityDetail(priorityId)");
    expect(page).not.toMatch(/completeReminder|saveReminder|persist|writeFile/);
  });
});

function repositories(store) {
  return {
    users: {
      getCurrentUser: async () => store.user,
      getUserById: async () => store.user,
    },
    goals: { listGoals: async () => store.goals },
    reminders: {
      getReminderById: async (id) => store.reminders.find((item) => item.id === id) ?? null,
    },
    protocols: { listProtocols: async () => store.protocols },
    executionItems: {
      listExecutionItems: async () => store.executionItems,
    },
    operatingPlan: { getOperatingPlan: async () => store.operatingPlan },
    operatingRhythm: { getOperatingRhythm: async () => store.operatingRhythm },
  };
}

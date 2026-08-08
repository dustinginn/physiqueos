import { describe, expect, it } from "vitest";
import { generatePeptideDosingTimeline } from "../models/PeptideDosingStrategyModel";
import { formatSupportSchedulePreview } from "../models/SupportScheduleModel";
import {
  createPeptideSupportHydrationModel,
  formatPeptideExecutionSummary,
  resolvePeptideDose,
} from "./PeptideExecutionManagementService";

describe("Tesamorelin Support migration", () => {
  it("losslessly hydrates the existing one-phase plan as Stay at this dose", () => {
    const hydration = createPeptideSupportHydrationModel({
      executionItem,
      protocol,
      reminder,
    });

    expect(hydration).toMatchObject({
      dosingMode: "structured",
      dosingStrategy: {
        pattern: "stay",
        startingDose: { amount: "0.5", unit: "mg" },
        startDate: "2026-05-24",
        endDate: null,
      },
      supportSchedule: {
        frequency: "specific_days",
        daysOfWeek: ["sunday", "monday", "tuesday", "wednesday", "thursday"],
        timing: "specific",
        specificTime: "21:45",
        startDate: "2026-05-24",
        endDate: null,
      },
      reminderPreference: "remind",
      legacyPriority: "normal",
      notes: "Should be fasted 2-3 hours before injection",
    });
    expect(generatePeptideDosingTimeline(hydration.dosingStrategy)).toEqual([{
      startDate: "2026-05-24",
      endDate: null,
      dose: { amount: "0.5", unit: "mg" },
      notes: "",
    }]);
    expect(formatSupportSchedulePreview(hydration.supportSchedule)).toBe(
      "Sun–Thu at 9:45 PM, starting May 24, 2026, until changed."
    );
  });

  it("derives current dose, no next change, and the Strategy summary from canonical Support", () => {
    expect(resolvePeptideDose(executionItem, "2026-08-06")).toMatchObject({
      current: { dose: { amount: ".5", unit: "mg" } },
      next: null,
    });
    expect(formatPeptideExecutionSummary(executionItem, "2026-08-06")).toBe(
      "Sun–Thu · 9:45 PM · 0.5 mg"
    );
  });
});

const protocol = {
  id: "protocol_tesamorelin",
  userId: "user",
  name: "Tesamorelin",
  category: "peptide",
  status: "active",
  startDate: "2026-05-24",
};
const executionItem = {
  id: "execution_tesamorelin",
  userId: "user",
  type: "peptide",
  title: "Tesamorelin",
  protocolRootId: protocol.id,
  active: true,
  cadence: { type: "weekly" },
  preferredSchedule: {
    daysOfWeek: ["sunday", "monday", "tuesday", "wednesday", "thursday"],
    timeOfDay: "21:45",
    startDate: "2026-05-24",
    endDate: null,
  },
  reminderPreference: "remind",
  priority: "normal",
  notes: "Should be fasted 2-3 hours before injection",
  timeline: [{
    startDate: "2026-05-24",
    endDate: null,
    dose: { amount: ".5", unit: "mg" },
    notes: "",
  }],
};
const reminder = {
  id: "reminder_tesamorelin",
  linkedEntityId: protocol.id,
  active: true,
};

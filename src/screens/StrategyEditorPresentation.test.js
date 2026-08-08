import fs from "node:fs";
import { describe, expect, it } from "vitest";

const editor = fs.readFileSync(new URL("./StrategyEditorScreen.jsx", import.meta.url), "utf8");
const detail = fs.readFileSync(new URL("./OperatingPlanStrategyDetailScreen.jsx", import.meta.url), "utf8");
const action = fs.readFileSync(new URL("../app/profile/operating-plan/strategy/[strategyType]/[strategyId]/edit/actions.js", import.meta.url), "utf8");

describe("strategy editing presentation", () => {
  it("adds the bounded Edit Strategy entry point and blocks repeat submission", () => {
    expect(detail).toContain("Edit Strategy");
    expect(editor).toContain("useFormStatus");
    expect(editor).toContain("disabled={pending}");
    expect(editor).toContain("Update the macro strategy supporting your current goal.");
    expect(editor).toContain("Update the training strategy supporting your current goal.");
    expect(editor).not.toContain("Days, times, and reminders remain in Execution.");
  });

  it("keeps Nutrition focused on macro composition", () => {
    expect(editor).toContain('title="Macro approach"');
    expect(editor).toContain('name="proteinBasis"');
    expect(editor).toContain('name="carbohydrateStrategy"');
    expect(editor).toContain('name="fatStrategy"');
    expect(editor).not.toContain('name="calorieStrategy"');
    expect(editor).not.toContain('label="Intake approach"');
  });

  it("keeps system-owned phase context out of Training configuration", () => {
    expect(editor).toContain('name="progression"');
    expect(editor).toContain('name={`frequency_${area}`}');
    expect(editor).toContain('name="priorities"');
    expect(editor).not.toContain('name="phase"');
    expect(editor).not.toContain('label="Current phase"');
  });

  it("uses the atomic successor service without exposing internals", () => {
    expect(action).toContain("createActiveProtocolSuccessorService");
    expect(action).toContain("createCoachingUpdatesStrategyManagementService");
    expect(action).toContain("expectedCurrentVersionId");
    expect(editor).not.toMatch(/version ID|successor|provenance|effective.date|repository|transaction/i);
  });

  it("presents the six Coaching Updates sections without internal scheduling concepts", () => {
    expect(detail).toContain("detail.editLabel");
    expect(editor).toContain("Midweek Calibration");
    expect(editor).toContain("Weekly Synthesis");
    expect(editor).toContain("Monthly Review");
    expect(editor).toContain("Progress Photos");
    expect(editor).toContain("DEXA");
    expect(editor).toContain("Notifications");
    expect(editor).toContain("Remind me about Progress Photos");
    expect(editor).toContain("Enable Photo Event briefing");
    expect(editor).toContain("Enable DEXA Event briefing");
    expect(editor).toContain("Remind me 1 week before");
    expect(editor).toContain("Remind me 1 day before");
    expect(editor).toContain("Remind me the morning of");
    expect(editor).toContain("Remind me to upload results after the appointment");
    expect(editor).toContain('name="dexaPreparationNote"');
    expect(action).toContain("draft: requested.dexa");
    expect(editor).not.toContain("Routine Daily Briefings");
    expect(editor).not.toContain("Event-driven updates");
    expect(editor).not.toMatch(/recurrence|scheduler status|protocol version|provenance|transaction details/i);
  });
});

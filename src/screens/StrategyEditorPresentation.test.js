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
    expect(editor).toContain("Days, times, and reminders remain in Execution.");
  });

  it("uses the atomic successor service without exposing internals", () => {
    expect(action).toContain("createActiveProtocolSuccessorService");
    expect(action).toContain("createCoachingUpdatesTransactionService");
    expect(action).toContain("expectedCurrentVersionId");
    expect(editor).not.toMatch(/version ID|successor|provenance|effective.date|repository|transaction/i);
  });

  it("presents Coaching Updates policy and event behavior without backend controls", () => {
    expect(detail).toContain("detail.editLabel");
    expect(editor).toContain("Midweek Calibration");
    expect(editor).toContain("Weekly Synthesis");
    expect(editor).toContain("Routine Daily Briefings are not used for this Goal.");
    expect(editor).toContain("Photo and DEXA updates remain available when eligible events occur.");
    expect(editor).toContain("disabled={!model.policy.dailyUserActivationPermitted}");
    expect(editor).not.toMatch(/recurrence|scheduler status|protocol version|provenance|transaction details/i);
  });
});

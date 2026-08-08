import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  new URL("./[reviewId]/actions.js", import.meta.url),
  "utf8",
);

describe("confirmed DEXA appointment reconciliation wiring", () => {
  it("reconciles the current appointment first and uses bounded historical compatibility", () => {
    const scheduledCompletion = source.slice(
      source.indexOf("scheduled_completion:"),
      source.indexOf("analysis: async"),
    );
    expect(scheduledCompletion).toContain("reconcileDexaAppointmentFromConfirmedEvidence");
    expect(scheduledCompletion).toContain("current.matched");
    expect(scheduledCompletion).toContain("reconcileHistoricalDexaExecutionFromConfirmedEvidence");
    expect(scheduledCompletion).not.toContain("reminder_dexa");
  });
});

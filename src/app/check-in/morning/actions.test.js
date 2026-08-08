import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(new URL("./actions.js", import.meta.url), "utf8");

describe("Morning Check-In reconciliation action wiring", () => {
  it("recomputes and validates reconciliation before any weight write", () => {
    const validation = source.indexOf("await reconciliationService.save");
    const weightWrite = source.indexOf(
      "await FounderRepositories.weights.addWeightEntry"
    );

    expect(validation).toBeGreaterThan(-1);
    expect(weightWrite).toBeGreaterThan(validation);
    expect(source).toContain(
      "parseMorningPriorityReconciliationFormData(formData)"
    );
  });

  it("uses the same stored-timezone fallback for weight and recovery dates", () => {
    expect(
      source.match(
        /resolveLocalTimeZone\(user\.timeZone \?\? user\.timezone\)/g
      )
    ).toHaveLength(2);
    expect(source).toContain("getLocalDateKey(now, timeZone)");
  });

  it("does not contain automatic carry-forward, cloning, or schedule mutation", () => {
    expect(source).not.toMatch(
      /carry.?forward|cloneReminder|scheduledDate\s*=|saveReminder|rescheduleReminder/i
    );
  });
});

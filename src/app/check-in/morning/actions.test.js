import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(new URL("./actions.js", import.meta.url), "utf8");
const persistence = fs.readFileSync(
  new URL("../../../domain/services/MorningCheckInPersistenceService.js", import.meta.url),
  "utf8"
);

describe("Morning Check-In reconciliation action wiring", () => {
  it("recomputes and validates reconciliation inside the transaction before any weight write", () => {
    const validation = persistence.indexOf("await reconciliationService.save");
    const weightWrite = persistence.indexOf(
      "await repositories.weights.addWeightEntry"
    );

    expect(validation).toBeGreaterThan(-1);
    expect(weightWrite).toBeGreaterThan(validation);
    expect(source).toContain(
      "parseMorningPriorityReconciliationFormData(formData)"
    );
    expect(source).toContain("createMorningCheckInPersistenceService");
    expect(persistence).toContain("createFounderStoreUnitOfWork");
    expect(persistence).toContain("createSeedRepositories(candidate)");
  });

  it("uses the same stored-timezone fallback for weight and recovery dates", () => {
    expect(
      source.match(
        /resolveLocalTimeZone\(user\.timeZone \?\? user\.timezone\)/g
      )
    ).toHaveLength(3);
    expect(source).toContain("getLocalDateKey(now, timeZone)");
  });

  it("does not contain automatic carry-forward, cloning, or schedule mutation", () => {
    expect(`${source}\n${persistence}`).not.toMatch(
      /carry.?forward|cloneReminder|scheduledDate\s*=|saveReminder|rescheduleReminder/i
    );
  });

  it("contains no direct production repository persist in the weight submission", () => {
    expect(source).not.toMatch(
      /FounderRepositories\.(weights|dailyCheckIns|canonicalEvidence|analyses|reminders)\./
    );
  });

  it("does not turn a successful Morning write into a generic briefing retry", () => {
    const saveAction = source.slice(source.indexOf("export async function saveMorningCheckIn"));
    expect(saveAction).toContain("const result = await service.save");
    expect(saveAction).not.toContain(
      "await createFounderMorningBriefingFinalizationService",
    );
    expect(saveAction).not.toContain("Briefing finalization remains retryable");
    expect(saveAction).not.toContain("briefingUpdate=failed");
  });
});

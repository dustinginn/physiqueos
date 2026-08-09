import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { createDailyFocusService } from "../../../domain/services/DailyFocusService";
const action = fs.readFileSync(new URL("./actions.js", import.meta.url), "utf8");
const persistence = fs.readFileSync(new URL("../../../domain/services/MorningCheckInPersistenceService.js", import.meta.url), "utf8");
const screen = fs.readFileSync(new URL("../../../screens/MorningCheckInScreen.jsx", import.meta.url), "utf8");
describe("Morning Weight workflow contract", () => {
  it("routes the incomplete Home morning session to the dedicated route", () => { const items = createDailyFocusService().getDailyFocus({ now: new Date(2026, 6, 14, 8), weightEntries: [], checkIns: [], reminders: [] }); expect(items[0]).toMatchObject({ label: "Morning Check-in", href: "/check-in/morning" }); expect(items[0].href).not.toBe("/log?session=morning"); });
  it("commits canonical Weight atomically without Evidence Review or Daily regeneration", () => { expect(persistence).toContain("createCanonicalMorningWeightEvidenceObject"); expect(persistence).toContain("addWeightEntry(weightEntry)"); expect(action).toContain("getLocalDateKey(now, timeZone)"); expect(`${action}\n${persistence}`).not.toMatch(/createEvidenceReviewService|generateDailyBriefing/); });
  it("enforces bounded one-decimal input and duplicate-day no-op", () => { expect(action).toMatch(/Math\.round\(parsedWeight \* 10\) \/ 10/); expect(action).toMatch(/weightValue < 50 \|\| weightValue > 1000/); expect(persistence).toMatch(/existingSameDayWeight\?\.weight\?\.value === command\.weightValue/); expect(screen).toContain('min="50"'); expect(screen).toContain('max="1000"'); });
});

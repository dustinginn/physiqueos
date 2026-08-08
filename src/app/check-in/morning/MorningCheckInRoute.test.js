import fs from "node:fs";
import { describe, expect, it } from "vitest";

const page = fs.readFileSync(new URL("./page.js", import.meta.url), "utf8");
const dailyFocus = fs.readFileSync(
  new URL("../../../domain/services/DailyFocusService.js", import.meta.url),
  "utf8"
);

describe("Morning Check-In previous-day route composition", () => {
  it("keeps the route dynamic and resolves the stored timezone with canonical fallback", () => {
    expect(page).toContain('export const dynamic = "force-dynamic"');
    expect(page).toContain(
      "resolveLocalTimeZone(user.timeZone ?? user.timezone)"
    );
  });

  it("loads the authoritative previous-day model and passes the array to the screen", () => {
    expect(page).toContain(
      "createMorningPriorityReconciliationService"
    );
    expect(page).toContain("reconciliationService.getSelection");
    expect(page).toContain(
      "reconciliationItems={reconciliationSelection.items}"
    );
  });

  it("Case N preserves the one canonical direct route used by Home and other entry points", () => {
    expect(dailyFocus).toContain('href: "/check-in/morning"');
    expect(page).toContain("<MorningCheckInScreen");
    expect(page).not.toMatch(/redirect|rewrite|promptSnapshot|unstable_cache/);
  });
});

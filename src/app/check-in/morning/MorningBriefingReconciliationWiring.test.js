import fs from "node:fs";
import { describe, expect, it } from "vitest";

const actions = fs.readFileSync(new URL("./actions.js", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("./page.js", import.meta.url), "utf8");
const screen = fs.readFileSync(
  new URL("../../../screens/MorningCheckInScreen.jsx", import.meta.url),
  "utf8"
);

describe("Morning Check-In briefing reconciliation wiring", () => {
  it("blocks finalization while canonical evidence still awaits confirmation", () => {
    expect(actions).toContain("briefingUpdate=waiting");
    expect(actions).toContain("createFounderMorningBriefingFinalizationService");
  });

  it("uses one bounded finalization path after persistence and for explicit retry", () => {
    expect(actions).toContain("finalizeMorningBriefingReconciliation");
    expect(actions.match(/\.finalize\(\{ userId: user\.id, timeZone, at: now \}\)/g))
      .toHaveLength(2);
    expect(page).toContain(
      "briefingFinalizationAction={finalizeMorningBriefingReconciliation}"
    );
    expect(page).not.toContain(".finalizePending");
    expect(screen).toContain("Finish recovery and update briefing");
  });
});

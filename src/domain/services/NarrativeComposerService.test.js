import { describe, expect, it } from "vitest";
import { composeNarrativeSurface } from "./NarrativeComposerService";

const canonical = {
  hero: { title: "Still on track.", summary: "The latest weigh-in fits the weekly pattern." },
  interpretation: ["The rolling average remains the stronger signal."],
  coachInsight: "Use today's training as the next useful check on recovery.",
};

describe("scheduled narrative composition", () => {
  it("preserves valid canonical narrative sections", () => {
    const result = composeNarrativeSurface({ ...canonical, confidence: 91, temporalContext: { date: "2026-07-13" } });
    expect(result.hero.title).toBe(canonical.hero.title);
    expect(result.hero.summary).toBe(canonical.hero.summary);
    expect(result.interpretation).toEqual(canonical.interpretation);
    expect(result.coachInsight).toBe(canonical.coachInsight);
    expect(result.coachInsightView.intro).toBe(canonical.coachInsight);
  });

  it("rewrites backend Hero language and never emits vague measurement filler", () => {
    const result = composeNarrativeSurface({ ...canonical, hero: { title: "Trend context updated.", summary: "Projection unchanged." }, confidence: 91, temporalContext: { date: "2026-07-14" }, weight: { dayChange: 0.2, weekOverWeek: -1.1, unit: "lb" } });
    expect(result.hero.title).toBe("Still on track.");
    expect(JSON.stringify(result)).not.toMatch(/Trend context updated|projection unchanged|next scheduled measurement/i);
    expect(result.supportingObservations.length).toBeLessThan(3);
    expect(result.coachInsightView.currentFocusBody).toMatch(/single weigh-in/i);
  });

  it("permits a shorter uneventful briefing with no filler bullets", () => {
    const result = composeNarrativeSurface({ confidence: 80, temporalContext: { date: "2026-07-14" } });
    expect(result.hero.title).toBe("Nothing to fix today.");
    expect(result.supportingObservations).toEqual([]);
    expect(result.interpretation).toHaveLength(1);
  });

  it("uses the confirmation template only when canonical narrative is absent", () => {
    const result = composeNarrativeSurface({ confidence: 80, temporalContext: { date: "2026-07-13" } });
    expect(result.hero.title).toBe("Nothing to fix today.");
    expect(result.interpretation.length).toBeGreaterThan(0);
  });

  it("audits same-cadence claims and omits unchanged projection support", () => {
    const claim = "projection:2026-07-30";
    const result = composeNarrativeSurface({
      ...canonical,
      confidence: 90,
      continuity: { previousClaimIds: [claim], currentClaimIds: [claim, "training:new-pr"] },
      projection: { projectedFinish: "2026-07-30" },
      temporalContext: { date: "2026-07-13" },
    });
    expect(result.supportingObservations.join(" ")).not.toMatch(/next scheduled measurement/i);
    expect(result.narrationAudit.continuity).toMatchObject({ repeatedClaimIds: [claim], novelClaimIds: ["training:new-pr"] });
  });
});

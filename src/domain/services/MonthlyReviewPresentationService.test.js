import { describe, expect, it } from "vitest";
import { applyMonthlyReviewToArtifact } from "./MonthlyReviewPresentationService.js";
import { buildEvidencePicture } from "../intelligence/shared/BriefingEvidencePicture.js";
import { synthesizeBriefing } from "../intelligence/shared/BriefingHolisticSynthesis.js";
import { createBriefingIntelligence } from "../intelligence/shared/BriefingIntelligence.js";
import { BRIEFING_INTELLIGENCE_POLICIES, resolveNarrativeBudget } from "../intelligence/shared/BriefingIntelligencePolicies.js";
import { REVIEW_CONTRACTS } from "../intelligence/shared/BriefingSectionContracts.js";
import { BRIEFING_REALIZABLE_KINDS, realizeHolisticBriefingV3 } from "../intelligence/v3/HolisticNarrativeV3.js";
import { holisticScenario } from "../../testSupport/briefingHolisticSynthetic.js";

function review(window = { startDate: "2026-09-01", endDate: "2026-09-19" }) {
  const scenario = holisticScenario({ seed: 1, kind: "risk_routine_progress", cadence: "monthly" });
  const intelligence = createBriefingIntelligence({ window, days: scenario.period.days, policy: BRIEFING_INTELLIGENCE_POLICIES.monthly });
  const picture = buildEvidencePicture({ intelligence, goalPolicy: scenario.goalPolicy, goalFacts: scenario.goalFacts });
  const synthesis = synthesizeBriefing({ picture, budget: resolveNarrativeBudget(BRIEFING_INTELLIGENCE_POLICIES.monthly, picture),
    realizableKinds: BRIEFING_REALIZABLE_KINDS });
  return realizeHolisticBriefingV3({ cadence: "monthly", synthesis, picture, goalLabel: "the goal", goalPolicy: scenario.goalPolicy,
    goalProgress: "You are more than halfway to the goal." });
}

// Legacy per-day energy over a phase that starts before the month.
function dailyWeeks() {
  const days = [];
  for (let d = new Date("2026-08-15T12:00:00Z"); d <= new Date("2026-09-19T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
    const date = d.toISOString().slice(0, 10);
    days.push({ id: date, date, day: Number(date.slice(8)), intake: date < "2026-09-01" ? 9999 : 2600, expenditure: 2500, balance: 100, missing: false, synthetic: false });
  }
  return [{ label: "Week 1", days }];
}

function legacyArtifact(referenceDate) {
  return { id: "monthly_x", briefing: {
    monthlyNarrative: { title: "Legacy", thesis: "Legacy thesis.", strategicSummaryV3: {
      summary: "Headline.", coachTake: "Legacy coaching.", uncertainty: [],
      sections: { result: "The read.", meaning: "Meaning.", action: "Keep going.", watch: "Watch it.", confidence: "Confidence · 79% —\nLong." } } },
    monthlyPresentation: {
      hero: { title: "Legacy", thesis: "Legacy thesis.", period: "September 1–19 · Delivered October 1", highlights: [{ label: "Old" }] },
      training: { title: "Legacy training", summary: "Legacy.", next: "Legacy next.", stats: [{ label: "Old lift" }], highlights: [{}] },
      energy: { eyebrow: "Energy Evolution", title: "Legacy energy", summary: "Legacy.", whyItMatters: "Legacy.", weekly: [{ label: "W1", intake: 2500, expenditure: 2600 }],
        summaryMetrics: [{ label: "Avg intake", value: 2500 }], dailyWeeks: dailyWeeks() },
      newBaseline: { title: "Legacy baseline", summary: "Legacy.", callout: "Legacy.", facts: [{ label: "Reference date", value: referenceDate }] },
      changes: { themes: [{ title: "Legacy change" }] },
      moments: { moments: [{ label: "Legacy moment" }] },
      monthAhead: { thesis: "Legacy.", guidance: [{ label: "Legacy" }] },
    } } };
}

const block = { score: 79, band: "high", movementLabel: "No meaningful change", presentationExplanation:
  "Confidence holds. The last check still sets the outlook. The available signals have mixed agreement. Material questions remain unresolved. Energy direction remains unresolved.",
  explanationModel: { summary: "long" } };

describe("Monthly review presentation", () => {
  it("replaces every legacy prose field with the review and removes what the review did not earn", () => {
    const realized = review();
    const plan = Object.freeze({ holisticSynthesis: { review: realized.review }, composition: { headline: realized.headline },
      confidenceBriefing: { body: realized.confidenceBody } });
    const measuredAt = realized.review.modules.find((item) => item.role === "trajectory")?.measuredAt;
    const referenceDate = measuredAt ? new Date(`${measuredAt}T12:00:00Z`).toLocaleDateString("en-US",
      { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : "never";
    const artifact = applyMonthlyReviewToArtifact({ artifact: legacyArtifact(referenceDate), narrativePlan: plan, confidenceBlock: block });
    const presentation = artifact.briefing.monthlyPresentation;
    const all = JSON.stringify(artifact.briefing);
    expect(all).not.toMatch(/Legacy (?:thesis|training|energy|baseline|change|moment|next)|Old lift/u);
    // Defining Moments keeps its approved shape: eyebrow, title, dated entries.
    const moments = realized.review.modules.find((item) => item.role === "moments");
    expect(presentation.moments).toEqual({ eyebrow: "Defining Moments", title: `${moments.items.length} moments defined September.`,
      moments: moments.items.map((item) => ({ date: item.date, label: item.title, body: item.text, tone: item.tone })) });
    // What Changed keeps its approved shape: thematic cards (label, title, body, tone).
    for (const theme of presentation.changes.themes) expect(Object.keys(theme).sort()).toEqual(["body", "label", "title", "tone"]);
    expect(presentation.changes.title).toBe("September changed how progress should be judged.");
    expect(presentation.monthAhead.title).toBe("Turn September's signals into repeatable evidence.");
    for (const card of presentation.monthAhead.guidance) expect(Object.keys(card).sort()).toEqual(["detail", "label", "tone", "value"]);
    expect(presentation.hero.title).toBe(realized.headline);
    expect(presentation.hero.period).toBe("September 1–19 · Month to date");
    expect(presentation.training.next).toBeUndefined();
    // The energy figures are rebuilt over the review's window and readable
    // days: nothing from before the month, no unreadable day.
    const excluded = new Set(realized.review.modules.find((item) => item.role === "energy")?.excludedDates ?? []);
    expect(presentation.energy.weekly.map((week) => week.label)).toEqual(["Sep 1–Sep 7", "Sep 8–Sep 14", "Sep 15–Sep 19"]);
    expect(presentation.energy.summaryMetrics[0]).toMatchObject({ label: "Avg intake", value: 2600 });
    expect(presentation.energy.phaseDates).toBe("Sep 1–Sep 19");
    for (const week of presentation.energy.dailyWeeks) for (const day of week.days) {
      expect(day.date >= "2026-09-01").toBe(true);
      if (excluded.has(day.date)) expect(day.missing).toBe(true);
    }
    expect(presentation.energy.eyebrow).toBe("Energy Evolution");
    // A week with fewer than three readable days is not shown as a weekly average.
    for (const week of presentation.energy.weekly) if (week.observedCount < 3) expect(week.missing).toBe(true);
    // Clients key What Changed and Month Ahead cards by tone: each is unique.
    const changeTones = presentation.changes?.themes.map((item) => item.tone) ?? [];
    expect(new Set(changeTones).size).toBe(changeTones.length);
    const aheadTones = presentation.monthAhead.guidance.map((item) => item.tone);
    expect(new Set(aheadTones).size).toBe(aheadTones.length);
    expect(presentation.monthAhead.eyebrow).toBe("Month Ahead");
    expect(presentation.training.callout).toBe("Why it matters");

    // Compact Confidence in the hero; none in the strategic card.
    const words = presentation.hero.confidence.presentationExplanation.split(/\s+/u).length;
    expect(words).toBeLessThanOrEqual(REVIEW_CONTRACTS.monthly.confidence.maxWords);
    expect(presentation.hero.confidence.score).toBe(79);
    // The approved Monthly has no strategic or uncertainty card.
    expect(artifact.briefing.monthlyNarrative.strategicSummaryV3).toBeUndefined();
    expect(presentation.coachTake).toBeUndefined();
    expect(artifact.briefing.monthlyReviewV3.audit.ok).toBe(true);
  });

  it("builds the measurement card from the review when the legacy grid describes another measurement", () => {
    const realized = review();
    const trajectory = realized.review.modules.find((item) => item.role === "trajectory");
    const plan = { holisticSynthesis: { review: realized.review }, composition: { headline: realized.headline }, confidenceBriefing: {} };
    const artifact = applyMonthlyReviewToArtifact({ artifact: legacyArtifact("January 1, 2020"), narrativePlan: plan, confidenceBlock: block });
    const card = artifact.briefing.monthlyPresentation.newBaseline;
    if (!trajectory || trajectory.scaleOnly) return expect(card).toBeUndefined();
    expect(card.title).toBe(trajectory.title);
    expect(card.facts.map((item) => item.label)).toContain("Reference date");
    expect(JSON.stringify(card)).not.toMatch(/January 1, 2020|Legacy/u);
  });

  it("a month without a measurement has no New Baseline card; the scale is judged in What Changed", () => {
    const realized = review();
    const modules = realized.review.modules.filter((item) => item.role !== "trajectory");
    const plan = { holisticSynthesis: { review: { ...realized.review, modules } }, composition: { headline: realized.headline }, confidenceBriefing: {} };
    const artifact = applyMonthlyReviewToArtifact({ artifact: legacyArtifact("never"), narrativePlan: plan, confidenceBlock: block });
    expect(artifact.briefing.monthlyPresentation.newBaseline).toBeUndefined();
    expect(artifact.briefing.monthlyPresentation.changes.themes.map((item) => item.tone)).toContain("weight");
  });

  it("a Monthly without a realized review is returned exactly as it was", () => {
    const original = legacyArtifact("September 12, 2026");
    const copy = structuredClone(original);
    const result = applyMonthlyReviewToArtifact({ artifact: copy, narrativePlan: { holisticSynthesis: { realized: false } } });
    expect(result).toEqual(original);
  });

  it("a closed month keeps its delivery line", () => {
    const realized = review({ startDate: "2026-08-01", endDate: "2026-08-31" });
    const plan = { holisticSynthesis: { review: realized.review }, composition: { headline: realized.headline }, confidenceBriefing: {} };
    const artifact = applyMonthlyReviewToArtifact({ artifact: legacyArtifact("never"), narrativePlan: plan, confidenceBlock: block });
    expect(artifact.briefing.monthlyPresentation.hero.period).toBe("September 1–19 · Delivered October 1");
  });
});

describe("Monthly review publication gate", () => {
  it("a correction keeps the format the Monthly was first published in", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync(new URL("./MonthlyBriefingService.js", import.meta.url), "utf8");
    expect(source).toMatch(/if \(!replacement \|\| existing\?\.briefing\?\.monthlyReviewV3\) \{\s*applyMonthlyReviewToArtifact/u);
  });
});

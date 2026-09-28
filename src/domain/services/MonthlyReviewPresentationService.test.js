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

function legacyArtifact(referenceDate) {
  return { id: "monthly_x", briefing: {
    monthlyNarrative: { title: "Legacy", thesis: "Legacy thesis.", strategicSummaryV3: {
      summary: "Headline.", coachTake: "Legacy coaching.", uncertainty: [],
      sections: { result: "The read.", meaning: "Meaning.", action: "Keep going.", watch: "Watch it.", confidence: "Confidence · 79% —\nLong." } } },
    monthlyPresentation: {
      hero: { title: "Legacy", thesis: "Legacy thesis.", period: "September 1–19 · Delivered October 1", highlights: [{ label: "Old" }] },
      training: { title: "Legacy training", summary: "Legacy.", next: "Legacy next.", stats: [{ label: "Old lift" }], highlights: [{}] },
      energy: { title: "Legacy energy", summary: "Legacy.", whyItMatters: "Legacy.", weekly: [{ label: "W1", intake: 2500, expenditure: 2600 }],
        summaryMetrics: [{ label: "Avg intake", value: 2500 }] },
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
    expect(presentation.moments).toBeUndefined();
    expect(presentation.hero.title).toBe(realized.headline);
    expect(presentation.hero.period).toBe("September 1–19 · Month to date");
    expect(presentation.training.next).toBeNull();
    // Data the review does not author stays: the energy bars.
    expect(presentation.energy.weekly).toHaveLength(1);
    // Compact Confidence in the hero; none in the strategic card.
    const words = presentation.hero.confidence.presentationExplanation.split(/\s+/u).length;
    expect(words).toBeLessThanOrEqual(REVIEW_CONTRACTS.monthly.confidence.maxWords);
    expect(presentation.hero.confidence.score).toBe(79);
    const strategic = artifact.briefing.monthlyNarrative.strategicSummaryV3;
    expect(strategic.sections).toMatchObject({ meaning: null, action: null, watch: null, confidence: null });
    expect(strategic.coachTake).toBe(realized.review.modules.find((item) => item.role === "strategy").paragraphs.join(" "));
    expect(artifact.briefing.monthlyReviewV3.audit.ok).toBe(true);
  });

  it("drops the measurement card when its metric grid describes a different measurement", () => {
    const realized = review();
    const plan = { holisticSynthesis: { review: realized.review }, composition: { headline: realized.headline }, confidenceBriefing: {} };
    const artifact = applyMonthlyReviewToArtifact({ artifact: legacyArtifact("January 1, 2020"), narrativePlan: plan, confidenceBlock: block });
    expect(artifact.briefing.monthlyPresentation.newBaseline).toBeUndefined();
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

// Monthly review properties: the Monthly is the richest recurring briefing —
// a review of the month written from the same shared engine — while its
// Confidence stays compact. Richness is earned by evidence, never padded.

import { describe, expect, it } from "vitest";
import { buildEvidencePicture } from "./BriefingEvidencePicture.js";
import { synthesizeBriefing } from "./BriefingHolisticSynthesis.js";
import { createBriefingIntelligence } from "./BriefingIntelligence.js";
import { BRIEFING_INTELLIGENCE_POLICIES, resolveNarrativeBudget } from "./BriefingIntelligencePolicies.js";
import { REVIEW_CONTRACTS, ReviewModule, compactConfidence, resolveReviewContract } from "./BriefingSectionContracts.js";
import { EFFECTIVENESS_LANGUAGE, RETROACTIVE_REPAIR_LANGUAGE } from "./BriefingClaimRestraint.js";
import { BRIEFING_REALIZABLE_KINDS, realizeHolisticBriefingV3 } from "../v3/HolisticNarrativeV3.js";
import { findNarrativeV3VoiceViolations } from "../v3/NarrativeV3CompositionService.js";
import { HOLISTIC_GOAL_TYPES, HOLISTIC_KINDS, holisticScenario } from "../../../testSupport/briefingHolisticSynthetic.js";

const SEEDS = [1, 2, 3];

function realize({ seed, kind, goalType = "build_lean_mass", cadence = "monthly", window = null }) {
  const scenario = holisticScenario({ seed, kind, goalType, cadence });
  const intelligence = window
    ? createBriefingIntelligence({ window, days: scenario.period.days, policy: BRIEFING_INTELLIGENCE_POLICIES[cadence] })
    : scenario.intelligence;
  const picture = buildEvidencePicture({ intelligence, goalPolicy: scenario.goalPolicy, goalFacts: scenario.goalFacts });
  const synthesis = synthesizeBriefing({ picture, budget: resolveNarrativeBudget(BRIEFING_INTELLIGENCE_POLICIES[cadence], picture),
    realizableKinds: BRIEFING_REALIZABLE_KINDS });
  const realized = realizeHolisticBriefingV3({ cadence, synthesis, picture, goalLabel: "the goal", goalPolicy: scenario.goalPolicy,
    goalProgress: "You are more than halfway to the goal." });
  return { scenario, picture, synthesis, realized };
}

const prose = (module) => [module.title, ...(module.paragraphs ?? []), ...(module.items ?? []).flatMap((item) => [item.value, item.text]),
  module.interpretation].filter(Boolean);
const reviewText = (review) => review.modules.flatMap(prose);
const words = (text) => String(text ?? "").split(/\s+/u).filter(Boolean).length;
const sentences = (text) => String(text ?? "").split(/(?<=[.!?])\s+(?=[A-Z0-9])/u).filter(Boolean);

const corpus = HOLISTIC_GOAL_TYPES.flatMap((goalType) => HOLISTIC_KINDS.flatMap((kind) => SEEDS.map((seed) =>
  ({ goalType, kind, seed, ...realize({ seed, kind, goalType }) })))).filter((item) => item.realized?.review);

describe("Monthly review: rich where the month earns it", () => {
  it("every realized Monthly carries a review that passes its own audit", () => {
    expect(corpus.length).toBeGreaterThan(200);
    for (const { goalType, kind, seed, realized } of corpus) {
      expect(realized.review.audit.issues, `${goalType}/${kind}#${seed}`).toEqual([]);
      expect(realized.sectionAudit.text.issues, `${goalType}/${kind}#${seed}`).toEqual([]);
    }
  });

  it("a rich month is substantially more expansive than the Weekly over the same evidence", () => {
    for (const kind of ["risk_routine_progress", "crowded", "disruption_training_stable_weight"]) {
      for (const seed of SEEDS) {
        const monthly = realize({ seed, kind }).realized;
        const weekly = realize({ seed, kind, cadence: "weekly" }).realized;
        expect(monthly.review.audit.totalWords, `${kind}#${seed}`).toBeGreaterThan(1.3 * weekly.sectionAudit.text.totalWords);
        expect(monthly.review.modules.length).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it("a quiet month stays shorter than an eventful one; nothing is padded to a length", () => {
    const average = (kind) => SEEDS.reduce((sum, seed) => sum + realize({ seed, kind }).realized.review.audit.totalWords, 0) / SEEDS.length;
    expect(average("stable_all")).toBeLessThan(0.7 * average("risk_routine_progress"));
    for (const { realized } of corpus) {
      for (const module of realized.review.modules) expect(module.earnedBy?.length, module.role).toBeGreaterThan(0);
    }
  });

  it("assesses every domain before choosing, gives complementary domains their own module, and records each omission", () => {
    const { realized, synthesis } = realize({ seed: 1, kind: "risk_routine_progress" });
    expect(synthesis.considered.map((item) => item.domain)).toEqual(expect.arrayContaining(["body_composition", "training",
      "body_trajectory", "guardrail", "nutrition", "routine", "activity", "recovery", "visual_change"]));
    const roles = realized.review.modules.map((item) => item.role);
    expect(roles).toEqual(expect.arrayContaining([ReviewModule.TRAINING, ReviewModule.ENERGY, ReviewModule.TRAJECTORY,
      ReviewModule.EXECUTION]));
    const every = [...roles, ...realized.review.omitted.map((item) => item.role)];
    expect(new Set(every)).toEqual(new Set(REVIEW_CONTRACTS.monthly.modules));
    // Modules render in the contract's display order.
    expect(roles).toEqual(REVIEW_CONTRACTS.monthly.modules.filter((role) => roles.includes(role)));
  });

  it("a domain without evidence gets no module: no training, no nutrition, no measurement", () => {
    for (const { picture, realized } of corpus) {
      const domain = (name) => picture.domains.find((item) => item.domain === name);
      const roles = realized.review.modules.map((item) => item.role);
      if (domain("nutrition").status !== "assessed") expect(roles).not.toContain(ReviewModule.ENERGY);
      if (domain("body_composition").status !== "assessed") expect(roles).not.toContain(ReviewModule.TRAJECTORY);
      if (domain("routine").state === "steady") expect(roles).not.toContain(ReviewModule.EXECUTION);
      if (domain("training").status !== "assessed") expect(roles).not.toContain(ReviewModule.TRAINING);
    }
  });

  it("is not a concatenation of Weeklies: no week-scoped wording and no Weekly sentence reused", () => {
    for (const { goalType, kind, seed, realized } of corpus.slice(0, 120)) {
      const text = reviewText(realized.review).join(" ");
      expect(text, `${goalType}/${kind}#${seed}`).not.toMatch(/\b(?:this|next|last) week\b|\bthe week\b/u);
      const weekly = realize({ seed, kind, goalType, cadence: "weekly" }).realized;
      if (!weekly) continue;
      // The goal-level meaning of a standing measurement is the same fact at
      // every horizon; the period's own content (recap, read, coaching) is not.
      for (const sentence of sentences([weekly.recap, weekly.coachTake, weekly.result].join(" "))) {
        expect(text.includes(sentence), sentence).toBe(false);
      }
    }
  });

  it("persistence: several short stretches, one stretch and a whole-month break read differently", () => {
    const labels = new Set(corpus.map(({ realized }) => realized.review.modules
      .find((item) => item.role === ReviewModule.EXECUTION)?.persistence).filter(Boolean));
    expect(labels.size).toBeGreaterThanOrEqual(2);
    const missed = realize({ seed: 3, kind: "missed_week" }).realized.review;
    const training = missed.modules.find((item) => item.role === ReviewModule.TRAINING);
    expect(training?.paragraphs.join(" ") ?? "").not.toMatch(/landed in every week/u);
    // Training bests in one week are told as one week, not as a pattern.
    for (const { realized } of corpus) {
      const t = realized.review.modules.find((item) => item.role === ReviewModule.TRAINING);
      if (!t) continue;
      expect(t.paragraphs.join(" ")).not.toMatch(/one of the \w+ weeks rather than in one good week/u);
    }
  });

  it("Confidence stays compact however rich the body is", () => {
    const { confidence } = REVIEW_CONTRACTS.monthly;
    for (const { realized } of corpus) {
      if (!realized.review.confidence) continue;
      expect(words(realized.review.confidence)).toBeLessThanOrEqual(confidence.maxWords);
      expect(sentences(realized.review.confidence).length).toBeLessThanOrEqual(confidence.maxSentences);
      // Exercise performance never explains the outlook.
      expect(realized.review.confidence).not.toMatch(/\blifts?\b|\breps?\b|\bbest\b/u);
    }
    const long = "Confidence jumped because the check measured a standout result: 5.0 lb of lean mass since August 15, with body fat at 8.1%. You are more than halfway to the goal. There is still uncertainty about the remaining time.";
    const compact = compactConfidence(long, confidence);
    expect(words(compact)).toBeLessThanOrEqual(confidence.maxWords);
    expect(compact).toMatch(/^Confidence jumped because/u);
    expect(compact).toContain("5.0 lb");
  });

  it("the same quantity is stated in one module only, and no two modules say the same thing", () => {
    for (const { realized } of corpus) {
      expect(realized.review.audit.issues.filter((issue) => /repeats|mostly say/u.test(issue))).toEqual([]);
    }
  });

  it("coach voice and causal restraint on every word of the review", () => {
    for (const { goalType, kind, seed, realized } of corpus) {
      for (const text of [...reviewText(realized.review), realized.review.confidence].filter(Boolean)) {
        expect(findNarrativeV3VoiceViolations(text), `${goalType}/${kind}#${seed}: ${text}`).toEqual([]);
        expect(text, `${goalType}/${kind}#${seed}`).not.toMatch(EFFECTIVENESS_LANGUAGE);
        expect(text, `${goalType}/${kind}#${seed}`).not.toMatch(RETROACTIVE_REPAIR_LANGUAGE);
      }
    }
  });

  it("weight is never read as body composition, and wearable expenditure is treated with humility", () => {
    for (const { realized, picture } of corpus) {
      const text = reviewText(realized.review).join(" ");
      expect(text).not.toMatch(/the scale (?:shows|proves|confirms) (?:lean|muscle|fat)/u);
      const trajectory = realized.review.modules.find((item) => item.role === ReviewModule.TRAJECTORY);
      const weight = picture.domains.find((item) => item.domain === "body_trajectory");
      if (trajectory && weight?.status === "assessed" && weight.facts.movement !== "flat" &&
          Number.isFinite(weight.facts.firstWeekAverage) && Number.isFinite(weight.facts.lastWeekAverage)) {
        expect(trajectory.paragraphs.join(" ")).toMatch(/can't tell .* apart from other weight/u);
      }
      const energy = realized.review.modules.find((item) => item.role === ReviewModule.ENERGY);
      if (energy && picture.domains.find((item) => item.domain === "activity")?.facts?.measurement === "wearable_estimate") {
        expect(energy.interpretation).toMatch(/wearable estimate/u);
      }
      // No expenditure figure is ever stated as prose.
      expect(text).not.toMatch(/\d[\d,]* (?:calories|kcal) (?:burned|spent|expended)/u);
    }
  });

  it("a month-to-date review never claims the days it has not seen", () => {
    const window = { startDate: "2026-09-01", endDate: "2026-09-19" };
    for (const seed of SEEDS) {
      for (const kind of ["risk_routine_progress", "strong_training", "crowded"]) {
        const { realized } = realize({ seed, kind, window });
        const review = realized.review;
        expect(review.period.toDate).toBe(true);
        expect(review.period.remainingDays).toBe(11);
        const text = [realized.headline, ...reviewText(review), realized.result].join(" ");
        expect(text).not.toMatch(/\bthe month ended\b|\bwhole month\b|\bevery week of the month\b|\ball month\b|\bfinished\b/u);
        const training = review.modules.find((item) => item.role === ReviewModule.TRAINING);
        if (training?.paragraphs.some((paragraph) => /New bests/u.test(paragraph))) {
          expect(training.paragraphs.join(" ")).toMatch(/through September 19/u);
        }
        const open = review.modules.find((item) => item.role === ReviewModule.EXECUTION)?.items?.find((item) => /latest complete day/u.test(item.text));
        if (open) expect(open.text).toMatch(/isn't known yet/u);
      }
    }
    // A closed calendar month carries no month-to-date qualifiers.
    const closed = realize({ seed: 1, kind: "risk_routine_progress", window: { startDate: "2026-08-01", endDate: "2026-08-31" } }).realized.review;
    expect(closed.period.toDate).toBe(false);
    expect(reviewText(closed).join(" ")).not.toMatch(/\bso far\b|through August 31|latest complete day/u);
    expect(closed.modules.find((item) => item.role === ReviewModule.AHEAD).paragraphs[0]).toMatch(/^September's job/u);
  });

  it("Recovery and Sleep have a declared slot: assessed first, and a module waits for real evidence", () => {
    const { realized, synthesis } = realize({ seed: 1, kind: "crowded" });
    expect(synthesis.considered.find((item) => item.domain === "recovery")).toBeTruthy();
    expect(REVIEW_CONTRACTS.monthly.modules).toContain(ReviewModule.OTHER);
    expect(realized.review.omitted.find((item) => item.role === ReviewModule.OTHER)?.reason).toMatch(/no_recovery_evidence_yet/u);
  });

  it("is deterministic, and only the Monthly has a review", () => {
    const first = realize({ seed: 2, kind: "crowded" }).realized.review;
    const second = realize({ seed: 2, kind: "crowded" }).realized.review;
    expect(second).toEqual(first);
    expect(resolveReviewContract("monthly")).toBe(REVIEW_CONTRACTS.monthly);
    for (const cadence of ["weekly", "midweek", "dexa", "photo"]) {
      expect(resolveReviewContract(cadence)).toBeNull();
      expect(realize({ seed: 1, kind: "crowded", cadence }).realized?.review).toBeUndefined();
    }
  });
});

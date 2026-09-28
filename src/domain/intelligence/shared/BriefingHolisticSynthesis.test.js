// Holistic synthesis properties across generated situations and every
// briefing horizon. Each assertion is a product rule, not a sentence.

import { describe, expect, it } from "vitest";
import { buildEvidencePicture } from "./BriefingEvidencePicture.js";
import { synthesizeBriefing } from "./BriefingHolisticSynthesis.js";
import { BRIEFING_INTELLIGENCE_POLICIES, resolveNarrativeBudget } from "./BriefingIntelligencePolicies.js";
import { goalFactsFromInterpretationV3, realizeHolisticWeeklyV3 } from "../v3/HolisticNarrativeV3.js";
import { findNarrativeV3VoiceViolations } from "../v3/NarrativeV3CompositionService.js";
import { HOLISTIC_KINDS, holisticScenario } from "../../../testSupport/briefingHolisticSynthetic.js";

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const ANALYST_TERMS = /\b(?:anchor\w*|directional\w*|evidence|robust|materiality|reliab\w*|anomal\w*|deviation\w*|baseline|signal\w*|z-?scores?|causal\w*)\b/iu;

function run({ seed, kind, cadence = "weekly" }) {
  const scenario = holisticScenario({ seed, kind, cadence });
  const picture = buildEvidencePicture({ intelligence: scenario.intelligence, goalPolicy: scenario.goalPolicy,
    goalFacts: scenario.goalFacts });
  const budget = resolveNarrativeBudget(scenario.policy, picture);
  const synthesis = synthesizeBriefing({ picture, budget });
  const realized = cadence === "weekly"
    ? realizeHolisticWeeklyV3({ synthesis, picture, goalLabel: "the goal", goalPolicy: scenario.goalPolicy }) : null;
  return { scenario, picture, budget, synthesis, realized };
}

const weekly = HOLISTIC_KINDS.flatMap((kind) => SEEDS.map((seed) => ({ kind, seed, ...run({ seed, kind }) })));
const textOf = (realized) => realized ? [realized.result, realized.meaning, realized.action, realized.watch,
  realized.coachTake, realized.confidenceBody].filter(Boolean).join(" ") : "";
const byKind = (kind) => weekly.filter((item) => item.kind === kind);

describe("every goal-relevant domain is assessed before synthesis", () => {
  it("considers the goal policy's full domain set, including the Recovery slot", () => {
    for (const { kind, seed, scenario, picture, synthesis } of weekly) {
      const expected = Object.keys(scenario.goalPolicy.domains).sort();
      expect(picture.domains.map((item) => item.domain).sort(), `${kind}#${seed}`).toEqual(expected);
      expect(synthesis.considered.map((item) => item.domain).sort()).toEqual(expected);
      expect(picture.domains.find((item) => item.domain === "recovery").status).toBe("unavailable");
    }
  });

  it("weight is always assessed for a mass goal when there are enough weigh-ins", () => {
    for (const { kind, seed, picture } of weekly.filter((item) => item.kind !== "sparse")) {
      const trajectory = picture.domains.find((item) => item.domain === "body_trajectory");
      expect(trajectory.status, `${kind}#${seed}`).toBe("assessed");
      expect(trajectory.facts.note).toBe("scale_weight_does_not_identify_lean_or_fat_mass");
    }
  });
});

describe("synthesis is holistic, complementary and budgeted", () => {
  it("never exceeds the briefing's budget and never repeats a domain without a dominant risk", () => {
    for (const { kind, seed, budget, synthesis } of weekly) {
      expect(synthesis.selected.length, `${kind}#${seed}`).toBeLessThanOrEqual(budget.maxInsights);
      expect(synthesis.limitations.length).toBeLessThanOrEqual(budget.maxLimitations);
      const domains = synthesis.selected.map((item) => item.domain);
      for (const domain of new Set(domains)) {
        const repeats = synthesis.selected.filter((item) => item.domain === domain);
        if (repeats.length > 1) expect(repeats.every((item) => item.role === "risk" && item.strength >= 2.4)).toBe(true);
      }
    }
  });

  it("not every assessed domain is mentioned, and the omissions say why", () => {
    for (const { kind, seed, picture, synthesis } of byKind("crowded")) {
      const offered = picture.domains.flatMap((item) => item.insights).length;
      expect(synthesis.selected.length + synthesis.limitations.length, `${kind}#${seed}`).toBeLessThan(offered);
      expect(synthesis.omitted.length).toBeGreaterThan(0);
      for (const item of synthesis.omitted) expect(item.reason).toMatch(/^[a-z_:+]+$/u);
    }
  });

  it("no one domain monopolizes a week with several meaningful domains", () => {
    for (const kind of ["disruption_training_stable_weight", "crowded", "spectacular_pr", "strong_training"]) {
      for (const { seed, synthesis } of byKind(kind)) {
        expect(new Set(synthesis.selected.map((item) => item.domain)).size, `${kind}#${seed}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("a routine break tells its own activity dip; activity is not a second story", () => {
    for (const { kind, seed, synthesis } of weekly) {
      const routine = synthesis.selected.find((item) => item.kind === "routine_break");
      if (routine?.coversKinds?.includes("activity_change")) {
        expect(synthesis.selected.some((item) => item.kind === "activity_change"), `${kind}#${seed}`).toBe(false);
      }
    }
  });

  it("a stable week stays concise", () => {
    for (const { seed, synthesis } of byKind("stable_all")) {
      expect(synthesis.selected.length, `seed ${seed}`).toBeLessThanOrEqual(2);
      expect(synthesis.selected.some((item) => ["routine_break", "guardrail_status"].includes(item.kind))).toBe(false);
    }
  });

  it("a spectacular PR is mentioned as an example without taking over the week", () => {
    for (const { seed, synthesis, realized } of byKind("spectacular_pr")) {
      expect(synthesis.selected.some((item) => item.kind === "training_progress"), `seed ${seed}`).toBe(true);
      expect(realized.coachTake).toMatch(/Lift A/u);
      expect(synthesis.selected.some((item) => item.domain !== "training")).toBe(true);
    }
  });

  it("an unreliable nutrition week never makes an intake claim and says why only when it limits the picture", () => {
    for (const { seed, synthesis, realized } of byKind("unreliable_nutrition")) {
      expect(synthesis.selected.some((item) => item.kind === "intake_vs_plan"), `seed ${seed}`).toBe(false);
      expect(synthesis.omitted.some((item) => item.id === "nutrition|intake_vs_plan" &&
        item.reason === "restrained:unreliable_days_in_average")).toBe(true);
      expect(textOf(realized)).not.toMatch(/intake stayed on plan/u);
    }
  });

  it("is deterministic for the same input", () => {
    for (const { kind, seed } of weekly.filter((_, index) => index % 9 === 0)) {
      expect(JSON.stringify(run({ seed, kind }).synthesis)).toBe(JSON.stringify(run({ seed, kind }).synthesis));
    }
  });
});

describe("Goal Confidence, strategy and restraint", () => {
  it("an exercise never explains Goal Confidence", () => {
    for (const { kind, seed, scenario, realized } of weekly) {
      if (!realized?.confidenceBody) continue;
      for (const milestone of scenario.goalFacts.trainingMilestones) {
        expect(realized.confidenceBody, `${kind}#${seed}`).not.toContain(milestone.subjectLabel);
      }
    }
  });

  it("weight is never presented as body composition", () => {
    for (const { kind, seed, scenario, realized } of weekly) {
      const text = textOf(realized);
      if (!scenario.goalFacts.composition) expect(text, `${kind}#${seed}`).not.toMatch(/\blean\b|body fat at/u);
      // The weight clause itself never names lean or fat mass.
      expect(realized?.result ?? "").not.toMatch(/weight[^,.;]*\b(?:muscle|lean|fat)\b/u);
    }
  });

  it("claims no cause and speaks as a coach, not an analyst", () => {
    for (const { kind, seed, realized } of weekly) {
      const text = textOf(realized);
      expect(text, `${kind}#${seed}`).not.toMatch(/\bbecause\b|\bcaused\b|\bdue to\b/u);
      expect(text).not.toMatch(ANALYST_TERMS);
      expect(text).not.toMatch(/becoming a habit|lack of discipline|should have/u);
      expect(findNarrativeV3VoiceViolations(text)).toEqual([]);
    }
  });

  it("Confidence and strategy are recorded, never altered, by the recap", () => {
    for (const { scenario, synthesis } of weekly) {
      expect(synthesis.relations.confidence.delta).toBe(scenario.goalFacts.outlook.delta);
      expect(synthesis.relations.strategy.action).toBe(scenario.goalFacts.strategy.action);
    }
  });

  it("a real risk is never told as fitting the plan", () => {
    for (const kind of ["weight_rapid_guardrail", "weight_dexa_conflict"]) {
      for (const { seed, synthesis, realized } of byKind(kind)) {
        expect(synthesis.selected.some((item) => item.role === "risk"), `${kind}#${seed}`).toBe(true);
        expect(realized.meaning).not.toMatch(/fits the plan/u);
      }
    }
  });

  it("each Weekly realization respects its hero budget and ends every section cleanly", () => {
    for (const { kind, seed, realized } of weekly) {
      if (!realized) continue;
      expect(realized.result.length, `${kind}#${seed}`).toBeLessThanOrEqual(160);
      expect((realized.meaning.match(/[.!?](?:\s|$)/gu) ?? []).length).toBeLessThanOrEqual(2);
      for (const text of [realized.result, realized.meaning, realized.action, realized.watch, realized.coachTake]) {
        expect(text).toMatch(/[.]$/u);
        expect(text).not.toMatch(/\band\b[^.]*\band\b[^.]*\band\b/u);
      }
    }
  });
});

describe("information budgets scale with each briefing's horizon and purpose", () => {
  it("budgets are ordered Midweek < Weekly < Monthly, and the same picture yields more under a larger budget", () => {
    const { midweek, weekly: week, monthly } = BRIEFING_INTELLIGENCE_POLICIES;
    expect(midweek.narrative.maxInsights).toBeLessThan(week.narrative.maxInsights);
    expect(week.narrative.maxInsights).toBeLessThan(monthly.narrative.maxInsights);
    for (const { picture } of byKind("crowded")) {
      const count = (policy) => synthesizeBriefing({ picture, budget: resolveNarrativeBudget(policy, picture) }).selected.length;
      expect(count(midweek)).toBeLessThanOrEqual(count(week));
      expect(count(week)).toBeLessThanOrEqual(count(monthly));
    }
  });

  it("Midweek stays light", () => {
    for (const kind of HOLISTIC_KINDS) {
      for (const seed of SEEDS.slice(0, 4)) {
        const { synthesis } = run({ seed, kind, cadence: "midweek" });
        expect(synthesis.selected.length, `${kind}#${seed}`).toBeLessThanOrEqual(2);
      }
    }
  });

  it("Monthly synthesizes across weeks — one insight per domain, never four weekly recaps", () => {
    for (const kind of ["crowded", "disruption_training_stable_weight", "strong_training"]) {
      for (const seed of SEEDS.slice(0, 4)) {
        const { synthesis } = run({ seed, kind, cadence: "monthly" });
        const domains = synthesis.selected.filter((item) => item.role !== "risk").map((item) => item.domain);
        expect(new Set(domains).size, `${kind}#${seed}`).toBe(domains.length);
      }
    }
  });

  it("DEXA leads with the new outcome, read with the execution before it", () => {
    for (const seed of SEEDS.slice(0, 5)) {
      const { synthesis } = run({ seed, kind: "disruption_training_stable_weight", cadence: "dexa" });
      expect(synthesis.lead?.kind, `seed ${seed}`).toBe("composition_result");
      expect(synthesis.selected.length).toBeGreaterThan(1);
    }
  });

  it("Photo depth grows with the strength of the outcome, not a fixed length", () => {
    const withOutcome = run({ seed: 2, kind: "strong_training", cadence: "photo" });
    const policy = BRIEFING_INTELLIGENCE_POLICIES.photo;
    expect(withOutcome.budget.maxInsights).toBe(policy.narrative.maxInsights + policy.narrative.scaleWithOutcome.extraInsights);
    const noOutcome = run({ seed: 2, kind: "weight_rising_no_dexa", cadence: "photo" });
    expect(noOutcome.budget.maxInsights).toBe(policy.narrative.maxInsights);
  });

  it("sparse evidence degrades gracefully: domains are insufficient, never invented", () => {
    for (const { seed, picture, synthesis } of byKind("sparse")) {
      expect(picture.domains.filter((item) => item.status !== "assessed").length, `seed ${seed}`).toBeGreaterThanOrEqual(3);
      expect(synthesis.selected.every((item) => picture.domains.find((d) => d.domain === item.domain).status === "assessed")).toBe(true);
    }
  });
});

describe("training milestones are real bests in the period", () => {
  it("counts one milestone per lift, only inside the period, and never a comparison that went down", () => {
    const candidate = (subjectId, type, observedAt, basis) => ({ domain: "training", type, observedAt, subjectId,
      subjectLabel: subjectId, score: 100, evidenceBasis: basis });
    const interpretation = { objectiveFindings: [], guardrailFindings: [], coachingObservationSelection: { rankedCandidates: [
      candidate("press", "load_milestone", "2026-09-22", { currentValue: 90, previousValue: 85 }),
      candidate("press", "volume_milestone", "2026-09-23", { currentValue: 7680, previousValue: 7500 }),
      candidate("squat", "reps_at_load_milestone", "2026-09-21", { currentValue: 12, previousValue: 6, load: 115, metric: "reps_at_load" }),
      candidate("leg_press", "longitudinal_progression", "2026-09-21", { percentChange: -16.5 }),
      candidate("row", "load_milestone", "2026-09-12", { currentValue: 100, previousValue: 95 }),
    ] } };
    const facts = goalFactsFromInterpretationV3({ interpretation, confidence: null,
      window: { startDate: "2026-09-20", endDate: "2026-09-26" } });
    expect(facts.trainingMilestones.map((item) => item.subjectId)).toEqual(["squat", "press"]);
  });
});


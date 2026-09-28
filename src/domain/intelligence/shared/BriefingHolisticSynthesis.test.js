// Holistic synthesis properties across generated situations and every
// briefing horizon. Each assertion is a product rule, not a sentence.

import { describe, expect, it } from "vitest";
import { buildEvidencePicture } from "./BriefingEvidencePicture.js";
import { synthesizeBriefing } from "./BriefingHolisticSynthesis.js";
import { BRIEFING_INTELLIGENCE_POLICIES, resolveNarrativeBudget } from "./BriefingIntelligencePolicies.js";
import { resolveGoalEvidencePolicy } from "./GoalEvidencePolicies.js";
import { goalFactsFromInterpretationV3, realizeHolisticWeeklyV3, WEEKLY_REALIZABLE_KINDS } from "../v3/HolisticNarrativeV3.js";
import { findNarrativeV3VoiceViolations } from "../v3/NarrativeV3CompositionService.js";
import { HOLISTIC_GOAL_TYPES, HOLISTIC_KINDS, holisticScenario } from "../../../testSupport/briefingHolisticSynthetic.js";

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const ANALYST_TERMS = /\b(?:anchor\w*|directional\w*|evidence|robust|materiality|reliab\w*|anomal\w*|deviation\w*|baseline|signal\w*|z-?scores?|causal\w*)\b/iu;

function run({ seed, kind, cadence = "weekly", goalType = "build_lean_mass", budgetOverride = null }) {
  const scenario = holisticScenario({ seed, kind, cadence, goalType });
  const picture = buildEvidencePicture({ intelligence: scenario.intelligence, goalPolicy: scenario.goalPolicy,
    goalFacts: scenario.goalFacts });
  const budget = budgetOverride ?? resolveNarrativeBudget(scenario.policy, picture);
  const synthesis = synthesizeBriefing({ picture, budget,
    realizableKinds: cadence === "weekly" ? WEEKLY_REALIZABLE_KINDS : null });
  const realized = cadence === "weekly"
    ? realizeHolisticWeeklyV3({ synthesis, picture, goalLabel: "the goal", goalPolicy: scenario.goalPolicy }) : null;
  return { scenario, picture, budget, synthesis, realized };
}

// Every situation under every goal type: wording rules must hold whichever
// way the goal wants the scale to move.
const weekly = HOLISTIC_GOAL_TYPES.flatMap((goalType) => HOLISTIC_KINDS.flatMap((kind) =>
  SEEDS.map((seed) => ({ kind, seed, goalType, ...run({ seed, kind, goalType }) }))));
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

  it("weight is always assessed for a weight-relevant goal when there are enough weigh-ins", () => {
    for (const { kind, seed, picture } of weekly.filter((item) => item.kind !== "sparse")) {
      const trajectory = picture.domains.find((item) => item.domain === "body_trajectory");
      // A disrupted stretch without weigh-ins can leave the window itself too thin.
      if (trajectory.status === "insufficient" && trajectory.facts.windowWeighIns < 3) continue;
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
      // A goal with no weight expectation has fewer meaningful domains here.
      for (const { seed, synthesis } of byKind(kind).filter((item) => item.goalType !== "general")) {
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
    for (const { seed, synthesis, realized } of byKind("spectacular_pr").filter((item) => item.goalType !== "general")) {
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
      expect(textOf(realized)).not.toMatch(/intake stayed on (?:plan|target)/u);
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
      // A maintenance goal has no wrong direction; its drift is only "quick".
      for (const { seed, synthesis, realized } of byKind(kind).filter((item) => item.goalType !== "general" &&
          (item.kind === "weight_rapid_guardrail" || item.goalType !== "maintain"))) {
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
  it("budgets are ordered Midweek < Weekly < Monthly, and the same picture yields more under a larger allowance", () => {
    const { midweek, weekly: week, monthly } = BRIEFING_INTELLIGENCE_POLICIES;
    expect(midweek.narrative.maxInsights).toBeLessThan(week.narrative.maxInsights);
    expect(week.narrative.maxInsights).toBeLessThan(monthly.narrative.maxInsights);
    // Allowance alone (Monthly's persistence and Midweek's partial-window
    // semantics are tested separately).
    const allowance = ({ narrative }) => ({ maxInsights: narrative.maxInsights, maxLimitations: narrative.maxLimitations,
      floor: narrative.floor, heroInsights: narrative.heroInsights });
    for (const { picture } of byKind("crowded")) {
      const count = (policy) => synthesizeBriefing({ picture, budget: allowance(policy) }).selected.length;
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

  it("Photo depth grows with how much the photos changed, not with a DEXA or a fixed length", () => {
    const policy = BRIEFING_INTELLIGENCE_POLICIES.photo;
    expect(policy.narrative.scaleWithOutcome.domain).toBe("visual_change");
    const visible = run({ seed: 2, kind: "strong_training", cadence: "photo" });
    expect(visible.scenario.goalFacts.visual.change).toBe("visible");
    expect(visible.budget.maxInsights).toBe(policy.narrative.maxInsights + policy.narrative.scaleWithOutcome.extraInsights);
    // A fresh DEXA with only a subtle photo change does not deepen a Photo briefing.
    const subtle = run({ seed: 2, kind: "disruption_training_stable_weight", cadence: "photo" });
    expect(subtle.scenario.goalFacts.composition.measuredAt).toBe(subtle.scenario.window.endDate);
    expect(subtle.budget.maxInsights).toBe(policy.narrative.maxInsights);
    const noPhotos = run({ seed: 2, kind: "weight_rising_no_dexa", cadence: "photo" });
    expect(noPhotos.budget.maxInsights).toBe(policy.narrative.maxInsights);
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


describe("goal-relative wording follows the goal's direction and the evidence's polarity", () => {
  const weightOf = (picture) => picture.domains.find((item) => item.domain === "body_trajectory")?.insights?.[0];
  const UP = /\b(?:climbing|edging up|creeping up|climb|rise|gain)\b/u;
  const DOWN = /\b(?:dropping|easing down|drifting down|drop|loss)\b/u;

  it("never says 'plan' about the scale, the outcome, Confidence or Watch; the plan's target appears only as an action", () => {
    for (const { kind, seed, goalType, realized } of weekly) {
      if (!realized) continue;
      for (const text of [realized.result, realized.meaning, realized.watch, realized.confidenceBody ?? ""]) {
        expect(text, `${goalType}/${kind}#${seed}`).not.toMatch(/\bplan(?:ned)?\b/u);
      }
      expect(realized.meaning).not.toMatch(/\bexpected\b|\bfits\b/u);
    }
  });

  it("every direction word matches the scale's actual movement, in every section", () => {
    for (const { kind, seed, goalType, picture, synthesis, realized } of weekly) {
      const weight = weightOf(picture);
      if (!realized || !weight || !synthesis.selected.some((item) => item.kind === "weight_trend")) continue;
      const label = `${goalType}/${kind}#${seed}`;
      const clause = /your weight [^,.]*/iu.exec(`${realized.result} ${realized.coachTake}`)?.[0] ?? "";
      if (weight.facts.movement === "up") expect(clause, label).not.toMatch(DOWN);
      if (weight.facts.movement === "down") expect(clause, label).not.toMatch(UP);
      if (weight.facts.movement === "flat") expect(clause, label).toMatch(/held steady|a little quickly|fast/u);
      if (/how much of this gain/u.test(realized.meaning)) expect(weight.facts.movement, label).toBe("up");
      if (/how much of this loss/u.test(realized.meaning)) expect(weight.facts.movement, label).toBe("down");
      if (/steadier climb/u.test(realized.watch)) expect(weight.facts.movement, label).toBe("up");
      if (/steadier drop/u.test(realized.watch)) expect(weight.facts.movement, label).toBe("down");
      if (/(?:drop|rise|climb) in weight/u.test(realized.confidenceBody ?? "")) {
        expect(/drop in weight/u.test(realized.confidenceBody) ? "down" : "up", label).toBe(weight.facts.movement);
      }
    }
  });

  it("a wrong-way or too-fast trend is never read as ordinary progress, and never endorsed", () => {
    for (const { kind, seed, goalType, synthesis, realized } of weekly) {
      const risk = synthesis.selected.find((item) => item.role === "risk");
      if (!risk || !realized) continue;
      const label = `${goalType}/${kind}#${seed}`;
      expect(realized.meaning, label).not.toMatch(/can't say how much of this (?:gain|loss)|nothing this week points away/u);
      expect(realized.coachTake, label).not.toMatch(/Keep doing what has been working/u);
      if (risk.kind === "weight_trend") expectWeightStep(realized.action, risk, synthesis, label);
      expect(realized.action).toMatch(/The rest of the setup stays as it is\.$/u);
    }
  });

  it("a too-fast trend puts the guardrail in question; a wrong-way trend puts the outcome in question", () => {
    for (const { kind, seed, goalType, scenario, synthesis, realized } of weekly) {
      const risk = synthesis.selected.find((item) => item.kind === "weight_trend" && item.role === "risk");
      if (!risk || !realized || !scenario.goalFacts.composition) continue;
      const label = `${goalType}/${kind}#${seed}`;
      // A maintenance goal has no "right way": its outcome is what must hold.
      // For maintenance, a fast climb strains the guardrail and a fast drop the outcome.
      if (goalType === "maintain") {
        const measure = risk.facts.movement === "up" ? scenario.goalFacts.guardrail.label : scenario.goalFacts.composition.label;
        expect(realized.meaning, label).toContain(`whether ${measure} is holding`);
      }
      else if (risk.facts.verdict === "rapid") expect(realized.meaning, label).toContain(`whether ${scenario.goalFacts.guardrail.label} is holding`);
      if (risk.facts.verdict === "wrong_direction") {
        expect(realized.meaning, label).toContain(`whether ${scenario.goalFacts.composition.label} is still moving the right way`);
      }
    }
  });

  it("the wrong-direction case is covered for every directional goal", () => {
    for (const goalType of ["build_lean_mass", "gain_weight", "lose_fat"]) {
      const cases = weekly.filter((item) => item.goalType === goalType && item.kind === "weight_dexa_conflict");
      expect(cases.some((item) => item.synthesis.selected.some((insight) => insight.facts?.verdict === "wrong_direction")),
        goalType).toBe(true);
    }
  });

  it("a recent result that went the wrong way is a risk the week is read against, never background", () => {
    for (const { kind, seed, goalType, picture, synthesis, realized } of weekly.filter((item) => item.kind === "composition_regressed")) {
      const label = `${goalType}/${kind}#${seed}`;
      const composition = picture.domains.find((item) => item.domain === "body_composition").insights[0];
      expect(composition.role, label).toBe("risk");
      expect(synthesis.selected.some((item) => item.id === composition.id), label).toBe(true);
      expect(realized.meaning).toMatch(/has turned back/u);
      expect(realized.meaning).not.toMatch(/nothing this week points away/u);
    }
  });

  it("the scale's pace always names the span it was measured over", () => {
    for (const { kind, seed, goalType, picture, realized } of weekly) {
      const weight = weightOf(picture);
      if (!realized || !weight) continue;
      expect(weight.facts.rateSpanDays).toBeLessThanOrEqual(28);
      const weeks = Math.round(weight.facts.rateSpanDays / 7);
      const words = ["", "", "two", "three", "four"];
      for (const match of `${realized.result} ${realized.coachTake}`.matchAll(/lb a week[^,.;]*/gu)) {
        expect(match[0], `${goalType}/${kind}#${seed}`).toBe(weeks <= 1 ? "lb a week over the last week" : `lb a week over the last ${words[weeks]} weeks`);
      }
    }
  });

  it("goals resolve from the canonical evaluation (mode, desiredDirection, targets), never a display name", () => {
    // Shaped exactly as GoalContractV3 normalizes objectives.
    const contract = (id, evaluation) => ({ objectives: [{ priority: "primary", metricCapability: { id },
      evaluation: { baselineValue: null, targetValue: null, targetRange: null, desiredDirection: null, ...evaluation } }] });
    const type = (id, evaluation) => resolveGoalEvidencePolicy(contract(id, evaluation)).goalType;
    expect(type("body_composition.lean_mass", { mode: "increase" })).toBe("build_lean_mass");
    expect(type("body_composition.lean_mass", { mode: "target_value", baselineValue: 148, targetValue: 158 })).toBe("build_lean_mass");
    expect(type("body_composition.lean_mass", { mode: "maintain_range", targetRange: { min: 150, max: 154 } })).toBe("maintain");
    expect(type("body.weight", { mode: "increase" })).toBe("gain_weight");
    expect(resolveGoalEvidencePolicy(contract("body.weight", { mode: "minimum" })).weightExpectation.direction).toBe("up");
    expect(type("body.weight", { mode: "decrease" })).toBe("lose_fat");
    expect(type("body.weight", { mode: "target_value", baselineValue: 170, targetValue: 180 })).toBe("gain_weight");
    expect(type("body.weight", { mode: "target_value", baselineValue: 190, targetValue: 180 })).toBe("lose_fat");
    expect(type("body.weight", { mode: "custom_declarative", desiredDirection: "increase" })).toBe("gain_weight");
    // A target range above where the goal started is a gain, not maintenance.
    expect(type("body.weight", { mode: "target_range", baselineValue: 170, targetRange: { min: 178, max: 182 } })).toBe("gain_weight");
    expect(type("body.weight", { mode: "target_range", baselineValue: 180, targetRange: { min: 178, max: 182 } })).toBe("maintain");
    expect(type("body.weight", { mode: "maintain_range", targetRange: { min: 178, max: 182 } })).toBe("maintain");
    expect(type("body_composition.body_fat_percentage", { mode: "decrease" })).toBe("lose_fat");
    expect(type("body_composition.body_fat_percentage", { mode: "maintain_range", targetRange: { min: 9, max: 11 } })).toBe("maintain");
    expect(type("performance.vo2max", { mode: "increase" })).toBe("general");
    expect(resolveGoalEvidencePolicy({ objectives: [] }).goalType).toBe("general");
  });
});

describe("routine and training rhythm are told as they happened", () => {
  it("routine breaks are reliably present in disrupted situations, so these properties are exercised", () => {
    for (const kind of ["disruption_training_stable_weight", "crowded"]) {
      const cases = weekly.filter((item) => item.kind === kind);
      const withBreak = cases.filter((item) => item.synthesis.selected.some((insight) => insight.kind === "routine_break"));
      expect(withBreak.length / cases.length, kind).toBeGreaterThanOrEqual(0.9);
    }
  });

  it("the quiet-day count, its position and the Watch weekdays come from the break itself", () => {
    const position = { late: "late in the week", early: "early in the week", middle: "midweek", whole: "for most of the week" };
    const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    for (const { kind, seed, goalType, synthesis, realized } of weekly) {
      const routine = synthesis.selected.find((item) => item.kind === "routine_break");
      if (!routine || !realized) continue;
      const label = `${goalType}/${kind}#${seed}`;
      const f = routine.facts;
      if (realized.result.includes("routine")) expect(realized.result, label).toContain(position[f.position]);
      const quiet = /(\w+) quiet days? (?:don't|doesn't)/u.exec(realized.meaning);
      if (quiet) {
        expect(f.direction, label).toBe("break");
        const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
        expect(words.indexOf(quiet[1].toLowerCase()), label).toBe(f.extentDays);
      }
      if (f.direction !== "break") {
        expect(`${realized.meaning} ${realized.coachTake} ${realized.confidenceBody ?? ""}`, label).not.toMatch(/\bquiet\b/u);
      }
      expect(realized.watch).not.toMatch(/next weekend/u);
      const training = f.missed?.find((gap) => gap.domain === "training")?.dates ?? [];
      for (const day of WEEKDAYS.filter((name) => realized.watch.includes(name))) {
        expect(training.map((date) => WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()]), label).toContain(day);
      }
      expect(realized.coachTake).not.toMatch(/looks a lot like/u);
    }
  });

  it("a fully missed training week is said and acted on, never dropped as 'insufficient'", () => {
    for (const { seed, goalType, picture, synthesis, realized } of weekly.filter((item) => item.kind === "missed_week")) {
      const label = `${goalType}#${seed}`;
      const training = picture.domains.find((item) => item.domain === "training");
      expect(training.status, label).toBe("assessed");
      expect(training.state).toBe("missed");
      const told = synthesis.selected.find((item) => item.kind === "training_frequency") ??
        synthesis.selected.find((item) => item.kind === "routine_break");
      expect(told, label).toBeTruthy();
      expect(realized.action).toMatch(/training rhythm/u);
    }
  });
});

describe("reliability restraint and extensibility", () => {
  it("one unreliable day already restrains the intake verdict, and is said only when that verdict mattered", () => {
    for (const { seed, goalType, picture, synthesis, realized } of weekly.filter((item) => item.kind === "single_unreliable_day")) {
      const label = `${goalType}#${seed}`;
      const nutrition = picture.domains.find((item) => item.domain === "nutrition");
      if (!nutrition.facts.unreliableDates?.length) continue;
      expect(synthesis.omitted.find((item) => item.id === "nutrition|intake_vs_plan")?.reason, label)
        .toBe("restrained:unreliable_days_in_average");
      // The restrained verdict was on plan — nothing that would have been said.
      expect(synthesis.limitations.length, label).toBe(0);
      expect(realized.coachTake).not.toMatch(/patchy|copied/u);
    }
  });

  it("an insight the briefing cannot phrase (a future Sleep finding) never takes a slot", () => {
    for (const { seed, goalType, picture } of weekly.filter((item) => item.kind === "stable_all")) {
      const withSleep = { ...picture, domains: picture.domains.map((domain) => domain.domain !== "recovery" ? domain : {
        ...domain, status: "assessed", state: "short_sleep", insights: [{ id: "recovery|sleep_shortfall", domain: "recovery",
          kind: "sleep_shortfall", role: "execution", polarity: "concern", strength: 3.5, facts: {} }] }) };
      const budget = resolveNarrativeBudget(BRIEFING_INTELLIGENCE_POLICIES.weekly, withSleep);
      const unaware = synthesizeBriefing({ picture: withSleep, budget });
      expect(unaware.selected.some((item) => item.kind === "sleep_shortfall"), `${goalType}#${seed}`).toBe(true);
      const synthesis = synthesizeBriefing({ picture: withSleep, budget, realizableKinds: WEEKLY_REALIZABLE_KINDS });
      expect(synthesis.selected.some((item) => item.kind === "sleep_shortfall")).toBe(false);
      expect(synthesis.omitted.find((item) => item.id === "recovery|sleep_shortfall")?.reason).toBe("no_realization_for_kind");
    }
  });

  it("every selected Weekly insight has its own phrase", () => {
    for (const { kind, seed, goalType, synthesis } of weekly) {
      for (const item of synthesis.selected) expect(WEEKLY_REALIZABLE_KINDS.has(item.kind), `${goalType}/${kind}#${seed}`).toBe(true);
    }
  });
});

describe("briefing budgets are semantic, not word counts", () => {
  it("Midweek cannot conclude a complete-week finding and speaks of what is emerging so far", () => {
    for (const seed of SEEDS) {
      const { synthesis } = run({ seed, kind: "missed_week", cadence: "midweek" });
      expect(synthesis.partialWindow).toBe(true);
      expect(synthesis.selected.some((item) => item.kind === "training_frequency" && item.requiresCompleteWindow), `seed ${seed}`).toBe(false);
      if (synthesis.omitted.some((item) => item.kind === "training_frequency")) {
        expect(synthesis.omitted.find((item) => item.kind === "training_frequency").reason).toBe("partial_window_cannot_conclude");
      }
      for (const item of synthesis.selected) expect(item.tense).toBe("so_far");
    }
  });

  it("Monthly labels persistence and favors what held across the month over a one-off stretch", () => {
    for (const seed of SEEDS) {
      const { synthesis } = run({ seed, kind: "disruption_training_stable_weight", cadence: "monthly" });
      for (const item of synthesis.selected) expect(["persistent", "sustained", "one_off"]).toContain(item.temporal);
      // The late three-to-four-day disruption is a one-off inside a month and
      // is worth less there than the same stretch would be without the
      // persistence rule.
      const { narrative } = BRIEFING_INTELLIGENCE_POLICIES.monthly;
      const plain = run({ seed, kind: "disruption_training_stable_weight", cadence: "monthly",
        budgetOverride: { ...narrative, persistence: false } }).synthesis;
      const find = (result) => [...result.selected, ...result.omitted].find((item) => item.kind === "routine_break");
      const routine = find(synthesis);
      expect(routine, `seed ${seed}`).toBeTruthy();
      expect(synthesis.selected.find((item) => item.kind === "routine_break")?.temporal ?? "one_off").toBe("one_off");
      expect(routine.value).toBeLessThan(find(plain).value);
      // Trends by nature (training bests, the scale's multi-week pace) are sustained.
      for (const item of synthesis.selected.filter((entry) => ["training_progress", "weight_trend"].includes(entry.kind))) {
        expect(item.temporal).toBe("sustained");
      }
    }
  });

  it("DEXA leads with its outcome even beside a strong risk elsewhere", () => {
    for (const seed of SEEDS) {
      const { synthesis } = run({ seed, kind: "weight_rapid_guardrail", cadence: "dexa" });
      expect(synthesis.lead?.domain, `seed ${seed}`).toBe("body_composition");
      expect(synthesis.selected[0].reason).toBe("briefing_lead_domain");
    }
  });
});

// A weight risk's step follows the scale (a climb is held at target, a drop
// is fed to target), unless the logged intake points the other way — then the
// log itself is what gets checked.
function expectWeightStep(action, risk, synthesis, label) {
  const intake = synthesis.selected.find((item) => item.kind === "intake_vs_plan" && item.polarity !== "supportive");
  const onTarget = synthesis.selected.some((item) => item.kind === "intake_vs_plan" && item.polarity === "supportive");
  const push = intake ? (/under|below/u.test(intake.facts.state) ? "up" : "down") : null;
  if ((push && push === risk.facts.movement) || (onTarget && risk.facts.movement === "down")) {
    expect(action, label).toMatch(/^Make sure every meal gets logged/u);
    return;
  }
  expect(action, label).toMatch(risk.facts.movement === "up" ? /^Keep intake at or below the plan's target/u
    : /^Make sure intake reaches the plan's target/u);
}

describe("sections agree with each other", () => {
  const sections = (realized) => [realized.result, realized.meaning, realized.coachTake, realized.action, realized.watch];

  it("a routine break is introduced before anything refers back to it", () => {
    for (const { kind, seed, goalType, realized } of weekly) {
      if (!realized) continue;
      const text = sections(realized).join(" ");
      const back = text.search(/similar (?:quiet|off-routine) stretch|a few (?:quiet|off-routine) days/u);
      if (back < 0) continue;
      const intro = text.search(/routine slipped|ran off its usual routine|quiet days? (?:don't|doesn't)/u);
      expect(intro, `${goalType}/${kind}#${seed}`).toBeGreaterThanOrEqual(0);
      expect(intro).toBeLessThan(back);
    }
  });

  it("a week with a risk, progress and a routine break tells all three and acts on the risk", () => {
    const cases = weekly.filter((item) => item.kind === "risk_routine_progress" && item.goalType !== "general");
    expect(cases.some((item) => ["training_progress", "routine_break"].every((kind) =>
      item.synthesis.selected.some((insight) => insight.kind === kind)) &&
      item.synthesis.selected.some((insight) => insight.role === "risk"))).toBe(true);
    for (const { seed, goalType, synthesis, realized } of cases) {
      const risk = synthesis.selected.find((item) => item.kind === "weight_trend" && item.role === "risk");
      if (!risk) continue;
      expectWeightStep(realized.action, risk, synthesis, `${goalType}#${seed}`);
      if (synthesis.selected.some((item) => item.kind === "routine_break" && item.facts.missed?.some((gap) => gap.domain === "training"))) {
        expect(realized.action).toMatch(/training rhythm back/u);
      }
    }
  });

  it("What To Do points at what Into Next Week acts on, and never endorses anything short of supportive", () => {
    // Each focus line and the step it must sit beside.
    const FOCUS = [
      [/scale's pace is the one thing to steer/u, /intake (?:at or below|reaches) the plan's target/u],
      [/food log is the first thing to check/u, /every meal gets logged/u],
      [/usual sessions back in/u, /training rhythm back/u],
      [/result is what matters most|is the number to protect/u, /Keep intake at the plan's target and training/u],
      [/Intake is the lever/u, /[Bb]ring intake/u],
    ];
    let focused = 0;
    for (const { kind, seed, goalType, synthesis, realized } of weekly) {
      if (!realized) continue;
      const label = `${goalType}/${kind}#${seed}`;
      for (const [focus, step] of FOCUS) {
        if (focus.test(realized.coachTake)) { focused += 1; expect(realized.action, label).toMatch(step); }
      }
      if (/steady week|more of the same/u.test(realized.coachTake)) {
        expect(synthesis.selected.every((item) => item.polarity === "supportive"), label).toBe(true);
        expect(realized.action).toBe("Keep the current setup in place.");
      }
      if (/Nothing here needs a change yet/u.test(realized.coachTake)) expect(realized.action).toBe("Keep the current setup in place.");
      expect(realized.coachTake).not.toMatch(/Nothing else needs changing|Keep doing what has been working/u);
    }
    expect(focused).toBeGreaterThan(20);
  });

  it("an outcome or guardrail risk gets its own step, Watch and a Confidence line that does not contradict itself", () => {
    for (const { kind, seed, goalType, synthesis, realized, scenario } of weekly) {
      const risk = synthesis.selected.find((item) => item.role === "risk" && ["composition_result", "guardrail_status"].includes(item.kind));
      if (!risk || !realized || synthesis.selected.some((item) => item.kind === "weight_trend" && item.role === "risk")) continue;
      const label = `${goalType}/${kind}#${seed}`;
      expect(realized.action, label).toMatch(/^Keep intake at the plan's target and training on its usual rhythm this week\. The rest of the setup stays as it is\.$/u);
      expect(realized.watch).toContain(`next ${scenario.goalFacts.composition.eventName}`);
      if (realized.confidenceBody) {
        expect(realized.confidenceBody).toMatch(/^Confidence holds at the level/u);
        expect(realized.confidenceBody).not.toMatch(/worth watching/u);
      }
      if (risk.kind === "guardrail_status") expect(realized.meaning).not.toMatch(/\bmatters\b/u);
    }
    const breached = weekly.filter((item) => item.kind === "guardrail_breached" && item.realized);
    expect(breached.some((item) => /past its limit/u.test(item.realized.result))).toBe(true);
    for (const { realized } of breached) expect(realized.result).not.toMatch(/closer to its limit/u);
  });

  it("the action never pushes the scale further the way it is already going too fast, nor contradicts the intake reading", () => {
    let mismatches = 0;
    for (const { kind, seed, goalType, synthesis, realized } of weekly) {
      if (!realized) continue;
      const label = `${goalType}/${kind}#${seed}`;
      const weight = synthesis.selected.find((item) => item.kind === "weight_trend" &&
        ["rapid", "quick", "wrong_direction"].includes(item.facts.verdict));
      const intake = synthesis.selected.find((item) => item.kind === "intake_vs_plan" && item.polarity !== "supportive");
      // Eating less while the scale already falls fast, or more while it climbs fast.
      if (weight?.facts.movement === "down") expect(realized.action, label).not.toMatch(/bring intake back down|at or below/u);
      if (weight?.facts.movement === "up") expect(realized.action, label).not.toMatch(/bring intake up|reaches the plan's target/u);
      // Intake said to run one way is never followed by a step implying the other.
      if (/intake ran above target/u.test(textOf(realized))) expect(realized.action, label).not.toMatch(/reaches the plan's target|bring intake up/u);
      if (/intake ran below target/u.test(textOf(realized))) expect(realized.action, label).not.toMatch(/at or below|bring intake back down/u);
      if (intake && weight?.role === "risk" && /every meal gets logged/u.test(realized.action)) mismatches += 1;
    }
    // The intake-against-scale situations actually reach the mismatch path.
    expect(mismatches).toBeGreaterThan(0);
  });

  it("a maintenance goal asks the scale to level off, never to 'steady' a climb or drop it wants", () => {
    for (const { kind, seed, synthesis, realized } of weekly.filter((item) => item.goalType === "maintain")) {
      if (!realized) continue;
      expect(realized.watch, `${kind}#${seed}`).not.toMatch(/steadier (?:climb|drop)|turns back/u);
      if (synthesis.selected.some((item) => item.kind === "weight_trend" && ["quick", "rapid"].includes(item.facts.verdict))) {
        expect(realized.watch).toMatch(/levels off/u);
      }
    }
    expect(weekly.some((item) => item.goalType === "maintain" && /levels off/u.test(item.realized?.watch ?? ""))).toBe(true);
  });

  it("a goal with no weight expectation never makes the scale its story or its Watch", () => {
    for (const { kind, seed, synthesis, realized } of weekly.filter((item) => item.goalType === "general")) {
      expect(synthesis.selected.some((item) => item.kind === "weight_trend"), `${kind}#${seed}`).toBe(false);
      if (realized) expect(realized.watch).not.toMatch(/weight average/u);
    }
  });
});

describe("the food log is checked whenever logged intake and the scale disagree", () => {
  // Hand-built pictures, so the mismatch paths are exercised directly.
  const picture = (weightFacts, intakeState) => ({
    schemaVersion: "test", goalType: "build_lean_mass", window: { startDate: "2026-09-20", endDate: "2026-09-26" },
    outlook: { percentage: 70, delta: 0 }, strategy: { action: "continue_current_strategy" },
    domains: [
      { domain: "body_trajectory", weight: 0.9, status: "assessed", state: weightFacts.verdict, polarity: "neutral", facts: weightFacts,
        insights: [{ id: "body_trajectory|weight_trend", domain: "body_trajectory", kind: "weight_trend",
          role: ["rapid", "wrong_direction"].includes(weightFacts.verdict) ? "risk" : "progress",
          polarity: weightFacts.verdict === "quick" ? "neutral" : "concern", strength: 2.4, facts: weightFacts }] },
      { domain: "nutrition", weight: 1.0, status: "assessed", state: intakeState, polarity: "neutral", facts: {},
        insights: [{ id: "nutrition|intake_vs_plan", domain: "nutrition", kind: "intake_vs_plan", role: "execution",
          polarity: intakeState === "on_plan" ? "supportive" : "concern", strength: 1.8,
          facts: { state: intakeState, observed: 2500, target: 2500 } }] },
    ],
  });
  const realize = (weightFacts, intakeState, direction = "up") => {
    const p = picture({ weeklyRate: weightFacts.movement === "down" ? -0.8 : 0.8, rateSpanDays: 28, ...weightFacts }, intakeState);
    const synthesis = synthesizeBriefing({ picture: p, budget: { maxInsights: 3, maxLimitations: 1, floor: 0.5, heroInsights: 2 },
      realizableKinds: WEEKLY_REALIZABLE_KINDS });
    return realizeHolisticWeeklyV3({ synthesis, picture: p, goalLabel: "the goal",
      goalPolicy: { weightExpectation: { direction } } });
  };

  it("intake on target while the scale falls the wrong way", () => {
    const realized = realize({ verdict: "wrong_direction", movement: "down", expectedDirection: "up" }, "on_plan");
    expect(realized.action).toMatch(/^Make sure every meal gets logged/u);
    expect(realized.coachTake).toMatch(/food log is the first thing to check/u);
  });

  it("intake above target while the scale drops a little quickly on a maintenance goal (no risk)", () => {
    const realized = realize({ verdict: "quick", movement: "down", expectedDirection: "stable" }, "above_plan", "stable");
    expect(realized.action).toMatch(/^Make sure every meal gets logged/u);
    expect(realized.action).not.toMatch(/bring intake/iu);
  });

  it("a wrong-way trend is focused on direction, not pace", () => {
    const realized = realize({ verdict: "wrong_direction", movement: "down", expectedDirection: "up" }, "below_plan");
    expect(realized.action).toMatch(/^Make sure intake reaches the plan's target/u);
    expect(realized.coachTake).toMatch(/Turning the scale back the right way/u);
    expect(realized.coachTake).not.toMatch(/pace/u);
  });
});

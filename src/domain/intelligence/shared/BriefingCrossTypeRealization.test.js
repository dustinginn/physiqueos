// One shared engine, every briefing type. The same generated situations are
// realized as Midweek, Weekly, Monthly, DEXA and Photo; each type's semantic
// contract and the cross-type invariants must hold. Properties only — never a
// particular briefing's sentences.

import { describe, expect, it } from "vitest";
import { buildEvidencePicture } from "./BriefingEvidencePicture.js";
import { synthesizeBriefing } from "./BriefingHolisticSynthesis.js";
import { createBriefingIntelligence } from "./BriefingIntelligence.js";
import { BRIEFING_INTELLIGENCE_POLICIES, resolveNarrativeBudget } from "./BriefingIntelligencePolicies.js";
import { SECTION_CONTRACTS, resolveSectionContract } from "./BriefingSectionContracts.js";
import { EFFECTIVENESS_LANGUAGE, RETROACTIVE_REPAIR_LANGUAGE } from "./BriefingClaimRestraint.js";
import { BRIEFING_REALIZABLE_KINDS, realizeHolisticBriefingV3 } from "../v3/HolisticNarrativeV3.js";
import { HOLISTIC_GOAL_TYPES, HOLISTIC_KINDS, holisticScenario } from "../../../testSupport/briefingHolisticSynthetic.js";

const CADENCES = ["midweek", "weekly", "monthly", "dexa", "photo"];
const SEEDS = [1, 2, 3, 4, 5];
const GOALS = HOLISTIC_GOAL_TYPES.filter((goal) => goal !== "general");

function realize({ seed, kind, goalType, cadence, visual = undefined }) {
  const scenario = holisticScenario({ seed, kind, goalType, cadence });
  const goalFacts = visual === undefined ? scenario.goalFacts : { ...scenario.goalFacts, visual };
  const picture = buildEvidencePicture({ intelligence: scenario.intelligence, goalPolicy: scenario.goalPolicy, goalFacts });
  const synthesis = synthesizeBriefing({ picture, budget: resolveNarrativeBudget(scenario.policy, picture),
    realizableKinds: BRIEFING_REALIZABLE_KINDS });
  const realized = realizeHolisticBriefingV3({ cadence, synthesis, picture, goalLabel: "the goal", goalPolicy: scenario.goalPolicy,
    goalProgress: "You are more than halfway to the goal." });
  return { scenario, picture, synthesis, realized, label: `${cadence}/${goalType}/${kind}#${seed}` };
}

const corpus = CADENCES.flatMap((cadence) => GOALS.flatMap((goalType) => HOLISTIC_KINDS.flatMap((kind) =>
  SEEDS.map((seed) => ({ cadence, goalType, kind, seed, ...realize({ seed, kind, goalType, cadence }) })))))
  .filter((item) => item.realized);
const of = (cadence) => corpus.filter((item) => item.cadence === cadence);
const texts = (realized) => [realized.headline, realized.meaning, realized.confidenceBody, realized.result,
  realized.coachTake, realized.action, realized.watch].filter(Boolean);
const words = (realized) => realized.sectionAudit.text.totalWords;
const average = (list) => list.reduce((sum, value) => sum + value, 0) / Math.max(1, list.length);

describe("every briefing type realizes from the same shared engine", () => {
  it("each type realizes in the generated corpus and passes its own section audits", () => {
    for (const cadence of CADENCES) expect(of(cadence).length, cadence).toBeGreaterThan(50);
    for (const { label, realized } of corpus) {
      expect(realized.sectionAudit.plan.issues, label).toEqual([]);
      expect(realized.sectionAudit.text.issues, label).toEqual([]);
    }
  });

  it("the same canonical days are read the same way whatever the briefing's horizon", () => {
    for (const seed of SEEDS) {
      const scenario = holisticScenario({ seed, kind: "weight_rising_no_dexa", goalType: "build_lean_mass", cadence: "monthly" });
      const assess = (cadence) => {
        const policy = BRIEFING_INTELLIGENCE_POLICIES[cadence];
        const end = scenario.window.endDate;
        const start = new Date(`${end}T12:00:00Z`);
        start.setUTCDate(start.getUTCDate() - ({ midweek: 2, weekly: 6, monthly: 27 }[cadence]));
        const intelligence = createBriefingIntelligence({ window: { startDate: start.toISOString().slice(0, 10), endDate: end },
          days: scenario.period.days, policy });
        return buildEvidencePicture({ intelligence, goalPolicy: scenario.goalPolicy, goalFacts: scenario.goalFacts })
          .domains.find((item) => item.domain === "body_trajectory");
      };
      const [midweek, weekly, monthly] = ["midweek", "weekly", "monthly"].map(assess);
      // The scale's pace is a fixed recent span ending with the briefing, so every horizon agrees on it.
      expect(weekly.facts.weeklyRate, `seed ${seed}`).toBe(monthly.facts.weeklyRate);
      expect(weekly.state).toBe(monthly.state);
      expect(midweek.facts.weeklyRate).toBe(weekly.facts.weeklyRate);
    }
  });

  it("narrative density scales with the horizon: Midweek lightest, Monthly deepest of the recurring types", () => {
    const midweek = average(of("midweek").map((item) => words(item.realized)));
    const weekly = average(of("weekly").map((item) => words(item.realized)));
    const monthlyInsights = average(of("monthly").map((item) => item.synthesis.selected.length));
    const weeklyInsights = average(of("weekly").map((item) => item.synthesis.selected.length));
    expect(midweek).toBeLessThan(weekly);
    expect(monthlyInsights).toBeGreaterThanOrEqual(weeklyInsights);
    for (const { label, cadence, realized, synthesis } of corpus) {
      expect(words(realized), label).toBeLessThanOrEqual(resolveSectionContract(cadence, synthesis).maxWords);
    }
  });

  it("claim restraint holds on every type: no effectiveness from measurement or performance, no repairing the past", () => {
    for (const { label, realized } of corpus) {
      for (const text of texts(realized)) {
        expect(text, label).not.toMatch(EFFECTIVENESS_LANGUAGE);
        expect(text, label).not.toMatch(RETROACTIVE_REPAIR_LANGUAGE);
      }
    }
  });

  it("exercise performance never explains Goal Confidence, and weight is never composition, on any type", () => {
    for (const { label, realized } of corpus) {
      if (realized.confidenceBody) expect(realized.confidenceBody, label).not.toMatch(/\btraining\b|\blifts?\b|\bbests?\b/iu);
      expect(realized.meaning, label).not.toMatch(/your weight[^.;,]*\b(?:lean|muscle|fat)\b/iu);
    }
  });

  it("never falls back to a generic no-change line when there is period evidence to say", () => {
    for (const { label, realized } of corpus) {
      expect(`${realized.headline} ${realized.result}`, label).not.toMatch(/Nothing here calls for a change|not enough reliable evidence/u);
    }
  });

  it("a future Sleep finding stays out of every type until it has a phrase", () => {
    for (const cadence of CADENCES) {
      const { picture } = realize({ seed: 1, kind: "stable_all", goalType: "build_lean_mass", cadence });
      expect(picture.domains.some((item) => item.domain === "recovery")).toBe(true);
      const withSleep = { ...picture, domains: picture.domains.map((domain) => domain.domain !== "recovery" ? domain : {
        ...domain, status: "assessed", insights: [{ id: "recovery|sleep_shortfall", domain: "recovery", kind: "sleep_shortfall",
          role: "execution", polarity: "concern", strength: 3.5, facts: {} }] }) };
      const synthesis = synthesizeBriefing({ picture: withSleep,
        budget: resolveNarrativeBudget(BRIEFING_INTELLIGENCE_POLICIES[cadence], withSleep), realizableKinds: BRIEFING_REALIZABLE_KINDS });
      expect(synthesis.omitted.find((item) => item.id === "recovery|sleep_shortfall")?.reason, cadence).toBe("no_realization_for_kind");
    }
  });

  it("is deterministic on every type", () => {
    for (const cadence of CADENCES) {
      const once = realize({ seed: 3, kind: "crowded", goalType: "build_lean_mass", cadence });
      const twice = realize({ seed: 3, kind: "crowded", goalType: "build_lean_mass", cadence });
      expect(JSON.stringify(once.realized)).toBe(JSON.stringify(twice.realized));
    }
  });
});

describe("Midweek: light, partial and provisional", () => {
  it("speaks of the week so far, never as a finished week", () => {
    for (const { label, synthesis, realized } of of("midweek")) {
      // "So far this week" places only in-window facts; a multi-week trend or
      // a standing measurement carries its own time.
      const first = synthesis.selected.find((item) => item.id === realized.heroIds[0]);
      if (first && !["weight_trend", "guardrail_status", "composition_result"].includes(first.kind)) {
        expect(realized.meaning, label).toMatch(/^(?:So far this week, |The week so far )/u);
      }
      expect(realized.meaning, label).not.toMatch(/So far this week, (?:your weight|body fat|lean mass|the [A-Z][a-z]+ \d)/u);
      expect(realized.result, label).toMatch(/^Early read: /u);
      expect(texts(realized).join(" "), label).not.toMatch(/This week held|a quiet finish|to the week\b|Strong training week|next week runs/u);
      expect(realized.headline.split(/\s+/u).length).toBeLessThanOrEqual(SECTION_CONTRACTS.midweek.headline.maxWords);
      expect((realized.coachTake.match(/[.!?](?:\s|$)/gu) ?? []).length).toBeLessThanOrEqual(1);
    }
  });

  it("never concludes a complete-week finding", () => {
    for (const { label, synthesis } of of("midweek")) {
      expect(synthesis.selected.some((item) => item.requiresCompleteWindow), label).toBe(false);
    }
  });
});

describe("Monthly: multi-week synthesis, not four Weeklies", () => {
  it("speaks of the month and names calendar dates, never a weekday or 'this week'", () => {
    for (const { label, realized } of of("monthly")) {
      expect(texts(realized).join(" "), label).not.toMatch(/\bthis week\b|\bnext week\b|\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/u);
    }
  });

  it("labels persistence and reads a one-off stretch as a one-off", () => {
    let oneOffs = 0;
    for (const { label, synthesis, realized } of of("monthly")) {
      const routine = synthesis.selected.find((item) => item.kind === "routine_break" && realized.heroIds.includes(item.id));
      if (routine?.temporal === "one_off") {
        oneOffs += 1;
        expect(realized.result, label).toMatch(/isn't a pattern/u);
      }
      for (const item of synthesis.selected) expect(["persistent", "sustained", "one_off"]).toContain(item.temporal);
    }
    expect(oneOffs).toBeGreaterThan(0);
  });

  it("a domain may speak twice across a month only in two different capacities, with every domain considered", () => {
    for (const { label, synthesis, picture } of of("monthly")) {
      const seen = new Set();
      for (const item of synthesis.selected.filter((entry) => entry.role !== "risk")) {
        const key = `${item.domain}|${item.role}`;
        expect(seen.has(key), label).toBe(false);
        seen.add(key);
      }
      expect(synthesis.considered.length).toBe(picture.domains.length);
    }
    // Weekly keeps one per domain.
    for (const { label, synthesis } of of("weekly")) {
      const domains = synthesis.selected.filter((item) => item.role !== "risk").map((item) => item.domain);
      expect(new Set(domains).size, label).toBe(domains.length);
    }
  });
});

describe("DEXA: outcome-led, lead-up as context", () => {
  it("the new measurement leads the headline and the recap", () => {
    let checked = 0;
    for (const { label, synthesis, realized } of of("dexa")) {
      const outcome = synthesis.selected.find((item) => item.domain === "body_composition" && item.facts.newThisPeriod);
      if (!outcome) continue;
      checked += 1;
      expect(realized.heroIds[0], label).toBe(outcome.id);
      expect(realized.headlineIds, label).toContain(outcome.id);
      expect(realized.recap, label).toMatch(/^The new DEXA showed/u);
    }
    expect(checked).toBeGreaterThan(50);
  });

  it("preceding execution is context: never a step to redo, never a watch on past dates", () => {
    for (const { label, realized } of of("dexa")) {
      expect(realized.action, label).not.toMatch(/training rhythm back|settle back|bring intake/u);
      expect(realized.watch, label).not.toMatch(/get(?:s)? (?:its|their) usual training back|returns on/u);
    }
  });
});

describe("Photo: visual-led, depth proportional to visual change, no invented facts", () => {
  const visualCases = (change) => GOALS.flatMap((goalType) => SEEDS.map((seed) =>
    realize({ seed, kind: "strong_training", goalType, cadence: "photo",
      visual: { available: true, capturedAt: "2026-09-19", change, comparable: true } })));

  it("the visual result leads when one exists", () => {
    for (const { label, synthesis, realized } of [...visualCases("visible"), ...visualCases(null)]) {
      const visual = synthesis.selected.find((item) => item.domain === "visual_change");
      expect(visual, label).toBeTruthy();
      expect(realized.heroIds[0], label).toBe(visual.id);
      expect(realized.headlineIds, label).toContain(visual.id);
    }
  });

  it("depth grows only with a measured, strong visual change", () => {
    const visible = visualCases("visible").map((item) => resolveSectionContract("photo", item.synthesis));
    const unmeasured = visualCases(null).map((item) => resolveSectionContract("photo", item.synthesis));
    for (const contract of visible) expect(contract.maxWords).toBeGreaterThan(SECTION_CONTRACTS.photo.maxWords);
    for (const contract of unmeasured) expect(contract.maxWords).toBe(SECTION_CONTRACTS.photo.maxWords);
  });

  it("a first photo set is a baseline, never 'compared with the last set'", () => {
    for (const goalType of GOALS) for (const seed of SEEDS) {
      const { realized, label } = realize({ seed, kind: "strong_training", goalType, cadence: "photo",
        visual: { available: true, capturedAt: "2026-09-19", change: null, comparable: false } });
      expect(realized.headline, label).toBe("New photos set a baseline.");
      expect(`${realized.headline} ${realized.meaning}`).not.toMatch(/compared/u);
    }
  });

  it("an unmeasured comparison never claims how much the photos changed", () => {
    for (const { label, realized } of visualCases(null)) {
      expect(texts(realized).join(" "), label).not.toMatch(/visible change|subtle change|look much like|little visible change/u);
      expect(realized.recap, label).toMatch(/compared pose by pose|set a baseline/u);
    }
  });

  it("visual and other evidence can disagree without contradiction", () => {
    for (const { label, realized } of visualCases("none")) {
      const text = texts(realized).join(" ");
      expect(text, label).toMatch(/look much like the last set|little visible change/u);
      // "Little visible change" is the honest read; a claimed visible change is not.
      expect(text).not.toMatch(/(?<!little )visible change/u);
    }
  });
});

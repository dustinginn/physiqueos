// Section contracts: each narrative section has its own job, the briefing
// progresses instead of looping over its top facts, and the same contract
// scales across briefing types. Properties over generated situations — never
// a particular week's sentences.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildEvidencePicture } from "./BriefingEvidencePicture.js";
import { synthesizeBriefing } from "./BriefingHolisticSynthesis.js";
import { resolveNarrativeBudget } from "./BriefingIntelligencePolicies.js";
import {
  SECTION_CONTRACTS, SectionRole, allocateSections, auditSectionPlan, auditSectionTexts, contentOverlap,
  leadInsights, resolveSectionContract, statedQuantities,
} from "./BriefingSectionContracts.js";
import { realizeHolisticWeeklyV3, WEEKLY_REALIZABLE_KINDS } from "../v3/HolisticNarrativeV3.js";
import { deepFreeze, isSemanticallyEquivalent } from "../v3/V3Runtime.js";
import { projectV3CoachInsight, projectV3Hero } from "../../services/BriefingV3Projection.js";
import { HOLISTIC_GOAL_TYPES, HOLISTIC_KINDS, holisticScenario } from "../../../testSupport/briefingHolisticSynthetic.js";

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

function synthesize({ seed, kind, goalType = "build_lean_mass", cadence = "weekly" }) {
  const scenario = holisticScenario({ seed, kind, goalType, cadence });
  const picture = buildEvidencePicture({ intelligence: scenario.intelligence, goalPolicy: scenario.goalPolicy,
    goalFacts: scenario.goalFacts });
  const synthesis = synthesizeBriefing({ picture, budget: resolveNarrativeBudget(scenario.policy, picture),
    realizableKinds: cadence === "weekly" ? WEEKLY_REALIZABLE_KINDS : null });
  return { scenario, picture, synthesis };
}

const weekly = HOLISTIC_GOAL_TYPES.flatMap((goalType) => HOLISTIC_KINDS.flatMap((kind) => SEEDS.map((seed) => {
  const { scenario, picture, synthesis } = synthesize({ seed, kind, goalType });
  const realized = realizeHolisticWeeklyV3({ synthesis, picture, goalLabel: "the goal", goalPolicy: scenario.goalPolicy });
  return { kind, seed, goalType, scenario, synthesis, realized, label: `${goalType}/${kind}#${seed}` };
}))).filter((item) => item.realized);

const words = (text) => String(text ?? "").split(/\s+/u).filter(Boolean).length;
const contract = SECTION_CONTRACTS.weekly;

describe("the headline is a short synthesis; the hero paragraph carries the evidence", () => {
  it("every headline fits its budget: a few words, no numbers", () => {
    for (const { label, realized } of weekly) {
      expect(words(realized.headline), label).toBeLessThanOrEqual(contract.headline.maxWords);
      expect(realized.headline.length).toBeLessThanOrEqual(contract.headline.maxChars);
      expect(statedQuantities(realized.headline)).toEqual([]);
      expect(realized.headline).toMatch(/^[A-Z].*\.$/u);
    }
  });

  it("the recap in the hero paragraph carries richer evidence than the headline", () => {
    let richer = 0;
    for (const { label, realized } of weekly) {
      expect(realized.meaning.startsWith(realized.recap), label).toBe(true);
      if (statedQuantities(realized.recap).length) {
        richer += 1;
        expect(words(realized.recap), label).toBeGreaterThan(words(realized.headline));
      }
    }
    expect(richer).toBeGreaterThan(weekly.length / 3);
  });

  it("the headline never drops a concern in the lead for a shorter all-good line", () => {
    let checked = 0;
    for (const { label, synthesis, realized } of weekly) {
      const concerns = synthesis.selected.filter((item) => realized.heroIds.includes(item.id) && item.polarity === "concern");
      if (!concerns.length) continue;
      checked += 1;
      expect(concerns.some((item) => realized.headlineIds.includes(item.id)), `${label}: ${realized.headline}`).toBe(true);
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("headline phrases read as English: a noun phrase after 'with', never a stray capital or a sentence fragment", () => {
    for (const { label, realized } of weekly) {
      expect(realized.headline, label).not.toMatch(/, with [A-Z]|with strong training week|, and [a-z]+ off target/u);
      expect(realized.headline).not.toMatch(/\s{2,}|,\s*\./u);
    }
  });

  it("the hero paragraph refers back to the scale only when the recap told it", () => {
    for (const { label, realized } of weekly) {
      expect(`${realized.headline} ${realized.meaning} ${realized.result} ${realized.coachTake} ${realized.action} ${realized.watch}`, label)
        .not.toMatch(/\b(?:the|a|this) (?:the|a|any|this|that)\b/iu);
      if (/how much of this (?:gain|drop)/u.test(realized.meaning)) expect(realized.recap, label).toMatch(/your weight/iu);
    }
  });

  it("headline and recap are generated from the same lead insights", () => {
    for (const { label, synthesis, realized } of weekly) {
      expect(realized.sectionPlan.sections.headline.insightIds, label).toEqual(realized.sectionPlan.sections.recap.insightIds);
      expect(realized.heroIds).toEqual(leadInsights(synthesis, contract).map((item) => item.id));
    }
  });
});

describe("Biggest Takeaway interprets; it never restates the Hero", () => {
  it("is neither an exact nor a semantic duplicate of the headline or the recap", () => {
    for (const { label, realized } of weekly) {
      for (const hero of [realized.headline, realized.recap]) {
        expect(realized.result, label).not.toBe(hero);
        expect(isSemanticallyEquivalent(realized.result, hero), label).toBe(false);
        expect(contentOverlap(realized.result, hero), label).toBeLessThanOrEqual(0.5);
      }
      // Interpretation adds no new numbers: the evidence stays in the recap.
      expect(statedQuantities(realized.result), label).toEqual([]);
    }
  });

  it("never praises a week whose lead carries a risk or a break in training or routine", () => {
    const PRAISE = /exactly the kind of week the goal needs|goal moves on ordinary weeks|how the goal gets built/u;
    let checked = 0;
    for (const { label, synthesis, realized } of weekly) {
      const lead = synthesis.selected.filter((item) => realized.heroIds.includes(item.id));
      const serious = lead.some((item) => item.role === "risk" ||
        (["training_frequency", "routine_break", "guardrail_status", "composition_result"].includes(item.kind) && item.polarity === "concern"));
      if (!serious) continue;
      checked += 1;
      expect(realized.result, label).not.toMatch(PRAISE);
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("the served projection maps headline, hero paragraph and Biggest Takeaway to different text", () => {
    for (const { label, realized } of weekly.filter((_, index) => index % 7 === 0)) {
      const narrative = { summary: realized.headline, coachTake: realized.coachTake,
        sections: { result: realized.result, meaning: realized.meaning, action: realized.action, watch: realized.watch } };
      const hero = projectV3Hero(narrative);
      const coach = projectV3CoachInsight(narrative);
      expect(new Set([hero.headline, hero.summary, coach.biggestWin]).size, label).toBe(3);
    }
  });
});

describe("the briefing progresses: every section adds something", () => {
  it("no insight is used twice in the same capacity, and each section adds an insight or a capacity", () => {
    for (const { label, realized } of weekly) {
      expect(realized.sectionAudit.plan, label).toEqual({ ok: true, issues: [] });
    }
  });

  it("written sections pass the redundancy audit: each quantity stated once, no two sections mostly the same", () => {
    for (const { label, realized } of weekly) {
      expect(realized.sectionAudit.text.issues, label).toEqual([]);
    }
  });

  it("What To Do adds execution, never the takeaway's priority or the action's step again", () => {
    for (const { label, realized } of weekly) {
      expect(contentOverlap(realized.coachTake, realized.result), label).toBeLessThanOrEqual(0.5);
      expect(contentOverlap(realized.coachTake, realized.action), label).toBeLessThanOrEqual(0.5);
      expect(isSemanticallyEquivalent(realized.coachTake, realized.action)).toBe(false);
    }
  });

  it("the action is actionable, not another recap", () => {
    for (const { label, realized } of weekly) {
      expect(realized.action, label).toMatch(/^(?:Keep|Get|Make|Bring|Settle)\b/u);
      expect(statedQuantities(realized.action), label).toEqual([]);
      expect(realized.action).not.toMatch(/\b(?:was|were|went|slipped|kept moving|has been)\b/u);
    }
  });

  it("the watch looks forward, not back", () => {
    for (const { label, realized } of weekly) {
      expect(realized.watch, label).toMatch(/^Watch (?:whether|what|where|the weekly|that)\b/u);
      expect(statedQuantities(realized.watch), label).toEqual([]);
    }
  });

  it("stays concise: the whole Weekly fits its word budget", () => {
    for (const { label, realized } of weekly) {
      expect(realized.sectionAudit.text.totalWords, label).toBeLessThanOrEqual(contract.maxWords);
    }
  });

  it("a stable week stays short: no manufactured contrast, no invented step, no repeated reassurance", () => {
    let checked = 0;
    for (const { label, synthesis, realized } of weekly.filter((item) => item.kind === "stable_all")) {
      if (synthesis.selected.some((item) => item.polarity === "concern")) continue;
      checked += 1;
      expect(realized.headline, label).not.toMatch(/\bbut\b/u);
      expect(words(realized.coachTake), label).toBeLessThanOrEqual(25);
      expect(realized.sectionPlan.sections.action.insightIds).toEqual([]);
      // "No change" is said once as the read, once as the commitment — What
      // To Do adds execution, not a third reassurance.
      expect(realized.coachTake).not.toMatch(/nothing (?:needs|calls)|more of the same|same numbers/iu);
    }
    expect(checked).toBeGreaterThan(20);
  });

  it("is deterministic and never mutates its inputs", () => {
    for (const { kind, seed, goalType } of weekly.filter((_, index) => index % 11 === 0)) {
      const first = synthesize({ seed, kind, goalType });
      const frozen = { synthesis: deepFreeze(structuredClone(first.synthesis)), picture: deepFreeze(structuredClone(first.picture)) };
      const once = realizeHolisticWeeklyV3({ ...frozen, goalLabel: "the goal", goalPolicy: first.scenario.goalPolicy });
      const twice = realizeHolisticWeeklyV3({ ...frozen, goalLabel: "the goal", goalPolicy: first.scenario.goalPolicy });
      expect(JSON.stringify(once)).toBe(JSON.stringify(twice));
    }
  });
});

describe("section contracts scale across briefing types without duplicating copy", () => {
  it("Midweek uses fewer sections than Weekly; Monthly may carry more evidence", () => {
    const { midweek, weekly: week, monthly } = SECTION_CONTRACTS;
    expect(midweek.sections.length).toBeLessThan(week.sections.length);
    expect(midweek.sections).not.toContain(SectionRole.TAKEAWAY);
    expect(midweek.sections).not.toContain(SectionRole.COACHING);
    expect(midweek.headline.maxWords).toBeLessThanOrEqual(week.headline.maxWords);
    expect(midweek.maxWords).toBeLessThan(week.maxWords);
    expect(monthly.recap.maxInsights).toBeGreaterThan(week.recap.maxInsights);
    expect(monthly.maxWords).toBeGreaterThan(week.maxWords);
  });

  it("every briefing type's allocation is non-redundant and lists only its own sections", () => {
    for (const cadence of ["midweek", "weekly", "monthly", "dexa", "photo"]) {
      for (const kind of HOLISTIC_KINDS) {
        for (const seed of SEEDS.slice(0, 4)) {
          const { synthesis } = synthesize({ seed, kind, cadence });
          const sectionContract = resolveSectionContract(cadence, synthesis);
          const plan = allocateSections({ synthesis, contract: sectionContract,
            steps: synthesis.selected.filter((item) => item.polarity !== "supportive").slice(0, 1).map((source) => ({ source })) });
          const label = `${cadence}/${kind}#${seed}`;
          expect(Object.keys(plan.sections).sort(), label).toEqual([...sectionContract.sections].sort());
          expect(auditSectionPlan(plan), label).toEqual({ ok: true, issues: [] });
          expect(plan.sections.recap.insightIds.length).toBeLessThanOrEqual(sectionContract.recap.maxInsights);
        }
      }
    }
  });

  it("DEXA leads with its outcome; Photo leads with the visual result and deepens only when it is strong", () => {
    for (const seed of SEEDS.slice(0, 4)) {
      const dexa = synthesize({ seed, kind: "weight_rapid_guardrail", cadence: "dexa" }).synthesis;
      expect(leadInsights(dexa, SECTION_CONTRACTS.dexa)[0].domain, `seed ${seed}`).toBe("body_composition");
    }
    const strong = synthesize({ seed: 2, kind: "strong_training", cadence: "photo" }).synthesis;
    const subtle = synthesize({ seed: 2, kind: "disruption_training_stable_weight", cadence: "photo" }).synthesis;
    const strongContract = resolveSectionContract("photo", strong);
    const subtleContract = resolveSectionContract("photo", subtle);
    expect(leadInsights(strong, strongContract)[0].domain).toBe("visual_change");
    expect(strongContract.sections.length).toBeGreaterThan(subtleContract.sections.length);
    expect(strongContract.sections).toContain(SectionRole.TAKEAWAY);
    expect(subtleContract.sections).not.toContain(SectionRole.TAKEAWAY);
  });

  it("the redundancy audit catches a restated Hero, a repeated quantity and a recap posing as an action", () => {
    const audit = auditSectionTexts({
      headline: "Training moved forward with new bests on 7 lifts this week and more.",
      recap: "Training moved forward with new bests on seven lifts.",
      takeaway: "Training moved forward with new bests on seven lifts.",
      coaching: "Your weight rose 1.7 lb a week.", action: "Your weight rose 1.7 lb a week.", watch: "The scale rose.",
    }, contract);
    expect(audit.ok).toBe(false);
    expect(audit.issues.join(" ")).toMatch(/headline: states a quantity/u);
    expect(audit.issues.join(" ")).toMatch(/mostly say the same thing/u);
    expect(audit.issues.join(" ")).toMatch(/repeats "1\.7 lb a"/u);
    expect(audit.issues.join(" ")).toMatch(/action: does not commit/u);
    expect(audit.issues.join(" ")).toMatch(/watch: does not look forward/u);
  });
});

describe("historical immutability", () => {
  it("a stored V3 Weekly is served as stored; the new section contract never rewrites it", () => {
    const stored = JSON.parse(readFileSync(new URL("../../../fixtures/briefingFamilyV3/weeklyArtifactV3Bound.json", import.meta.url)));
    const narrative = deepFreeze(structuredClone(stored.briefing.narrativeV3));
    expect(projectV3Hero(narrative).headline).toBe(stored.briefing.narrativeV3.summary);
    expect(projectV3CoachInsight(narrative).biggestWin).toBe(stored.briefing.narrativeV3.sections.result);
  });
});

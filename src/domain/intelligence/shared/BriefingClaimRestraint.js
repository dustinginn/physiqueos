// Claim restraint: what a finding is allowed to claim, shared by every
// briefing's realization.
//
// Each insight kind carries a claim scope. Exercise bests are performance
// evidence: they can say training progressed or performance improved, but
// they cannot say the training "is working" in the causal sense — producing
// the body-composition outcome or proving the intervention effective. A scan
// is authoritative for its measure, not for what caused the change. Only an
// insight that carries explicit authoritative causal support may be realized
// as effectiveness; nothing in the evidence model produces that today.
//
// Incomplete or unreliable past evidence is a limit on the picture. Its
// actionable implication is better observability going forward; guidance
// never implies the past period can be repaired unless an explicit
// retroactive-correction action exists for it.
//
// Where it acts: realizers phrase "going well" by claim scope and write
// limitation guidance prospectively; `auditClaimRestraint` is a diagnostic
// backstop recorded with the narrative (and enforced by tests), not a
// production gate. `causalSupport` / `retroactiveCorrection` are the fields a
// future authoritative producer would set; nothing emits them today.

export const ClaimScope = Object.freeze({
  PERFORMANCE: "performance",
  MEASUREMENT: "measurement",
  TRAJECTORY: "trajectory",
  EXECUTION: "execution",
  OBSERVABILITY: "observability",
});

const SCOPE_BY_KIND = Object.freeze({
  training_progress: ClaimScope.PERFORMANCE,
  training_frequency: ClaimScope.EXECUTION,
  composition_result: ClaimScope.MEASUREMENT,
  guardrail_status: ClaimScope.MEASUREMENT,
  visual_change: ClaimScope.MEASUREMENT,
  weight_trend: ClaimScope.TRAJECTORY,
  routine_break: ClaimScope.EXECUTION,
  routine_steady: ClaimScope.EXECUTION,
  intake_vs_plan: ClaimScope.EXECUTION,
  activity_change: ClaimScope.EXECUTION,
  activity_on_plan: ClaimScope.EXECUTION,
  nutrition_unclear: ClaimScope.OBSERVABILITY,
});

export function claimScopeOf(item) {
  return SCOPE_BY_KIND[item?.kind] ?? ClaimScope.EXECUTION;
}

// Effectiveness/causal language: an intervention "working", paying off,
// producing or driving an outcome.
const APOSTROPHE = "['\u2019]";
// Named interventions only: "it"/"that" also start ordinary sentences
// ("if that works for you", "it worked out to …").
const AGENT = "(?:training|lifting|plan|approach|program|programme|strategy|routine|setup)";

export const EFFECTIVENESS_LANGUAGE = new RegExp([
  // "the training is working", "the plan works", "it has been working", "training's working"
  `\\b${AGENT}(?:${APOSTROPHE}s|\\s+(?:is|are|was|were|has been|have been|has|have))?\\s+(?:clearly\\s+|really\\s+|definitely\\s+)?(?:working|works|worked)\\b`,
  `\\b${AGENT}\\s+(?:is\\s+|has been\\s+)?(?:effective|succeeding|proving effective|paying off|pays off|paid off|paying dividends|delivering results|doing (?:its|the) job)\\b`,
  "\\b(?:paying off|pays off|paid off|paying dividends|delivering results|doing (?:its|their) job|doing what it should)\\b",
  // the intervention producing the outcome
  `\\b${AGENT}\\s+(?:is\\s+|was\\s+)?(?:building|adding|putting on)\\s+(?:lean\\s+)?(?:muscle|mass)\\b`,
  "\\b(?:dr(?:ive|ives|iving|ove)|produc(?:e|es|ed|ing)|caus(?:e|es|ed|ing))\\s+(?:the\\s+|this\\s+|those\\s+)?(?:gains?|results?|progress|change|lean[- ]mass)\\b",
  "\\b(?:thanks to|responsible for|because of)\\s+(?:the\\s+)?(?:training|lifting|plan|program|programme|routine|approach)\\b",
  "\\b(?:result(?:s|ed)? in|leads? to|led to)\\s+(?:the\\s+|more\\s+)?(?:gains?|lean|muscle|fat loss|progress)\\b",
  "\\btranslat(?:e|es|ed|ing) into (?:lean|muscle|mass|results?|gains?)\\b",
  "\\bcoming from the (?:training|lifting|plan|program|programme|routine)\\b",
  "\\bgetting results\\b",
  "\\bfuel(?:s|ed|led|ing|ling)? (?:the\\s+)?(?:lean[- ]mass\\s+)?gains?\\b",
  // normative-causal: a week "is what the goal needs"
  "\\bthe kind of week the goal needs\\b",
].join("|"), "iu");

// Guidance that implies the past period can still be repaired — not
// prospective guidance ("from here on", "going forward", "next week").
const DAY = "(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)";
const LOG_NOUN = "(?:days?|logs?|entries|meals?|food)";
// Past-period references: "those days", "the missing meals", "Thursday's
// log", "Thursday through Saturday" — a day range followed by "this/next
// week" is a plan for the coming week, not a repair.
const PAST = `(?:(?:those|that|these|the missing|the past)\\s+${LOG_NOUN}|(?:this|last|the) week's\\s+${LOG_NOUN}|${DAY}'s\\s+${LOG_NOUN}|(?!${DAY}(?:\\s+through\\s+${DAY})?\\s+(?:this|next) week)${DAY}(?:\\s+through\\s+${DAY})?(?:\\s+${LOG_NOUN})?)`;
export const RETROACTIVE_REPAIR_LANGUAGE = new RegExp([
  `\\b(?:logging|log|fill(?:ing)? in|complet(?:e|ing)|fix(?:ing)?|correct(?:ing)?|updat(?:e|ing)(?:\\s+the\\s+log\\s+for)?|add(?:ing)?)\\s+${PAST}\\b(?![^.;]*\\b(?:going forward|from here on|from now on)\\b)`,
  "\\bgo back and\\b", "\\bbackfill", "\\bcan still be (?:logged|added|filled in)\\b",
  "\\benter the (?:meals?|food) you (?:skipped|missed)\\b",
].join("|"), "iu");

// Whether any selected finding carries explicit authoritative causal
// support (none does today), and whether any limitation offers an explicit
// retroactive-correction action (none does today).
export function claimSupport(synthesis) {
  const items = [...(synthesis?.selected ?? []), ...(synthesis?.context ?? []), ...(synthesis?.limitations ?? [])];
  return {
    effectiveness: items.some((item) => item?.causalSupport === "authoritative"),
    retroactiveCorrection: items.some((item) => item?.retroactiveCorrection?.available === true),
  };
}

// Strategy-level causal support: a future evidence schema may mark a
// strategy's effectiveness as causally established (for example, a
// controlled comparison). An outcome that merely demonstrated feasibility —
// a DEXA showing the measure moved while the plan ran — is not that.
export function hasAuthoritativeCausalSupport(interpretation) {
  return interpretation?.strategyEffectiveness?.causalSupport === "authoritative";
}

// Text-level audit: effectiveness language needs authoritative causal
// support; repair-the-past language needs an explicit correction action.
export function auditClaimRestraint(texts, support = { effectiveness: false, retroactiveCorrection: false }) {
  const issues = [];
  for (const [role, text] of Object.entries(texts ?? {})) {
    if (!text) continue;
    const effectiveness = support.effectiveness ? null : EFFECTIVENESS_LANGUAGE.exec(text);
    if (effectiveness) issues.push(`${role}: claims effectiveness without authoritative causal support ("${effectiveness[0]}")`);
    const repair = support.retroactiveCorrection ? null : RETROACTIVE_REPAIR_LANGUAGE.exec(text);
    if (repair) issues.push(`${role}: implies the past period can be repaired ("${repair[0]}")`);
  }
  return issues;
}

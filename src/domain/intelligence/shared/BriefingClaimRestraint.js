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
const AGENT = "(?:training|lifting|plan|approach|program|programme|strategy|routine|setup|work|it|this|that)";

export const EFFECTIVENESS_LANGUAGE = new RegExp([
  // "the training is working", "the plan works", "it has been working", "training's working"
  `\\b${AGENT}(?:${APOSTROPHE}s|\\s+(?:is|are|was|were|has been|have been))?\\s+(?:clearly\\s+|really\\s+|definitely\\s+)?(?:working|works|worked)\\b`,
  `\\b${AGENT}\\s+(?:is\\s+|has been\\s+)?(?:effective|succeeding|proving effective|paying off|pays off|paid off|paying dividends|delivering results|doing (?:its|the) job)\\b`,
  "\\b(?:paying off|pays off|paid off|paying dividends|delivering results|doing (?:its|their) job|doing what it should)\\b",
  // the intervention producing the outcome
  `\\b${AGENT}\\s+(?:is\\s+|was\\s+)?(?:building|adding|putting on)\\s+(?:lean\\s+)?(?:muscle|mass)\\b`,
  "\\b(?:dr(?:ive|ives|iving|ove)|produc(?:e|es|ed|ing)|caus(?:e|es|ed|ing))\\s+(?:the\\s+|this\\s+|those\\s+)?(?:gains?|results?|progress|change|lean[- ]mass)\\b",
  "\\b(?:thanks to|responsible for|because of)\\s+(?:the\\s+)?(?:training|lifting|plan|program|programme|routine|approach)\\b",
  "\\b(?:result(?:s|ed)? in|leads? to|led to)\\s+(?:the\\s+|more\\s+)?(?:gains?|lean|muscle|fat loss|progress)\\b",
  // normative-causal: a week "is what the goal needs"
  "\\bthe kind of week the goal needs\\b",
].join("|"), "iu");

// Guidance that implies the past period can still be repaired — not
// prospective guidance ("from here on", "going forward", "next week").
const PAST = "(?:those|that|these|the missing|the past|this week's|last week's|the week's|monday's|tuesday's|wednesday's|thursday's|friday's|saturday's|sunday's|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\\s+through\\s+\\w+)?)";
export const RETROACTIVE_REPAIR_LANGUAGE = new RegExp([
  `\\b(?:logging|log|fill(?:ing)? in|complet(?:e|ing)|fix(?:ing)?|correct(?:ing)?|updat(?:e|ing)(?:\\s+the\\s+log\\s+for)?|add(?:ing)?)\\s+${PAST}(?:\\s+(?:days?|logs?|entries|meals?|week))?\\b(?![^.;]*\\b(?:going forward|from here on|from now on)\\b)`,
  "\\bgo back and\\b", "\\bbackfill",
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

// Text-level audit: effectiveness language needs authoritative causal
// support; repair-the-past language needs an explicit correction action.
export function auditClaimRestraint(texts, support = { effectiveness: false, retroactiveCorrection: false }) {
  const issues = [];
  for (const [role, text] of Object.entries(texts ?? {})) {
    if (!text) continue;
    if (!support.effectiveness && EFFECTIVENESS_LANGUAGE.test(text)) {
      issues.push(`${role}: claims effectiveness without authoritative causal support`);
    }
    if (!support.retroactiveCorrection && RETROACTIVE_REPAIR_LANGUAGE.test(text)) {
      issues.push(`${role}: implies the past period can be repaired`);
    }
  }
  return issues;
}

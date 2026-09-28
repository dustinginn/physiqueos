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
export const EFFECTIVENESS_LANGUAGE = new RegExp([
  "\\b(?:is|are|was|were|'s|'re)\\s+(?:clearly\\s+|really\\s+|definitely\\s+)?working\\b",
  "\\bpaying off\\b", "\\bdoing (?:its|their) job\\b", "\\bdoing what it should\\b",
  "\\b(?:approach|plan|program|programme|strategy|training|routine)\\s+(?:is\\s+|has been\\s+)?(?:effective|succeeding)\\b",
  "\\b(?:building|built|adding|added)\\s+(?:lean\\s+)?(?:muscle|mass)\\b",
  "\\b(?:driv(?:e|es|ing)|produc(?:e|es|ing)|caus(?:e|es|ing))\\s+(?:the\\s+)?(?:gain|gains|result|results|progress|change)\\b",
  "\\bresponsible for\\b", "\\bthanks to\\b", "\\bresult(?:s|ed)? in\\b", "\\bleads? to\\b",
].join("|"), "iu");

// Guidance that implies the past period can still be repaired.
export const RETROACTIVE_REPAIR_LANGUAGE = new RegExp([
  "\\b(?:logging|log|fill(?:ing)? in|complet(?:e|ing)|fix(?:ing)?|correct(?:ing)?|updat(?:e|ing))\\s+(?:those|that|these|the missing|the past)\\s+(?:days?|logs?|entries|meals?|week)\\b",
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

// Holistic narrative for V3 recurring briefings.
//
// Two responsibilities, kept apart:
//   1. `goalFactsFromInterpretationV3` turns what V3 already established
//      (composition, guardrail, energy against plan, training milestones,
//      outlook, strategy) into the plain goal facts the shared evidence picture
//      reads. No new judgment is made here.
//   2. `realizeHolisticWeeklyV3` writes the Weekly from the shared synthesis:
//      each section has its own responsibility and the synthesis decides what
//      is worth saying. The prose is a coach talking — the reasoning behind it
//      stays underneath.
//
// Exercise milestones may appear as examples of training progress; they are
// never used to explain Goal Confidence.

import { EVIDENCE_DOMAIN_ROLES as ROLES } from "../shared/GoalEvidencePolicies.js";
import { SectionRole, allocateSections, auditSectionPlan, auditSectionTexts, leadInsights,
  resolveSectionContract } from "../shared/BriefingSectionContracts.js";
import { ClaimScope, claimScopeOf, claimSupport } from "../shared/BriefingClaimRestraint.js";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
  "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const PROGRESS_TYPES = new Set(["load_milestone", "reps_at_load_milestone", "volume_milestone",
  "longitudinal_progression", "first_weighted_work", "repeated_progression"]);
const HERO_BUDGET = 160;

// ---------------------------------------------------------------- goal facts

// `words` carries the Goal Contract's own vocabulary (the outcome check's
// name, the primary measure, the guardrail) — the core never names them.
export function goalFactsFromInterpretationV3({ interpretation, confidence, window, words = {} }) {
  const objectives = interpretation?.objectiveFindings ?? [];
  const primary = objectives.find((item) => item.priority === "primary") ?? objectives[0] ?? null;
  // The goal's primary outcome measure is what an outcome check reports on.
  const compositionObjective = primary?.directness === "direct" ? primary : null;
  const guardrail = (interpretation?.guardrailFindings ?? []).find((item) => item.status !== "not_assessed") ?? null;
  const energy = Object.fromEntries((interpretation?.energyExecution?.findings ?? [])
    .map((item) => [item.dimension, { state: item.state, observed: item.observedValue, target: item.targetValue }]));
  return {
    composition: compositionObjective && compositionObjective.state !== "not_assessed" ? {
      available: true,
      measuredAt: String(compositionObjective.evidenceObservedAt ?? "").slice(0, 10) || null,
      comparisonAt: String(compositionObjective.comparisonAt ?? "").slice(0, 10) || null,
      state: compositionObjective.state,
      metric: compositionObjective.metricCapability?.id ?? compositionObjective.objectiveId,
      change: compositionObjective.change, unit: compositionObjective.unit,
      currentValue: compositionObjective.currentValue,
      label: words.outcomeLabel ?? "the main measure",
      eventName: words.outcomeEventName ?? "check",
    } : null,
    guardrail: guardrail ? {
      available: true, status: guardrail.status, value: guardrail.currentValue, unit: guardrail.unit,
      metric: guardrail.metricCapability?.id ?? null, label: words.guardrailLabel ?? "the limit",
    } : null,
    energy: Object.keys(energy).length ? energy : null,
    trainingMilestones: trainingMilestones(interpretation, window),
    outlook: confidence ? { percentage: confidence.currentPercentage, delta: confidence.delta,
      primaryObjectiveState: primary?.state ?? null } : null,
    strategy: interpretation?.recommendation ? { action: interpretation.recommendation.action } : null,
  };
}

// One milestone per lift, in the period, ranked by how big the step was.
function trainingMilestones(interpretation, window) {
  const selection = interpretation?.coachingObservationSelection ?? {};
  const pool = [...(selection.rankedCandidates ?? []), ...(selection.selected ?? [])];
  const inWindow = pool.filter((item) => item?.domain === "training" && PROGRESS_TYPES.has(item.type) &&
    window && String(item.observedAt) >= window.startDate && String(item.observedAt) <= window.endDate);
  const bySubject = new Map();
  for (const item of inWindow) {
    const milestone = normalizeMilestone(item);
    // A comparison that went down is not a best, whatever its candidate type.
    if (milestone.relativeGain != null && milestone.relativeGain <= 0) continue;
    // Without a comparison, only an intrinsic first counts as a best.
    if (milestone.relativeGain == null && milestone.type !== "first_weighted_work") continue;
    const current = bySubject.get(milestone.subjectId);
    if (!current || rankMilestone(milestone) > rankMilestone(current)) bySubject.set(milestone.subjectId, milestone);
  }
  return [...bySubject.values()].sort((left, right) => rankMilestone(right) - rankMilestone(left) ||
    left.subjectId.localeCompare(right.subjectId));
}

function normalizeMilestone(item) {
  const basis = item.evidenceBasis ?? {};
  const current = Number(basis.currentValue);
  const previous = Number(basis.previousValue);
  const relativeGain = Number.isFinite(current) && Number.isFinite(previous) && previous > 0 ? (current - previous) / previous :
    Number.isFinite(Number(basis.percentChange)) ? Number(basis.percentChange) / 100 : null;
  return { subjectId: item.subjectId ?? item.subjectLabel, subjectLabel: item.subjectLabel, type: item.type,
    observedAt: item.observedAt, metric: basis.metric ?? null, currentValue: Number.isFinite(current) ? current : null,
    previousValue: Number.isFinite(previous) ? previous : null, unit: basis.unit ?? null,
    load: Number.isFinite(Number(basis.load)) ? Number(basis.load) : null,
    relativeGain: relativeGain == null ? null : Math.round(relativeGain * 1000) / 1000, score: item.score ?? 0 };
}

function rankMilestone(item) {
  const concrete = item.currentValue != null && item.previousValue != null ? 1 : 0;
  return (item.relativeGain ?? 0) * 10 + concrete + (item.score ?? 0) / 1000;
}

// ---------------------------------------------------------------- weekly

// The insight kinds this realizer can phrase. Synthesis keeps any other kind
// (a future Sleep finding) out of the selection with a reason until a phrase
// for it exists here.
export const WEEKLY_REALIZABLE_KINDS = Object.freeze(new Set(["training_progress", "weight_trend", "routine_break",
  "composition_result", "guardrail_status", "intake_vs_plan", "activity_change", "training_frequency",
  "activity_on_plan", "routine_steady", "nutrition_unclear", "visual_change"]));

// The Weekly written to its section contract (shared/BriefingSectionContracts):
// a short headline for what kind of week it was, an evidence-rich recap, the
// goal meaning, the coach's read, what to carry into execution, the next
// steps and what decides next week. Each section consumes a different facet
// of the same synthesis, so the briefing progresses rather than repeating
// its top facts.
export function realizeHolisticWeeklyV3({ synthesis, picture, goalLabel, goalPolicy }) {
  if (!synthesis?.selected?.length) return null;
  const contract = resolveSectionContract("weekly", synthesis);
  const facts = { ...pictureFacts(picture), direction: goalPolicy?.weightExpectation?.direction ?? null,
    sparse: (picture?.domains ?? []).filter((item) => ["insufficient", "unavailable"].includes(item.status)).length >= 4 };
  const lead = leadInsights(synthesis, contract);
  const steps = planSteps(synthesis);
  const discriminators = watchItems({ synthesis, facts });
  const { text: headline, ids: headlineIds } = headlineSentence(lead, facts, contract.headline);
  const recap = recapSentence(lead, facts);
  const implication = implicationSentence({ synthesis, facts, goalLabel, lead });
  const takeaway = takeawaySentence({ lead, synthesis, steps });
  const coachTake = coachingSentences({ synthesis, lead, facts, steps, contract });
  const action = actionSentence(synthesis, steps);
  const watch = watchSentence(discriminators);
  const sectionPlan = allocateSections({ synthesis, contract, steps, discriminators });
  const confidenceBody = confidenceSentence({ synthesis, facts });
  const texts = { [SectionRole.HEADLINE]: headline, [SectionRole.RECAP]: recap, [SectionRole.MEANING]: implication,
    [SectionRole.CONFIDENCE]: confidenceBody,
    [SectionRole.TAKEAWAY]: takeaway, [SectionRole.COACHING]: coachTake, [SectionRole.ACTION]: action,
    [SectionRole.WATCH]: watch };
  return {
    headline, result: takeaway, meaning: `${recap} ${implication}`, action, watch, coachTake,
    recap, implication,
    confidenceBody,
    heroIds: lead.map((item) => item.id),
    headlineIds,
    selectedIds: synthesis.selected.map((item) => item.id),
    limitationIds: synthesis.limitations.map((item) => item.id),
    sectionPlan,
    sectionAudit: { plan: auditSectionPlan(sectionPlan, synthesis),
      text: auditSectionTexts(texts, contract, { claimSupport: claimSupport(synthesis) }) },
  };
}

// ---- headline: what kind of week it was, in a few words and no numbers.

const LEAD_PHRASE = {
  training_progress: (f) => (f.milestoneCount >= 2 ? "Strong training week" : "A new best in training"),
  // Only reached for a canonical-range steady trend (the only supportive one).
  weight_trend: (f) => (f.verdict !== "steady" ? null : f.movement === "flat" ? "Weight holding steady" : "Weight on the phase's pace"),
  composition_result: (f) => `New ${f.eventName} shows progress`,
  routine_steady: () => "A steady week",
  activity_on_plan: () => "A steady week",
  intake_vs_plan: () => "Intake on target",
  visual_change: (f) => (f.change === "visible" ? "New photos show visible change" : "New photos show subtle change"),
};

// `standalone` phrases lead a headline on their own.
function concernPhrase(item, standalone = false) {
  const f = item.facts ?? {};
  switch (item.kind) {
    case "weight_trend":
      return { accelerating: `weight ${f.movement === "down" ? "loss" : "gain"} is picking up`,
        rapid: "the scale is moving fast", quick: "the scale is ahead of pace",
        wrong_direction: "the scale went the wrong way", drifting: "the scale drifted",
        flat: "the scale held flat" }[f.verdict] ?? null;
    case "routine_break": {
      const quiet = f.direction === "break";
      // (headline character only)
      const phrase = { late: quiet ? "a quiet finish" : "an off-routine finish", early: quiet ? "a slow start" : "an off-routine start",
        middle: quiet ? "a quiet midweek" : "an off-routine midweek" }[f.position] ?? (quiet ? "a quiet stretch" : "an off-routine stretch");
      return standalone && ["late", "early"].includes(f.position) ? `${phrase} to the week` : phrase;
    }
    case "training_frequency": return f.missedAll ? `no training logged${standalone ? " this week" : ""}` : "fewer sessions than usual";
    case "guardrail_status": return f.status === "breached" ? `${f.label} past its limit` : `${f.label} near its limit`;
    // A standing result is not this week's news.
    case "composition_result": return f.newThisPeriod ? `${f.label} ${Number(f.change) > 0 ? "up" : "down"} on the ${f.eventName}`
      : `${f.label} ${Number(f.change) > 0 ? "up" : "down"} on the last ${f.eventName}`;
    case "intake_vs_plan": return "intake off target";
    case "activity_change": return f.direction === "below" ? "activity dipped" : "activity ran high";
    case "visual_change": return "little visible change";
    default: return null;
  }
}

// The same concerns as noun phrases, for "…, with …".
function concernNoun(item) {
  const f = item.facts ?? {};
  if (item.kind === "weight_trend") {
    return { accelerating: `weight ${f.movement === "down" ? "loss" : "gain"} picking up`, rapid: "the scale moving fast",
      quick: "the scale ahead of pace", wrong_direction: "the scale going the wrong way", drifting: "the scale drifting",
      flat: "the scale flat" }[f.verdict] ?? "the scale moving";
  }
  return concernPhrase(item);
}

// Supporting leads as noun phrases, for "…, with …".
const LEAD_NOUN = {
  training_progress: () => "strong training", weight_trend: (f) => (f.movement === "flat" ? "the scale steady" : "the scale on pace"),
  composition_result: (f) => `a ${f.eventName} showing progress`, routine_steady: () => "a steady routine",
  activity_on_plan: () => "a steady routine", intake_vs_plan: () => "intake on target",
  visual_change: () => "visible change in the photos",
};

function headlineSentence(lead, facts, budget) {
  // Neutral findings (a trend described without a verdict) get no headline
  // phrase of either kind.
  const phrases = lead.map((item) => ({ item, lead: item.polarity === "supportive" ? LEAD_PHRASE[item.kind]?.(item.facts ?? {}) : null,
    concern: item.polarity === "concern" ? concernPhrase(item) : null })).filter((entry) => entry.lead || entry.concern);
  const leads = phrases.filter((entry) => entry.lead);
  const concerns = phrases.filter((entry) => entry.concern);
  const options = [];
  const option = (text, ...entries) => options.push({ text, ids: entries.map((entry) => entry.item.id) });
  if (leads[0] && concerns[0]) option(`${leads[0].lead}, but ${concerns[0].concern}.`, leads[0], concerns[0]);
  if (concerns[0] && concerns[1]) option(`${upperFirst(concernPhrase(concerns[0].item, true))}, with ${concernNoun(concerns[1].item)}.`, concerns[0], concerns[1]);
  // A concern is never dropped for a shorter all-good headline.
  if (concerns[0]) option(`${upperFirst(concernPhrase(concerns[0].item, true))}.`, concerns[0]);
  if (leads[0] && leads[1]) option(`${leads[0].lead}, with ${LEAD_NOUN[leads[1].item.kind]?.(leads[1].item.facts ?? {}) ?? "more to build on"}.`, leads[0], leads[1]);
  if (leads[0]) option(`${leads[0].lead}.`, leads[0]);
  // A described (neutral) scale trend says what the scale did, no verdict.
  const neutralWeight = lead.find((item) => item.kind === "weight_trend" && item.polarity === "neutral");
  if (neutralWeight && !leads.length && !concerns.length) {
    const f = neutralWeight.facts;
    const phrase = f.movement === "flat" ? "Weight held steady."
      : f.expectedDirection === "stable" ? `The scale moved ${f.movement === "down" ? "down" : "up"}.`
        : f.movement === f.expectedDirection ? "Weight moving in the goal's direction." : null;
    if (phrase) options.push({ text: phrase, ids: [neutralWeight.id] });
  }
  options.push({ text: "A steady week.", ids: [] });
  const fits = ({ text }) => text.split(/\s+/u).length <= budget.maxWords && text.length <= budget.maxChars && !/\d/u.test(text);
  return options.find(fits) ?? { text: "A steady week.", ids: [] };
}

// ---- recap: what happened, with the concrete numbers.

function recapSentence(lead, facts) {
  const clauses = lead.map((item) => ({ item, text: clauseFor(item, facts) })).filter((entry) => entry.text);
  if (!clauses.length) return "This week held to its usual pattern.";
  const [first, second] = clauses;
  const joined = !second ? upperFirst(first.text) :
    first.item.polarity === "supportive" && second.item.polarity === "concern"
      ? `${upperFirst(first.text)}, but ${second.text}` : `${upperFirst(first.text)}, and ${second.text}`;
  const sentence = `${joined}.`;
  return sentence.length <= HERO_BUDGET ? sentence : `${upperFirst(first.text)}.`;
}

// ---- takeaway: the coach's read of the whole picture — what is going well
// and what matters now. Adds no new numbers and never restates the recap.
//
// What is "going well" is said within each finding's claim scope
// (shared/BriefingClaimRestraint): performance evidence says performance
// moved; a measurement says what it measured; execution says what was done.
// None of them is turned into a claim that the training or the approach is
// "working" (causing the outcome) without authoritative causal support.
const GOING_WELL = {
  [ClaimScope.PERFORMANCE]: () => "the performance gains are real",
  [ClaimScope.MEASUREMENT]: (f, kind) => (kind === "visual_change" ? "the photos line up with the goal's direction"
    : `the new ${f.eventName} shows ${f.label} moving the right way`),
  [ClaimScope.TRAJECTORY]: (f) => (f.verdict === "steady" ? "the scale is where the phase expects it" : null),
  [ClaimScope.EXECUTION]: (f, kind) => ({ routine_steady: "the routine held", activity_on_plan: "the routine held",
    intake_vs_plan: "intake stayed where it needs to be" }[kind] ?? null),
};

function workingPhrase(item) {
  return GOING_WELL[claimScopeOf(item)]?.(item.facts ?? {}, item.kind) ?? null;
}

function prioritiesPhrase(item) {
  const f = item.facts ?? {};
  switch (item.kind) {
    case "weight_trend":
      return { accelerating: "the scale picking up speed is what to rein in",
        rapid: "the pace of the scale is what to rein in", quick: "the pace of the scale is worth easing a little",
        wrong_direction: "the scale needs to turn back the right way", drifting: "the scale needs to settle back toward steady",
        flat: "a flat scale is worth a few more weeks before changing anything" }[f.verdict] ?? null;
    case "routine_break": {
      const prior = f.recurrence?.priorSpans?.length;
      const part = { late: "the end of the week", early: "the start of the week", middle: "the middle of the week" }[f.position] ??
        "the usual weekly rhythm";
      if (f.direction !== "break") return prior ? `${part} is worth protecting; the routine has drifted like this before`
        : "an off-routine stretch like this is easy to reset";
      return prior ? `the part to protect is ${part}, where the routine has slipped before`
        : "a short slip like this is easy to recover from";
    }
    case "training_frequency": return f.missedAll ? "a single missed week is easy to absorb; the next one is the one that counts"
      : "the missed sessions are easy to absorb if next week runs as usual";
    // Direction-neutral (a guardrail may be a ceiling or a floor), and
    // consistent with a keep-to-target step.
    case "guardrail_status": return f.status === "breached" ? "the priority now is getting back within range, and hitting the targets consistently is the way there"
      : `holding ${f.label} steady comes before anything else right now`;
    case "composition_result": return `the ${f.eventName} result is the thing to turn around`;
    case "intake_vs_plan": return "the food side is the lever this week";
    case "activity_change": return f.direction === "below" ? "activity is worth bringing back up" : null;
    case "visual_change": return "the photos need more time to show change";
    default: return null;
  }
}

// Praise only when nothing in the lead is a concern of risk strength or a
// break in training or routine; otherwise the read leads with the priority.
function takeawaySentence({ lead, synthesis, steps }) {
  // When the logged intake and the scale disagree, the priority is the log
  // itself — never "correcting" intake against the scale.
  const mismatch = steps.find((step) => step.mismatch);
  const priority = (item) => (mismatch && ["intake_vs_plan", "weight_trend"].includes(item.kind)
    ? "the scale and the food log don't agree yet, so the log is the first thing to check" : prioritiesPhrase(item));
  // No praise beside a risk or a problem with the goal's outcome or guardrail;
  // training performance may still be credited beside a routine slip.
  const serious = lead.some((item) => item.role === "risk" ||
    (["guardrail_status", "composition_result", "training_frequency"].includes(item.kind) && item.polarity === "concern"));
  const working = lead.map((item) => (item.polarity === "supportive" && !serious ? workingPhrase(item) : null)).filter(Boolean);
  // Priorities come only from real concerns; a neutral finding is not a problem.
  const priorities = [...new Set(lead.map((item) => (item.polarity === "concern" ? priority(item) : null)).filter(Boolean))];
  if (working.length && priorities.length) return `${upperFirst(working[0])}; ${priorities[0]}.`;
  if (priorities.length) return `${upperFirst(priorities[0])}${priorities[1] ? `, and ${priorities[1]}` : ""}.`;
  if (working.length > 1) return `${upperFirst(working[0])}, and ${working[1]}.`;
  if (working.length) return `${upperFirst(working[0])}, and that is the part to keep.`;
  return synthesis.selected.some((item) => item.polarity === "concern")
    ? "Nothing here needs a change yet; the next few weeks will say more."
    : "Nothing in this week calls for a different approach.";
}

function clauseFor(item, facts) {
  const f = item.facts ?? {};
  switch (item.kind) {
    case "training_progress":
      return f.milestoneCount >= 3 ? `training kept moving forward, with new bests on ${numberWord(f.milestoneCount)} lifts` :
        f.milestoneCount === 2 ? "training kept moving forward, with new bests on two lifts" : "training produced a new best";
    case "weight_trend":
      return weightClause(f);
    case "routine_break":
      return f.direction === "break"
        ? `the routine slipped ${positionPhrase(f.position)}`
        : `the week ran off its usual routine ${positionPhrase(f.position)}`;
    case "composition_result":
      return `${f.newThisPeriod ? "the new" : `the ${dateWords(f.measuredAt)}`} ${f.eventName} ${compositionPhrase(f)}`;
    case "visual_change":
      return { visible: "the new photos show a visible change", subtle: "the new photos show a subtle change",
        none: "the new photos look much like the last set" }[f.change] ?? null;
    case "guardrail_status":
      return f.status === "breached" ? `${f.label} is past its limit` : `${f.label} is close to its limit`;
    case "intake_vs_plan":
      return f.state === "on_plan" ? "intake stayed on target" : `intake ran ${/over|above/u.test(f.state) ? "above" : "below"} target`;
    case "activity_change":
      return f.direction === "below" ? `activity dropped off ${dayRange(f.dates)}` : `activity picked up ${dayRange(f.dates)}`;
    case "training_frequency":
      if (f.missedAll) return "no training sessions were logged this week";
      if (f.missedDates) return `training was missed ${dayRange(f.missedDates)}`;
      return f.direction === "below" ? "there were fewer training days than usual" : "there were more training days than usual";
    case "activity_on_plan":
      return "activity stayed where it usually is";
    case "routine_steady":
      return "the routine held";
    default:
      return null;
  }
}

// Goal-relative meaning: the standing outcome picture, what the scale can and
// cannot say about it for this goal's direction, and whether anything here
// changes the direction of the goal. One sentence, keyed on the goal's
// expected direction, the trend's verdict and the outcome's polarity — never
// a single goal's wording. It names the scale explicitly, since the scale's
// numbers may be told later in the briefing.
function implicationSentence({ synthesis, facts, goalLabel, lead }) {
  const composition = facts.composition;
  const risk = synthesis.selected.find((item) => item.role === "risk");
  const weight = synthesis.selected.find((item) => item.kind === "weight_trend");
  const compositionTold = lead.some((item) => item.domain === ROLES.outcome);
  const scan = composition && !compositionTold
    ? `The ${dateWords(composition.measuredAt)} ${composition.eventName} ${compositionPhrase(composition)}${facts.guardrail ? ` with ${facts.guardrail.label} at ${guardrailValue(facts)}` : ""}`
    : null;
  const next = composition ? `the next ${composition.eventName}` : null;
  // Stated after the standing result when it has not been told already, or
  // on its own when the recap just told it.
  const read = (withScan, alone) => (scan ? `${scan}${withScan}` : upperFirst(alone));
  const verdict = weight?.facts?.verdict;
  const movement = weight?.facts?.movement;
  const stableGoal = facts.direction === "stable";
  const fastWithGoal = ["rapid", "accelerating"].includes(verdict);
  if (!composition) {
    return risk ? `That is the part to keep an eye on for ${goalLabel}.` : `Nothing this week changes the direction of ${goalLabel}.`;
  }
  if (composition.polarity === "concern" || risk?.kind === "composition_result") {
    return read(`; the scale can't show whether ${composition.label} has turned back, and ${next} will.`,
      `the scale can't show whether ${composition.label} has turned back; ${next} will.`);
  }
  if (risk?.kind === "weight_trend") {
    // Too fast the goal's way strains the guardrail; the wrong way puts the
    // outcome itself in question. For maintenance, a fast climb strains the
    // guardrail and a fast drop the outcome.
    const question = stableGoal ? `whether ${movement === "up" && facts.guardrail ? facts.guardrail.label : composition.label} is holding`
      : fastWithGoal && facts.guardrail ? `whether ${facts.guardrail.label} is holding`
        : `whether ${composition.label} is still moving the right way`;
    return read(`; at this pace ${next} is what will show ${question}.`, `at this pace ${next} is what will show ${question}.`);
  }
  if (risk?.kind === "guardrail_status") {
    const question = risk.facts.status === "breached" ? `whether ${risk.facts.label} comes back inside its limit`
      : `where ${risk.facts.label} stands against its limit`;
    return read(`; ${next} will show ${question}.`, `${next} will show ${question}.`);
  }
  if (risk) return read(`; ${next} is the check that settles it.`, `${next} is the check that settles it.`);
  if (weight && stableGoal && verdict === "quick") {
    return read(`; ${next} will show whether ${composition.label} is holding at this pace.`,
      `${next} will show whether ${composition.label} is holding at this pace.`);
  }
  if (weight && stableGoal && verdict === "drifting") {
    // Names the movement only when the recap has not already said it.
    const moved = lead.some((item) => item.kind === "weight_trend") ? "" : `the scale has moved ${movement === "down" ? "down" : "up"}, and `;
    return read(`; ${moved}${next} will show whether ${composition.label} is holding.`,
      `${moved}${next} will show whether ${composition.label} is holding.`);
  }
  if (weight && !stableGoal && ["steady", "quick"].includes(verdict) && movement !== "flat") {
    // Refers back to the scale only when the recap just told it.
    const told = lead.some((item) => item.kind === "weight_trend");
    const change = told ? (movement === "up" ? "this gain" : "this drop") : (movement === "up" ? "any recent gain" : "any recent drop");
    return read(`; the scale alone can't say how much of ${change} is ${composition.label}, and ${next} will.`,
      `the scale alone can't say how much of ${change} is ${composition.label}; ${next} will.`);
  }
  if (weight && verdict === "flat") {
    return read(`; with the scale holding steady, ${next} will show whether ${composition.label} is still moving.`,
      `with the scale holding steady, ${next} will show whether ${composition.label} is still moving.`);
  }
  return read(", and that remains the picture to build on.", "that result remains the picture to build on.");
}

// ---- coaching: what to carry into execution — a supporting example, the
// second-tier findings the recap did not tell, and any limit on the picture;
// with nothing new to add, how to carry out the next step. Never the
// takeaway's priority or the action's step again.
function coachingSentences({ synthesis, lead, facts, steps, contract }) {
  const parts = [];
  const leadIds = new Set(lead.map((item) => item.id));
  const progress = synthesis.selected.find((item) => item.kind === "training_progress");
  // "Keep pushing" only when nothing about the goal's outcome or guardrail is
  // in question; otherwise the example is stated as it happened.
  const outcomeConcern = synthesis.selected.some((item) => item.role === "risk" ||
    (["composition_result", "guardrail_status"].includes(item.kind) && item.polarity === "concern"));
  if (progress?.facts?.example) {
    parts.push(outcomeConcern ? `${upperFirst(exampleClause(progress.facts.example))}.`
      : `Keep pushing the same lifts; ${exampleClause(progress.facts.example)}.`);
  }
  for (const item of synthesis.selected) {
    // The outcome measure is told by the meaning; never again here.
    if (leadIds.has(item.id) || item.kind === "training_progress" || item.domain === ROLES.outcome) continue;
    if (item.kind === "routine_break") {
      const prior = item.facts.recurrence?.priorSpans?.at(-1);
      const stretch = item.facts.direction === "break" ? "quiet" : "off-routine";
      const covered = steps.some((step) => step.source?.id === item.id);
      parts.push(`${upperFirst(clauseFor(item, facts))}${prior ? `, and a similar ${stretch} stretch came in ${monthPart(prior.startDate)}` : ""}${covered ? "" : "; the usual days and times are the easiest way back"}.`);
    } else if (item.kind === "weight_trend" && item.facts.verdict === "steady" && item.facts.movement !== "flat") {
      parts.push(`${upperFirst(clauseFor(item, facts))}, in the direction the goal wants.`);
    } else if (item.kind === "weight_trend" && item.facts.movement === "flat") {
      parts.push(facts.direction === "stable" ? "Your weight held steady, where a maintenance phase wants it."
        : "Your weight held steady; the next few weeks will show whether it starts to move.");
    } else if (item.kind === "intake_vs_plan" && item.polarity !== "supportive") {
      parts.push(`${upperFirst(clauseFor(item, facts))}; aim for the target most days rather than making up for it on one.`);
    } else {
      const clause = clauseFor(item, facts);
      if (clause) parts.push(`${upperFirst(clause)}.`);
    }
  }
  for (const item of synthesis.limitations) parts.push(limitationSentence(item));
  if (!parts.length) {
    // Nothing new to tell: how to carry out the step, or nothing at all
    // dressed up as something — a steady week stays short.
    const step = steps[0];
    parts.push(step ? step.focus ?? executionTip(step, facts)
      : facts.sparse ? "Logging a little more each day from here on will make the next check clearer."
        : synthesis.selected.every((item) => item.polarity !== "concern") ? "Keep logging the same way; it is what makes weeks like this easy to read."
        : "Nothing here needs a change yet.");
  }
  return parts.slice(0, contract.coaching?.maxSentences ?? 3).join(" ");
}

// How to carry out a step — never the step itself again.
function executionTip(step, facts) {
  const item = step.source;
  switch (item.kind) {
    case "weight_trend": return item.facts.movement === "up"
      ? "Steady days on the plan's numbers do more here than any big correction."
      : "Hitting the plan's numbers every day matters more here than any one big day.";
    case "training_frequency": case "routine_break":
      return /training/u.test(step.text) ? "Even a shorter session on a usual day counts."
        : "The usual days and times are the easiest way back.";
    case "composition_result": case "guardrail_status":
      return `Steady, ordinary days until the next ${facts.composition?.eventName ?? "check"} make its reading easier to trust.`;
    case "intake_vs_plan": return "Aim for the target most days rather than making up for it on one.";
    default: return "One adjustment this week is enough.";
  }
}

function exampleClause(example) {
  const label = example.subjectLabel;
  if (example.metric === "reps_at_load" && example.load != null && example.currentValue != null && example.previousValue != null) {
    return `${label} went from ${example.previousValue} to ${example.currentValue} reps at ${example.load} lb`;
  }
  if (["heaviest_load"].includes(example.metric) && example.currentValue != null && example.previousValue != null) {
    return `${label} moved up to ${example.currentValue} ${example.unit ?? "lb"} from ${example.previousValue}`;
  }
  if (example.relativeGain != null && example.relativeGain >= 0.1) {
    return `${label} did about ${Math.round(example.relativeGain * 100)}% more work than the session before`;
  }
  return `${label} set a new best`;
}

// Said like a coach, and prospective: the past days stay as they are (no
// retroactive-correction action exists for them); what helps is complete
// logging from here on. Patchy logging first; a copied day only when that is
// all there is.
function limitationSentence(item) {
  const byKind = item.facts?.datesByKind ?? {};
  const patchy = [...(byKind.implausible_macro_profile ?? []), ...(byKind.partial_day ?? [])].sort();
  if (patchy.length) {
    return `${dayRange(patchy)}${patchy.length === 1 ? "'s food log was" : "'s food logs were"} too patchy to read; complete logs from here on will make the next check clearer.`;
  }
  const copied = byKind.duplicate_day_totals ?? item.facts?.dates ?? [];
  return `${dayRange(copied)}'s food log looks copied from the day before; a fresh log each day from here on keeps the next check honest.`;
}

// The next steps (two when a risk needs its own), then the standing
// strategy. Each step records the insight it answers, so the coach take can
// point at the same thing. A weight risk's step follows the scale; an intake
// reading that points the other way from the scale is named as a mismatch to
// check, never "corrected" into pushing the scale further off course.
function planSteps(synthesis) {
  const selected = synthesis.selected;
  const risk = selected.some((item) => item.role === "risk");
  const routine = selected.find((item) => item.kind === "routine_break");
  const missedTraining = selected.find((item) => item.kind === "training_frequency" && item.facts.direction === "below");
  const intake = selected.find((item) => item.kind === "intake_vs_plan" && item.polarity !== "supportive");
  const intakeOnTarget = selected.find((item) => item.kind === "intake_vs_plan" && item.polarity === "supportive");
  const weight = selected.find((item) => item.kind === "weight_trend" &&
    ["rapid", "quick", "wrong_direction", "accelerating", "drifting"].includes(item.facts.verdict));
  const anyWeight = selected.find((item) => item.kind === "weight_trend" && item.facts.movement !== "flat");
  const weightRisk = weight?.role === "risk" ? weight : null;
  const outcomeRisk = selected.find((item) => item.role === "risk" && ["composition_result", "guardrail_status"].includes(item.kind));
  // Which way an intake correction would push the scale.
  const intakePush = intake ? (/under|below/u.test(intake.facts.state) ? "up" : "down") : null;
  // The logged intake and the scale disagree: intake said above target while
  // the scale moves too fast downward (or the mirror), or intake on target
  // while the scale falls the wrong way.
  const intakeContradictsScale = Boolean((intake && weight && intakePush === weight.facts.movement) ||
    (intakeOnTarget && weightRisk));
  const logCheck = { text: "make sure every meal gets logged", mismatch: true,
    focus: "Log meals as they happen rather than from memory at the end of the day." };
  const steps = [];
  if (intakeContradictsScale && weight) {
    steps.push({ source: weight, ...logCheck });
  } else if (weightRisk || (weight?.facts.verdict === "quick" && weight.polarity === "concern")) {
    const source = weightRisk ?? weight;
    steps.push({ source, text: source.facts.movement === "up" ? "keep intake at or below the plan's target"
        : "make sure intake reaches the plan's target" });
  } else if (outcomeRisk) {
    steps.push({ source: outcomeRisk, text: "keep intake at the plan's target and training on its usual rhythm" });
  }
  const trainingGap = (routine && routine.facts.missed?.some((gap) => gap.domain === "training")) || missedTraining;
  if (trainingGap && !outcomeRisk) steps.push({ source: missedTraining ?? routine, text: "get the usual training rhythm back" });
  // An intake step never pushes the scale further the way it is already
  // moving too fast, nor away from steady for a maintenance goal.
  const pushesScale = anyWeight && intakePush === anyWeight.facts.movement &&
    (anyWeight.facts.verdict !== "steady" || anyWeight.facts.expectedDirection === "stable");
  if (intake && !weightRisk && !outcomeRisk && !intakeContradictsScale && !pushesScale) {
    steps.push({ source: intake, text: intakePush === "up" ? "bring intake up to the plan's target"
      : "bring intake back down to the plan's target" });
  }
  if (routine && !trainingGap && !outcomeRisk) steps.push({ source: routine, text: "settle back into the usual routine" });
  return steps.slice(0, risk ? 2 : 1);
}

function actionSentence(synthesis, steps) {
  if (!steps.length) return "Keep the current setup in place.";
  // Beside a risk, say the rest stays; otherwise the step stands alone.
  const risk = synthesis.selected.some((item) => item.role === "risk");
  const tail = risk ? " The rest of the setup stays as it is." : "";
  return `${upperFirst(steps[0].text)}${steps[1] ? ` and ${steps[1].text}` : ""} this week.${tail}`;
}

// What decides next week, each item tied to the insight it discriminates.
function watchItems({ synthesis, facts }) {
  const items = [];
  const weight = synthesis.selected.find((item) => item.kind === "weight_trend") ?? facts.weightInsight;
  const routine = synthesis.selected.find((item) => item.kind === "routine_break");
  const outcomeRisk = synthesis.selected.find((item) => item.role === "risk" && ["composition_result", "guardrail_status"].includes(item.kind));
  // A trend the goal does not judge, or one lost in noise, is nothing to watch.
  const verdict = ["not_goal_relevant", "too_noisy"].includes(weight?.facts?.verdict) ? null : weight?.facts?.verdict;
  const movement = weight?.facts?.movement;
  // An outcome or guardrail risk's next check is posed by the meaning
  // already; the watch looks for what else will decide things.
  if (outcomeRisk && !facts.composition) {
    items.push({ source: outcomeRisk, text: `where ${outcomeRisk.facts.label} lands at the next check` });
  }
  if (verdict) {
    const text = ["quick", "rapid"].includes(verdict) && facts.direction === "stable"
      ? "whether the weekly weight average levels off"
      : verdict === "accelerating" ? "whether the weekly weight average settles back to its earlier pace"
        : ["quick", "rapid"].includes(verdict) && movement !== "flat"
          ? `whether the weekly weight average eases to a steadier ${movement === "down" ? "drop" : "climb"}`
          : verdict === "wrong_direction"
            ? `whether the weekly weight average turns back ${facts.direction === "down" ? "down" : "up"}`
            : "the weekly weight average";
    items.push({ source: weight, text });
  }
  const missedTraining = synthesis.selected.find((item) => item.kind === "training_frequency" && item.facts.direction === "below");
  if (missedTraining && !routine) items.push({ source: missedTraining, text: "whether the usual training days come back" });
  if (routine) {
    const training = routine.facts.missed?.find((gap) => gap.domain === "training")?.dates;
    const dates = training?.length ? training : routine.facts.affectedDates;
    items.push({ source: routine, text: training?.length
      ? `whether ${dayRange(dates)} ${dates.length === 1 ? "gets its" : "get their"} usual training back`
      : `whether the usual routine returns on ${dayRange(dates)}` });
  }
  // A limitation's forward guidance lives in What To Do ("from here on"); the
  // watch does not repeat it.
  return items.slice(0, synthesis.budget.watchDiscriminators ?? 1);
}

function watchSentence(items) {
  if (!items.length) return "Watch that the usual rhythm holds next week.";
  return items.length === 1 ? `Watch ${items[0].text}.` : `Watch ${items[0].text} and ${items[1].text}.`;
}

// Goal Confidence at goal level only: what sets the outlook, and whether this
// period's picture moves it. Never an exercise.
function confidenceSentence({ synthesis, facts }) {
  const holds = synthesis.relations?.confidence?.delta === 0;
  if (!holds || !facts.composition) return null;
  const risk = synthesis.selected.find((item) => item.role === "risk");
  // Exercise performance never sits beside the outlook: only goal-level
  // evidence (a canonically on-pace scale) may be said to fit it.
  const supportive = synthesis.selected.filter((item) => item.polarity === "supportive" && item.kind === "weight_trend");
  const disruption = synthesis.selected.find((item) => item.kind === "routine_break");
  const few = disruption?.facts?.direction === "break" ? "a short break in routine" : "a few off-routine days";
  const event = facts.composition.newThisPeriod ? `the new ${facts.composition.eventName}`
    : `the ${dateWords(facts.composition.measuredAt)} ${facts.composition.eventName}`;
  // When the risk is the outlook-setting result itself, say so once.
  // A guardrail reading comes from that same measurement, so it is part of
  // the level it set, not a separate pending signal.
  if (["composition_result", "guardrail_status"].includes(risk?.kind)) {
    return `Confidence holds at the level ${event} set, and nothing this week moves it either way.`;
  }
  const period = risk
    ? `${riskNoun(risk)} is worth watching but hasn't changed it yet`
    : supportive.length
      ? `this week's ${supportive.map((item) => item.kind === "training_progress" ? "training" : "weight trend").join(" and ")} ${supportive.length === 1 ? "fits" : "fit"} it${disruption ? `; ${few} ${disruption.facts.direction === "break" ? "isn't" : "aren't"} enough to change that` : ""}`
      : disruption ? `${few} ${disruption.facts.direction === "break" ? "isn't" : "aren't"} enough to change it` : "nothing this week changes it";
  const scan = facts.composition.newThisPeriod ? `${upperFirst(event)} sets` : `${upperFirst(event)} still sets`;
  return `Confidence holds. ${scan} the outlook, and ${period}.`;
}

function riskNoun(item) {
  if (item.kind === "weight_trend") {
    const rising = item.facts.movement === "up";
    if (item.facts.verdict === "accelerating") return `the pick-up in weight ${rising ? "gain" : "loss"}`;
    return item.facts.verdict === "rapid" ? `the fast ${rising ? "climb" : "drop"} in weight`
      : `the ${rising ? "rise" : "drop"} in weight`;
  }
  if (item.kind === "guardrail_status") {
    return item.facts.status === "breached" ? `${item.facts.label} past its limit` : `${item.facts.label} edging toward its limit`;
  }
  if (item.kind === "composition_result") return `the ${item.facts.eventName} result`;
  return "this week's change";
}

// Described, not judged: a pace is called fast only against a canonical
// expected range; otherwise the clause says what the scale did.
function weightClause(f) {
  const rate = Math.abs(Number(f.weeklyRate));
  const weeks = Math.round(Number(f.rateSpanDays ?? 28) / 7);
  const days = Number(f.rateSpanDays ?? 28);
  const span = days < 14 ? `over the last ${days} days` : `over the last ${numberWord(weeks)} weeks`;
  const pace = `about ${formatNumber(Math.round(rate * 10) / 10)} lb a week ${span}`;
  const rising = Number(f.weeklyRate) > 0;
  if (f.movement === "flat" && !["rapid", "quick", "drifting"].includes(f.verdict)) return "your weight held steady";
  switch (f.verdict) {
    case "steady": return `your weight has been ${rising ? "rising" : "falling"} ${pace}`;
    case "accelerating": return `your weight ${rising ? "gain" : "loss"} picked up to about ${formatNumber(Math.round(Math.abs(Number(f.recentPace)) * 10) / 10)} lb a week over the last two weeks`;
    case "drifting": return `your weight has moved ${rising ? "up" : "down"} ${pace}`;
    case "quick": return `your weight is ${rising ? "climbing" : "dropping"} a little faster than the pace the phase sets, ${pace}`;
    case "rapid": return `your weight is ${rising ? "climbing" : "dropping"} well faster than the pace the phase sets, ${pace}`;
    case "flat": return "your weight held steady";
    case "wrong_direction": return `your weight has been ${rising ? "creeping up" : "drifting down"} ${pace}`;
    default: return null;
  }
}

// ---------------------------------------------------------------- words

function pictureFacts(picture) {
  const domain = (name) => picture?.domains?.find((item) => item.domain === name);
  const composition = domain(ROLES.outcome);
  const guardrail = domain(ROLES.guardrail);
  return {
    composition: composition?.status === "assessed" ? { ...composition.facts, polarity: composition.polarity } : null,
    guardrail: guardrail?.status === "assessed" ? guardrail.facts : null,
    weightInsight: domain(ROLES.trajectory)?.insights?.[0] ?? null,
  };
}

function compositionPhrase(f) {
  const label = f.label ?? "the main measure";
  const change = Number(f.change);
  if (!Number.isFinite(change) || change === 0) return `showed ${label} holding`;
  return `showed ${label} ${change > 0 ? "up" : "down"} ${formatNumber(Math.abs(change))} ${f.unit ?? ""}`.trim();
}

function guardrailValue(facts) { return `${formatNumber(facts.guardrail.value)}${facts.guardrail.unit === "%" ? "%" : ` ${facts.guardrail.unit ?? ""}`}`; }

function positionPhrase(position) {
  return { late: "late in the week", early: "early in the week", middle: "midweek", whole: "for most of the week" }[position] ?? "this week";
}

function dayRange(dates) {
  const unique = [...new Set(dates ?? [])].sort();
  if (!unique.length) return "some days";
  const names = unique.map((date) => WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()]);
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  const consecutive = unique.every((date, index) => index === 0 ||
    Date.parse(`${date}T12:00:00Z`) - Date.parse(`${unique[index - 1]}T12:00:00Z`) === 86400000);
  return consecutive ? `${names[0]} through ${names.at(-1)}` : `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

function dateWords(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(String(date ?? ""));
  return match ? `${MONTHS[Number(match[2]) - 1]} ${Number(match[3])}` : "last";
}

function monthPart(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(String(date ?? ""));
  if (!match) return "an earlier week";
  const day = Number(match[3]);
  return `${day <= 10 ? "early" : day <= 20 ? "mid" : "late"} ${MONTHS[Number(match[2]) - 1]}`;
}

function formatNumber(value) {
  const number = Number(value);
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function numberWord(value) { return NUMBER_WORDS[value] ?? String(value); }
function lowerFirst(value) { return value ? `${value[0].toLocaleLowerCase("en-US")}${value.slice(1)}` : value; }
function upperFirst(value) { return value ? `${value[0].toLocaleUpperCase("en-US")}${value.slice(1)}` : value; }

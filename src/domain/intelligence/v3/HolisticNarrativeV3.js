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
import { ReviewModule, SectionRole, allocateSections, auditReview, auditSectionPlan, auditSectionTexts, leadInsights,
  resolveReviewContract, resolveSectionContract } from "../shared/BriefingSectionContracts.js";
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
export function goalFactsFromInterpretationV3({ interpretation, confidence, window, words = {}, observations = [] }) {
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
    visual: visualComparison(observations, window),
    outlook: confidence ? { percentage: confidence.currentPercentage, delta: confidence.delta,
      primaryObjectiveState: primary?.state ?? null } : null,
    strategy: interpretation?.recommendation ? { action: interpretation.recommendation.action } : null,
  };
}

// A qualitative photo comparison in the period: that the photos were
// compared, how many poses, and whether a comparable prior set existed. The
// canonical producer records observations, not an amount of change, so
// `change` stays null — the engine never invents one.
function visualComparison(observations, window) {
  // One day of tolerance past the window: an evening capture in a
  // westward time zone carries the next UTC date.
  const endTolerance = window ? new Date(Date.parse(`${window.endDate}T12:00:00Z`) + 86400000).toISOString().slice(0, 10) : null;
  const photos = (observations ?? []).filter((item) => item?.sourceType === "canonical_photo_observation" &&
    window && String(item.observedAt).slice(0, 10) <= endTolerance &&
    String(item.observedAt).slice(0, 10) >= window.startDate);
  const latest = photos.sort((left, right) => String(right.observedAt).localeCompare(String(left.observedAt)))[0];
  if (!latest) return null;
  const change = ["visible", "subtle", "none"].includes(latest.measurement?.metadata?.visualChange)
    ? latest.measurement.metadata.visualChange : null;
  const observed = String(latest.observedAt).slice(0, 10);
  return { available: true, capturedAt: observed > window.endDate ? window.endDate : observed, change,
    comparable: latest.quality?.status === "adequate", source: "canonical_photo_observation" };
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

// ---------------------------------------------------------------- briefings

// The insight kinds these realizers can phrase. Synthesis keeps any other
// kind out of the selection with a reason until a phrase for it exists here.
// Sleep (`sleep_below_usual`) is phrased only as recovery context in the recap
// or the coaching, plus a takeaway line saying it is not by itself a reason to
// change anything: it has no headline phrase and no step of its own, so it
// never leads a briefing or becomes a recommendation.
export const BRIEFING_REALIZABLE_KINDS = Object.freeze(new Set(["training_progress", "weight_trend", "routine_break",
  "composition_result", "guardrail_status", "intake_vs_plan", "activity_change", "training_frequency",
  "activity_on_plan", "routine_steady", "nutrition_unclear", "visual_change", "visual_comparison",
  "sleep_below_usual"]));
export const WEEKLY_REALIZABLE_KINDS = BRIEFING_REALIZABLE_KINDS;

// How each briefing type speaks about its own horizon. The intelligence and
// the section roles are shared; only the period's words differ.
const PERIOD_WORDS = Object.freeze({
  weekly: { noun: "week", this: "this week", thisPoss: "this week's", next: "next week", inThis: "in this week",
    logTip: "Keep logging the same way; that is what makes a week like this clear.", ahead: "next week",
    steady: "A steady week", strongTraining: "Strong training week", stepTail: "this week", leverWhen: "this week",
    usual: "This week held to its usual pattern.", midNoun: "midweek",
    positions: { late: "late in the week", early: "early in the week", middle: "midweek", whole: "for most of the week" },
    parts: { late: "the end of the week", early: "the start of the week", middle: "the middle of the week" } },
  midweek: { noun: "week", this: "so far this week", thisPoss: "this week's", next: "the rest of the week", inThis: "so far",
    logTip: "Keep logging the same way; it keeps the week clear.", ahead: "for the rest of the week",
    steady: "Steady so far", strongTraining: "Strong training so far", stepTail: "for the rest of the week",
    leverWhen: "for the rest of the week", usual: "The week so far is holding to its usual pattern.", midNoun: "stretch",
    recapLead: "So far this week, ", partial: true,
    positions: { late: "in the last day or two", early: "at the start of the week", middle: "midway through", whole: "most days" },
    parts: {} },
  monthly: { calendarDates: true, review: true, noun: "month", this: "this month", thisPoss: "this month's", next: "the coming month", inThis: "in this month",
    logTip: "Keep logging the same way; it keeps the picture clear.", ahead: "over the coming weeks",
    steady: "A steady month", strongTraining: "Strong training month", stepTail: "over the coming weeks",
    leverWhen: "over the coming weeks", usual: "This month held to its usual pattern.", midNoun: "mid-month",
    positions: { late: "late in the month", early: "early in the month", middle: "mid-month", whole: "for most of the month" },
    parts: { late: "the end of the month", early: "the start of the month", middle: "the middle of the month" } },
  outcomeCheck: { calendarDates: true, noun: "lead-up", this: "in the weeks before this check",
    logTip: "Keep logging the same way; it keeps the picture clear.", ahead: "over the next few weeks", thisPoss: "the lead-up's", next: "the next few weeks",
    inThis: "in the lead-up to this check", steady: "A steady lead-up", strongTraining: "Strong training before this check",
    stepTail: "over the next few weeks", leverWhen: "from here", usual: "The weeks before this check held to their usual pattern.",
    midNoun: "stretch", context: "in the weeks before this check", before: "before this check", outcomeLed: true,
    positions: { late: "just before this check", early: "early in the lead-up", middle: "midway through the lead-up",
      whole: "through most of the lead-up" }, parts: {} },
  visualCheck: { calendarDates: true, noun: "lead-up", this: "in the weeks before these photos",
    logTip: "Keep logging the same way; it keeps the picture clear.", ahead: "over the next few weeks", thisPoss: "the lead-up's", next: "the next few weeks",
    inThis: "in the lead-up to these photos", steady: "A steady lead-up", strongTraining: "Strong training before these photos",
    stepTail: "over the next few weeks", leverWhen: "from here", usual: "The weeks before these photos held to their usual pattern.",
    midNoun: "stretch", context: "in the weeks before these photos", before: "before these photos",
    positions: { late: "just before these photos", early: "early in the lead-up", middle: "midway through the lead-up",
      whole: "through most of the lead-up" }, parts: {} },
});

// The period words for the briefing being realized. Realization is
// synchronous and deterministic; the words are set for the duration of one
// call and restored afterwards.
let P = PERIOD_WORDS.weekly;

// A briefing written to its section contract (shared/BriefingSectionContracts):
// a short headline for what kind of period it was, an evidence-rich recap, the
// goal meaning, the coach's read, what to carry into execution, the next
// steps and what decides next. Each section consumes a different facet of the
// same synthesis, so the briefing progresses rather than repeating its top
// facts. The briefing type sets the horizon's words, the section list and the
// budgets; the intelligence is the same.
export function realizeHolisticBriefingV3({ cadence = "weekly", synthesis, picture, goalLabel, goalPolicy, goalProgress = null }) {
  if (!synthesis?.selected?.length) return null;
  const previous = P;
  P = periodWords(cadence, synthesis);
  try {
    return realize({ cadence, synthesis, picture, goalLabel, goalPolicy, goalProgress });
  } finally {
    P = previous;
  }
}

// Event briefings are keyed by what leads them (the goal's outcome measure,
// or a visual comparison), never by a scan or source name.
function periodWords(cadence, synthesis) {
  if (PERIOD_WORDS[cadence]) return PERIOD_WORDS[cadence];
  const lead = resolveSectionContract(cadence, synthesis)?.leadDomain;
  if (lead === ROLES.outcome) return PERIOD_WORDS.outcomeCheck;
  if (lead === ROLES.visual) return PERIOD_WORDS.visualCheck;
  return PERIOD_WORDS.weekly;
}

export function realizeHolisticWeeklyV3(args) {
  return realizeHolisticBriefingV3({ ...args, cadence: "weekly" });
}

function realize({ cadence, synthesis, picture, goalLabel, goalPolicy, goalProgress }) {
  const contract = resolveSectionContract(cadence, synthesis);
  const reviewContract = contract.review ? resolveReviewContract(cadence) : null;
  // A review is read after its period: it names the month rather than
  // calling it "this month" (restored with the rest of the period words).
  const bounds = periodBounds(picture?.window);
  if (reviewContract && bounds?.monthName) P = { ...P, this: `in ${bounds.monthName}`, inThis: `in ${bounds.monthName}` };
  const has = (role) => contract.sections.includes(role);
  const facts = { ...pictureFacts(picture), direction: goalPolicy?.weightExpectation?.direction ?? null,
    // Recovery counts as it always did (not assessed): Sleep is supporting
    // context and never changes how sparse the logged picture reads.
    sparse: (picture?.domains ?? []).filter((item) => item.domain === "recovery" ||
      ["insufficient", "unavailable"].includes(item.status)).length >= 4,
    goalProgress, event: Boolean(contract.leadDomain), leadDomain: contract.leadDomain ?? null,
    period: periodBounds(picture?.window),
    trainingDomain: picture?.domains?.find((item) => item.domain === "training")?.facts ?? null,
    nutritionDomain: picture?.domains?.find((item) => item.domain === "nutrition")?.facts ?? null };
  const lead = leadInsights(synthesis, contract);
  const steps = planSteps(synthesis);
  const discriminators = watchItems({ synthesis, facts });
  const { text: headline, ids: headlineIds } = headlineSentence(lead, facts, contract.headline);
  // A review opens with the period's character; its numbers live in the
  // domain modules below the opening.
  const recap = reviewContract ? openingSentence(lead, facts) : recapSentence(lead, facts);
  const implication = has(SectionRole.MEANING) ? implicationSentence({ synthesis, facts, goalLabel, lead }) : null;
  const baseTakeaway = takeawaySentence({ lead, synthesis, steps });
  // A partial window reads as a first read, never as a finished period.
  const takeaway = P.partial ? `Early days, but ${lowerFirst(baseTakeaway)}` : baseTakeaway;
  // In a review, execution detail lives in the domain modules; the coach's
  // take is the strategy synthesis of the whole period.
  const coachTake = reviewContract ? strategySentences({ synthesis, facts, steps, implication })
    : coachingSentences({ synthesis, lead, facts, steps, contract });
  const action = actionSentence(synthesis, steps);
  const watch = watchSentence(discriminators);
  const sectionPlan = allocateSections({ synthesis, contract, steps, discriminators });
  const confidenceBody = confidenceSentence({ synthesis, facts });
  const texts = { [SectionRole.HEADLINE]: headline, [SectionRole.RECAP]: recap, [SectionRole.MEANING]: implication,
    [SectionRole.CONFIDENCE]: confidenceBody,
    [SectionRole.TAKEAWAY]: takeaway, [SectionRole.COACHING]: coachTake, [SectionRole.ACTION]: action,
    [SectionRole.WATCH]: watch };
  const meaning = implication ? `${recap} ${implication}` : recap;
  const review = reviewContract ? realizeReview({ reviewContract, synthesis, picture, facts, steps, discriminators,
    opening: meaning, strategy: coachTake, confidenceBody }) : null;
  return {
    cadence, headline, result: takeaway, meaning, action, watch, coachTake,
    recap, implication,
    confidenceBody,
    ...(review ? { review } : {}),
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
  training_progress: (f) => (f.milestoneCount >= 2 ? P.strongTraining : "A new best in training"),
  // Only reached for a canonical-range steady trend (the only supportive one).
  weight_trend: (f) => (f.verdict !== "steady" ? null : f.movement === "flat" ? "Weight holding steady" : "Weight on the phase's pace"),
  // A review names the result, not the scan's novelty.
  composition_result: (f) => (P.review ? "Real measured progress" : `New ${f.eventName} shows progress`),
  routine_steady: () => P.steady,
  activity_on_plan: () => P.steady,
  intake_vs_plan: () => "Intake on target",
  visual_change: (f) => ({ visible: "New photos show visible change", subtle: "New photos show subtle change",
    none: "New photos, little visible change" }[f.change] ?? null),
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
      // Several stretches in a review period are told as such, not by the first one's position.
      if (P.review && (f.shifts?.length ?? 0) >= 2) return `${numberWord(f.shifts.length)} off-routine stretches`;
      // (headline character only)
      // A partial window or an event's lead-up has no "finish" of its own.
      const bounded = !P.partial && !P.context;
      const phrase = bounded ? { late: quiet ? "a quiet finish" : "an off-routine finish", early: quiet ? "a slow start" : "an off-routine start",
        middle: quiet ? `a quiet ${P.midNoun}` : `an off-routine ${P.midNoun}` }[f.position] : null;
      const fallback = quiet ? "a quiet stretch" : "an off-routine stretch";
      if (!phrase) return standalone ? `${upperFirst(fallback)} ${P.this}` : `${fallback} ${P.this}`;
      return standalone && ["late", "early"].includes(f.position) ? `${phrase} to the ${P.noun}` : phrase;
    }
    case "training_frequency": return f.missedAll ? `no training logged${standalone ? ` ${P.this}` : ""}` : "fewer sessions than usual";
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
  // An outcome-led briefing (an outcome check, a photo comparison) always
  // leads with the result it exists for; a concern joins it only if both fit.
  const outcome = facts.leadDomain ? lead.find((item) => item.domain === facts.leadDomain) : null;
  if (outcome) {
    const own = outcome.polarity === "concern" ? upperFirst(concernPhrase(outcome, true))
      : outcome.kind === "visual_comparison" ? (outcome.facts?.comparable ? "New photos, compared with the last set" : "New photos set a baseline")
        : LEAD_PHRASE[outcome.kind]?.(outcome.facts ?? {}) ?? null;
    const other = concerns.find((entry) => entry.item !== outcome);
    if (own && other) option(`${own}, but ${other.concern}.`, { item: outcome }, other);
    if (own) option(`${own}.`, { item: outcome });
  }
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
  // A photo comparison without a measured amount of change: say the photos
  // were compared, nothing more.
  const comparison = lead.find((item) => item.kind === "visual_comparison");
  if (comparison && !leads.length && !concerns.length) {
    options.push({ text: comparison.facts?.comparable ? "New photos, compared with the last set." : "New photos set a baseline.", ids: [comparison.id] });
  }
  options.push({ text: `${P.steady}.`, ids: [] });
  const fits = ({ text }) => text.split(/\s+/u).length <= budget.maxWords && text.length <= budget.maxChars && !/\d/u.test(text);
  return options.find(fits) ?? { text: `${P.steady}.`, ids: [] };
}

// ---- recap: what happened, with the concrete numbers.

function recapSentence(lead, facts) {
  const clauses = lead.map((item) => ({ item, text: clauseFor(item, facts) })).filter((entry) => entry.text);
  if (!clauses.length) return P.usual;
  // An event's outcome leads; what came before it is placed in the lead-up.
  const outcomeFirst = P.context && ["composition_result", "visual_change", "visual_comparison"].includes(clauses[0].item.kind);
  // Clauses that carry their own time (a stretch's dates, a measurement's own
  // "new" or date) are never re-placed in the lead-up.
  const dated = new Set(["routine_break", "activity_change", "training_frequency", "composition_result", "guardrail_status",
    "weight_trend"]);
  const texts = clauses.map((entry, index) => (outcomeFirst && index > 0 && !dated.has(entry.item.kind)
    ? `${P.context}, ${entry.text}` : entry.text));
  const joiner = (index) => (clauses[index - 1].item.polarity === "supportive" && clauses[index].item.polarity === "concern"
    ? ", but " : clauses.length > 2 && index === clauses.length - 1 ? ", and " : clauses.length > 2 ? ", " : ", and ");
  let body = texts[0];
  for (let index = 1; index < texts.length; index += 1) body += `${joiner(index)}${texts[index]}`;
  // "So far this week" places only what happened in the partial window; a
  // multi-week trend or a standing measurement carries its own time.
  const ownTime = new Set(["weight_trend", "guardrail_status", "composition_result"]);
  const recapLead = P.recapLead && !ownTime.has(clauses[0].item.kind) ? P.recapLead : null;
  const sentence = recapLead ? `${recapLead}${body}.` : `${upperFirst(body)}.`;
  const budget = HERO_BUDGET * (clauses.length > 2 ? 1.5 : 1);
  if (sentence.length <= budget) return sentence;
  return recapLead ? `${recapLead}${texts[0]}.` : `${upperFirst(texts[0])}.`;
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
  [ClaimScope.MEASUREMENT]: (f, kind) => (kind === "visual_change" ? `the photos show ${f.change === "visible" ? "a visible" : "a subtle"} change`
    : kind === "visual_comparison" ? null
      : P.outcomeLed && f.newThisPeriod ? "the measured result moves the goal forward"
        : P.review && f.measuredAt ? `the ${dateWords(f.measuredAt)} ${f.eventName} shows ${f.label} moving the right way`
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
      const part = P.parts[f.position] ?? "the usual weekly rhythm";
      // Across a month, a one-off stretch and a persistent one mean different things.
      if (P.review && (f.shifts?.length ?? 0) >= 2 && item.temporal !== "persistent") {
        return `${numberWord(f.shifts.length)} short off-routine stretches aren't a pattern yet, but they are the part to keep an eye on`;
      }
      if (item.temporal === "one_off") return `one ${f.direction === "break" ? "quiet" : "off-routine"} stretch in an otherwise steady ${P.noun} isn't a pattern`;
      if (item.temporal === "persistent") return `the routine was off for most of the ${P.noun}, so rebuilding it matters more than any single week`;
      if (f.direction !== "break") return prior ? `${part} is worth protecting; the routine has drifted like this before`
        : "an off-routine stretch like this is easy to reset";
      return prior ? `the part to protect is ${part}, where the routine has slipped before`
        : "a short slip like this is easy to recover from";
    }
    case "training_frequency":
      if (P.partial) return "there is still time to get the usual sessions in";
      return f.missedAll ? `a single missed ${P.noun} is easy to absorb; the next one is the one that counts`
        : `the missed sessions are easy to absorb if ${P.next} runs as usual`;
    // Direction-neutral (a guardrail may be a ceiling or a floor), and
    // consistent with a keep-to-target step.
    case "guardrail_status": return f.status === "breached" ? "the priority now is getting back within range, and hitting the targets consistently is the way there"
      : `holding ${f.label} steady comes before anything else right now`;
    case "composition_result": return `the ${f.eventName} result is the thing to turn around`;
    case "intake_vs_plan": return `the food side is the lever ${P.leverWhen}`;
    case "activity_change": return f.direction === "below" ? "activity is worth bringing back up" : null;
    case "visual_change": return "the photos need more time to show change";
    // Recovery context, never a step: noticed, not acted on by itself.
    case "sleep_below_usual": return "the shorter nights are worth keeping an eye on, but they are not a reason on their own to change the plan";
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
  // In a photo briefing a measurement beside the photos is corroborating
  // context the recap already told; the read does not restate it.
  const corroborating = (item) => P.context && !P.outcomeLed && claimScopeOf(item) === ClaimScope.MEASUREMENT;
  const working = lead.map((item) => (item.polarity === "supportive" && !serious && !corroborating(item)
    ? workingPhrase(item) : null)).filter(Boolean);
  // Priorities come only from real concerns; a neutral finding is not a problem.
  // In an event's lead-up, execution is context: priorities come only from
  // the outcome, the guardrail or a weight risk.
  const contextOnly = new Set(["routine_break", "activity_change", "training_frequency", "intake_vs_plan", "sleep_below_usual"]);
  const priorities = [...new Set(lead.map((item) => (item.polarity === "concern" && !(P.context && contextOnly.has(item.kind))
    ? priority(item) : null)).filter(Boolean))];
  // An event: the result, then where the lead-up sits — context for the
  // result, never a reason by itself to change course.
  const eventResult = lead.some((item) => [ROLES.outcome, ROLES.visual].includes(item.domain) && item.facts?.newThisPeriod);
  if (P.context && eventResult && working.length && !priorities.length) {
    const leadUp = lead.find((item) => contextOnly.has(item.kind) && item.polarity === "concern");
    const noun = leadUp ? { routine_break: leadUp.facts?.direction === "break" ? "quiet stretch" : "off-routine stretch",
      training_frequency: "missed sessions", intake_vs_plan: "intake miss", activity_change: "activity dip" }[leadUp.kind] : null;
    return noun ? `${upperFirst(working[0])}; the ${noun} ${P.before} is context, not a reason to change course.`
      : `${upperFirst(working[0])}, and nothing ${P.before} argues for changing course.`;
  }
  if (working.length && priorities.length) return `${upperFirst(working[0])}; ${priorities[0]}.`;
  if (priorities.length) return `${upperFirst(priorities[0])}${priorities[1] ? `; ${priorities[1]}` : ""}.`;
  if (working.length > 1) return `${upperFirst(working[0])}, and ${working[1]}.`;
  if (working.length) return `${upperFirst(working[0])}, and that is the part to keep.`;
  // An event's lead-up execution is context, not an open concern.
  return synthesis.selected.some((item) => item.polarity === "concern" && !(P.context && contextOnly.has(item.kind)))
    ? "Nothing here needs a change yet; the next few weeks will say more."
    : `Nothing ${P.inThis} calls for a different approach.`;
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
        : P.context ? `the routine ran off its usual pattern ${positionPhrase(f.position)}`
          : `the ${P.noun} ran off its usual routine ${positionPhrase(f.position)}`;
    case "composition_result":
      return `${f.newThisPeriod ? "the new" : `the ${dateWords(f.measuredAt)}`} ${f.eventName} ${compositionPhrase(f)}`;
    case "visual_change":
      return { visible: "the new photos show a visible change", subtle: "the new photos show a subtle change",
        none: "the new photos look much like the last set" }[f.change] ?? null;
    case "visual_comparison":
      return f.comparable ? "the new photos were compared pose by pose with the last comparable set"
        : "the new photos set a baseline for later comparisons";
    case "guardrail_status":
      return f.status === "breached" ? `${f.label} is past its limit` : `${f.label} is close to its limit`;
    case "intake_vs_plan":
      return f.state === "on_plan" ? "intake stayed on target" : `intake ran ${/over|above/u.test(f.state) ? "above" : "below"} target`;
    case "activity_change":
      return f.direction === "below" ? `activity dropped off ${dayRange(f.dates)}` : `activity picked up ${dayRange(f.dates)}`;
    case "training_frequency":
      if (f.missedAll) return `no training sessions were logged ${P.this}`;
      if (f.missedDates) return `training was missed ${dayRange(f.missedDates)}`;
      return f.direction === "below" ? "there were fewer training days than usual" : "there were more training days than usual";
    case "activity_on_plan":
      return "activity stayed where it usually is";
    case "routine_steady":
      return "the routine held";
    case "sleep_below_usual":
      return sleepClause(f);
    default:
      return null;
  }
}

// Sleep as recovery context: what the nights were against the person's own
// usual — never a cause, a diagnosis or a generic target. A usual built on only
// a few weeks of nights says so.
function sleepClause(f) {
  if (!Number.isFinite(f.shortNights) || !Number.isFinite(f.windowNights)) return null;
  const nights = f.shortNights === f.windowNights ? `on all ${numberWord(f.windowNights)} recorded nights`
    : `on ${numberWord(f.shortNights)} of ${numberWord(f.windowNights)} recorded nights`;
  const young = Number(f.priorNights) < 28 ? ", against a usual that is still only a few weeks old" : "";
  return `sleep ran shorter than your recent usual ${nights}${young}`;
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
  // An outcome-led briefing (an outcome check): the result was just told, so its meaning
  // is where it puts the goal, and where the guardrail stands.
  if (compositionTold && composition?.newThisPeriod && composition.polarity !== "concern" && !risk) {
    const guardrail = facts.guardrail ? `, with ${facts.guardrail.label} at ${guardrailValue(facts)}` : "";
    const progress = facts.goalProgress ? stripFinalPeriod(facts.goalProgress) : `That result sets the direction for ${goalLabel}`;
    return `${progress}${guardrail}.`;
  }
  // A review tells the standing measurement in its own module, not here.
  const ownModule = P.review && composition && (composition.newThisPeriod || composition.ageDays <= 45);
  const scan = composition && !compositionTold && !ownModule
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
    return risk ? `That is the part to keep an eye on for ${goalLabel}.` : `Nothing ${P.this} changes the direction of ${goalLabel}.`;
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
      // An event's lead-up gets no "way back" tip: it is context for the result,
      // so the only guidance looks ahead to the next comparison.
      const covered = steps.some((step) => step.source?.id === item.id);
      const tail = P.context ? "; the usual days and times from here keep the next comparison clean"
        : covered ? "" : "; the usual days and times are the easiest way back";
      parts.push(`${upperFirst(clauseFor(item, facts))}${prior ? `, and a similar ${stretch} stretch came in ${monthPart(prior.startDate)}` : ""}${tail}.`);
    } else if (item.kind === "weight_trend" && item.facts.verdict === "steady" && item.facts.movement !== "flat") {
      parts.push(`${upperFirst(clauseFor(item, facts))}, in the direction the goal wants.`);
    } else if (item.kind === "weight_trend" && item.facts.movement === "flat") {
      parts.push(facts.direction === "stable" ? "Your weight held steady, where a maintenance phase wants it."
        : "Your weight held steady; the next few weeks will show whether it starts to move.");
    } else if (item.kind === "intake_vs_plan" && item.polarity !== "supportive") {
      parts.push(`${upperFirst(clauseFor(item, facts))}; aim for the target most days rather than making up for it on one.`);
    } else {
      const clause = clauseFor(item, facts);
      // Placed in an event's lead-up when the clause carries no time of its own.
      if (clause) parts.push(P.context && !["activity_change", "training_frequency"].includes(item.kind)
        ? `${upperFirst(P.context)}, ${clause}.` : `${upperFirst(clause)}.`);
    }
  }
  for (const item of synthesis.limitations) parts.push(limitationSentence(item));
  if (!parts.length) {
    // Nothing new to tell: how to carry out the step, or nothing at all
    // dressed up as something — a steady week stays short.
    const step = steps[0];
    parts.push(step ? step.focus ?? executionTip(step, facts)
      : facts.sparse ? "Logging a little more each day from here on will make the next check clearer."
        : synthesis.selected.every((item) => item.polarity !== "concern") ? P.logTip
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
      return `Steady, ordinary days until the next ${facts.composition?.eventName ?? "check"} make its result easier to trust.`;
    case "intake_vs_plan": return "Aim for the target most days rather than making up for it on one.";
    default: return `One adjustment ${P.stepTail} is enough.`;
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
  const incomplete = [...(byKind.partial_day ?? []), ...(byKind.sparse_day ?? [])].sort();
  if (incomplete.length) {
    return `${dayRange(incomplete)}${incomplete.length === 1 ? "'s food log was" : "'s food logs were"} incomplete, so ${incomplete.length === 1 ? "it isn't" : "they aren't"} counted; complete logs from here on will make the next check clearer.`;
  }
  const reused = byKind.duplicate_source_evidence ?? item.facts?.dates ?? [];
  return `${dayRange(reused)}'s record repeats another day's screenshots, so it isn't counted; a separate record for each day from here on keeps the next check accurate.`;
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
  // An event's lead-up is context for the result, not a list of things to
  // redo: only risks produce steps there.
  const leadUp = Boolean(P.context);
  const trainingGap = !leadUp && ((routine && routine.facts.missed?.some((gap) => gap.domain === "training")) || missedTraining);
  if (trainingGap && !outcomeRisk) steps.push({ source: missedTraining ?? routine, text: "get the usual training rhythm back" });
  // An intake step never pushes the scale further the way it is already
  // moving too fast, nor away from steady for a maintenance goal.
  const pushesScale = anyWeight && intakePush === anyWeight.facts.movement &&
    (anyWeight.facts.verdict !== "steady" || anyWeight.facts.expectedDirection === "stable");
  if (intake && !leadUp && !weightRisk && !outcomeRisk && !intakeContradictsScale && !pushesScale) {
    steps.push({ source: intake, text: intakePush === "up" ? "bring intake up to the plan's target"
      : "bring intake back down to the plan's target" });
  }
  if (routine && !leadUp && !trainingGap && !outcomeRisk) steps.push({ source: routine, text: "settle back into the usual routine" });
  return steps.slice(0, risk ? 2 : 1);
}

function actionSentence(synthesis, steps) {
  if (!steps.length) return "Keep the current setup in place.";
  // Beside a risk, say the rest stays; otherwise the step stands alone.
  const risk = synthesis.selected.some((item) => item.role === "risk");
  const tail = risk ? " The rest of the setup stays as it is." : "";
  return `${upperFirst(steps[0].text)}${steps[1] ? ` and ${steps[1].text}` : ""} ${P.stepTail}.${tail}`;
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
  if (routine && (P.context || P.calendarDates || P.partial)) {
    // Days that have already passed are never something to "get back"
    // (an event's lead-up, a finished month, the start of this week):
    // watch the rhythm ahead.
    items.push({ source: routine, text: `whether the usual training rhythm holds ${P.ahead}` });
  } else if (routine) {
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
  if (!items.length) return `Watch that the usual rhythm holds ${P.ahead}.`;
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
  // A review names its measurement by date: "new" means little a month on.
  const event = facts.composition.newThisPeriod && !P.review ? `the new ${facts.composition.eventName}`
    : `the ${dateWords(facts.composition.measuredAt)} ${facts.composition.eventName}`;
  // When the risk is the outlook-setting result itself, say so once.
  // A guardrail reading comes from that same measurement, so it is part of
  // the level it set, not a separate pending signal.
  if (["composition_result", "guardrail_status"].includes(risk?.kind)) {
    return `Confidence holds at the level ${event} set, and nothing ${P.this} moves it either way.`;
  }
  const period = risk
    ? `${riskNoun(risk)} is worth watching but hasn't changed it yet`
    : supportive.length
      ? `${P.thisPoss} weight trend fits it${disruption ? `; ${few} ${disruption.facts.direction === "break" ? "isn't" : "aren't"} enough to change that` : ""}`
      : disruption ? `${few} ${disruption.facts.direction === "break" ? "isn't" : "aren't"} enough to change it` : `nothing ${P.this} changes it`;
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
  return `${P.thisPoss} change`;
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

// ---------------------------------------------------------------- review
//
// A review (the Monthly) opens like the other briefings, then gives the
// period editorial room: one module per job (shared/BriefingSectionContracts
// REVIEW_CONTRACTS), each written from the shared picture's own domain
// assessment and each rendered only when that assessment earns it. Every
// module records what earned it or why it was left out. The numbers live in
// the domain modules; the opening, the strategy and the Confidence line stay
// short and goal-level.

// The period's calendar bounds: a window that ends before its month does is a
// month-to-date read, and says so rather than implying the month is done.
function periodBounds(window) {
  if (!window?.startDate || !window?.endDate) return null;
  const [year, month] = window.startDate.split("-").map(Number);
  const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const days = Math.round((Date.parse(`${window.endDate}T12:00:00Z`) - Date.parse(`${window.startDate}T12:00:00Z`)) / 86400000) + 1;
  // Only a calendar month is named; any other span is "the month".
  const calendar = window.startDate.endsWith("-01") && window.endDate <= monthEnd;
  return { ...window, monthName: calendar ? MONTHS[month - 1] : null, nextMonth: calendar ? MONTHS[month % 12] : null,
    monthEnd: calendar ? monthEnd : window.endDate, days,
    toDate: calendar && window.endDate < monthEnd, remainingDays: calendar ? Math.round((Date.parse(`${monthEnd}T12:00:00Z`) -
      Date.parse(`${window.endDate}T12:00:00Z`)) / 86400000) : 0 };
}

// Opening: what defined the period, as character (no numbers), in one sentence.
function openingSentence(lead, facts) {
  const rank = { supportive: 0, neutral: 1, concern: 2 };
  const phrases = [...lead].sort((left, right) => (rank[left.polarity] ?? 1) - (rank[right.polarity] ?? 1))
    .map((item) => openingPhrase(item, facts)).filter(Boolean);
  const month = facts.period?.monthName ?? `The ${P.noun}`;
  // A month still running says what it has brought so far.
  if (facts.period?.toDate) {
    return phrases.length ? `So far, ${month} has brought ${listPhrase(phrases)}.` : `So far, ${month} has held to its usual pattern.`;
  }
  if (!phrases.length) return `${month} held to its usual pattern.`;
  return `${month} brought ${listPhrase(phrases)}.`;
}

function openingPhrase(item, facts) {
  const f = item.facts ?? {};
  const soFar = facts.period?.toDate ? " so far" : "";
  switch (item.kind) {
    case "composition_result": {
      const scan = `the ${dateWords(f.measuredAt)} ${f.eventName}`;
      if (item.polarity === "supportive") return `measured progress in ${f.label} on ${scan}`;
      if (item.polarity === "concern") return `${scan} showing ${f.label} going the wrong way`;
      return `${scan} with ${f.label} holding`;
    }
    case "training_progress": {
      if (f.milestoneCount <= 1) return "a new training best";
      const t = trainingFactsOf(item, facts);
      if (t && t.bestBlocks >= t.blocks) return "new training bests in every week";
      if (t && t.bestBlocks >= 2) return "new training bests across most of the month";
      return "one strong week of new training bests";
    }
    case "weight_trend":
      if (f.movement === "flat") return "a steady scale";
      if (item.polarity === "concern") return concernNoun(item);
      return f.movement === (facts.direction === "down" ? "down" : "up") ? `a steady ${f.movement === "up" ? "climb" : "drop"} on the scale`
        : `the scale moving ${f.movement}`;
    case "routine_break": {
      const count = f.shifts?.length ?? 1;
      if (item.temporal === "persistent") return "a routine that was off for much of the month";
      return count >= 2 ? `${numberWord(count)} short off-routine stretches` : "one short off-routine stretch";
    }
    case "training_frequency": return f.missedAll ? "no logged training"
      : f.direction === "below" ? "fewer training days than usual" : "more training days than usual";
    case "activity_change": return f.direction === "below" ? "a few days of lower activity" : "a few days of higher activity";
    case "intake_vs_plan": return f.state === "on_plan" ? "intake on target" : "intake off target";
    case "guardrail_status": return `${f.label} ${f.status === "breached" ? "past" : "near"} its limit`;
    case "visual_change": case "visual_comparison": return "new progress photos";
    default: return null;
  }
}

// Strategy: what the combined period means, whether it argues for a change
// (the recommendation's own call, said in plain words), and what it cannot
// settle. Number-free; the modules carry the numbers.
function strategySentences({ synthesis, facts, steps, implication = null }) {
  const selected = synthesis.selected;
  const outcome = selected.find((item) => item.kind === "composition_result" && item.facts?.newThisPeriod);
  const progress = selected.find((item) => item.kind === "training_progress");
  const routine = selected.find((item) => item.kind === "routine_break");
  const risk = selected.find((item) => item.role === "risk");
  const gains = [outcome?.polarity === "supportive" ? "the measured result moved the goal forward" : null,
    progress ? "training kept progressing" : null].filter(Boolean);
  const misses = routine ? (routine.temporal === "persistent" ? "the routine was off for much of the month, and that is the part to rebuild"
    : "the misses were short-lived rather than a slide") : null;
  const first = gains.length ? `Put together, ${listPhrase(gains)}${misses ? `; ${misses}` : ", and nothing in the month pulled against it"}.`
    : misses ? `${upperFirst(misses)}.` : `Put together, it was a quiet ${P.noun} on every front.`;
  // What to tighten comes from the steps and from readable-day intake
  // against the plan's own target — execution, never the strategy.
  const intakeOff = ["above_plan", "below_plan"].includes(facts.nutritionDomain?.readableIntakeState);
  const tighten = [steps.some((step) => /training|routine/u.test(step.text)) ? "keeping the usual sessions" : null,
    intakeOff ? "the daily calorie number" : null].filter(Boolean);
  const call = risk ? `The one thing to act on is ${riskFocus(risk)}; the rest of the setup stays as it is.`
    : tighten.length ? `Nothing in the month argues for changing the plan; what to tighten is execution: ${listPhrase(tighten)}.`
      : steps.length ? "Nothing in the month argues for changing the plan; what to tighten is execution, not strategy."
        : "Nothing in the month argues for changing the plan.";
  const weight = selected.find((item) => item.kind === "weight_trend" && item.facts?.movement !== "flat") ??
    (facts.weightInsight?.facts?.movement !== "flat" ? facts.weightInsight : null);
  // Said once: the opening's goal meaning may already have posed it.
  const posed = /can't (?:say|show) how much/u.test(implication ?? "");
  const open = facts.composition && weight && !posed
    ? `What the month can't settle is how much of the scale's ${weight.facts.movement === "up" ? "climb" : "drop"} is ${facts.composition.label}.` : null;
  const gaps = synthesis.limitations.some((item) => item.domain === "nutrition")
    ? "Intake is the least certain part of the picture, because some logged days couldn't be used." : null;
  return [first, call, open, gaps].filter(Boolean).join(" ");
}

function riskFocus(item) {
  if (item.kind === "weight_trend") return "the scale's pace";
  if (item.kind === "guardrail_status") return `${item.facts.label} against its limit`;
  if (item.kind === "composition_result") return "the measured result";
  return "the part that slipped";
}

function realizeReview({ reviewContract, synthesis, picture, facts, steps, discriminators, opening, confidenceBody }) {
  const domain = (name) => picture?.domains?.find((item) => item.domain === name) ?? null;
  const period = facts.period;
  const modules = [];
  const omitted = [];
  const add = (module) => modules.push(module);
  const skip = (role, reason) => omitted.push({ role, reason });
  add({ role: ReviewModule.OPENING, earnedBy: synthesis.selected.map((item) => item.id), paragraphs: [opening],
    highlights: openingHighlights({ picture, facts }) });
  const routineShifts = Array.isArray(domain("routine")?.facts?.shifts) ? domain("routine").facts.shifts : [];
  const training = trainingModule(domain("training"), period, facts, routineShifts);
  if (training) add(training); else skip(ReviewModule.TRAINING, domain("training")?.state ?? "unavailable");
  const energy = energyModule(domain("nutrition"), domain("activity"), period);
  if (energy) add(energy); else skip(ReviewModule.ENERGY, domain("nutrition")?.state ?? "unavailable");
  const trajectory = trajectoryModule(facts, domain(ROLES.trajectory), opening);
  if (trajectory) add(trajectory); else skip(ReviewModule.TRAJECTORY, facts.composition ? "no_current_measurement" : "no_composition_measurement");
  const changes = changesModule({ picture, facts, synthesis, trajectory, energy, reviewContract, opening });
  if (changes) add(changes); else skip(ReviewModule.CHANGES, "no_domain_to_judge");
  const moments = momentsModule({ picture, facts, period, reviewContract });
  if (moments) add(moments); else skip(ReviewModule.MOMENTS, "no_defining_dated_event");
  add(aheadModule({ synthesis, facts, steps, discriminators, period, energy, opening, picture }));
  const order = new Map(reviewContract.modules.map((role, index) => [role, index]));
  modules.sort((left, right) => order.get(left.role) - order.get(right.role));
  const review = { schemaVersion: "briefing_review_v2", cadence: reviewContract.cadence,
    period: period ? { startDate: period.startDate, endDate: period.endDate, monthEnd: period.monthEnd,
      toDate: period.toDate, remainingDays: period.remainingDays, monthName: period.monthName } : null,
    modules, omitted, confidence: confidenceBody ?? null };
  return { ...review, audit: auditReview(review, reviewContract, { claimSupport: claimSupport(synthesis) }) };
}

// What Changed: one thematic card per domain the month gives something to
// judge — how that evidence should now be read against the goal. Interpretive
// and number-free (the numbers live in the domain modules above it).
function changesModule({ picture, facts, synthesis, trajectory, energy, reviewContract, opening = "" }) {
  const domain = (name) => picture?.domains?.find((item) => item.domain === name) ?? null;
  const themes = [];
  const c = facts.composition;
  const training = domain("training");
  if (training?.status === "assessed" && (training.facts.milestoneCount || training.facts.trainingDays)) {
    const f = training.facts;
    themes.push({ tone: "training", title: "Training", earnedBy: `training|assessed:${training.state}`,
      value: f.milestoneCount >= 2 ? (f.bestBlocks >= 2 ? "Performance stayed the clearest indicator." : "Performance moved in one burst.")
        : f.milestoneCount === 1 ? "Performance produced one clear step." : "Training held its rhythm.",
      text: "Between checks, training is the earliest sign of progress: it shows the work moving forward, not what the body is made of." });
  }
  if (energy) {
    const state = energy.intakeState;
    const weight = domain(ROLES.trajectory)?.facts;
    const climbing = weight?.movement === "up";
    themes.push({ tone: "energy", title: "Calories", earnedBy: energy.earnedBy[0],
      value: state === "above_plan" ? "Intake ran ahead of the plan." : state === "below_plan" ? "Intake ran short of the plan."
        : state === "on_plan" && energy.lean ? `Intake leaned a little ${energy.lean} the plan.`
          : state === "on_plan" ? "Intake held to the plan." : "Logging set the limit on what calories can show.",
      text: [state === "above_plan" && climbing ? "With the scale already climbing, the calorie number is the one to tighten, not to raise."
        : state === "below_plan" && weight?.movement === "down" && facts.direction === "up" ? "With the scale drifting down, calories are the lever to raise."
          : state === "on_plan" && energy.lean ? `That is still inside the plan's range, but it is the direction to keep an eye on.`
            : state === "on_plan" ? "Holding the target is what lets the scale and the next measurement be judged cleanly." : null,
      energy.excludedDates?.length ? "A day that couldn't be used limits how sure that picture is." : null].filter(Boolean).join(" ") ||
        "Intake is judged against the plan's target, never against the wearable." });
  }
  const w = domain(ROLES.trajectory);
  if (w?.status === "assessed" && !["too_noisy", "not_goal_relevant"].includes(w.state)) {
    const f = w.facts;
    const moving = f.movement !== "flat";
    // The scale's own numbers live here (the measurement card is the scan's).
    const pace = moving && Number.isFinite(f.firstWeekAverage) && Number.isFinite(f.lastWeekAverage)
      ? ` The weekly average went from about ${formatNumber(Math.round(f.firstWeekAverage))} lb in the first week to about ${formatNumber(Math.round(f.lastWeekAverage))} lb in the latest, roughly ${formatNumber(Math.round(Math.abs(f.weeklyRate) * 10) / 10)} lb a week on the recent trend.`
      : moving && Number.isFinite(f.weeklyRate) ? ` The recent trend is roughly ${formatNumber(Math.round(Math.abs(f.weeklyRate) * 10) / 10)} lb a week.` : "";
    themes.push({ tone: "weight", title: "Weight", earnedBy: `${ROLES.trajectory}|assessed:${w.state}`,
      value: moving ? `The scale kept ${f.movement === "up" ? "climbing" : "dropping"}${f.expectedDirection === f.movement ? ", as the goal expects" : ""}.` : "The scale held steady.",
      // Said once: the opening's goal meaning may already have posed it.
      text: /can't (?:say|show) (?:how much|whether)|will show (?:whether|where)/u.test(opening)
        ? `Between scans it sets the pace${moving && f.expectedDirection === f.movement ? ", and that pace is in the goal's direction" : ""}; the verdict on what the weight is made of waits for ${c ? `the next ${c.eventName}` : "a body-composition measurement"}.${pace}`
        // The headline already said what the scale did; the story adds what it can't say.
        : `It can't tell ${c?.label ?? "what the weight is made of"}${c ? " apart from other weight" : ""}${c ? `; the next ${c.eventName} will` : ""}.${pace}` });
  }
  const routine = domain("routine");
  const shifts = Array.isArray(routine?.facts?.shifts) ? routine.facts.shifts : [];
  if (shifts.length) {
    const extent = new Set(shifts.flatMap((shift) => shift.affectedDates)).size;
    const days = facts.period?.days ?? extent;
    const persistent = extent >= days / 2;
    const activity = domain("activity");
    themes.push({ tone: "routine", title: "Routine", earnedBy: routine.insights[0]?.id ?? "routine|assessed",
      value: persistent ? "The routine was off for much of the month." : shifts.length >= 2 ? `${upperFirst(numberWord(shifts.length))} short stretches, not a pattern.` : "One short stretch, not a pattern.",
      text: persistent ? "That makes the schedule itself the first thing to rebuild."
        : `Together they cover ${numberWord(extent)} days; outside them the routine held${activity?.facts?.planState === "on_plan" ? ", and wearable activity stayed at its usual level" : ""}.`,
      persistence: persistent ? "persistent" : shifts.length >= 2 ? "recurring_short" : "one_off" });
  }
  // Recovery/Sleep earns a theme through its own assessor's insights.
  const recovery = domain("recovery");
  for (const item of recovery?.status === "assessed" ? recovery.insights ?? [] : []) {
    const clause = clauseFor(item, facts);
    if (clause) themes.push({ tone: "recovery", title: "Recovery", earnedBy: item.id, value: `${upperFirst(clause)}.`, text: "" });
  }
  const kept = themes.slice(0, reviewContract.maxThemes);
  if (!kept.length) return null;
  return { role: ReviewModule.CHANGES, earnedBy: kept.map((item) => item.earnedBy),
    items: kept.map(({ earnedBy: _earned, ...item }) => item) };
}

// Defining Moments: the month's genuinely defining dated events, chosen from
// the canonical evidence by weight (a new measurement, a routine stretch, the
// largest single step in training, new photos), then told in date order. A
// moment tells when and what happened; the numbers stay in their modules.
function momentsModule({ picture, facts, period, reviewContract }) {
  const domain = (name) => picture?.domains?.find((item) => item.domain === name) ?? null;
  const inWindow = (date) => period && date >= period.startDate && date <= period.endDate;
  const candidates = [];
  const c = facts.composition;
  if (c?.newThisPeriod && inWindow(c.measuredAt)) {
    candidates.push({ date: c.measuredAt, weight: 3, tone: "baseline", earnedBy: `${ROLES.outcome}|composition_result`,
      title: c.polarity === "concern" ? `A new ${c.eventName} flagged a setback` : c.polarity === "supportive" ? `A new ${c.eventName} measured progress` : `A new ${c.eventName} held steady`,
      text: `It became the reference point for the next scan${facts.guardrail ? `, with ${facts.guardrail.label} ${facts.guardrail.status === "clear" ? "inside its limit" : "near its limit"}` : ""}.` });
  }
  const routine = domain("routine");
  const shifts = Array.isArray(routine?.facts?.shifts) ? routine.facts.shifts : [];
  shifts.forEach((shift, index) => {
    const text = shiftSentence(shift, period);
    if (!text || !inWindow(shift.span.startDate)) return;
    candidates.push({ date: shift.span.startDate, weight: 1.5 + 0.2 * shift.extentDays, tone: "routine",
      earnedBy: shift.id,
      title: shift.reachesPeriodEnd ? "The latest off-routine stretch began" : index === 0 && shifts.length > 1 ? "The first off-routine stretch began" : "An off-routine stretch began",
      text });
  });
  const training = domain("training");
  const top = training?.status === "assessed" ? training.facts.milestones?.[0] : null;
  if (top?.observedAt && inWindow(String(top.observedAt).slice(0, 10))) {
    candidates.push({ date: String(top.observedAt).slice(0, 10), weight: 2, tone: "training", earnedBy: "training|training_progress",
      title: "The month's biggest single step in training", text: `${top.subjectLabel} made the largest jump of any lift.` });
  }
  const visual = domain(ROLES.visual);
  if (visual?.status === "assessed" && visual.facts?.newThisPeriod && inWindow(visual.facts.capturedAt)) {
    candidates.push({ date: visual.facts.capturedAt, weight: 1.8, tone: "photos", earnedBy: visual.insights?.[0]?.id ?? "visual_change|assessed",
      title: "New progress photos", text: `${upperFirst(clauseFor(visual.insights[0], facts) ?? "the new photos were taken")}.` });
  }
  const chosen = candidates.sort((left, right) => right.weight - left.weight || left.date.localeCompare(right.date))
    .slice(0, reviewContract.maxMoments).sort((left, right) => left.date.localeCompare(right.date) || left.title.localeCompare(right.title));
  if (!chosen.length) return null;
  return { role: ReviewModule.MOMENTS, earnedBy: chosen.map((item) => item.earnedBy),
    items: chosen.map(({ weight: _weight, earnedBy: _earned, ...item }) => item) };
}

function shiftSentence(shift, period) {
  const missedGroups = new Map();
  for (const member of shift.missed) {
    const key = member.dates.join(",");
    missedGroups.set(key, [...(missedGroups.get(key) ?? []), member]);
  }
  const parts = [...shift.higher.map((m) => [[m], "higher"]), ...shift.lower.map((m) => [[m], "lower"]),
    ...[...missedGroups.values()].map((members) => [members, "missed"])]
    .sort((left, right) => left[0][0].dates[0].localeCompare(right[0][0].dates[0]))
    .map(([members, kind]) => {
      if (kind === "missed") {
        const nouns = members.map((member) => MISSED_NOUN[member.domain]).filter(Boolean);
        return nouns.length ? `${listPhrase(nouns)} stopped ${dateList(members[0].dates)}` : null;
      }
      const words = SHIFT_WORDS[members[0].domain]?.[kind];
      return words ? `${words} ${dateList(members[0].dates)}` : null;
    }).filter(Boolean);
  if (!parts.length) return null;
  const open = shift.reachesPeriodEnd
    ? period?.toDate ? " It runs up to the latest complete day, so whether it has passed isn't known yet."
      : ` It ran to the end of the ${P.noun}, so the first days of ${period?.nextMonth ?? `the next ${P.noun}`} will show whether it has passed.`
    : "";
  return `${upperFirst(listPhrase(parts))}.${open}`;
}

function trainingFactsOf(item, facts) {
  return item?.domain === "training" ? facts.trainingDomain ?? null : null;
}

// At-a-glance data for the opening: one value per domain that earned the
// month's story. Data, not prose — the modules below explain each.
function openingHighlights({ picture, facts }) {
  const chips = [];
  const composition = facts.composition;
  if (composition && Number.isFinite(Number(composition.change)) && (composition.newThisPeriod || composition.ageDays <= 45)) {
    chips.push({ label: upperFirst(composition.label), value: `${Number(composition.change) > 0 ? "+" : ""}${formatNumber(composition.change)} ${composition.unit ?? ""}`.trim(),
      detail: `${dateWords(composition.measuredAt)} ${composition.eventName}${composition.comparisonAt ? `, since ${dateWords(composition.comparisonAt)}` : ""}`,
      icon: "baseline", tone: "evidence" });
  }
  const training = picture?.domains?.find((item) => item.domain === "training");
  if (training?.status === "assessed" && training.facts.milestoneCount) {
    chips.push({ label: "Training", value: `${training.facts.milestoneCount} new ${training.facts.milestoneCount === 1 ? "best" : "bests"}`,
      detail: `${training.facts.trainingDays} training days`, icon: "training", tone: "training" });
  }
  const weight = picture?.domains?.find((item) => item.domain === ROLES.trajectory);
  if (weight?.status === "assessed" && Number.isFinite(weight.facts.weeklyRate) && !["too_noisy", "not_goal_relevant"].includes(weight.state)) {
    const rate = Math.round(Math.abs(weight.facts.weeklyRate) * 10) / 10;
    chips.push({ label: "Scale weight", value: weight.facts.movement === "flat" ? "Steady" : `${weight.facts.weeklyRate > 0 ? "+" : "−"}${formatNumber(rate)} lb/week`,
      detail: `${weight.facts.rateSpanDays ?? 28}-day trend`, icon: "weight", tone: "primary" });
  }
  return chips.slice(0, 3);
}

function trainingModule(training, period, facts, shifts = []) {
  if (training?.status !== "assessed") return null;
  const f = training.facts;
  if (!f.trainingDays && !f.milestoneCount) return null;
  const soFar = period?.toDate ? " so far" : "";
  const through = period?.toDate ? ` through ${dateWords(period.endDate)}` : "";
  const everyWeek = f.bestBlocks >= f.blocks;
  const title = f.milestoneCount >= 2
    ? everyWeek ? `Progress ran through every week${soFar}.` : f.bestBlocks >= 2 ? "Progress was spread across the month."
      : "Most of the progress came in one strong week."
    : f.milestoneCount === 1 ? "One lift set a new best." : "Training kept its rhythm.";
  const paragraphs = [];
  if (f.milestoneCount >= 2) {
    const spread = everyWeek ? `they landed in every week${soFar} rather than in one good week`
      : f.bestBlocks >= 2 ? `they landed in ${numberWord(f.bestBlocks)} of the ${numberWord(f.blocks)} weeks rather than in one good week`
        : "they all came in the same week";
    paragraphs.push(`New bests came on ${f.milestoneCount} lifts${through}, and ${spread}.`);
  } else if (f.milestoneCount === 1) {
    paragraphs.push(`${upperFirst(exampleClause(f.milestones[0]))}.`);
  }
  if (f.trainingDays) {
    const usual = Number(f.usualTrainingDays);
    const rhythm = Number.isFinite(usual) && f.trainingDays < usual - 2 ? ", a few fewer than your usual rhythm"
      : Number.isFinite(usual) && f.trainingDays > usual + 2 ? ", more than your usual rhythm" : ", in line with your usual rhythm";
    const shiftDates = new Set(shifts.flatMap((shift) => shift.affectedDates));
    const inside = f.missedDates?.length && f.missedDates.every((date) => shiftDates.has(date));
    const missedNote = inside ? "; the missed days fall within the routine stretches below" : "";
    paragraphs.push(`There were ${f.trainingDays} training days${rhythm}${missedNote}.`);
  }
  // A steady rhythm with no finding is still the month's training record: the
  // domain's own assessment earns it.
  const earnedBy = training.insights.length ? training.insights.map((item) => item.id) : [`training|assessed:${training.state}`];
  return { role: ReviewModule.TRAINING, earnedBy, title, paragraphs,
    // What the pattern of progress means (persistence), not the goal's measure.
    interpretation: f.milestoneCount >= 2
      ? everyWeek || f.bestBlocks >= 2 ? `Progress that lands week after week reflects the program rather than one good session, so it is the pattern ${period?.nextMonth ?? "the coming month"} needs to keep.`
        : `Progress that lands in a single week can be one good stretch; ${period?.nextMonth ?? "the coming month"} needs to show it repeats.`
      : f.milestoneCount === 1 ? "One clear step is a start; repeating it is what turns it into a trend."
        : "A steady rhythm keeps the next measurement straightforward to compare.",
    stats: (f.milestones ?? []).slice(0, 3).map(statOf) };
}

function statOf(milestone) {
  const date = milestone.observedAt ? dateWords(String(milestone.observedAt).slice(0, 10)) : null;
  if (milestone.metric === "reps_at_load" && milestone.load != null) {
    return { label: milestone.subjectLabel, value: `${milestone.currentValue} reps at ${milestone.load} lb`,
      detail: [`up from ${milestone.previousValue} reps`, date].filter(Boolean).join(" · ") };
  }
  if (milestone.metric === "heaviest_load") {
    return { label: milestone.subjectLabel, value: `${milestone.currentValue} ${milestone.unit ?? "lb"}`,
      detail: [`up from ${milestone.previousValue} ${milestone.unit ?? "lb"}`, date].filter(Boolean).join(" · ") };
  }
  return { label: milestone.subjectLabel, value: milestone.relativeGain != null ? `+${Math.round(milestone.relativeGain * 100)}%` : "New best",
    detail: [milestone.relativeGain != null ? "more work than the session before" : null, date].filter(Boolean).join(" · ") };
}

function energyModule(nutrition, activity, period) {
  if (nutrition?.status !== "assessed" || (nutrition.facts.loggedDays ?? 0) < 7) return null;
  const f = nutrition.facts;
  const usable = f.reliableDays >= 7 && Number.isFinite(f.reliableIntakeAverage);
  // The plan-relative verdict is the shared picture's (usable days, V3 tolerance).
  const state = usable ? f.readableIntakeState : null;
  // Within the plan's tolerance, a clear lean either way is still said.
  const ratio = usable && f.intakeTarget ? f.reliableIntakeAverage / f.intakeTarget : null;
  const lean = state === "on_plan" && ratio != null ? (ratio >= 1.05 ? "above" : ratio <= 0.95 ? "below" : null) : null;
  const title = !state ? "Food was logged across the month."
    : state === "above_plan" ? "Intake ran above the plan's target."
      : state === "below_plan" ? "Intake ran below the plan's target."
        : lean ? `Intake ran a little ${lean} the plan's target.` : "Intake stayed close to the plan's target.";
  const days = period?.days ?? f.loggedDays;
  const logged = f.loggedDays >= days ? `all ${days} days` : `${f.loggedDays} of ${days} days`;
  const excluded = f.unreliableDates ?? [];
  // Excluded days are named once, with their reason, below.
  const counted = excluded.length === 0 ? ", and every day counts toward the averages" : "";
  const paragraphs = [`Food was logged on ${logged}${period?.toDate ? ` through ${dateWords(period.endDate)}` : ""}${counted}.`];
  if (usable) {
    const protein = Number.isFinite(f.reliableProteinAverage) ? `, and protein averaged around ${f.reliableProteinAverage} g${Number.isFinite(f.usualProtein) &&
      Math.abs(f.reliableProteinAverage - f.usualProtein) <= 0.08 * f.usualProtein ? ", close to your usual" : ""}` : "";
    paragraphs.push(`Intake averaged about ${thousands(Math.round(f.reliableIntakeAverage / 50) * 50)} calories${f.intakeTarget ? ` against a ${thousands(f.intakeTarget)} target` : ""}${protein}.`);
  }
  // Unusual days stay in the averages; a clear run of them is behavior worth saying.
  if ((f.lowProteinDates ?? []).length >= 2) {
    // Said only when true of those very days.
    const fedDays = (f.lowProteinIntakes ?? []).some((kcal) => Number.isFinite(kcal) && f.intakeTarget && kcal >= f.intakeTarget * 0.95);
    paragraphs.push(`Protein ran well below your usual on ${dateList(f.lowProteinDates)}${fedDays ? ", even on days when total intake was at or above target" : ""}.`);
  }
  for (const reason of exclusionReasons(f.exclusions ?? [])) paragraphs.push(reason);
  const wearable = activity?.facts?.measurement === "wearable_estimate";
  const earnedBy = nutrition.insights.length ? nutrition.insights.map((item) => item.id) : [`nutrition|assessed:${nutrition.state}`];
  return { role: ReviewModule.ENERGY, earnedBy, title, paragraphs, intakeState: state, lean, excludedDates: excluded,
    interpretation: wearable ? "Expenditure is a wearable estimate, so treat the weekly balance as a rough guide; the scale's trend gives a better sense of where intake sits against the work." : null };
}

// Why a day is left out, said plainly and only from completeness evidence.
function exclusionReasons(exclusions) {
  const byKind = (kind) => exclusions.filter((item) => item.kind === kind);
  const out = [];
  for (const item of byKind("duplicate_source_evidence")) {
    out.push(`${upperFirst(dateWords(item.date))}'s record repeats ${item.sameSourceAs ? `${dateWords(item.sameSourceAs)}'s` : "another day's"} screenshots, so it is left out of the averages.`);
  }
  const partial = byKind("partial_day").map((item) => item.date);
  if (partial.length) out.push(`${upperFirst(dateList(partial))} ${partial.length === 1 ? "was" : "were"} only partly logged, so ${partial.length === 1 ? "it is" : "they are"} left out of the averages.`);
  const sparse = byKind("sparse_day");
  const fewEntries = sparse.filter((item) => item.entries != null).map((item) => item.date);
  const partOfDay = sparse.filter((item) => item.entries == null).map((item) => item.date);
  if (fewEntries.length) out.push(`${upperFirst(dateList(fewEntries))} ${fewEntries.length === 1 ? "has" : "have"} too few entries to stand for a whole day, so ${fewEntries.length === 1 ? "it is" : "they are"} left out of the averages.`);
  if (partOfDay.length) out.push(`Only part of a usual day was recorded on ${dateList(partOfDay)}, so ${partOfDay.length === 1 ? "it is" : "they are"} left out of the averages.`);
  return out;
}

function trajectoryModule(facts, trajectory, opening = "") {
  const c = facts.composition;
  // Without a current measurement there is no New Baseline card; the scale is
  // judged in What Changed.
  if (!c || !(c.newThisPeriod || c.ageDays <= 45)) return null;
  const change = Number(c.change);
  const moved = Number.isFinite(change) && change !== 0 ? `${c.label} ${change > 0 ? "up" : "down"} ${formatNumber(Math.abs(change))} ${c.unit ?? ""}`.trim()
    : `${c.label} holding`;
  const guard = facts.guardrail ? { clear: `${facts.guardrail.label} stayed inside its limit`, watch: `${facts.guardrail.label} is close to its limit`,
    pressured: `${facts.guardrail.label} is pressing on its limit`, breached: `${facts.guardrail.label} is past its limit` }[facts.guardrail.status] ?? null : null;
  // Said once: an opening that already named the guardrail's state keeps it.
  const guardTold = facts.guardrail && new RegExp(`${facts.guardrail.label} (?:past|near) its limit`, "u").test(opening);
  const paragraphs = [`It measured ${moved}${c.comparisonAt ? ` since ${dateWords(c.comparisonAt)}` : ""}${guard && !guardTold ? `, and ${guard}` : ""}.`];
  const w = trajectory?.status === "assessed" ? trajectory.facts : null;
  return { role: ReviewModule.TRAJECTORY, earnedBy: [`${ROLES.outcome}|composition_result`, ...(w ? [`${ROLES.trajectory}|weight_trend`] : [])],
    title: c.newThisPeriod ? `The ${dateWords(c.measuredAt)} ${c.eventName} is the new reference point.` : `The ${dateWords(c.measuredAt)} ${c.eventName} still sets the reference point.`,
    paragraphs, interpretation: c.newThisPeriod ? `The next ${c.eventName} will be compared with this one.` : null,
    measuredAt: c.measuredAt, standing: !c.newThisPeriod,
    // The measurement's own values, as data for the card's metric grid.
    grid: [
      Number.isFinite(Number(c.currentValue)) ? { label: upperFirst(c.label), value: `${formatNumber(c.currentValue)} ${c.unit ?? ""}`.trim() } : null,
      facts.guardrail && Number.isFinite(Number(facts.guardrail.value)) ? { label: upperFirst(facts.guardrail.label), value: guardrailValue(facts) } : null,
    ].filter(Boolean) };
}

const MISSED_NOUN = { training: "training", body: "weigh-ins", nutrition: "food logging" };


const SHIFT_WORDS = {
  training: { missed: "training stopped", lower: "training ran light" },
  activity: { lower: "the wearable showed less activity", higher: "the wearable showed more activity" },
  nutrition: { higher: "calories ran above usual", lower: "calories ran below usual", missed: "food logging stopped" },
  body: { missed: "weigh-ins stopped" },
};



function aheadModule({ synthesis, facts, steps, discriminators, period, energy, opening, picture }) {
  const next = period?.nextMonth ?? `the coming ${P.noun}`;
  const domain = (name) => picture?.domains?.find((item) => item.domain === name) ?? null;
  // One priority card per domain, labelled by the domain it speaks for.
  const items = [];
  const routineStep = steps.find((step) => ["routine_break", "training_frequency"].includes(step.source?.kind));
  if (routineStep) items.push({ label: "Routine", tone: "routine", value: upperFirst(routineStep.text), text: monthTip(routineStep, facts) });
  if (synthesis.selected.some((item) => item.kind === "training_progress")) {
    items.push({ label: "Training", tone: "training", value: "Keep the progression going", text: "Build on the lifts that moved; repeating a best matters as much as beating it." });
  }
  // Calories: readable-day intake off the plan's target, unless the scale is
  // already moving against the goal the other way (then the log is checked
  // first); and complete logging when unreadable days limited the month.
  const weightNow = facts.weightInsight?.facts;
  const againstScale = energy?.intakeState === "above_plan" ? weightNow?.movement === "down" && facts.direction !== "down"
    : energy?.intakeState === "below_plan" ? weightNow?.movement === "up" && facts.direction !== "up" : false;
  const intakeStep = steps.find((step) => step.source?.kind === "intake_vs_plan" || step.mismatch);
  const offTarget = ["above_plan", "below_plan"].includes(energy?.intakeState) && !againstScale;
  const unreadable = synthesis.limitations.some((item) => item.domain === "nutrition") && energy;
  if (intakeStep || offTarget || unreadable) {
    // The logging advice answers the actual reason a day couldn't be used.
    const kinds = new Set((domain("nutrition")?.facts?.exclusions ?? []).map((item) => item.kind));
    const reusedOnly = kinds.size > 0 && [...kinds].every((kind) => kind === "duplicate_source_evidence");
    const value = intakeStep ? upperFirst(intakeStep.text)
      : offTarget ? `Bring intake ${energy.intakeState === "above_plan" ? "back down" : "up"} to the target`
        : reusedOnly ? "Keep one record per day" : "Log complete days";
    const text = [intakeStep ? monthTip(intakeStep, facts) : offTarget ? "Hit the target on most days rather than making up for it on one." : null,
      unreadable ? (reusedOnly ? `A separate record for each day keeps ${next}'s intake accurate.` : `A complete log every day makes intake the easiest part of ${next} to judge.`) : null]
      .filter(Boolean).join(" ");
    items.push({ label: "Calories", tone: "energy", value, text });
  }
  const watch = discriminators.find((item) => item.source?.kind === "weight_trend");
  const weightStep = steps.find((step) => step.source?.kind === "weight_trend" && !step.mismatch);
  if (watch || weightStep) {
    items.push({ label: "Weight", tone: "weight", value: weightStep ? upperFirst(weightStep.text) : `Watch ${watch.text}`,
      text: weightStep ? monthTip(weightStep, facts) : "One weigh-in never tells the trend; the weekly average does." });
  }
  // Photos earn a card when the goal reads visual evidence: new photos, or
  // none this month to keep the visual check going.
  const visual = domain(ROLES.visual);
  if (visual) {
    items.push({ label: "Photos", tone: "photos", value: visual.facts?.newThisPeriod ? "Keep the same setup" : "Take a progress set",
      text: visual.facts?.newThisPeriod ? "The same poses and light keep the next comparison fair."
        : `No photo comparison landed ${P.inThis}; a set on schedule keeps the visual check going.` });
  }
  const c = facts.composition;
  if (c) {
    // When the opening already posed the next check's question, point back to it.
    const posed = new RegExp(`next ${c.eventName}`, "u").test(opening ?? "");
    const named = new RegExp(`\\b${c.eventName}\\b`, "u").test(opening ?? "");
    // The measurement card above already told what it measured.
    const told = c.newThisPeriod || c.ageDays <= 45;
    items.push({ label: c.eventName, tone: "baseline", value: `Use the next ${c.eventName === "check" ? "check" : "scan"}`,
      text: posed ? "It is the check that settles the question above." : named || told ? "It is the next direct measurement of the goal."
        : `It measures what the scale can't: ${c.label}${facts.guardrail ? `, and ${facts.guardrail.label} against its limit` : ""}.` });
  }
  // The close: the strategy call, then the coming period's job.
  const risk = synthesis.selected.find((item) => item.role === "risk");
  const riskNamed = risk && riskFocus(risk).split(/\s+/u).filter((word) => word.length > 3).some((word) => (opening ?? "").includes(word));
  const call = risk ? (riskNamed ? "That risk comes first; the rest of the setup stays as it is." : `The one thing to act on is ${riskFocus(risk)}.`)
    : /changes the direction/u.test(opening ?? "") ? "The plan stays as it is."
      : `Nothing in ${period?.monthName ?? `the ${P.noun}`} argues for changing the plan.`;
  const job = steps.length || offTarget ? `${upperFirst(next)}'s job is to keep the progress going on a steadier rhythm${offTarget ? " and a tighter calorie number" : ""}.`
    : `${upperFirst(next)}'s job is to keep doing what is already moving the goal.`;
  return { role: ReviewModule.AHEAD, earnedBy: [...steps.map((step) => step.source?.id), ...discriminators.map((item) => item.source?.id)].filter(Boolean).length
    ? [...steps.map((step) => step.source?.id), ...discriminators.map((item) => item.source?.id)].filter(Boolean) : ["recommendation"],
  title: `${upperFirst(next)} ahead`, paragraphs: [`${call} ${job}`], items };
}

// How to carry a step across a month (the Weekly's tips are day-scale).
function monthTip(step, facts) {
  if (step.mismatch) return "Logging meals as they happen, every day of the month ahead, gives the next check clean numbers.";
  switch (step.source?.kind) {
    case "weight_trend": return "A month of steady days on the plan's numbers does more than any single correction.";
    case "training_frequency": case "routine_break": return "Protecting the usual training days matters more than any single big week.";
    case "composition_result": case "guardrail_status":
      return `Steady, ordinary weeks until the next ${facts.composition?.eventName ?? "check"} make its result easier to trust.`;
    case "intake_vs_plan": return "Hitting the target on most days across the month counts for more than any single day.";
    default: return "One adjustment, held for the month, is enough.";
  }
}

function listPhrase(parts) {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return parts.some((part) => / and /u.test(part)) ? `${parts[0]}, and ${parts[1]}` : `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`;
}

// Calendar dates, runs compressed: "September 6, September 22, and September 24 through 26".
function dateList(dates) {
  const unique = [...new Set(dates ?? [])].sort();
  const runs = [];
  for (const date of unique) {
    const last = runs.at(-1);
    if (last && Date.parse(`${date}T12:00:00Z`) - Date.parse(`${last.at(-1)}T12:00:00Z`) === 86400000) last.push(date);
    else runs.push([date]);
  }
  const words = runs.map((run) => {
    if (run.length === 1) return dateWords(run[0]);
    const sameMonth = run[0].slice(0, 7) === run.at(-1).slice(0, 7);
    const end = sameMonth ? String(Number(run.at(-1).slice(8))) : dateWords(run.at(-1));
    return run.length === 2 ? `${dateWords(run[0])} and ${sameMonth ? end : dateWords(run[1])}` : `${dateWords(run[0])} through ${end}`;
  });
  return listPhrase(words);
}

function thousands(value) { return Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 }); }

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
  return P.positions[position] ?? P.this;
}

function dayRange(dates) {
  const unique = [...new Set(dates ?? [])].sort();
  if (!unique.length) return "some days";
  // Weekdays name days within a week; a month or an event's lead-up needs
  // calendar dates.
  const names = unique.map((date) => (P.calendarDates ? dateWords(date) : WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()]));
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
function stripFinalPeriod(value) { return String(value ?? "").replace(/[.!]\s*$/u, ""); }
function upperFirst(value) { return value ? `${value[0].toLocaleUpperCase("en-US")}${value.slice(1)}` : value; }

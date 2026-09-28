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

export function realizeHolisticWeeklyV3({ synthesis, picture, goalLabel, goalPolicy }) {
  if (!synthesis?.selected?.length) return null;
  const facts = pictureFacts(picture);
  const hero = heroInsights(synthesis);
  const told = new Set(hero.map((item) => item.id));
  const result = heroSentence(hero, facts);
  const meaning = meaningSentence({ synthesis, facts, goalLabel });
  const coachTake = coachSentences({ synthesis, told, facts });
  const action = actionSentence(synthesis);
  const watch = watchSentence({ synthesis, facts, goalPolicy });
  return {
    result, meaning, action, watch, coachTake,
    confidenceBody: confidenceSentence({ synthesis, facts }),
    heroIds: hero.map((item) => item.id),
    selectedIds: synthesis.selected.map((item) => item.id),
    limitationIds: synthesis.limitations.map((item) => item.id),
  };
}

function heroInsights(synthesis) {
  const count = synthesis.budget.heroInsights ?? 2;
  const selected = synthesis.selected;
  const supportive = selected.filter((item) => item.polarity === "supportive");
  const concern = selected.filter((item) => item.polarity !== "supportive");
  // Lead with what moved the goal forward, then what held it back — the
  // complementary pair, not the two strongest of one kind.
  const picked = [supportive[0], concern[0]].filter(Boolean);
  for (const item of selected) if (picked.length < count && !picked.includes(item)) picked.push(item);
  return picked.slice(0, count);
}

function heroSentence(hero, facts) {
  const clauses = hero.map((item) => ({ item, text: clauseFor(item, facts) })).filter((entry) => entry.text);
  if (!clauses.length) return "This week kept the plan on track.";
  const [first, second] = clauses;
  const joined = !second ? upperFirst(first.text) :
    first.item.polarity === "supportive" && second.item.polarity !== "supportive"
      ? `${upperFirst(first.text)}, but ${second.text}` : `${upperFirst(first.text)}, and ${second.text}`;
  const sentence = `${joined}.`;
  return sentence.length <= HERO_BUDGET ? sentence : `${upperFirst(first.text)}.`;
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
      return `the new ${f.eventName} ${compositionPhrase(f)}`;
    case "guardrail_status":
      return `${f.label} is closer to its limit than it should be`;
    case "intake_vs_plan":
      return f.state === "on_plan" ? "intake stayed on plan" : `intake ran ${/over|above/u.test(f.state) ? "above" : "below"} plan`;
    case "activity_change":
      return f.direction === "below" ? `activity dropped off ${dayRange(f.dates)}` : `activity picked up ${dayRange(f.dates)}`;
    case "training_frequency":
      return f.direction === "below" ? "there were fewer training days than usual" : "there were more training days than usual";
    case "activity_on_plan":
      return "activity stayed where it usually is";
    case "routine_steady":
      return "the routine held";
    default:
      return null;
  }
}

// Goal-relative meaning: the standing body-composition picture, what this
// week's scale trend can and cannot say about it, and whether anything here
// changes the direction of the goal. Two sentences at most.
function meaningSentence({ synthesis, facts, goalLabel }) {
  const composition = facts.composition;
  const risk = synthesis.selected.find((item) => item.role === "risk");
  const weight = synthesis.selected.find((item) => item.kind === "weight_trend");
  const routine = synthesis.selected.find((item) => item.kind === "routine_break");
  const scan = composition
    ? `The ${dateWords(composition.measuredAt)} ${composition.eventName} ${compositionPhrase(composition)}${facts.guardrail ? ` with ${facts.guardrail.label} at ${guardrailValue(facts)}` : ""}`
    : null;
  let first;
  if (scan && weight && !risk && weight.facts.verdict === "quick") {
    first = `${scan}, so some gain on the scale is expected; the next ${composition.eventName} will show how much of it is ${composition.label}.`;
  } else if (scan && weight && !risk) {
    first = `${scan}, so a rising scale fits the plan; the next ${composition.eventName} will show how much of it is ${composition.label}.`;
  } else if (scan && risk) {
    first = `${scan}; at this pace the next ${composition.eventName} is what will show whether ${facts.guardrail?.label ?? "the limit"} is holding.`;
  } else if (scan) {
    first = `${scan}, and nothing this week points away from that.`;
  } else {
    first = risk ? `That is the part to keep an eye on for ${goalLabel}.` : `Nothing this week changes the direction of ${goalLabel}.`;
  }
  const days = routine?.facts?.span?.days;
  const second = routine && !risk ? `${upperFirst(numberWord(days ?? 2))} quiet ${days === 1 ? "day doesn't" : "days don't"} change that.` : null;
  return [first, second].filter(Boolean).join(" ");
}

function coachSentences({ synthesis, told, facts }) {
  const parts = [];
  const progress = synthesis.selected.find((item) => item.kind === "training_progress");
  if (progress?.facts?.example) parts.push(milestoneSentence(progress.facts.example));
  for (const item of synthesis.selected) {
    if (item.kind === "training_progress") continue;
    if (item.kind === "routine_break") {
      const prior = item.facts.recurrence?.priorSpans?.at(-1);
      parts.push(prior
        ? `The quiet stretch looks a lot like ${monthPart(prior.startDate)}; the useful move is simply to pick the rhythm back up.`
        : "Nothing about a few quiet days needs fixing; just pick the rhythm back up.");
    } else if (!told.has(item.id)) {
      const clause = clauseFor(item, facts);
      if (clause) parts.push(`${upperFirst(clause)}.`);
    }
  }
  for (const item of synthesis.limitations) parts.push(limitationSentence(item));
  if (!parts.length) parts.push("Keep doing what has been working.");
  return parts.slice(0, 3).join(" ");
}

function milestoneSentence(example) {
  const label = example.subjectLabel;
  if (example.metric === "reps_at_load" && example.load != null && example.currentValue != null && example.previousValue != null) {
    return `${label} stood out: ${example.previousValue} to ${example.currentValue} reps at ${example.load} lb.`;
  }
  if (["heaviest_load"].includes(example.metric) && example.currentValue != null && example.previousValue != null) {
    return `${label} stood out, up to ${example.currentValue} ${example.unit ?? "lb"} from ${example.previousValue}.`;
  }
  if (example.relativeGain != null && example.relativeGain >= 0.1) {
    return `${label} stood out, about ${Math.round(example.relativeGain * 100)}% more work than the session before.`;
  }
  return `${label} set a new best.`;
}

// Said like a coach, about the days that actually limit the picture: patchy
// logging first; a copied day only when that is all there is.
function limitationSentence(item) {
  const byKind = item.facts?.datesByKind ?? {};
  const patchy = [...(byKind.implausible_macro_profile ?? []), ...(byKind.partial_day ?? [])].sort();
  if (patchy.length) {
    return `Food logging ${patchy.length === 1 ? `on ${dayRange(patchy)} is` : `for ${dayRange(patchy)} is`} too patchy to read, so ${patchy.length === 1 ? "that day isn't" : "those days aren't"} part of this picture.`;
  }
  const copied = byKind.duplicate_day_totals ?? item.facts?.dates ?? [];
  return `${dayRange(copied)}'s food log looks copied from the day before, so it isn't counted here.`;
}

function actionSentence(synthesis) {
  const keep = "Keep the current setup in place.";
  const routine = synthesis.selected.find((item) => item.kind === "routine_break");
  const intake = synthesis.selected.find((item) => item.kind === "intake_vs_plan" && item.polarity !== "supportive");
  const weightFast = synthesis.selected.find((item) => item.kind === "weight_trend" && item.facts.verdict === "too_fast");
  if (routine && routine.facts.missed?.some((gap) => gap.domain === "training")) {
    return `Get the usual training rhythm back this week. ${keep}`;
  }
  if (intake || weightFast) return `Keep intake on plan this week. ${keep}`;
  if (routine) return `Settle back into the usual routine this week. ${keep}`;
  return `${keep}`;
}

function watchSentence({ synthesis, facts, goalPolicy }) {
  const items = [];
  const weight = synthesis.selected.find((item) => item.kind === "weight_trend") ?? facts.weightInsight;
  const routine = synthesis.selected.find((item) => item.kind === "routine_break");
  const limitation = synthesis.limitations[0];
  const direction = goalPolicy?.weightExpectation?.direction;
  if (weight?.facts?.verdict && ["quick", "rapid"].includes(weight.facts.verdict)) {
    items.push(direction === "down" ? "whether the weekly weight average eases to a steadier drop"
      : "whether the weekly weight average eases to a steadier climb");
  } else if (weight?.facts?.verdict) {
    items.push("the weekly weight average");
  }
  if (routine) items.push("whether next weekend keeps its usual training");
  if (limitation) items.push("whether food logging fills back in");
  const budget = synthesis.budget.watchDiscriminators ?? 1;
  const chosen = items.slice(0, budget);
  if (!chosen.length) return "Watch that the usual rhythm holds next week.";
  return chosen.length === 1 ? `Watch ${chosen[0]}.` : `Watch ${chosen[0]} and ${chosen[1]}.`;
}

// Goal Confidence at goal level only: what sets the outlook, and whether this
// period's picture moves it. Never an exercise.
function confidenceSentence({ synthesis, facts }) {
  const holds = synthesis.relations?.confidence?.delta === 0;
  if (!holds || !facts.composition) return null;
  const risk = synthesis.selected.find((item) => item.role === "risk");
  const supportive = synthesis.selected.filter((item) => item.polarity === "supportive" &&
    ["training_progress", "weight_trend"].includes(item.kind));
  const disruption = synthesis.selected.find((item) => item.kind === "routine_break");
  const period = risk
    ? `${riskNoun(risk)} is worth watching but hasn't changed it yet`
    : supportive.length
      ? `this week's ${supportive.map((item) => item.kind === "training_progress" ? "training" : "weight trend").join(" and ")} ${supportive.length === 1 ? "fits" : "fit"} it${disruption ? "; a few quiet days aren't enough to change that" : ""}`
      : disruption ? "a few quiet days aren't enough to change it" : "nothing this week changes it";
  return `Confidence holds. The ${dateWords(facts.composition.measuredAt)} ${facts.composition.eventName} still sets the outlook, and ${period}.`;
}

function riskNoun(item) {
  if (item.kind === "weight_trend") return item.facts.verdict === "wrong_direction" ? "the drop in weight" : "the quick weight gain";
  if (item.kind === "guardrail_status") return `${item.facts.label} edging toward its limit`;
  return "this week's change";
}

function weightClause(f) {
  const rate = Math.abs(Number(f.weeklyRate));
  const pace = `about ${formatNumber(Math.round(rate * 10) / 10)} lb a week`;
  const rising = Number(f.weeklyRate) > 0;
  switch (f.verdict) {
    case "steady": return `your weight is ${rising ? "edging up" : "easing down"}, ${pace}`;
    case "quick": return `your weight is ${rising ? "climbing" : "dropping"} a little quickly, ${pace}`;
    case "rapid": return `your weight is ${rising ? "climbing" : "dropping"} fast, ${pace}`;
    case "flat": return "your weight held steady";
    case "wrong_direction": return `your weight is ${rising ? "creeping up" : "drifting down"}, ${pace}`;
    default: return null;
  }
}

// ---------------------------------------------------------------- words

function pictureFacts(picture) {
  const domain = (name) => picture?.domains?.find((item) => item.domain === name);
  const composition = domain(ROLES.outcome);
  const guardrail = domain(ROLES.guardrail);
  return {
    composition: composition?.status === "assessed" ? composition.facts : null,
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
  return { late: "at the end of the week", early: "at the start of the week", middle: "midweek", whole: "for most of the week" }[position] ?? "this week";
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
function upperFirst(value) { return value ? `${value[0].toLocaleUpperCase("en-US")}${value.slice(1)}` : value; }

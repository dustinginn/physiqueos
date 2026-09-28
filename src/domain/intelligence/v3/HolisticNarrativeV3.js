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

export function realizeHolisticWeeklyV3({ synthesis, picture, goalLabel, goalPolicy }) {
  if (!synthesis?.selected?.length) return null;
  const facts = { ...pictureFacts(picture), direction: goalPolicy?.weightExpectation?.direction ?? null };
  const hero = heroInsights(synthesis);
  const told = new Set(hero.map((item) => item.id));
  const result = heroSentence(hero, facts);
  const meaning = meaningSentence({ synthesis, facts, goalLabel, told });
  // A routine break the hero and meaning did not tell is introduced before
  // anything refers back to it.
  const routine = synthesis.selected.find((item) => item.kind === "routine_break");
  if (routine && meaningTellsRoutine({ synthesis, facts })) told.add(routine.id);
  const steps = planSteps(synthesis);
  const coachTake = coachSentences({ synthesis, told, facts, steps });
  const action = actionSentence(synthesis, steps);
  const watch = watchSentence({ synthesis, facts });
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
  if (!clauses.length) return "This week held to its usual pattern.";
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
      return `${f.newThisPeriod ? "the new" : `the ${dateWords(f.measuredAt)}`} ${f.eventName} ${compositionPhrase(f)}`;
    case "visual_change":
      return { visible: "the new photos show a visible change", subtle: "the new photos show a subtle change",
        none: "the new photos look much like the last set" }[f.change] ?? null;
    case "guardrail_status":
      return f.status === "breached" ? `${f.label} is past its limit` : `${f.label} is closer to its limit than it should be`;
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
// changes the direction of the goal. Two sentences at most. Keyed on the
// goal's expected direction, the trend's verdict and the outcome's polarity —
// never a single goal's wording.
function meaningSentence({ synthesis, facts, goalLabel, told }) {
  const composition = facts.composition;
  const risk = synthesis.selected.find((item) => item.role === "risk");
  const weight = synthesis.selected.find((item) => item.kind === "weight_trend");
  const routine = synthesis.selected.find((item) => item.kind === "routine_break");
  const compositionTold = [...told].some((id) => id.startsWith(`${ROLES.outcome}|`));
  const scan = composition && !compositionTold
    ? `The ${dateWords(composition.measuredAt)} ${composition.eventName} ${compositionPhrase(composition)}${facts.guardrail ? ` with ${facts.guardrail.label} at ${guardrailValue(facts)}` : ""}`
    : null;
  const next = composition ? `the next ${composition.eventName}` : null;
  // Each goal-relative reading, stated after the standing result when it has
  // not been told already, or on its own when the hero just told it.
  const read = (withScan, alone) => (scan ? `${scan}${withScan}` : upperFirst(alone));
  const verdict = weight?.facts?.verdict;
  const movement = weight?.facts?.movement;
  const stableGoal = facts.direction === "stable";
  let first;
  if (!composition) {
    first = risk ? `That is the part to keep an eye on for ${goalLabel}.` : `Nothing this week changes the direction of ${goalLabel}.`;
  } else if (composition.polarity === "concern" || risk?.kind === "composition_result") {
    first = read(`; this week's scale trend can't show whether ${composition.label} has turned back, and ${next} will.`,
      `this week's scale trend can't show whether ${composition.label} has turned back; ${next} will.`);
  } else if (risk?.kind === "weight_trend") {
    // Too fast the goal's way strains the guardrail; the wrong way puts the
    // outcome itself in question.
    // A maintenance goal has no "right way": its outcome is what must hold.
    // For maintenance, a fast climb strains the guardrail and a fast drop the outcome.
    const question = stableGoal ? `whether ${movement === "up" && facts.guardrail ? facts.guardrail.label : composition.label} is holding`
      : verdict === "rapid" && facts.guardrail ? `whether ${facts.guardrail.label} is holding`
        : `whether ${composition.label} is still moving the right way`;
    first = read(`; at this pace ${next} is what will show ${question}.`, `at this pace ${next} is what will show ${question}.`);
  } else if (risk?.kind === "guardrail_status") {
    const question = risk.facts.status === "breached" ? `whether ${risk.facts.label} comes back inside its limit`
      : `where ${risk.facts.label} stands against its limit`;
    first = read(`; ${next} will show ${question}.`, `${next} will show ${question}.`);
  } else if (risk) {
    first = read(`; ${next} is the check that settles it.`, `${next} is the check that settles it.`);
  } else if (weight && stableGoal && verdict === "quick") {
    first = read(`; the scale is moving more than a steady phase usually does, and ${next} will show whether ${composition.label} is holding.`,
      `the scale is moving more than a steady phase usually does; ${next} will show whether ${composition.label} is holding.`);
  } else if (weight && !stableGoal && ["steady", "quick"].includes(verdict) && movement !== "flat") {
    const change = movement === "up" ? "gain" : "loss";
    first = read(`; the scale alone can't say how much of this ${change} is ${composition.label}, and ${next} will.`,
      `the scale alone can't say how much of this ${change} is ${composition.label}; ${next} will.`);
  } else if (weight && verdict === "flat") {
    first = read(`; with the scale holding steady, ${next} will show whether ${composition.label} is still moving.`,
      `with the scale holding steady, ${next} will show whether ${composition.label} is still moving.`);
  } else {
    first = read(", and nothing this week points away from that.", "nothing else this week points away from that result.");
  }
  const days = routine?.facts?.extentDays ?? routine?.facts?.span?.days;
  const quiet = routine?.facts?.direction === "break";
  const second = meaningTellsRoutine({ synthesis, facts })
    ? quiet
      ? `${upperFirst(numberWord(days ?? 2))} quiet ${days === 1 ? "day doesn't" : "days don't"} change the picture.`
      : "A few off-routine days don't change the picture."
    : null;
  return [first, second].filter(Boolean).join(" ");
}

// Meaning mentions a routine break only when nothing more pressing is being
// said about the goal.
function meaningTellsRoutine({ synthesis, facts }) {
  const routine = synthesis.selected.find((item) => item.kind === "routine_break");
  const risk = synthesis.selected.some((item) => item.role === "risk");
  return Boolean(routine && !risk && facts.composition?.polarity !== "concern");
}

function coachSentences({ synthesis, told, facts, steps }) {
  const parts = [];
  const progress = synthesis.selected.find((item) => item.kind === "training_progress");
  if (progress?.facts?.example) parts.push(milestoneSentence(progress.facts.example));
  for (const item of synthesis.selected) {
    if (item.kind === "training_progress") continue;
    if (item.kind === "routine_break") {
      const prior = item.facts.recurrence?.priorSpans?.at(-1);
      const stretch = item.facts.direction === "break" ? "quiet" : "off-routine";
      const introduced = told.has(item.id);
      const clause = upperFirst(clauseFor(item, facts));
      parts.push(prior
        ? introduced
          ? `A similar ${stretch} stretch came in ${monthPart(prior.startDate)}; the useful move is simply to pick the rhythm back up.`
          : `${clause}, and a similar ${stretch} stretch came in ${monthPart(prior.startDate)}; the useful move is simply to pick the rhythm back up.`
        : introduced
          ? `Nothing about those ${stretch} days needs fixing; just pick the rhythm back up.`
          : `${clause}; nothing about a few ${stretch} days needs fixing, so just pick the rhythm back up.`);
    } else if (!told.has(item.id)) {
      const clause = clauseFor(item, facts);
      if (clause) parts.push(`${upperFirst(clause)}.`);
    }
  }
  for (const item of synthesis.limitations) parts.push(limitationSentence(item));
  if (!parts.length) {
    // The coach take points at what the next step answers; with no step it
    // never endorses anything short of supportive.
    const supportive = synthesis.selected.every((item) => item.polarity === "supportive");
    parts.push(steps[0] ? steps[0].focus ?? focusSentence(steps[0].source)
      : supportive ? "This is what a steady week looks like; more of the same."
        : "Nothing here needs a change yet; the next few weeks will say more.");
  }
  return parts.slice(0, 3).join(" ");
}

function focusSentence(item) {
  switch (item.kind) {
    case "weight_trend": return item.facts.verdict === "wrong_direction"
      ? "Turning the scale back the right way is the one thing to focus on this week."
      : "The scale's pace is the one thing to steer this week.";
    case "training_frequency": return "Getting the usual sessions back in matters more than anything else this week.";
    case "composition_result": return `The ${item.facts.eventName} result is what matters most for the goal right now.`;
    case "guardrail_status": return `${upperFirst(item.facts.label)} is the number to protect right now.`;
    case "intake_vs_plan": return "Intake is the lever this week.";
    default: return "One adjustment this week is enough.";
  }
}

function milestoneSentence(example) {
  const label = example.subjectLabel;
  if (example.metric === "reps_at_load" && example.load != null && example.currentValue != null && example.previousValue != null) {
    return `${label} stood out, going from ${example.previousValue} to ${example.currentValue} reps at ${example.load} lb.`;
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
  const weight = selected.find((item) => item.kind === "weight_trend" && ["rapid", "quick", "wrong_direction"].includes(item.facts.verdict));
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
  const logCheck = { text: "make sure every meal gets logged",
    focus: "The logged intake and the scale point different ways, so the food log is the first thing to check." };
  const steps = [];
  if (intakeContradictsScale && weight) {
    steps.push({ source: weight, ...logCheck });
  } else if (weightRisk) {
    steps.push({ source: weightRisk, text: weightRisk.facts.movement === "up" ? "keep intake at or below the plan's target"
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
  const risk = synthesis.selected.some((item) => item.role === "risk");
  const tail = risk ? "The rest of the setup stays as it is." : "Keep the current setup in place.";
  return `${upperFirst(steps[0].text)}${steps[1] ? ` and ${steps[1].text}` : ""} this week. ${tail}`;
}

function watchSentence({ synthesis, facts }) {
  const items = [];
  const weight = synthesis.selected.find((item) => item.kind === "weight_trend") ?? facts.weightInsight;
  const routine = synthesis.selected.find((item) => item.kind === "routine_break");
  const limitation = synthesis.limitations[0];
  const outcomeRisk = synthesis.selected.find((item) => item.role === "risk" && ["composition_result", "guardrail_status"].includes(item.kind));
  // A trend the goal does not judge, or one lost in noise, is nothing to watch.
  const verdict = ["not_goal_relevant", "too_noisy"].includes(weight?.facts?.verdict) ? null : weight?.facts?.verdict;
  const movement = weight?.facts?.movement;
  if (outcomeRisk && facts.composition) {
    items.push(outcomeRisk.kind === "guardrail_status"
      ? `where ${outcomeRisk.facts.label} lands at the next ${facts.composition.eventName}`
      : `what the next ${facts.composition.eventName} shows for ${facts.composition.label}`);
  }
  if (["quick", "rapid"].includes(verdict) && facts.direction === "stable") {
    items.push("whether the weekly weight average levels off");
  } else if (["quick", "rapid"].includes(verdict) && movement !== "flat") {
    items.push(`whether the weekly weight average eases to a steadier ${movement === "down" ? "drop" : "climb"}`);
  } else if (verdict === "wrong_direction") {
    items.push(`whether the weekly weight average turns back ${facts.direction === "down" ? "down" : facts.direction === "up" ? "up" : "toward steady"}`);
  } else if (verdict) {
    items.push("the weekly weight average");
  }
  const missedTraining = synthesis.selected.find((item) => item.kind === "training_frequency" && item.facts.direction === "below");
  if (missedTraining && !routine) items.push("whether the usual training days come back");
  if (routine) {
    const training = routine.facts.missed?.find((gap) => gap.domain === "training")?.dates;
    const dates = training?.length ? training : routine.facts.affectedDates;
    items.push(training?.length
      ? `whether ${dayRange(dates)} ${dates.length === 1 ? "gets its" : "get their"} usual training back`
      : `whether the usual routine returns on ${dayRange(dates)}`);
  }
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
    return item.facts.verdict === "rapid" ? `the fast ${rising ? "climb" : "drop"} in weight`
      : `the ${rising ? "rise" : "drop"} in weight`;
  }
  if (item.kind === "guardrail_status") {
    return item.facts.status === "breached" ? `${item.facts.label} past its limit` : `${item.facts.label} edging toward its limit`;
  }
  if (item.kind === "composition_result") return `the ${item.facts.eventName} result`;
  return "this week's change";
}

function weightClause(f) {
  const rate = Math.abs(Number(f.weeklyRate));
  const weeks = Math.round(Number(f.rateSpanDays ?? 28) / 7);
  const days = Number(f.rateSpanDays ?? 28);
  const span = days < 14 ? `over the last ${days} days` : `over the last ${numberWord(weeks)} weeks`;
  const pace = `about ${formatNumber(Math.round(rate * 10) / 10)} lb a week ${span}`;
  const rising = Number(f.weeklyRate) > 0;
  if (f.movement === "flat" && !["rapid", "quick"].includes(f.verdict)) return "your weight held steady";
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
function upperFirst(value) { return value ? `${value[0].toLocaleUpperCase("en-US")}${value.slice(1)}` : value; }

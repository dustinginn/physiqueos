// DEXA Event: plain-language copy.
//
// The DEXA Event is read by people who have never had a body-composition scan
// explained to them. The V3 assessment decides what happened (objective
// progress, goal progress, the recommended action), the DEXA scan supplies the
// measured values (lean mass, body fat against the range the goal sets), and
// this module words them once each in everyday language:
//
//   title        what changed for the goal
//   heroBody     the measured numbers behind it
//   opening      why it matters
//   regional     where on the body it changed, when that is notable
//   phaseMeaning what one scan can and cannot decide
//   uncertainty  what a scan cannot tell us
//   biggestWin   how far the goal has come
//   protect      what to keep doing
//   next         the single coaching priority
//
// Nothing here changes the assessment, Confidence, the scan or the evidence;
// it only chooses words. The copy never claims a scan proves new muscle, and
// it says plainly when body fat is above the range rather than near it. It
// returns null when the scan has no prior comparison, and the caller keeps the
// existing presentation.

export const DEXA_PLAIN_LANGUAGE_SCHEMA = "dexa_event_plain_language_v1";

const GOAL_WORDS = Object.freeze({
  lean_mass_gain: { goal: "your muscle-building goal", target: "your muscle-building target", limitRange: true, gaining: true },
  body_fat_maintenance: { goal: "your maintenance goal", target: "your maintenance target", limitRange: true, gaining: false },
  fat_loss: { goal: "your fat-loss goal", target: "your fat-loss target", limitRange: false, gaining: false },
  unknown: { goal: "your goal", target: "your target", limitRange: false, gaining: false },
});

const REGION_WORDS = Object.freeze({
  trunk: "your torso", android: "your belly", gynoid: "your hips and upper thighs", legs: "your legs", arms: "your arms",
});

const RESULT_WORDS = Object.freeze({
  "Lean Tissue": { label: "Lean Mass" },
  "DEXA Weight": { label: "Scan Weight", context: "Includes water and food, not just muscle and fat" },
});

const LEAN_WORDS = "(muscle plus water and other non-fat tissue)";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// Below this, a regional change is not worth a sentence.
const REGIONAL_NOTABLE_LB = 0.5;

export function composeDexaEventPlainLanguage({ event, narrativePlan, roles } = {}) {
  const facts = dexaFacts(event, narrativePlan, roles);
  if (!facts) return null;
  const parts = {};
  const claims = {};
  const set = (field, claim, text) => {
    parts[field] = text || null;
    claims[field] = text ? [claim] : [];
  };

  set("title", "goal_direction", title(facts));
  set("heroBody", "measured_change", heroBody(facts));
  set("opening", "why_it_matters", opening(facts));
  set("regional", "regional_change", regional(facts));
  set("phaseMeaning", "decision_timing", phaseMeaning(facts));
  set("supportingEvidence", "supporting_evidence", supportingEvidence(facts));
  set("uncertainty", "measurement_uncertainty", uncertainty(facts));
  const protect = protectAdvice(facts);
  set("biggestWin", "goal_progress", biggestWin(facts, { protect }));
  set("protect", "keep_doing", protect);
  set("next", "coaching_priority", nextAdvice(facts));

  return {
    schemaVersion: DEXA_PLAIN_LANGUAGE_SCHEMA,
    hero: {
      title: parts.title,
      body: parts.heroBody,
      results: plainResults(event.hero?.results, facts),
    },
    interpretation: {
      ...event.interpretation,
      opening: parts.opening ?? "",
      // Body fat and lean mass are told in the hero; nothing is left to repeat.
      fatLoss: "",
      leanMass: "",
      regional: parts.regional ?? "",
      phaseMeaning: parts.phaseMeaning,
      supportingEvidence: parts.supportingEvidence ?? "",
      uncertainty: parts.uncertainty ?? "",
      goalProgress: null,
      guardrailStatus: null,
    },
    coachInsight: {
      biggestWin: parts.biggestWin ?? "",
      protect: parts.protect ?? "",
      watch: "",
      next: parts.next ?? "",
    },
    claims,
  };
}

function dexaFacts(event, narrativePlan, roles) {
  if (!event || !narrativePlan || !roles) return null;
  const metric = (label) => (event.progress?.headline ?? []).find((item) => item.label === label) ?? null;
  const lean = metric("Lean Tissue");
  const bodyFat = metric("Body Fat");
  if (!event.priorScanDate || lean?.delta == null || bodyFat?.current == null) return null;
  const goalKind = GOAL_WORDS[event.semanticGoalType] ? event.semanticGoalType : "unknown";
  const words = GOAL_WORDS[goalKind];
  const range = words.limitRange ? event.context?.bodyFatGuardrail ?? null : null;
  const objectiveState = narrativePlan.objectiveStates?.[0]?.state ?? null;
  const reached = roles.goalProgress === "reached" ||
    ["achieved", "exceeded"].includes(narrativePlan.goalAchievement);
  return {
    goalKind,
    words,
    since: `your ${longDate(event.priorScanDate)} scan`,
    lean,
    leanState: lean.delta >= 0.5 ? "increased" : lean.delta <= -0.5 ? "decreased" : "flat",
    bodyFat,
    fatMass: metric("Fat Mass"),
    range,
    bodyFatStatus: range ? bodyFatRangeStatus(bodyFat.current, range) : "unknown",
    progressed: ["progressed", "satisfied", "stable_success"].includes(objectiveState),
    regressed: ["regressed", "worsened"].includes(objectiveState),
    reached,
    progressBand: roles.goalProgress ?? null,
    action: narrativePlan.recommendation?.action ?? null,
    demonstrated: narrativePlan.strategyEffectiveness?.feasibility === "demonstrated",
    activePhase: event.context?.activePhase ?? null,
    calibration: event.context?.activePhase?.name === "Establish Maintenance" &&
      event.context?.operatingState?.value === "calibration",
    contextIncomplete: event.pi?.status === "fallback",
    regionalFat: event.regionalChanges?.fat?.[0] ?? event.progress?.regionalFat?.[0] ?? null,
    regionalLean: event.regionalChanges?.lean?.[0] ?? event.progress?.regionalLean?.[0] ?? null,
    support: event.supportingEvidence ?? null,
  };
}

// What changed for the goal.
function title(facts) {
  const { words, bodyFatStatus } = facts;
  if (facts.reached) return `You've reached ${words.goal}.`;
  const lead = facts.progressed ? `You're making progress toward ${words.goal}`
    : facts.regressed ? `This scan moved away from ${words.goal}`
      : `This scan didn't show clear progress toward ${words.goal}`;
  // Body fat joins the headline only as a verdict; where it sits against the
  // range is the hero's to say.
  if (words.limitRange && bodyFatStatus === "above") return `${lead}, ${facts.progressed ? "but" : "and"} body fat needs attention.`;
  return `${lead}.`;
}

// The measured numbers behind it.
function heroBody(facts) {
  const { lean, bodyFat, range, bodyFatStatus } = facts;
  const leanChange = facts.leanState === "flat"
    ? `stayed about the same${lb(lean.delta) === "0.0 lb" ? "" : ` (${signedLb(lean.delta)})`}`
    : `went ${lean.delta > 0 ? "up" : "down"} ${lb(lean.delta)}`;
  const leanSentence = `Since ${facts.since}, your lean mass ${LEAN_WORDS} ${leanChange}.`;
  const moved = bodyFat.delta >= 0.1 ? "rose to" : bodyFat.delta <= -0.1 ? "dropped to" : "held at";
  const value = `${oneDecimal(bodyFat.current)}%`;
  const rangeText = range ? `${trimNumber(range.lowerBound)}–${trimNumber(range.upperBound)}%` : null;
  const fatSentence = ({
    above: () => `Your body fat ${moved} ${value}, which is above your ${rangeText} target range.`,
    below: () => `Your body fat ${moved} ${value}, which is below your ${rangeText} target range.`,
    near_boundary: () => `Your body fat ${moved} ${value}, still inside your ${rangeText} target range but close to the ${nearEdge(bodyFat.current, range)}.`,
    within: () => `Your body fat ${moved} ${value}, inside your ${rangeText} target range.`,
  })[bodyFatStatus]?.() ?? `Your body fat ${moved} ${value}.`;
  return facts.goalKind === "fat_loss" ? `${fatSentence} ${leanSentence}` : `${leanSentence} ${fatSentence}`;
}

// Why it matters.
function opening(facts) {
  const { goalKind, leanState, bodyFatStatus, fatMass, lean } = facts;
  if (goalKind === "lean_mass_gain") {
    if (leanState === "decreased") return "That's not the direction you want while building muscle.";
    if (leanState !== "increased") return null;
    if (bodyFatStatus === "above" && fatMass?.delta > 0) {
      return fatMass.delta > lean.delta
        ? `You also gained ${lb(fatMass.delta)} of fat, more than the lean mass you added. Some fat gain is normal while building muscle, but right now fat is coming on faster than lean mass.`
        : `You also gained ${lb(fatMass.delta)} of fat. Some fat gain is normal while building muscle; the aim is to keep it small next to the lean mass you add.`;
    }
    if (["within", "near_boundary"].includes(bodyFatStatus)) {
      return "That's the balance you want while building muscle: adding lean mass without letting body fat climb out of range.";
    }
    return null;
  }
  if (goalKind === "fat_loss" && leanState === "decreased") {
    return "Some of the weight you lost was lean mass, which is worth keeping an eye on while you lose fat.";
  }
  return null;
}

// Where on the body it changed, when notable.
function regional(facts) {
  const notable = (item) => item && Math.abs(item.delta) >= REGIONAL_NOTABLE_LB && REGION_WORDS[item.region];
  const fat = notable(facts.regionalFat) ? facts.regionalFat : null;
  const lean = notable(facts.regionalLean) ? facts.regionalLean : null;
  if (!fat && !lean) return null;
  const amount = (item, noun) => `${lb(item.delta)} ${item.delta > 0 ? "more" : "less"} ${noun}`;
  let sentence;
  if (fat && lean && fat.region === lean.region) {
    sentence = `The biggest changes were in ${REGION_WORDS[fat.region]}: about ${amount(fat, "fat")} and ${amount(lean, "lean mass")}.`;
  } else {
    sentence = [
      fat ? `Fat changed most in ${REGION_WORDS[fat.region]} (about ${amount(fat, "fat")}).` : null,
      lean ? `Lean mass changed most in ${REGION_WORDS[lean.region]} (about ${amount(lean, "lean mass")}).` : null,
    ].filter(Boolean).join(" ");
  }
  return `${sentence} Body-part numbers are less precise than the whole-body totals.`;
}

// What one scan can and cannot decide.
function phaseMeaning(facts) {
  if (["transition_goal", "transition_phase", "review_strategy"].includes(facts.action) || facts.reached) return null;
  if (facts.calibration) {
    return "This scan helps show whether you've found the amount of food that keeps your weight steady, but one scan isn't enough to confirm it.";
  }
  if (!facts.activePhase) return null;
  return "One scan isn't enough to decide whether you're ready for the next part of your plan. We'll weigh it alongside your training, weight trend and next scan first.";
}

function supportingEvidence({ support }) {
  if (!support) return null;
  const present = [
    support.weightDays ? "weigh-ins" : null,
    support.trainingDays ? "workouts" : null,
    support.nutritionDays ? "food logs" : null,
    support.photoSessions ? "progress photos" : null,
  ].filter(Boolean);
  if (!present.length) return null;
  return `Your ${naturalList(present)} from the same period help put this scan in context.`;
}

// What a scan cannot tell us.
function uncertainty(facts) {
  const limit = facts.contextIncomplete
    ? "We can compare the two scans, but some of your goal information is missing, so this result shouldn't change your plan on its own."
    : `A scan gives a useful picture of how your body is changing, but ${({
      increased: "it can't tell us exactly how much of the increase in lean mass is new muscle.",
      decreased: "it can't tell us for certain whether a drop in lean mass is lost muscle.",
      flat: "small changes can get lost in normal day-to-day variation.",
    })[facts.leanState]}`;
  return `${limit} Water, food and recent training can all shift the reading, so it helps to have your next scan under similar conditions.`;
}

// How far the goal has come.
function biggestWin(facts, { protect }) {
  if (facts.reached) return null;
  const still = facts.progressed ? "" : "still ";
  const where = ({
    more_than_half: `You're ${still}more than halfway to ${facts.words.target}.`,
    half: `You're ${still}halfway to ${facts.words.target}.`,
  })[facts.progressBand];
  if (!where) return null;
  // Progress this scan did not add is not called new progress.
  if (!facts.progressed) return where;
  return `${where} That's meaningful progress${protect ? ", and it's worth protecting" : ""}.`;
}

// What to keep doing while one thing is corrected.
function protectAdvice(facts) {
  if (!facts.progressed || facts.reached || !correcting(facts)) return null;
  return "Keep training the way you have been. There's no reason to overhaul your whole plan when part of it is moving in the right direction.";
}

function correcting(facts) {
  return ["continue_with_guardrail_monitoring", "pause_and_investigate"].includes(facts.action) ||
    (facts.words.limitRange && facts.bodyFatStatus === "above");
}

// The single coaching priority.
function nextAdvice(facts) {
  const { action, words, bodyFatStatus, leanState } = facts;
  const fatAbove = words.gaining && bodyFatStatus === "above";
  if (action === "transition_goal" || facts.reached) {
    return "Take a moment to lock in this result before choosing your next target.";
  }
  if (action === "transition_phase") return "You're ready for the next part of your plan. Keep your routines steady as you make the switch.";
  if (action === "review_strategy") return "It's time to review your plan rather than keep it unchanged. This result is big enough to call for a real adjustment.";
  if (action === "pause_and_investigate") {
    return fatAbove
      ? "Pause the push to gain more weight and take a close look at your calorie intake first. Bringing body fat back toward your target comes before anything else."
      : "Hold off on pushing harder for now. First look at your training, food and recovery to understand what's behind this result.";
  }
  if (fatAbove) {
    return leanState === "increased"
      ? `Take a closer look at your calorie intake before trying to gain more weight. The priority now is keeping your muscle-building progress while bringing body fat back toward your target.`
      : `Take a closer look at your calorie intake, training and recovery before changing anything else. The priority is bringing body fat back toward your target and getting lean mass moving up${leanState === "decreased" ? " again" : ""}.`;
  }
  if (words.gaining && bodyFatStatus === "below") {
    return "Make sure you're eating enough to support your training. Lower body fat isn't automatically better while you're building muscle.";
  }
  if (action === "continue_with_guardrail_monitoring") {
    return words.limitRange && bodyFatStatus !== "unknown"
      ? "Keep going with your current plan, and keep an eye on body fat as you do."
      : "Keep going with your current plan, and keep an eye on the area that needs attention.";
  }
  return facts.demonstrated
    ? "Stay the course. There's no reason to change your plan right now."
    : "Keep your plan steady until the next check-in gives a clearer picture.";
}

function plainResults(results, facts) {
  if (!Array.isArray(results)) return results;
  return results.map((item) => {
    const words = RESULT_WORDS[item.label];
    const next = { ...item, ...(words ?? {}) };
    if (item.label === "Lean Tissue") next.context = facts.goalKind === "lean_mass_gain" ? "Your main goal measure" : "Change since your last scan";
    if (item.label === "Body Fat" && facts.range) {
      const range = `${trimNumber(facts.range.lowerBound)}–${trimNumber(facts.range.upperBound)}%`;
      next.context = ({
        above: `Above your ${range} target`,
        below: `Below your ${range} target`,
        near_boundary: `Near the edge of your ${range} target`,
        within: `Inside your ${range} target`,
      })[facts.bodyFatStatus] ?? item.context;
    }
    return next;
  });
}

// The same classification as DEXAEventContextService.classifyBodyFatGuardrail
// (kept here so the shared briefing presentation does not import the DEXA
// context graph; a test holds the two equal).
const NEAR_EDGE_TOLERANCE = 0.15;
export function bodyFatRangeStatus(value, range) {
  const current = Number(value);
  if (value == null || !Number.isFinite(current) || !range) return "unknown";
  if (current < range.lowerBound) return "below";
  if (current > range.upperBound) return "above";
  const near = Math.abs(current - range.lowerBound) <= NEAR_EDGE_TOLERANCE ||
    Math.abs(current - range.upperBound) <= NEAR_EDGE_TOLERANCE;
  return near ? "near_boundary" : "within";
}

function nearEdge(value, range) {
  return Math.abs(value - range.upperBound) <= Math.abs(value - range.lowerBound) ? "top" : "bottom";
}

function longDate(dateKey) {
  const [, month, day] = String(dateKey).split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}`;
}

function oneDecimal(value) { return Number(value).toFixed(1); }
function trimNumber(value) { return String(Number(value)); }
function lb(value) { return `${oneDecimal(Math.abs(value))} lb`; }
function signedLb(value) { return `${value > 0 ? "+" : value < 0 ? "−" : ""}${lb(value)}`; }
function naturalList(items) {
  if (items.length < 2) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

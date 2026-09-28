// Section contracts: what each narrative section is for, how much it may
// carry, and which facet of the synthesis it consumes — shared by every
// briefing type.
//
// A holistic synthesis says what is worth saying; a section contract says who
// says it and in what capacity, so the briefing progresses instead of looping
// over its top facts:
//
//   headline   — what kind of period this was (character; short, no numbers)
//   recap      — what happened (evidence; the concrete numbers live here)
//   meaning    — what it means for the goal (implication)
//   confidence — why the goal outlook moved or held (outlook; goal level only)
//   takeaway   — the coach's read of the whole picture (interpretation; adds
//                no new numbers)
//   coaching   — what to carry into execution (execution; may add a supporting
//                example, a second-tier finding, or a limit on the picture)
//   action     — the next steps (commitment)
//   watch      — the next evidence that decides things (discriminator)
//
// An insight may be used by several sections, but never twice in the same
// capacity; every section after the headline must add an insight or a new
// capacity. Each briefing type lists only the sections it needs.

import { auditClaimRestraint } from "./BriefingClaimRestraint.js";

export const SectionRole = Object.freeze({
  HEADLINE: "headline",
  RECAP: "recap",
  MEANING: "meaning",
  CONFIDENCE: "confidence",
  TAKEAWAY: "takeaway",
  COACHING: "coaching",
  ACTION: "action",
  WATCH: "watch",
});

export const SectionFacet = Object.freeze({
  [SectionRole.HEADLINE]: "character",
  [SectionRole.RECAP]: "evidence",
  [SectionRole.MEANING]: "implication",
  [SectionRole.CONFIDENCE]: "outlook",
  [SectionRole.TAKEAWAY]: "interpretation",
  [SectionRole.COACHING]: "execution",
  [SectionRole.ACTION]: "commitment",
  [SectionRole.WATCH]: "discriminator",
});

const R = SectionRole;

// Section pairs that must not say the same thing in other words. The
// headline and recap deliberately tell the same lead insights at two
// granularities, and the recap and meaning share one paragraph, so those
// pairs are held only to the quantity rule.
export const DISTINCT_SECTION_PAIRS = Object.freeze([
  [R.HEADLINE, R.TAKEAWAY], [R.RECAP, R.TAKEAWAY], [R.MEANING, R.TAKEAWAY], [R.TAKEAWAY, R.COACHING],
  [R.TAKEAWAY, R.ACTION], [R.RECAP, R.COACHING], [R.MEANING, R.COACHING], [R.COACHING, R.ACTION],
  [R.MEANING, R.WATCH], [R.COACHING, R.WATCH], [R.HEADLINE, R.COACHING], [R.CONFIDENCE, R.TAKEAWAY],
]);
const HEADLINE = Object.freeze({ maxWords: 10, maxChars: 72, quantities: false });
const FULL = [R.HEADLINE, R.RECAP, R.MEANING, R.CONFIDENCE, R.TAKEAWAY, R.COACHING, R.ACTION, R.WATCH];

export const SECTION_CONTRACTS = Object.freeze({
  // Moderate progression: short headline → evidence-rich recap → goal meaning
  // → coach's read → execution → next steps → what decides next week.
  weekly: Object.freeze({
    cadence: "weekly", sections: FULL, headline: HEADLINE,
    recap: { maxInsights: 2, quantities: true },
    takeaway: { quantities: false, newInsights: false },
    coaching: { maxSentences: 3 },
    maxWords: 230,
  }),
  // Least copy: what is emerging so far and the next step; no forced arc.
  // No goal-meaning or multi-sentence coaching section: an early read, one
  // execution line, the step and what to watch.
  midweek: Object.freeze({
    cadence: "midweek", sections: [R.HEADLINE, R.RECAP, R.TAKEAWAY, R.COACHING, R.ACTION, R.WATCH],
    headline: { ...HEADLINE, maxWords: 8 }, recap: { maxInsights: 1, quantities: true, tense: "so_far" },
    takeaway: { quantities: false, newInsights: false },
    coaching: { maxSentences: 1 },
    maxWords: 120,
  }),
  // Room for multi-week synthesis and persistence, still one job per section.
  monthly: Object.freeze({
    cadence: "monthly", sections: FULL, headline: HEADLINE,
    recap: { maxInsights: 3, quantities: true },
    takeaway: { quantities: false, newInsights: false },
    coaching: { maxSentences: 4 },
    maxWords: 320,
  }),
  // Outcome-led: the headline and recap lead with the new result; the
  // supporting sections add preceding execution, interpretation and next steps.
  dexa: Object.freeze({
    cadence: "dexa", sections: FULL, headline: HEADLINE, leadDomain: "body_composition",
    recap: { maxInsights: 2, quantities: true },
    takeaway: { quantities: false, newInsights: false },
    coaching: { maxSentences: 3 },
    maxWords: 260,
  }),
  // Visual-result-led; depth scales with how much the photos actually show.
  photo: Object.freeze({
    cadence: "photo", sections: [R.HEADLINE, R.RECAP, R.MEANING, R.TAKEAWAY, R.COACHING, R.ACTION, R.WATCH], headline: HEADLINE,
    leadDomain: "visual_change", recap: { maxInsights: 1, quantities: true },
    // A measured, strong visual change earns a second recap insight and more
    // execution context; without one the Photo stays short.
    scaleWithOutcome: { domain: "visual_change", minimumStrength: 2.5, recapInsights: 2, coachingSentences: 3 },
    takeaway: { quantities: false, newInsights: false },
    coaching: { maxSentences: 1 },
    maxWords: 150,
  }),
});

// The contract a briefing actually gets for this synthesis: Photo gains its
// interpretation and execution sections only when the visual result is strong.
export function resolveSectionContract(cadence, synthesis) {
  const base = SECTION_CONTRACTS[cadence];
  if (!base) return null;
  const scale = base.scaleWithOutcome;
  if (!scale) return base;
  const strong = synthesis?.selected?.some((item) => item.domain === scale.domain &&
    item.role === "outcome" && item.strength >= scale.minimumStrength);
  if (!strong) return base;
  return { ...base, recap: { ...base.recap, maxInsights: scale.recapInsights },
    coaching: { ...base.coaching, maxSentences: scale.coachingSentences }, maxWords: Math.round(base.maxWords * 1.6) };
}

// The headline insights: what moved the goal forward, then what held it back
// (the complementary pair, not the two strongest of one kind); a briefing
// with an authoritative lead domain leads with it.
export function leadInsights(synthesis, contract, count = contract?.recap?.maxInsights ?? 2) {
  const selected = synthesis?.selected ?? [];
  const lead = contract?.leadDomain ? selected.find((item) => item.domain === contract.leadDomain) : null;
  const supportive = selected.filter((item) => item.polarity === "supportive" && item !== lead);
  // A real concern outranks a merely neutral finding for the second slot.
  const concern = [...selected.filter((item) => item.polarity === "concern" && item !== lead),
    ...selected.filter((item) => !["supportive", "concern"].includes(item.polarity) && item !== lead)];
  const picked = [lead, supportive[0], concern[0]].filter(Boolean);
  for (const item of selected) if (picked.length < count && !picked.includes(item)) picked.push(item);
  return picked.slice(0, count);
}

// Which insight each section consumes, in which capacity. `steps` are the
// action's steps ({ source }) and `discriminators` the watch items
// ({ source }); both come from the briefing's realizer. Sections a contract
// does not list are absent; a section with nothing new to add is marked
// minimal rather than padded.
export function allocateSections({ synthesis, contract, steps = [], discriminators = [] }) {
  const lead = leadInsights(synthesis, contract);
  const leadIds = lead.map((item) => item.id);
  const ids = (list) => [...new Set(list.filter(Boolean).map((item) => item.id))];
  const rest = (synthesis?.selected ?? []).filter((item) => !leadIds.includes(item.id));
  const example = lead.find((item) => item.kind === "training_progress") ??
    rest.find((item) => item.kind === "training_progress");
  const candidates = {
    [R.HEADLINE]: leadIds,
    [R.RECAP]: leadIds,
    [R.MEANING]: ids(synthesis?.context ?? []),
    [R.CONFIDENCE]: [],
    [R.TAKEAWAY]: leadIds,
    [R.COACHING]: ids([...(example ? [example] : []), ...rest, ...(synthesis?.limitations ?? [])]),
    [R.ACTION]: ids(steps.map((step) => step.source)),
    [R.WATCH]: ids(discriminators.map((item) => item.source)),
  };
  const sections = {};
  for (const role of contract.sections) {
    const insightIds = candidates[role] ?? [];
    const noMaterial = !insightIds.length && ![R.CONFIDENCE, R.MEANING].includes(role);
    sections[role] = { role, facet: SectionFacet[role], insightIds,
      ...(noMaterial ? { minimal: true } : {}) };
  }
  return { cadence: contract.cadence, order: [...contract.sections], leadIds, sections };
}

// Structural contract checks on an allocation: no insight used twice in the
// same capacity; the takeaway interprets only what the recap told (no new
// insights); a section with material names it, one without is marked minimal;
// the action commits only to what the synthesis selected.
export function auditSectionPlan(plan, synthesis = null) {
  const issues = [];
  const seen = new Set();
  for (const role of plan.order) {
    const section = plan.sections[role];
    for (const id of section.insightIds) {
      const key = `${id}|${section.facet}`;
      if (seen.has(key)) issues.push(`${role}: ${id} already used as ${section.facet}`);
      seen.add(key);
    }
    if (!section.insightIds.length && !section.minimal && ![R.CONFIDENCE, R.MEANING].includes(role)) {
      issues.push(`${role}: no material and not marked minimal`);
    }
  }
  const recap = new Set(plan.sections[R.RECAP]?.insightIds ?? []);
  for (const id of plan.sections[R.TAKEAWAY]?.insightIds ?? []) {
    if (!recap.has(id)) issues.push(`takeaway: introduces ${id} the recap did not tell`);
  }
  if (synthesis) {
    // Everything the synthesis considered: a watch may follow an assessed
    // finding that was not selected for the recap (the scale is always watched).
    const known = new Set([...(synthesis.selected ?? []), ...(synthesis.limitations ?? []), ...(synthesis.context ?? []),
      ...(synthesis.omitted ?? [])].map((item) => item.id));
    const watchOnly = new Set((synthesis.omitted ?? []).map((item) => item.id));
    for (const role of plan.order.filter((item) => item !== R.WATCH)) {
      for (const id of plan.sections[role].insightIds) {
        if (watchOnly.has(id) && role !== R.COACHING) issues.push(`${role}: uses ${id}, which synthesis left out`);
      }
    }
    for (const role of plan.order) {
      for (const id of plan.sections[role].insightIds) if (!known.has(id)) issues.push(`${role}: ${id} is not in the synthesis`);
    }
  }
  return { ok: issues.length === 0, issues };
}

const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";
const STOP = new Set(("a an and are as at be but by for from has have in is it its of on or so that the this those " +
  "to was were what when whether which while with your you week weeks this that there than").split(" "));

// Specific quantities a section states (a number with its unit and the word
// that follows, so "2.4 lb a week" and "2.4 lb with" stay different facts),
// excluding calendar dates.
export function statedQuantities(text) {
  const withoutDates = String(text ?? "").replace(new RegExp(`\\b(?:${MONTHS}) \\d{1,2}\\b`, "gu"), "");
  return [...withoutDates.matchAll(/\b\d+(?:\.\d+)?\s?(?:lb|%|reps?|kg|lifts?)?(?:\s+[a-z]+)?/gu)]
    .map((match) => match[0].trim());
}

function contentWords(text) {
  return new Set(String(text ?? "").toLowerCase().replace(/[^a-z\s'-]/gu, " ").split(/\s+/u)
    .map((word) => word.replace(/'s$/u, "").replace(/(?:ing|ed|es|s)$/u, ""))
    .filter((word) => word.length > 2 && !STOP.has(word)));
}

// Share of the shorter text's content words that the other also uses. Two
// short sentences on one topic naturally share a word or two, so fewer than
// three shared content words never counts as a paraphrase.
export function contentOverlap(left, right, { minimumShared = 3 } = {}) {
  const a = contentWords(left);
  const b = contentWords(right);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared < minimumShared ? 0 : shared / Math.min(a.size, b.size);
}

// Semantic non-redundancy of the written sections: the headline stays short
// and number-free; a specific quantity is stated in one section only; the
// takeaway adds no numbers and is not a paraphrase of the headline or recap;
// no two sections mostly share their content words; the action commits to
// something and the watch looks forward.
export function auditSectionTexts(texts, contract, { overlapCeiling = 0.6, claimSupport = undefined } = {}) {
  // Claim restraint first: effectiveness and repair-the-past language.
  const issues = [...auditClaimRestraint(texts, claimSupport)];
  const headline = texts[R.HEADLINE];
  if (headline) {
    const words = headline.split(/\s+/u).filter(Boolean).length;
    if (words > contract.headline.maxWords) issues.push(`headline: ${words} words`);
    if (headline.length > contract.headline.maxChars) issues.push(`headline: ${headline.length} characters`);
    if (!contract.headline.quantities && statedQuantities(headline).length) issues.push("headline: states a quantity");
  }
  if (texts[R.TAKEAWAY] && contract.takeaway?.quantities === false && statedQuantities(texts[R.TAKEAWAY]).length) {
    issues.push("takeaway: states a quantity");
  }
  const owners = new Map();
  for (const role of contract.sections.filter((item) => item !== R.CONFIDENCE)) {
    for (const quantity of new Set(statedQuantities(texts[role]))) {
      if (owners.has(quantity) && owners.get(quantity) !== role) issues.push(`${role}: repeats "${quantity}" from ${owners.get(quantity)}`);
      else owners.set(quantity, role);
    }
  }
  const roles = contract.sections.filter((role) => texts[role]);
  const overlaps = [];
  for (const [left, right] of DISTINCT_SECTION_PAIRS) {
    if (!texts[left] || !texts[right]) continue;
    const value = contentOverlap(texts[left], texts[right]);
    overlaps.push({ pair: `${left}~${right}`, overlap: Math.round(value * 100) / 100 });
    if (value > overlapCeiling) issues.push(`${left} and ${right} mostly say the same thing (${value.toFixed(2)})`);
  }
  if (texts[R.ACTION] && !/^(?:Keep|Get|Make|Bring|Hold|Settle|Add|Log|Stay|Aim|Plan|Protect|Take)\b/u.test(texts[R.ACTION])) {
    issues.push("action: does not commit to a step");
  }
  if (texts[R.WATCH] && !/^Watch\b/u.test(texts[R.WATCH])) issues.push("watch: does not look forward");
  const totalWords = roles.reduce((sum, role) => sum + texts[role].split(/\s+/u).filter(Boolean).length, 0);
  if (contract.maxWords && totalWords > contract.maxWords) issues.push(`briefing: ${totalWords} words`);
  return { ok: issues.length === 0, issues, overlaps, totalWords };
}

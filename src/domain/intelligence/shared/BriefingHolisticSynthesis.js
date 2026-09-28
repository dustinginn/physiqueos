// Holistic, goal-relative synthesis.
//
// Given the full evidence picture (every goal-relevant domain assessed), choose
// the smallest complementary set of insights that gives the most truthful and
// useful picture for this briefing's purpose — not the single top-ranked
// pattern. Complementarity is structural:
//   * one insight per domain, unless the evidence is strategically dominant
//     (a guardrail or trajectory risk);
//   * a routine shift already tells the domains it covers (activity dips are
//     part of it, not a second story);
//   * a limitation is said only when it constrains something the briefing
//     would otherwise claim;
//   * progress and execution balance each other when both exist.
// Every omission carries its reason. Goal Confidence and strategy are related
// to, never derived from, the recap: the synthesis only records them.
//
// The budget's semantic fields shape selection, not word counts:
//   * `leadDomain` — the briefing's authoritative evidence (a DEXA) leads when
//     it is present;
//   * `partialWindow` — a partial period cannot conclude complete-period
//     findings (fewer sessions than a usual week); what is said is "so far";
//   * `persistence` — a multi-week briefing favors what persisted across the
//     period over one-off stretches, and labels each;
// and `realizableKinds` (from the briefing's realizer) keeps an insight the
// briefing cannot yet phrase — a new Sleep finding, say — out of the
// selection with a reason, instead of letting it take a slot and vanish.

import { InsightRole } from "./BriefingEvidencePicture.js";

export const HOLISTIC_SYNTHESIS_VERSION = "briefing_holistic_synthesis_v1";

export function synthesizeBriefing({ picture, budget, realizableKinds = null }) {
  if (!picture || !budget) throw new Error("Holistic synthesis requires an evidence picture and a narrative budget.");
  const weightOf = new Map(picture.domains.map((item) => [item.domain, item.weight ?? 0.5]));
  const windowDays = windowLength(picture.window);
  const all = picture.domains.flatMap((domain) => domain.insights.map((item) => {
    const temporal = budget.persistence ? persistenceOf(item, windowDays) : null;
    const scale = temporal === "persistent" ? 1.2 : temporal === "one_off" ? 0.6 : 1;
    return { ...item, value: round(item.strength * (weightOf.get(item.domain) ?? 0.5) * scale, 2),
      ...(temporal ? { temporal } : {}), ...(budget.partialWindow ? { tense: "so_far" } : {}) };
  }));
  const omitted = [];
  const candidates = [];
  const context = [];
  const limitations = [];
  for (const item of all) {
    if (item.restrained) omitted.push(omit(item, `restrained:${item.restrained}`));
    else if (realizableKinds && !realizableKinds.has(item.kind)) omitted.push(omit(item, "no_realization_for_kind"));
    else if (budget.partialWindow && item.requiresCompleteWindow) omitted.push(omit(item, "partial_window_cannot_conclude"));
    // Standing context (a recent scan, a clear guardrail) always informs the
    // goal-relative sections by responsibility; it never competes for recap slots.
    else if (item.role === InsightRole.CONTEXT) context.push(item);
    else if (item.role === InsightRole.LIMITATION) limitations.push(item);
    else candidates.push(item);
  }

  const selected = [];
  const remaining = [...candidates].sort(byValue);
  const covered = new Set();
  let floorReached = false;
  // The briefing's authoritative evidence leads whenever it is present.
  const lead = budget.leadDomain ? remaining.find((item) => item.domain === budget.leadDomain &&
    [InsightRole.OUTCOME, InsightRole.RISK].includes(item.role)) : null;
  if (lead) {
    selected.push({ ...lead, marginal: lead.value, reason: "briefing_lead_domain" });
    for (const kind of lead.coversKinds ?? []) covered.add(kind);
    remaining.splice(remaining.indexOf(lead), 1);
  }
  while (selected.length < budget.maxInsights && remaining.length) {
    const scored = remaining.map((item) => ({ item, score: marginalValue(item, selected, covered, budget) }))
      .sort((left, right) => right.score - left.score || left.item.id.localeCompare(right.item.id));
    const best = scored[0];
    if (best.score < budget.floor) { floorReached = true; break; }
    selected.push({ ...best.item, marginal: round(best.score, 2), reason: selectionReason(best.item, selected) });
    for (const kind of best.item.coversKinds ?? []) covered.add(kind);
    remaining.splice(remaining.indexOf(best.item), 1);
  }

  const kept = selected;
  for (const item of remaining) {
    omitted.push(omit(item, omissionReason(item, kept, covered, budget,
      floorReached || selected.length < budget.maxInsights)));
  }

  // A limitation earns its separate, small allowance only when it constrains
  // a claim being made or a domain that would otherwise have been discussed.
  const keptLimitations = [];
  for (const item of limitations.sort(byValue)) {
    if (keptLimitations.length < (budget.maxLimitations ?? 1) && limitsSomethingSaid(item, kept, all, budget)) {
      keptLimitations.push({ ...item, reason: "constrains_a_claim" });
    } else {
      omitted.push(omit(item, keptLimitations.length >= (budget.maxLimitations ?? 1)
        ? "limitation_allowance_used" : "limitation_constrains_nothing_said"));
    }
  }

  const ordered = orderForNarrative(kept, budget);
  return {
    schemaVersion: HOLISTIC_SYNTHESIS_VERSION,
    budget: { ...budget },
    purpose: budget.purpose ?? null,
    partialWindow: Boolean(budget.partialWindow),
    considered: picture.domains.map((item) => ({ domain: item.domain, status: item.status, state: item.state,
      insightIds: item.insights.map((insight) => insight.id) })),
    selected: ordered,
    context: context.sort(byValue).map((item) => ({ ...item, reason: "goal_relative_context" })),
    limitations: keptLimitations,
    omitted,
    lead: ordered[0] ?? null,
    density: ordered.length === 0 ? "none" : ordered.length <= Math.ceil(budget.maxInsights / 2) ? "light" : "full",
    relations: {
      confidence: picture.outlook ? { percentage: picture.outlook.percentage, delta: picture.outlook.delta,
        independentOfRecap: true } : null,
      strategy: picture.strategy ? { action: picture.strategy.action, independentOfRecap: true } : null,
    },
  };
}

function marginalValue(item, selected, covered, budget) {
  let value = item.value;
  const sameDomain = selected.some((other) => other.domain === item.domain);
  const dominant = item.role === InsightRole.RISK && item.strength >= 2.4;
  // One insight per domain; only a dominant risk may add a second — or, when
  // the briefing's horizon allows it (Monthly), a second insight in a
  // different capacity (training progress beside a training-rhythm change).
  const complementary = budget.complementarySameDomain &&
    selected.every((other) => other.domain !== item.domain || other.role !== item.role);
  if (sameDomain && !dominant && !complementary) return 0;
  if (sameDomain && !dominant) value *= 0.6;
  if (covered.has(item.kind) && item.role !== InsightRole.RISK) value *= 0.3;
  // Two facts of the same kind from different domains still complement each
  // other (training progress and a weight trend); only a light penalty.
  const roles = new Set(selected.map((other) => other.role));
  if (roles.has(item.role) && item.role !== InsightRole.RISK) value *= 0.9;
  // Progress and execution balance each other: the first of a missing kind
  // is worth more once the other is present.
  if (selected.length && [InsightRole.PROGRESS, InsightRole.OUTCOME].includes(item.role) &&
      !selected.some((other) => [InsightRole.PROGRESS, InsightRole.OUTCOME].includes(other.role))) value *= 1.25;
  if (item.role === InsightRole.LIMITATION && budget.limitationsLast) value *= 0.9;
  if (item.polarity === "supportive" && item.role === InsightRole.EXECUTION && item.strength < 1) value *= 0.8;
  return value;
}

function limitsSomethingSaid(item, selected, all, budget) {
  const limits = new Set(item.limits ?? []);
  if (selected.some((other) => limits.has(other.domain))) return true;
  // The limited domain would have been worth discussing had it been readable
  // (a verdict that would have cleared the floor was restrained), or the gap
  // itself is large. An on-plan verdict that would not have been said anyway
  // is not a reason to talk about logging.
  return all.some((other) => other !== item && limits.has(other.domain) && other.restrained &&
      other.polarity !== "supportive" && other.value >= budget.floor) ||
    item.value >= budget.floor * 1.6;
}

function orderForNarrative(items, budget) {
  const rank = { [InsightRole.OUTCOME]: 0, [InsightRole.RISK]: 1, [InsightRole.PROGRESS]: 2, [InsightRole.EXECUTION]: 3,
    [InsightRole.CONTEXT]: 4, [InsightRole.LIMITATION]: 5 };
  const leads = (item) => (budget.leadDomain && item.domain === budget.leadDomain ? -1 : 0);
  return [...items].sort((left, right) => leads(left) - leads(right) ||
    (rank[left.role] ?? 9) - (rank[right.role] ?? 9) || byValue(left, right));
}

// Persistent: spans at least half the period (or is a trend by nature — a
// multi-week scale fit, a set of training bests). One-off: a short stretch
// inside a long period.
function persistenceOf(item, windowDays) {
  const extent = Number(item.facts?.extentDays);
  if (!Number.isFinite(extent) || !windowDays) return "sustained";
  if (extent >= windowDays / 2) return "persistent";
  return extent <= Math.max(3, windowDays / 4) ? "one_off" : "sustained";
}

function windowLength(window) {
  if (!window?.startDate || !window?.endDate) return null;
  return Math.round((Date.parse(`${window.endDate}T12:00:00Z`) - Date.parse(`${window.startDate}T12:00:00Z`)) / 86400000) + 1;
}

function selectionReason(item, selectedBefore) {
  if (!selectedBefore.length) return "highest_value_for_goal";
  if (item.role === InsightRole.RISK) return "strategically_relevant_risk";
  if (item.role === InsightRole.LIMITATION) return "constrains_a_claim";
  return `complements_${[...new Set(selectedBefore.map((other) => other.domain))].join("+")}`;
}

function omissionReason(item, kept, covered, budget, stoppedAtFloor) {
  if (covered.has(item.kind)) return "told_within_a_selected_insight";
  if (kept.some((other) => other.domain === item.domain)) return "domain_already_represented";
  if (item.value < budget.floor) return "below_briefing_floor";
  return stoppedAtFloor ? "not_enough_to_add_beside_what_was_said" : "information_budget_reached";
}

function omit(item, reason) {
  return { id: item.id, domain: item.domain, kind: item.kind, value: item.value ?? null, reason };
}

function byValue(left, right) { return right.value - left.value || left.id.localeCompare(right.id); }
function round(value, places = 2) { const f = 10 ** places; return Math.round(Number(value) * f) / f; }

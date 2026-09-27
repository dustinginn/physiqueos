// Shared Briefing Intelligence.
//
// One deterministic period-understanding layer for every canonical briefing
// type. It compares a period's canonical day-level evidence against the
// person's own recent routine, detects and ranks what materially characterized
// the period, and exposes that as structured observations. It never decides
// what a briefing concludes: each briefing type's policy (see
// BriefingIntelligencePolicies.js) chooses the horizon and admissible pattern
// kinds, and the V3 narrative/confidence layers decide how the structured
// characterization is used.
//
// Restraint is part of the contract, not a wording choice:
//   * a single unusual day is never a pattern;
//   * missing data is never behavior — an absence is only claimed on days the
//     person was otherwise observable;
//   * a day whose own record looks unreliable is excluded from behavior claims
//     and reported as a reliability finding instead;
//   * co-occurrence is the strongest causal claim ever made;
//   * wearable estimates are directional, never precise.

import { deepFreeze } from "../v3/V3Runtime.js";

export const BRIEFING_INTELLIGENCE_VERSION = "briefing_intelligence_v1";

export const BriefingPatternKind = Object.freeze({
  VALUE_RUN: "value_run",
  LEVEL_SHIFT: "level_shift",
  DISPERSION_CHANGE: "dispersion_change",
  FREQUENCY_CHANGE: "frequency_change",
  ROUTINE_GAP: "routine_gap",
  ROUTINE_SHIFT: "routine_shift",
});

export const BriefingMeasurementType = Object.freeze({
  LOGGED: "logged",
  WEARABLE_ESTIMATE: "wearable_estimate",
  RECORDED_EVENT: "recorded_event",
});

// Day-value signals: a number per day, compared with the person's baseline.
const VALUE_SIGNALS = Object.freeze({
  // Day-to-day intake genuinely varies by roughly a tenth; an unusually steady
  // baseline must not make an ordinary day look extreme.
  "nutrition.calories": { domain: "nutrition", measurementType: "logged", scaleFloor: 150, relativeFloor: 0.08 },
  "activity.active_kcal": { domain: "activity", measurementType: "wearable_estimate", scaleFloor: 100, relativeFloor: 0.1 },
  "activity.exercise_minutes": { domain: "activity", measurementType: "wearable_estimate", scaleFloor: 10, relativeFloor: 0.1 },
});

// Occurrence signals: did the routine event happen on an observable day.
const OCCURRENCE_SIGNALS = Object.freeze({
  "training.session": { domain: "training", measurementType: "recorded_event" },
  "body.weigh_in": { domain: "body", measurementType: "recorded_event" },
});

export const BRIEFING_INTELLIGENCE_DEFAULTS = deepFreeze({
  deviationZ: 1.5,
  // A short run must be carried by every day in it, not by one extreme day:
  // two-day runs need each day >= this; longer runs use deviationZ.
  shortRunZ: 2.0,
  minRunDays: 2,
  minExpectedMissed: 1.5,
  supportingOnlyDomains: ["body"],
  minBaselineValueDays: 10,
  minBaselineObservedDays: 14,
  levelShiftShare: 0.6,
  levelShiftZ: 1.0,
  levelShiftMinDays: 4,
  dispersionRatio: 2.0,
  dispersionMinDays: 5,
  absenceChanceCeiling: 0.2,
  frequencyMinDelta: 2,
  frequencyRelativeDelta: 0.35,
  reliabilityZ: 2.5,
  minMateriality: 1.5,
  maxCharacterization: 3,
  domainWeights: { training: 1, nutrition: 1, body: 0.6, activity: 0.7 },
  admissibleKinds: Object.values(BriefingPatternKind),
  recurrenceLookbackDays: 28,
});

/**
 * @param {object} input
 * @param {{startDate:string,endDate:string}} input.window  the period being briefed (inclusive local dates)
 * @param {Array<object>} input.days  day records covering the baseline and window, see BriefingPeriodEvidence
 * @param {object} [input.policy]  briefing-type policy (horizon, admissible kinds, thresholds)
 */
export function createBriefingIntelligence({ window, days = [], policy = {} } = {}) {
  if (!isDate(window?.startDate) || !isDate(window?.endDate) || window.endDate < window.startDate) {
    throw new Error("Briefing intelligence requires a valid window.");
  }
  const settings = { ...BRIEFING_INTELLIGENCE_DEFAULTS, ...policy,
    domainWeights: { ...BRIEFING_INTELLIGENCE_DEFAULTS.domainWeights, ...(policy.domainWeights ?? {}) } };
  const baselineDays = Number(settings.baselineDays ?? 28);
  const baselineWindow = { startDate: shiftDate(window.startDate, -baselineDays), endDate: shiftDate(window.startDate, -1) };
  const byDate = new Map(days.filter((day) => isDate(day?.date)).map((day) => [day.date, day]));
  const windowDates = dateRange(window.startDate, window.endDate);
  const baselineDates = dateRange(baselineWindow.startDate, baselineWindow.endDate);
  const dayAt = (date) => byDate.get(date) ?? { date };

  // Reliability is judged on baseline and window days alike: an unreliable
  // baseline day would otherwise bias the very routine it is compared against.
  const allReliability = detectReliabilityFindings({ windowDates: [...baselineDates, ...windowDates],
    baselineDates, dayAt, settings });
  const unreliable = new Set(allReliability.map((item) => `${item.domain}|${item.date}`));
  const reliability = allReliability.filter((item) => item.date >= window.startDate);
  const baselineUnreliableDays = allReliability.length - reliability.length;

  const baselines = [];
  const patterns = [];
  const limitations = [];

  for (const [signal, spec] of Object.entries(VALUE_SIGNALS)) {
    const usable = (date) => {
      const value = signalValue(dayAt(date), signal);
      return Number.isFinite(value) && !unreliable.has(`${spec.domain}|${date}`) ? value : null;
    };
    const baseValues = baselineDates.map(usable).filter((value) => value != null);
    if (baseValues.length < settings.minBaselineValueDays) {
      limitations.push({ signal, reason: "insufficient_baseline", baselineDays: baseValues.length });
      continue;
    }
    const stats = robustStats(baseValues, spec);
    baselines.push({ signal, domain: spec.domain, measurementType: spec.measurementType,
      method: "median_mad", n: baseValues.length, median: round(stats.median), scale: round(stats.scale) });
    const series = windowDates.map((date) => {
      const value = usable(date);
      return { date, value, z: value == null ? null : (value - stats.median) / stats.scale };
    });
    patterns.push(...detectValueRuns({ signal, spec, series, stats, settings }));
    const shift = detectLevelShift({ signal, spec, series, stats, settings });
    if (shift) patterns.push(shift);
    const dispersion = detectDispersionChange({ signal, spec, series, stats, baseValues, settings });
    if (dispersion) patterns.push(dispersion);
  }

  const observable = (date) => isObservableDay(dayAt(date));
  for (const [signal, spec] of Object.entries(OCCURRENCE_SIGNALS)) {
    const baseObserved = baselineDates.filter(observable);
    if (baseObserved.length < settings.minBaselineObservedDays) {
      limitations.push({ signal, reason: "insufficient_baseline", baselineDays: baseObserved.length });
      continue;
    }
    const baseHits = baseObserved.filter((date) => occurred(dayAt(date), signal)).length;
    const rate = baseHits / baseObserved.length;
    const weekdayRate = weekdayRates(baseObserved, (date) => occurred(dayAt(date), signal), rate);
    baselines.push({ signal, domain: spec.domain, measurementType: spec.measurementType,
      method: "observed_day_rate_by_weekday", n: baseObserved.length, rate: round(rate, 3),
      weekdayRates: weekdayRate.map((value) => round(value, 3)) });
    const windowObserved = windowDates.filter(observable);
    const unobserved = windowDates.filter((date) => !observable(date));
    if (unobserved.length) limitations.push({ signal, reason: "unobservable_days", dates: unobserved });
    const hits = windowObserved.filter((date) => occurred(dayAt(date), signal));
    const frequency = detectFrequencyChange({ signal, spec, rate, windowObserved, hits, settings, window });
    if (frequency) patterns.push(frequency);
    patterns.push(...detectRoutineGaps({ signal, spec, weekdayRate, windowDates, observable,
      happened: (date) => occurred(dayAt(date), signal), settings }));
  }

  // A policy detects its building blocks (`detectKinds`) but characterizes the
  // period only with `admissibleKinds`: e.g. a routine shift is built from
  // runs and gaps even where runs and gaps alone may not characterize.
  const detectable = new Set(settings.detectKinds ?? Object.values(BriefingPatternKind));
  const admissible = new Set(settings.admissibleKinds);
  const behavior = patterns.filter((item) => detectable.has(item.kind))
    .map((item) => ({ ...item, materiality: round(materiality(item, settings), 2) }));
  const segments = detectable.has(BriefingPatternKind.ROUTINE_SHIFT) || admissible.has(BriefingPatternKind.ROUTINE_SHIFT)
    ? detectRoutineShifts({ patterns: behavior, window, settings }) : [];
  const recurrence = detectRecurrence({ segments, baselineDates, dayAt, observable, settings, window });
  const byId = new Map(behavior.map((item) => [item.id, item]));
  for (const segment of segments) {
    const similar = recurrence.get(segment.id);
    if (similar) segment.recurrence = similar;
    segment.materiality = round(shiftMateriality(segment, byId, settings), 2);
  }
  const ranked = [...segments, ...behavior]
    .sort((left, right) => right.materiality - left.materiality || left.id.localeCompare(right.id));
  const characterization = selectCharacterization(ranked.filter((item) => admissible.has(item.kind)), settings, byId);

  return deepFreeze({
    schemaVersion: BRIEFING_INTELLIGENCE_VERSION,
    horizon: { window: { ...window }, baselineWindow, cadence: settings.cadence ?? null },
    policy: { cadence: settings.cadence ?? null, admissibleKinds: [...settings.admissibleKinds],
      maxCharacterization: settings.maxCharacterization, minMateriality: settings.minMateriality },
    baselines,
    patterns: ranked,
    characterization,
    reliability,
    limitations: baselineUnreliableDays
      ? [...limitations, { reason: "unreliable_baseline_days_excluded", count: baselineUnreliableDays }]
      : limitations,
  });
}

// ---------------------------------------------------------------- detectors

function detectValueRuns({ signal, spec, series, stats, settings }) {
  const runs = [];
  let current = null;
  const close = () => {
    const weakest = current ? Math.min(...current.points.map((point) => Math.abs(point.z))) : 0;
    const required = current && current.points.length <= 2 ? settings.shortRunZ : settings.deviationZ;
    if (current && current.points.length >= settings.minRunDays && weakest >= required) {
      const zs = current.points.map((point) => point.z);
      const values = current.points.map((point) => point.value);
      runs.push(pattern({
        kind: BriefingPatternKind.VALUE_RUN, signal, spec,
        startDate: current.points[0].date, endDate: current.points.at(-1).date,
        direction: current.direction,
        magnitude: { meanZ: round(mean(zs.map(Math.abs)), 2), minZ: round(weakest, 2),
          ratioToBaseline: round(mean(values) / stats.median, 3) },
        support: { days: current.points.length, baselineDays: stats.n },
        dates: current.points.map((point) => point.date),
      }));
    }
    current = null;
  };
  for (const point of series) {
    const direction = point.z == null ? null :
      point.z >= settings.deviationZ ? "above" : point.z <= -settings.deviationZ ? "below" : null;
    if (!direction) { close(); continue; }
    if (current && current.direction === direction) current.points.push(point);
    else { close(); current = { direction, points: [point] }; }
  }
  close();
  return runs;
}

function detectLevelShift({ signal, spec, series, stats, settings }) {
  const valid = series.filter((point) => point.z != null);
  if (valid.length < settings.levelShiftMinDays) return null;
  for (const direction of ["above", "below"]) {
    const sign = direction === "above" ? 1 : -1;
    const agreeing = valid.filter((point) => sign * point.z >= settings.levelShiftZ);
    const centerZ = (median(valid.map((point) => point.value)) - stats.median) / stats.scale;
    if (agreeing.length >= Math.ceil(settings.levelShiftShare * valid.length) && sign * centerZ >= settings.levelShiftZ) {
      return pattern({
        kind: BriefingPatternKind.LEVEL_SHIFT, signal, spec,
        startDate: valid[0].date, endDate: valid.at(-1).date, direction,
        magnitude: { medianZ: round(centerZ, 2),
          ratioToBaseline: round(median(valid.map((point) => point.value)) / stats.median, 3) },
        support: { days: valid.length, agreeingDays: agreeing.length, baselineDays: stats.n },
        dates: agreeing.map((point) => point.date),
      });
    }
  }
  return null;
}

function detectDispersionChange({ signal, spec, series, stats, baseValues, settings }) {
  const values = series.map((point) => point.value).filter((value) => value != null);
  if (values.length < settings.dispersionMinDays) return null;
  const windowScale = robustStats(values, spec).scale;
  const baseScale = robustStats(baseValues, spec).scale;
  const ratio = windowScale / baseScale;
  if (!(ratio >= settings.dispersionRatio)) return null;
  const dated = series.filter((point) => point.value != null);
  return pattern({
    kind: BriefingPatternKind.DISPERSION_CHANGE, signal, spec,
    startDate: dated[0].date, endDate: dated.at(-1).date, direction: "more_variable",
    magnitude: { dispersionRatio: round(ratio, 2) },
    support: { days: values.length, baselineDays: stats.n },
    dates: dated.map((point) => point.date),
  });
}

function detectFrequencyChange({ signal, spec, rate, windowObserved, hits, settings, window }) {
  if (!windowObserved.length) return null;
  const expected = rate * windowObserved.length;
  const delta = hits.length - expected;
  if (Math.abs(delta) < Math.max(settings.frequencyMinDelta, settings.frequencyRelativeDelta * expected)) return null;
  return pattern({
    kind: BriefingPatternKind.FREQUENCY_CHANGE, signal, spec,
    startDate: window.startDate, endDate: window.endDate,
    direction: delta < 0 ? "below" : "above",
    magnitude: { observed: hits.length, expected: round(expected, 1) },
    support: { observedDays: windowObserved.length },
    dates: hits,
  });
}

// A run of consecutive, otherwise-observable days on which a routine event
// did not happen, improbable under the person's own weekday routine (a
// scheduled rest day is not a missed session) and missing at least
// `minExpectedMissed` sessions the routine would have held. An unobservable
// day breaks the run: it is a data gap, not an absence.
function detectRoutineGaps({ signal, spec, weekdayRate, windowDates, observable, happened, settings }) {
  if (!weekdayRate?.some((value) => value > 0)) return [];
  const gaps = [];
  let current = [];
  const close = () => {
    const rates = current.map((date) => weekdayRate[weekdayOf(date)]);
    const chance = rates.reduce((product, value) => product * (1 - value), 1);
    const expectedMissed = rates.reduce((sum, value) => sum + value, 0);
    if (current.length >= settings.minRunDays && chance <= settings.absenceChanceCeiling &&
        expectedMissed >= settings.minExpectedMissed) {
      gaps.push(pattern({
        kind: BriefingPatternKind.ROUTINE_GAP, signal, spec,
        startDate: current[0], endDate: current.at(-1), direction: "absent",
        magnitude: { consecutiveDays: current.length, expectedMissed: round(expectedMissed, 2),
          chanceUnderRoutine: round(chance, 3) },
        support: { days: current.length, observedAbsence: true },
        dates: [...current],
      }));
    }
    current = [];
  };
  for (const date of windowDates) {
    if (!observable(date) || happened(date)) { close(); continue; }
    current.push(date);
  }
  close();
  return gaps;
}

// Behavior patterns from different domains whose spans overlap or touch form
// one routine shift: several parts of the usual routine changed together. No
// cause is attributed — only that they happened in the same stretch.
function detectRoutineShifts({ patterns, window, settings }) {
  const spanned = patterns.filter((item) => [BriefingPatternKind.VALUE_RUN, BriefingPatternKind.ROUTINE_GAP].includes(item.kind));
  const groups = [];
  for (const item of [...spanned].sort((left, right) => left.span.startDate.localeCompare(right.span.startDate))) {
    const group = groups.find((candidate) => spansTouch(candidate.span, item.span));
    if (group) {
      group.members.push(item);
      group.span = { startDate: minDate(group.span.startDate, item.span.startDate),
        endDate: maxDate(group.span.endDate, item.span.endDate) };
    } else {
      groups.push({ span: { ...item.span }, members: [item] });
    }
  }
  return groups
    .filter((group) => new Set(group.members.map((item) => item.domain)).size >= 2)
    .map((group) => {
      const domains = [...new Set(group.members.map((item) => item.domain))].sort();
      const days = dateRange(group.span.startDate, group.span.endDate).length;
      return {
        id: `routine_shift|${group.span.startDate}|${group.span.endDate}|${domains.join("+")}`,
        kind: BriefingPatternKind.ROUTINE_SHIFT,
        domains,
        signals: group.members.map((item) => item.signal),
        span: { ...group.span, days },
        position: periodPosition(group.span, window),
        direction: "changed",
        measurementTypes: [...new Set(group.members.map((item) => item.measurementType))].sort(),
        causalClaim: "co_occurrence",
        members: group.members.map((item) => item.id),
        support: { memberCount: group.members.length, domainCount: domains.length },
      };
    });
}

// Did a comparable multi-domain break already happen inside the baseline?
// Detected with the same machinery over each earlier week-length slice, so a
// recurrence is evidence, never an assumption.
// Only within `recurrenceLookbackDays`, and never the current break itself:
// a gap that runs into the window's first day is the same episode, not an
// earlier one.
function detectRecurrence({ segments, baselineDates, dayAt, observable, settings, window }) {
  const result = new Map();
  if (!segments.length || baselineDates.length < 14) return result;
  const trainingRate = rateOf(baselineDates, dayAt, observable, "training.session");
  if (!(trainingRate > 0)) return result;
  const happened = (date) => occurred(dayAt(date), "training.session");
  const weekdayRate = weekdayRates(baselineDates.filter(observable), happened, trainingRate);
  const scan = baselineDates.slice(-Math.max(7, settings.recurrenceLookbackDays));
  const dayBefore = shiftDate(window.startDate, -1);
  const found = detectRoutineGaps({ signal: "training.session", spec: OCCURRENCE_SIGNALS["training.session"],
    weekdayRate, windowDates: scan, observable, happened, settings })
    .map((gap) => ({ startDate: gap.span.startDate, endDate: gap.span.endDate, signal: gap.signal }));
  for (const segment of segments) {
    if (!segment.signals.includes("training.session")) continue;
    const prior = found.filter((gap) => !(gap.endDate === dayBefore && segment.span.startDate === window.startDate &&
      !happened(window.startDate)));
    if (prior.length) result.set(segment.id, { priorSpans: prior.slice(-2), count: prior.length,
      lookbackDays: scan.length });
  }
  return result;
}

function detectReliabilityFindings({ windowDates, baselineDates, dayAt, settings }) {
  const findings = [];
  const proteinBase = baselineDates.map((date) => dayAt(date).nutrition)
    .filter((item) => Number.isFinite(item?.protein) && Number.isFinite(item?.calories) && item.calories > 0);
  const proteinStats = proteinBase.length >= settings.minBaselineValueDays
    ? robustStats(proteinBase.map((item) => item.protein), { scaleFloor: 10, relativeFloor: 0.06 }) : null;
  const shareStats = proteinBase.length >= settings.minBaselineValueDays
    ? robustStats(proteinBase.map((item) => (item.protein * 4) / item.calories), { scaleFloor: 0.02, relativeFloor: 0.05 }) : null;
  let previous = null;
  for (const date of windowDates) {
    const nutrition = dayAt(date).nutrition;
    if (nutrition && Number.isFinite(nutrition.calories)) {
      if (proteinStats && shareStats && Number.isFinite(nutrition.protein) && nutrition.calories > 0) {
        const proteinZ = (nutrition.protein - proteinStats.median) / proteinStats.scale;
        const shareZ = ((nutrition.protein * 4) / nutrition.calories - shareStats.median) / shareStats.scale;
        if (proteinZ <= -settings.reliabilityZ && shareZ <= -settings.reliabilityZ) {
          findings.push({ id: `reliability|nutrition|${date}|implausible_macro_profile`, domain: "nutrition", date,
            kind: "implausible_macro_profile", effect: "excluded_from_behavior",
            evidence: { proteinZ: round(proteinZ, 2), proteinShareZ: round(shareZ, 2) } });
        }
      }
      if (previous && sameTotals(previous.nutrition, nutrition)) {
        findings.push({ id: `reliability|nutrition|${date}|duplicate_day_totals`, domain: "nutrition", date,
          kind: "duplicate_day_totals", effect: "excluded_from_behavior", evidence: { duplicateOf: previous.date } });
      }
      if (nutrition.completeness === "partial") {
        findings.push({ id: `reliability|nutrition|${date}|partial_day`, domain: "nutrition", date,
          kind: "partial_day", effect: "excluded_from_behavior", evidence: {} });
      }
    }
    previous = nutrition && Number.isFinite(nutrition.calories) ? { date, nutrition } : null;
  }
  return findings;
}

// ---------------------------------------------------------------- ranking

function materiality(item, settings) {
  const weight = (domain) => settings.domainWeights[domain] ?? 0.5;
  if (item.kind === BriefingPatternKind.ROUTINE_SHIFT) return item.materiality ?? 0;
  const w = weight(item.domain) * (item.measurementType === "wearable_estimate" ? 0.85 : 1);
  if (item.kind === BriefingPatternKind.VALUE_RUN) {
    return w * (1 + Math.min(2, item.magnitude.minZ / settings.deviationZ)) * Math.min(1.5, item.support.days / 2);
  }
  if (item.kind === BriefingPatternKind.LEVEL_SHIFT) {
    return w * (1.5 + Math.min(2, Math.abs(item.magnitude.medianZ)));
  }
  if (item.kind === BriefingPatternKind.ROUTINE_GAP) {
    const surprise = Math.log(item.magnitude.chanceUnderRoutine) / Math.log(settings.absenceChanceCeiling);
    return w * (1.5 + Math.min(1.5, surprise)) * Math.min(1.5, item.support.days / 2);
  }
  if (item.kind === BriefingPatternKind.FREQUENCY_CHANGE) {
    const relative = Math.abs(item.magnitude.observed - item.magnitude.expected) / Math.max(1, item.magnitude.expected);
    return w * (1.5 + Math.min(1.5, relative * 2));
  }
  if (item.kind === BriefingPatternKind.DISPERSION_CHANGE) {
    return w * Math.min(2.5, item.magnitude.dispersionRatio / 1.5);
  }
  return 0;
}

// A shift is as material as its strongest member, strengthened by each
// co-occurring domain (supporting-only measurement habits add least) and by
// evidenced recurrence — never a fixed floor that lets weak members lead.
function shiftMateriality(segment, byId, settings) {
  const members = segment.members.map((id) => byId.get(id)).filter(Boolean)
    .sort((left, right) => right.materiality - left.materiality);
  if (!members.length) return 0;
  const supporting = (item) => settings.supportingOnlyDomains.includes(item.domain) ? 0.25 : 0.5;
  const rest = members.slice(1).reduce((sum, item) => sum + supporting(item) * item.materiality, 0);
  return members[0].materiality + rest + (segment.recurrence ? 0.5 : 0);
}

// Keep the few most material, non-redundant findings: one finding per signal
// (so "below all week" and "above Sun–Mon" never lead together), and a
// signal already told by a routine shift is not repeated on its own.
function selectCharacterization(ranked, settings, byId = new Map()) {
  const told = new Set();
  const toldSignals = new Set();
  const selected = [];
  for (const item of ranked) {
    if (item.materiality < settings.minMateriality) continue;
    if (told.has(item.id)) continue;
    if (item.signal && toldSignals.has(item.signal)) continue;
    // Measurement habits (weigh-ins) can support a routine shift but never
    // characterize a period on their own.
    if (item.kind !== BriefingPatternKind.ROUTINE_SHIFT && settings.supportingOnlyDomains.includes(item.domain)) continue;
    if (item.kind === BriefingPatternKind.FREQUENCY_CHANGE &&
        selected.some((other) => other.signals?.includes(item.signal) || other.signal === item.signal)) continue;
    selected.push(item);
    if (item.signal) toldSignals.add(item.signal);
    for (const member of item.members ?? []) {
      told.add(member);
      const signal = byId.get(member)?.signal;
      if (signal) toldSignals.add(signal);
    }
    if (selected.length >= settings.maxCharacterization) break;
  }
  return selected;
}

// ---------------------------------------------------------------- helpers

function pattern({ kind, signal, spec, startDate, endDate, direction, magnitude, support, dates }) {
  return {
    id: `${kind}|${signal}|${startDate}|${endDate}|${direction}`,
    kind, signal, domain: spec.domain, measurementType: spec.measurementType,
    span: { startDate, endDate, days: dateRange(startDate, endDate).length },
    direction, magnitude, support, dates: [...dates],
    causalClaim: "none",
  };
}

function signalValue(day, signal) {
  if (signal === "nutrition.calories") return num(day?.nutrition?.calories);
  if (signal === "activity.active_kcal") return num(day?.activity?.activeKcal);
  if (signal === "activity.exercise_minutes") return num(day?.activity?.exerciseMinutes);
  return null;
}

function occurred(day, signal) {
  if (signal === "training.session") return Number(day?.training?.sessions ?? 0) > 0;
  if (signal === "body.weigh_in") return day?.body?.weighIn === true;
  return false;
}

// Observable = some independent record shows the person was engaged with
// tracking that day, so "no training recorded" can mean no training.
function isObservableDay(day) {
  return Number.isFinite(num(day?.activity?.activeKcal)) || Number.isFinite(num(day?.nutrition?.calories)) ||
    day?.body?.weighIn === true || Number(day?.training?.sessions ?? 0) > 0;
}

// Per-weekday habit, shrunk toward the overall rate where a weekday has few
// observations, so a scheduled rest day reads as routine, not as a miss.
function weekdayRates(observedDates, happened, overall) {
  const hits = Array(7).fill(0);
  const seen = Array(7).fill(0);
  for (const date of observedDates) {
    const weekday = weekdayOf(date);
    seen[weekday] += 1;
    if (happened(date)) hits[weekday] += 1;
  }
  return hits.map((count, weekday) => (count + overall) / (seen[weekday] + 1));
}

function weekdayOf(date) { return new Date(`${date}T12:00:00.000Z`).getUTCDay(); }

function rateOf(dates, dayAt, observable, signal) {
  const observed = dates.filter(observable);
  if (!observed.length) return 0;
  return observed.filter((date) => occurred(dayAt(date), signal)).length / observed.length;
}

// Two independently logged days essentially never match on every macro; a
// near-identical repeat (within rounding) is a carried-over record.
function sameTotals(left, right) {
  const keys = ["calories", "protein", "carbs", "fat"];
  return keys.every((key) => {
    const a = left?.[key];
    const b = right?.[key];
    return Number.isFinite(a) && Number.isFinite(b) &&
      Math.abs(a - b) <= Math.max(1, 0.005 * Math.max(Math.abs(a), Math.abs(b)));
  });
}

function robustStats(values, spec) {
  const med = median(values);
  const mad = median(values.map((value) => Math.abs(value - med))) * 1.4826;
  const scale = Math.max(mad, spec.scaleFloor ?? 0, Math.abs(med) * (spec.relativeFloor ?? 0));
  return { median: med, scale, n: values.length };
}

function periodPosition(span, window) {
  const total = dateRange(window.startDate, window.endDate).length;
  const start = dateRange(window.startDate, span.startDate).length - 1;
  const end = dateRange(window.startDate, span.endDate).length - 1;
  const center = (start + end) / 2 / Math.max(1, total - 1);
  if (end - start + 1 >= total - 1) return "whole";
  if (center >= 0.6) return "late";
  if (center <= 0.4) return "early";
  return "middle";
}

function spansTouch(left, right) {
  return !(shiftDate(left.endDate, 1) < right.startDate || shiftDate(right.endDate, 1) < left.startDate);
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  if (!sorted.length) return NaN;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mean(values) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function num(value) { return value == null || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null; }
function round(value, places = 1) { const f = 10 ** places; return Math.round(Number(value) * f) / f; }
function isDate(value) { return /^\d{4}-\d{2}-\d{2}$/u.test(String(value ?? "")); }
function minDate(left, right) { return left < right ? left : right; }
function maxDate(left, right) { return left > right ? left : right; }

export function shiftDate(date, days) {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function dateRange(startDate, endDate) {
  const dates = [];
  for (let date = startDate; date <= endDate; date = shiftDate(date, 1)) dates.push(date);
  return dates;
}

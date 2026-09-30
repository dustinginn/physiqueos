const PATTERNS = new Set(["stay", "titrate_up", "titrate_down", "up_hold_down", "custom"]);
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function normalizePeptideDosingStrategy(value = {}) {
  const pattern = PATTERNS.has(value.pattern) ? value.pattern : "stay";
  return {
    schemaVersion: 1,
    pattern,
    startingDose: dose(value.startingDose),
    startDate: String(value.startDate ?? ""),
    stepAmount: decimal(value.stepAmount),
    stepInterval: positiveInteger(value.stepInterval, 1),
    stepUnit: value.stepUnit === "days" ? "days" : "weeks",
    targetDose: decimal(value.targetDose),
    holdDuration: positiveInteger(value.holdDuration, 1),
    holdUnit: value.holdUnit === "days" ? "days" : "weeks",
    decreaseAmount: decimal(value.decreaseAmount ?? value.stepAmount),
    decreaseInterval: positiveInteger(value.decreaseInterval ?? value.stepInterval, 1),
    decreaseUnit: value.decreaseUnit === "days" ? "days" : "weeks",
    landingDose: decimal(value.landingDose),
    endDate: value.endDate ? String(value.endDate) : null,
  };
}

/// Reads `executionItem.scheduleSuspensions` (or a raw list) as the canonical
/// suspension records. An absent or malformed field is `[]`; stored order is
/// kept so "paused" stays "the last suspension has no resumedOn".
export function normalizeScheduleSuspensions(item) {
  const raw = Array.isArray(item) ? item : item?.scheduleSuspensions;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry) => entry && DATE_ONLY.test(String(entry.pausedFrom ?? "")))
    .map((entry) => ({
      pausedFrom: String(entry.pausedFrom),
      resumedOn: DATE_ONLY.test(String(entry.resumedOn ?? "")) ? String(entry.resumedOn) : null,
      pausedAt: entry.pausedAt == null ? null : String(entry.pausedAt),
      resumedAt: entry.resumedAt == null ? null : String(entry.resumedAt),
      reason: entry.reason == null || entry.reason === "" ? null : String(entry.reason),
      pausedExecutionRevision: entry.pausedExecutionRevision == null ? null : Number(entry.pausedExecutionRevision),
      resumedExecutionRevision: entry.resumedExecutionRevision == null ? null : Number(entry.resumedExecutionRevision),
    }));
}

/// True when `date` falls inside a suspension window: pausedFrom <= date and,
/// for a closed window, date < resumedOn (the resume day is eligible again).
export function isDateSuspended(suspensions, date) {
  const day = String(date ?? "");
  if (!DATE_ONLY.test(day)) return false;
  return normalizeScheduleSuspensions(suspensions).some((window) =>
    window.pausedFrom <= day && (window.resumedOn === null || day < window.resumedOn)
  );
}

/// Generates the dated phases for a strategy. Closed suspension windows that
/// start after the strategy's start date shift every later phase start by the
/// window length (applied chronologically on already-shifted dates) so the plan
/// is frozen through the pause: the phase containing the pause extends through
/// it and the following steps resume afterwards. Open windows and windows at
/// or before the strategy start contribute nothing; `stay` plans have no later
/// boundaries and are unaffected (S3): an explicit stay end date is a literal
/// date the Founder chose and is never shifted, while a fixed-duration
/// titration's end date moves with its steps.
export function generatePeptideDosingTimeline(value, { suspensions = [] } = {}) {
  const strategy = normalizePeptideDosingStrategy(value);
  if (strategy.pattern === "custom") return null;
  validateStrategy(strategy);
  const entries = [{ startDate: strategy.startDate, amount: number(strategy.startingDose.amount), note: "" }];
  if (strategy.pattern === "titrate_up" || strategy.pattern === "titrate_down") {
    addSteps(entries, {
      direction: strategy.pattern === "titrate_up" ? 1 : -1,
      amount: number(strategy.stepAmount), interval: strategy.stepInterval, unit: strategy.stepUnit,
      target: number(strategy.targetDose),
    });
  } else if (strategy.pattern === "up_hold_down") {
    addSteps(entries, { direction: 1, amount: number(strategy.stepAmount), interval: strategy.stepInterval, unit: strategy.stepUnit, target: number(strategy.targetDose) });
    entries.at(-1).note = `Hold for ${strategy.holdDuration} ${strategy.holdUnit}`;
    const decreaseStart = addDate(entries.at(-1).startDate, strategy.holdDuration, strategy.holdUnit);
    if (number(strategy.landingDose) < number(strategy.targetDose)) {
      entries.push({ startDate: decreaseStart, amount: clamp(number(strategy.targetDose) - number(strategy.decreaseAmount)), note: "" });
      addSteps(entries, { direction: -1, amount: number(strategy.decreaseAmount), interval: strategy.decreaseInterval, unit: strategy.decreaseUnit, target: number(strategy.landingDose) });
    }
  }
  let finalEndDate = strategy.endDate;
  const windows = strategy.pattern === "stay" ? [] : applicableSuspensionWindows(suspensions, strategy.startDate);
  for (const window of windows) {
    const shift = daysBetween(window.pausedFrom, window.resumedOn);
    if (shift <= 0) continue;
    for (let index = 1; index < entries.length; index += 1) {
      if (entries[index].startDate >= window.pausedFrom) entries[index].startDate = addDate(entries[index].startDate, shift, "days");
    }
    if (finalEndDate && finalEndDate >= window.pausedFrom) finalEndDate = addDate(finalEndDate, shift, "days");
  }
  return entries.map((entry, index) => ({
    startDate: entry.startDate,
    endDate: index < entries.length - 1 ? addDate(entries[index + 1].startDate, -1, "days") : finalEndDate,
    dose: { amount: formatDecimal(entry.amount), unit: strategy.startingDose.unit },
    notes: entry.note,
  }));
}

/// History-preserving composition (S1): the stored timeline becomes the phases
/// that started before the strategy (closed at strategy.startDate - 1 when the
/// last of them is still open or ends on/after it) followed by the generated
/// phases. Pure; idempotent for the same strategy on the same day.
export function composeTimelineWithStrategy({ existingTimeline = [], strategy, generated = [] } = {}) {
  const startDate = String(strategy?.startDate ?? "");
  const frozen = normalizeTimeline(existingTimeline).filter((phase) => phase.startDate < startDate);
  const last = frozen.at(-1);
  if (last && (!last.endDate || last.endDate >= startDate)) {
    frozen[frozen.length - 1] = { ...last, endDate: addDate(startDate, -1, "days") };
  }
  return [...frozen, ...normalizeTimeline(generated)];
}

/// Hydrates the editor's strategy from a stored record. `timeline` is always
/// the full stored timeline (frozen history included); `generated` is what the
/// strategy produces with the record's closed suspension windows. The record is
/// `structured` only when that generated tail equals the stored phases from the
/// strategy start and every earlier phase is closed before it.
export function hydratePeptideDosingStrategy(executionItem, options = {}) {
  const stored = executionItem?.dosingStrategy;
  const timeline = normalizeTimeline(executionItem?.timeline);
  const suspensions = options.suspensions === undefined
    ? normalizeScheduleSuspensions(executionItem)
    : normalizeScheduleSuspensions(options.suspensions);
  if (stored) {
    try {
      const strategy = normalizePeptideDosingStrategy(stored);
      const generated = generatePeptideDosingTimeline(strategy, { suspensions });
      if (generated && reproducesStoredTail(generated, timeline, strategy.startDate)) {
        return { mode: "structured", strategy, timeline, generated };
      }
    } catch { /* preserve as compatibility data */ }
  }
  if (timeline.length === 1) {
    const phase = timeline[0];
    return { mode: "structured", strategy: normalizePeptideDosingStrategy({ pattern: "stay", startingDose: phase.dose, startDate: phase.startDate, endDate: phase.endDate }), timeline, generated: timeline };
  }
  return {
    mode: "legacy_custom",
    strategy: normalizePeptideDosingStrategy({ pattern: "custom", startingDose: timeline[0]?.dose, startDate: timeline[0]?.startDate }),
    timeline,
    generated: null,
  };
}

export function formatDosingStrategyPreview(value, existingTimeline = [], { suspensions = [] } = {}) {
  const strategy = normalizePeptideDosingStrategy(value);
  let timeline;
  try {
    timeline = strategy.pattern === "custom" ? normalizeTimeline(existingTimeline) : generatePeptideDosingTimeline(strategy, { suspensions });
  } catch {
    return ["Complete the dosing choices to preview the generated plan."];
  }
  if (!timeline?.length) return ["No dosing phases configured."];
  return timeline.map((phase, index) => {
    const date = new Date(`${phase.startDate}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    const suffix = index === timeline.length - 1 && !phase.endDate ? " · Continue until changed" : phase.notes ? ` · ${phase.notes}` : "";
    return `${date} · ${phase.dose.amount} ${phase.dose.unit}${suffix}`;
  });
}

function reproducesStoredTail(generated, timeline, startDate) {
  const frozen = timeline.filter((phase) => phase.startDate < startDate);
  if (frozen.some((phase) => !phase.endDate || phase.endDate >= startDate)) return false;
  const tail = timeline.filter((phase) => phase.startDate >= startDate);
  return JSON.stringify(generated) === JSON.stringify(tail);
}
function applicableSuspensionWindows(suspensions, startDate) {
  return normalizeScheduleSuspensions(suspensions)
    .filter((window) => window.resumedOn !== null && window.pausedFrom > startDate && window.resumedOn > window.pausedFrom)
    .sort((left, right) => (left.pausedFrom < right.pausedFrom ? -1 : left.pausedFrom > right.pausedFrom ? 1 : 0));
}
function validateStrategy(strategy) {
  if (!DATE_ONLY.test(strategy.startDate)) throw new Error("Choose a valid dosing start date.");
  if (!(number(strategy.startingDose.amount) > 0) || !strategy.startingDose.unit) throw new Error("Enter a starting dose and unit.");
  if (strategy.endDate && strategy.endDate < strategy.startDate) throw new Error("Choose an end date after the dosing start date.");
  if (["titrate_up", "titrate_down", "up_hold_down"].includes(strategy.pattern) && !(number(strategy.stepAmount) > 0)) throw new Error("Enter a valid dose change.");
  if (strategy.pattern === "titrate_up" && !(number(strategy.targetDose) >= number(strategy.startingDose.amount))) throw new Error("Target dose must be at least the starting dose.");
  if (strategy.pattern === "titrate_down" && !(number(strategy.targetDose) <= number(strategy.startingDose.amount) && number(strategy.targetDose) > 0)) throw new Error("Target dose must be below the starting dose.");
  if (strategy.pattern === "up_hold_down") {
    if (!(number(strategy.targetDose) >= number(strategy.startingDose.amount))) throw new Error("Peak dose must be at least the starting dose.");
    if (!(number(strategy.decreaseAmount) > 0) || !(number(strategy.landingDose) > 0 && number(strategy.landingDose) <= number(strategy.targetDose))) throw new Error("Enter a valid landing strategy.");
  }
}
function addSteps(entries, config) {
  let current = entries.at(-1).amount;
  let date = entries.at(-1).startDate;
  for (let guard = 0; guard < 500 && current !== config.target; guard += 1) {
    const candidate = clamp(current + config.direction * config.amount);
    current = config.direction > 0 ? Math.min(candidate, config.target) : Math.max(candidate, config.target);
    date = addDate(date, config.interval, config.unit);
    entries.push({ startDate: date, amount: current, note: "" });
  }
}
function addDate(date, count, unit) { const parsed = new Date(`${date}T12:00:00Z`); parsed.setUTCDate(parsed.getUTCDate() + count * (unit === "weeks" ? 7 : 1)); return parsed.toISOString().slice(0, 10); }
function daysBetween(from, to) { return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000); }
function dose(value = {}) { return { amount: decimal(value.amount ?? value.value), unit: String(value.unit ?? "mg").trim() }; }
function decimal(value) { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? formatDecimal(parsed) : ""; }
function number(value) { return Number(value); }
function positiveInteger(value, fallback) { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback; }
function clamp(value) { return Math.round((value + Number.EPSILON) * 1000000) / 1000000; }
/// The one dose-amount normalization ("2.0" and "2" are the same dose); shared
/// with the save guard so stored and generated amounts compare by value.
export function formatDecimal(value) { return String(clamp(Number(value))); }
function normalizeTimeline(value) { return (Array.isArray(value) ? value : []).map((phase) => ({ startDate: String(phase.startDate), endDate: phase.endDate ? String(phase.endDate) : null, dose: { amount: String(phase.dose?.amount ?? ""), unit: String(phase.dose?.unit ?? "") }, notes: String(phase.notes ?? "") })); }

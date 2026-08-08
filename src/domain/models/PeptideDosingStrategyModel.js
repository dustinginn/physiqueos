const PATTERNS = new Set(["stay", "titrate_up", "titrate_down", "up_hold_down", "custom"]);

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

export function generatePeptideDosingTimeline(value) {
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
  return entries.map((entry, index) => ({
    startDate: entry.startDate,
    endDate: index < entries.length - 1 ? addDate(entries[index + 1].startDate, -1, "days") : strategy.endDate,
    dose: { amount: formatDecimal(entry.amount), unit: strategy.startingDose.unit },
    notes: entry.note,
  }));
}

export function hydratePeptideDosingStrategy(executionItem) {
  const stored = executionItem?.dosingStrategy;
  if (stored) {
    try {
      const strategy = normalizePeptideDosingStrategy(stored);
      const generated = generatePeptideDosingTimeline(strategy);
      if (generated && JSON.stringify(generated) === JSON.stringify(normalizeTimeline(executionItem.timeline))) {
        return { mode: "structured", strategy, timeline: generated };
      }
    } catch { /* preserve as compatibility data */ }
  }
  const timeline = normalizeTimeline(executionItem?.timeline);
  if (timeline.length === 1) {
    const phase = timeline[0];
    return { mode: "structured", strategy: normalizePeptideDosingStrategy({ pattern: "stay", startingDose: phase.dose, startDate: phase.startDate, endDate: phase.endDate }), timeline };
  }
  return {
    mode: "legacy_custom",
    strategy: normalizePeptideDosingStrategy({ pattern: "custom", startingDose: timeline[0]?.dose, startDate: timeline[0]?.startDate }),
    timeline,
  };
}

export function formatDosingStrategyPreview(value, existingTimeline = []) {
  const strategy = normalizePeptideDosingStrategy(value);
  let timeline;
  try {
    timeline = strategy.pattern === "custom" ? normalizeTimeline(existingTimeline) : generatePeptideDosingTimeline(strategy);
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

function validateStrategy(strategy) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(strategy.startDate)) throw new Error("Choose a valid dosing start date.");
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
function dose(value = {}) { return { amount: decimal(value.amount ?? value.value), unit: String(value.unit ?? "mg").trim() }; }
function decimal(value) { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? formatDecimal(parsed) : ""; }
function number(value) { return Number(value); }
function positiveInteger(value, fallback) { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback; }
function clamp(value) { return Math.round((value + Number.EPSILON) * 1000000) / 1000000; }
function formatDecimal(value) { return String(clamp(Number(value))); }
function normalizeTimeline(value) { return (Array.isArray(value) ? value : []).map((phase) => ({ startDate: String(phase.startDate), endDate: phase.endDate ? String(phase.endDate) : null, dose: { amount: String(phase.dose?.amount ?? ""), unit: String(phase.dose?.unit ?? "") }, notes: String(phase.notes ?? "") })); }

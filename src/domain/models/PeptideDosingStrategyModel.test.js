import { describe, expect, it } from "vitest";
import {
  composeTimelineWithStrategy,
  formatDosingStrategyPreview,
  generatePeptideDosingTimeline,
  hydratePeptideDosingStrategy,
  isDateSuspended,
  normalizeScheduleSuspensions,
} from "./PeptideDosingStrategyModel";

describe("peptide dosing strategy", () => {
  it("generates a stay-at-dose phase with an open final state", () => {
    expect(generatePeptideDosingTimeline(base({ pattern: "stay" }))).toEqual([
      phase("2026-05-21", null, "0.5"),
    ]);
  });

  it("generates deterministic titrate-up and titrate-down dates", () => {
    expect(generatePeptideDosingTimeline(base({ pattern: "titrate_up", targetDose: "1.5" }))).toEqual([
      phase("2026-05-21", "2026-05-27", "0.5"),
      phase("2026-05-28", "2026-06-03", "1"),
      phase("2026-06-04", null, "1.5"),
    ]);
    expect(generatePeptideDosingTimeline(base({ pattern: "titrate_down", startingDose: { amount: "1.5", unit: "mg" }, targetDose: "0.5" }))).toEqual([
      phase("2026-05-21", "2026-05-27", "1.5"),
      phase("2026-05-28", "2026-06-03", "1"),
      phase("2026-06-04", null, "0.5"),
    ]);
  });

  it("generates the Retatrutide-style up, hold, and down plan", () => {
    const timeline = generatePeptideDosingTimeline(upHoldDown());
    expect(timeline).toHaveLength(7);
    expect(timeline[3]).toMatchObject({ startDate: "2026-06-11", endDate: "2026-07-22", dose: { amount: "2" } });
    expect(timeline.at(-1)).toEqual(phase("2026-08-06", null, "0.5"));
    expect(formatDosingStrategyPreview(upHoldDown()).at(-1)).toContain("Continue until changed");
  });

  it("rehydrates generated data and fails legacy manual data safely", () => {
    const strategy = base({ pattern: "titrate_up", targetDose: "1.5" });
    const timeline = generatePeptideDosingTimeline(strategy);
    expect(hydratePeptideDosingStrategy({ dosingStrategy: strategy, timeline }).mode).toBe("structured");
    expect(hydratePeptideDosingStrategy({ timeline: [phase("2026-05-21", "2026-05-27", "0.5"), phase("2026-06-01", null, "0.8")] })).toMatchObject({
      mode: "legacy_custom",
      strategy: { pattern: "custom" },
      generated: null,
    });
  });
});

describe("Founder-shaped records", () => {
  it("hydrates the up_hold_down plan from 2026-05-21 (7 phases, last open) as structured with the full timeline", () => {
    const record = { dosingStrategy: upHoldDown(), timeline: retatrutideShapedTimeline() };
    const hydration = hydratePeptideDosingStrategy(record);
    expect(hydration.mode).toBe("structured");
    expect(hydration.strategy.pattern).toBe("up_hold_down");
    expect(hydration.timeline).toEqual(retatrutideShapedTimeline());
    expect(hydration.generated).toEqual(retatrutideShapedTimeline());
    expect(hydration.timeline.map((entry) => entry.startDate)).toEqual([
      "2026-05-21", "2026-05-28", "2026-06-04", "2026-06-11", "2026-07-23", "2026-07-30", "2026-08-06",
    ]);
    expect(hydration.timeline[3].notes).toBe("Hold for 6 weeks");
    expect(hydration.timeline.at(-1).endDate).toBeNull();
  });

  it("hydrates the stay plan from 2026-05-24 as structured", () => {
    const strategy = base({ pattern: "stay", startingDose: { amount: "1", unit: "mg" }, startDate: "2026-05-24", targetDose: "1", landingDose: "1" });
    const record = { dosingStrategy: strategy, timeline: [phase("2026-05-24", null, "1")] };
    expect(hydratePeptideDosingStrategy(record)).toMatchObject({
      mode: "structured",
      strategy: { pattern: "stay", startDate: "2026-05-24" },
      timeline: [phase("2026-05-24", null, "1")],
      generated: [phase("2026-05-24", null, "1")],
    });
  });

  it("treats an absent scheduleSuspensions field as no suspensions", () => {
    const withoutField = hydratePeptideDosingStrategy({ dosingStrategy: upHoldDown(), timeline: retatrutideShapedTimeline() });
    const withEmpty = hydratePeptideDosingStrategy({ dosingStrategy: upHoldDown(), timeline: retatrutideShapedTimeline(), scheduleSuspensions: [] });
    const withNull = hydratePeptideDosingStrategy({ dosingStrategy: upHoldDown(), timeline: retatrutideShapedTimeline(), scheduleSuspensions: null });
    expect(withoutField).toEqual(withEmpty);
    expect(withNull).toEqual(withEmpty);
    expect(withoutField.mode).toBe("structured");
  });
});

describe("suspension-aware generation", () => {
  it("ignores an open window", () => {
    const timeline = generatePeptideDosingTimeline(upHoldDown(), { suspensions: [window("2026-07-01", null)] });
    expect(timeline).toEqual(retatrutideShapedTimeline());
  });

  it("ignores windows at or before the strategy start", () => {
    const before = generatePeptideDosingTimeline(upHoldDown(), { suspensions: [window("2026-05-01", "2026-05-10")] });
    const spanning = generatePeptideDosingTimeline(upHoldDown(), { suspensions: [window("2026-05-10", "2026-06-01")] });
    const onStart = generatePeptideDosingTimeline(upHoldDown(), { suspensions: [window("2026-05-21", "2026-05-30")] });
    expect(before).toEqual(retatrutideShapedTimeline());
    expect(spanning).toEqual(retatrutideShapedTimeline());
    expect(onStart).toEqual(retatrutideShapedTimeline());
  });

  it("leaves stay plans unaffected", () => {
    const stay = base({ pattern: "stay", startDate: "2026-05-24" });
    expect(generatePeptideDosingTimeline(stay, { suspensions: [window("2026-06-01", "2026-06-10")] })).toEqual([
      phase("2026-05-24", null, "0.5"),
    ]);
    const stayWithEnd = base({ pattern: "stay", startDate: "2026-05-24", endDate: "2026-06-30" });
    expect(generatePeptideDosingTimeline(stayWithEnd, { suspensions: [window("2026-06-01", "2026-06-10")] })).toEqual([
      phase("2026-05-24", "2026-07-09", "0.5"),
    ]);
  });

  it("shifts later starts by a 9-day closed window mid-hold and extends the hold phase through the pause with no gap", () => {
    const suspensions = [window("2026-07-01", "2026-07-10")];
    const timeline = generatePeptideDosingTimeline(upHoldDown(), { suspensions });
    expect(timeline).toEqual([
      phase("2026-05-21", "2026-05-27", "0.5"),
      phase("2026-05-28", "2026-06-03", "1"),
      phase("2026-06-04", "2026-06-10", "1.5"),
      phase("2026-06-11", "2026-07-31", "2", "Hold for 6 weeks"),
      phase("2026-08-01", "2026-08-07", "1.5"),
      phase("2026-08-08", "2026-08-14", "1"),
      phase("2026-08-15", null, "0.5"),
    ]);
    expectContiguous(timeline);
    const stored = { dosingStrategy: upHoldDown(), timeline, scheduleSuspensions: suspensions };
    expect(hydratePeptideDosingStrategy(stored)).toMatchObject({ mode: "structured", generated: timeline, timeline });
    expect(hydratePeptideDosingStrategy({ ...stored, scheduleSuspensions: undefined }).mode).toBe("legacy_custom");
  });

  it("extends the previous phase through a window that starts exactly on a step day", () => {
    const timeline = generatePeptideDosingTimeline(base({ pattern: "titrate_up", targetDose: "1.5" }), {
      suspensions: [window("2026-05-28", "2026-06-04")],
    });
    expect(timeline).toEqual([
      phase("2026-05-21", "2026-06-03", "0.5"),
      phase("2026-06-04", "2026-06-10", "1"),
      phase("2026-06-11", null, "1.5"),
    ]);
    expectContiguous(timeline);
  });

  it("applies two windows chronologically and cumulatively on already-shifted dates", () => {
    const suspensions = [window("2026-07-05", "2026-07-08"), window("2026-06-01", "2026-06-03")];
    const timeline = generatePeptideDosingTimeline(upHoldDown(), { suspensions });
    expect(timeline).toEqual([
      phase("2026-05-21", "2026-05-27", "0.5"),
      phase("2026-05-28", "2026-06-05", "1"),
      phase("2026-06-06", "2026-06-12", "1.5"),
      phase("2026-06-13", "2026-07-27", "2", "Hold for 6 weeks"),
      phase("2026-07-28", "2026-08-03", "1.5"),
      phase("2026-08-04", "2026-08-10", "1"),
      phase("2026-08-11", null, "0.5"),
    ]);
    expectContiguous(timeline);
    expect(hydratePeptideDosingStrategy({ dosingStrategy: upHoldDown(), timeline, scheduleSuspensions: suspensions }).mode).toBe("structured");
  });

  it("shifts an explicit strategy end date with the window", () => {
    const timeline = generatePeptideDosingTimeline(base({ pattern: "titrate_up", targetDose: "1.5", endDate: "2026-06-30" }), {
      suspensions: [window("2026-06-10", "2026-06-15")],
    });
    expect(timeline).toEqual([
      phase("2026-05-21", "2026-05-27", "0.5"),
      phase("2026-05-28", "2026-06-03", "1"),
      phase("2026-06-04", "2026-07-05", "1.5"),
    ]);
  });

  it("reproduces a plan authored after a pause (window before its start is ignored)", () => {
    const suspensions = [window("2026-09-10", "2026-09-17")];
    const stay = base({ pattern: "stay", startingDose: { amount: "1.5", unit: "mg" }, startDate: "2026-09-25" });
    expect(generatePeptideDosingTimeline(stay, { suspensions })).toEqual([phase("2026-09-25", null, "1.5")]);
    const titration = base({ pattern: "titrate_up", startDate: "2026-09-25", targetDose: "1.5" });
    expect(generatePeptideDosingTimeline(titration, { suspensions })).toEqual(generatePeptideDosingTimeline(titration));
  });

  it("previews the shifted plan when suspensions are supplied", () => {
    const suspensions = [window("2026-07-01", "2026-07-10")];
    const preview = formatDosingStrategyPreview(upHoldDown(), [], { suspensions });
    expect(preview.at(-1)).toBe("Aug 15 · 0.5 mg · Continue until changed");
    expect(formatDosingStrategyPreview(upHoldDown()).at(-1)).toBe("Aug 6 · 0.5 mg · Continue until changed");
  });
});

describe("history-preserving composition (S1)", () => {
  const today = "2026-09-29";

  it("changes the dose from today by closing the current phase and appending the generated plan", () => {
    const existing = retatrutideShapedTimeline();
    const strategy = base({ pattern: "stay", startingDose: { amount: "1", unit: "mg" }, startDate: today });
    const composed = composeTimelineWithStrategy({ existingTimeline: existing, strategy, generated: generatePeptideDosingTimeline(strategy) });
    expect(composed).toHaveLength(8);
    expect(JSON.stringify(composed.slice(0, 6))).toBe(JSON.stringify(existing.slice(0, 6)));
    expect(composed[6]).toEqual(phase("2026-08-06", "2026-09-28", "0.5"));
    expect(composed[7]).toEqual(phase(today, null, "1"));
    expectContiguous(composed);
    const hydration = hydratePeptideDosingStrategy({ dosingStrategy: strategy, timeline: composed });
    expect(hydration.mode).toBe("structured");
    expect(hydration.timeline).toEqual(composed);
    expect(hydration.generated).toEqual([phase(today, null, "1")]);
  });

  it("changes the dose on a phase-transition day without producing a malformed phase", () => {
    const existing = generatePeptideDosingTimeline(base({ pattern: "titrate_up", targetDose: "1.5" }));
    const strategy = base({ pattern: "stay", startingDose: { amount: "0.75", unit: "mg" }, startDate: "2026-05-28" });
    const composed = composeTimelineWithStrategy({ existingTimeline: existing, strategy, generated: generatePeptideDosingTimeline(strategy) });
    expect(composed).toEqual([
      phase("2026-05-21", "2026-05-27", "0.5"),
      phase("2026-05-28", null, "0.75"),
    ]);
    expectContiguous(composed);
    expect(hydratePeptideDosingStrategy({ dosingStrategy: strategy, timeline: composed }).mode).toBe("structured");
  });

  it("is idempotent when the dose is changed twice in one day", () => {
    const existing = retatrutideShapedTimeline();
    const first = base({ pattern: "stay", startingDose: { amount: "1", unit: "mg" }, startDate: today });
    const once = composeTimelineWithStrategy({ existingTimeline: existing, strategy: first, generated: generatePeptideDosingTimeline(first) });
    const again = composeTimelineWithStrategy({ existingTimeline: once, strategy: first, generated: generatePeptideDosingTimeline(first) });
    expect(again).toEqual(once);
    const second = base({ pattern: "stay", startingDose: { amount: "1.25", unit: "mg" }, startDate: today });
    const replaced = composeTimelineWithStrategy({ existingTimeline: once, strategy: second, generated: generatePeptideDosingTimeline(second) });
    expect(replaced).toHaveLength(8);
    expect(replaced.slice(0, 7)).toEqual(once.slice(0, 7));
    expect(replaced[7]).toEqual(phase(today, null, "1.25"));
  });

  it("keeps the frozen prefix byte-identical to the stored phases", () => {
    const existing = retatrutideShapedTimeline().map((entry) => ({ ...entry, notes: entry.notes }));
    const strategy = base({ pattern: "titrate_up", startingDose: { amount: "0.5", unit: "mg" }, startDate: today, targetDose: "1" });
    const composed = composeTimelineWithStrategy({ existingTimeline: existing, strategy, generated: generatePeptideDosingTimeline(strategy) });
    expect(JSON.stringify(composed.slice(0, 6))).toBe(JSON.stringify(existing.slice(0, 6)));
    expect(composed.slice(6)).toEqual([
      phase("2026-08-06", "2026-09-28", "0.5"),
      phase(today, "2026-10-05", "0.5"),
      phase("2026-10-06", null, "1"),
    ]);
  });

  it("keeps a frozen phase that already ended before the strategy start untouched", () => {
    const existing = [phase("2026-05-21", "2026-08-31", "0.5")];
    const strategy = base({ pattern: "stay", startingDose: { amount: "1", unit: "mg" }, startDate: today });
    expect(composeTimelineWithStrategy({ existingTimeline: existing, strategy, generated: generatePeptideDosingTimeline(strategy) })).toEqual([
      phase("2026-05-21", "2026-08-31", "0.5"),
      phase(today, null, "1"),
    ]);
  });

  it("changes the dose after a pause and still hydrates as structured (window before the new start is ignored)", () => {
    const suspensions = [window("2026-07-01", "2026-07-10")];
    const shifted = generatePeptideDosingTimeline(upHoldDown(), { suspensions });
    const strategy = base({ pattern: "stay", startingDose: { amount: "1", unit: "mg" }, startDate: today });
    const composed = composeTimelineWithStrategy({ existingTimeline: shifted, strategy, generated: generatePeptideDosingTimeline(strategy, { suspensions }) });
    expect(composed.slice(0, 6)).toEqual(shifted.slice(0, 6));
    expect(composed.slice(6)).toEqual([phase("2026-08-15", "2026-09-28", "0.5"), phase(today, null, "1")]);
    const hydration = hydratePeptideDosingStrategy({ dosingStrategy: strategy, timeline: composed, scheduleSuspensions: suspensions });
    expect(hydration.mode).toBe("structured");
    expect(hydration.timeline).toEqual(composed);
  });

  it("marks the record legacy_custom when a frozen phase overlaps the strategy start", () => {
    const strategy = base({ pattern: "stay", startingDose: { amount: "1", unit: "mg" }, startDate: today });
    const open = hydratePeptideDosingStrategy({ dosingStrategy: strategy, timeline: [phase("2026-05-21", null, "0.5"), phase(today, null, "1")] });
    expect(open).toMatchObject({ mode: "legacy_custom", strategy: { pattern: "custom" } });
    const overlapping = hydratePeptideDosingStrategy({ dosingStrategy: strategy, timeline: [phase("2026-05-21", today, "0.5"), phase(today, null, "1")] });
    expect(overlapping.mode).toBe("legacy_custom");
    const closed = hydratePeptideDosingStrategy({ dosingStrategy: strategy, timeline: [phase("2026-05-21", "2026-09-28", "0.5"), phase(today, null, "1")] });
    expect(closed.mode).toBe("structured");
  });

  it("marks the record legacy_custom when the stored tail differs from the generated plan", () => {
    const strategy = base({ pattern: "stay", startingDose: { amount: "1", unit: "mg" }, startDate: today });
    const hydration = hydratePeptideDosingStrategy({ dosingStrategy: strategy, timeline: [phase("2026-05-21", "2026-09-28", "0.5"), phase(today, null, "1.5")] });
    expect(hydration.mode).toBe("legacy_custom");
    expect(hydration.timeline).toHaveLength(2);
  });
});

describe("suspension helpers", () => {
  it("normalizes an absent, null, or malformed scheduleSuspensions field to an empty list", () => {
    expect(normalizeScheduleSuspensions({})).toEqual([]);
    expect(normalizeScheduleSuspensions({ scheduleSuspensions: null })).toEqual([]);
    expect(normalizeScheduleSuspensions({ scheduleSuspensions: "no" })).toEqual([]);
    expect(normalizeScheduleSuspensions(undefined)).toEqual([]);
    expect(normalizeScheduleSuspensions({ scheduleSuspensions: [{ resumedOn: "2026-07-10" }, null, { pausedFrom: "not-a-date" }] })).toEqual([]);
  });

  it("normalizes suspension records to the canonical shape in stored order", () => {
    const item = { scheduleSuspensions: [
      { pausedFrom: "2026-07-01", resumedOn: "2026-07-10", pausedAt: "2026-07-01T10:00:00.000Z", resumedAt: "2026-07-10T09:00:00.000Z", reason: "travel", pausedExecutionRevision: 4, resumedExecutionRevision: 5 },
      { pausedFrom: "2026-09-12", pausedAt: "2026-09-12T08:00:00.000Z", pausedExecutionRevision: "6" },
    ] };
    expect(normalizeScheduleSuspensions(item)).toEqual([
      { pausedFrom: "2026-07-01", resumedOn: "2026-07-10", pausedAt: "2026-07-01T10:00:00.000Z", resumedAt: "2026-07-10T09:00:00.000Z", reason: "travel", pausedExecutionRevision: 4, resumedExecutionRevision: 5 },
      { pausedFrom: "2026-09-12", resumedOn: null, pausedAt: "2026-09-12T08:00:00.000Z", resumedAt: null, reason: null, pausedExecutionRevision: 6, resumedExecutionRevision: null },
    ]);
    expect(normalizeScheduleSuspensions(item.scheduleSuspensions)).toEqual(normalizeScheduleSuspensions(item));
  });

  it("reports whether a date is suspended by an open or closed window", () => {
    const closed = [window("2026-07-01", "2026-07-10")];
    expect(isDateSuspended(closed, "2026-06-30")).toBe(false);
    expect(isDateSuspended(closed, "2026-07-01")).toBe(true);
    expect(isDateSuspended(closed, "2026-07-09")).toBe(true);
    expect(isDateSuspended(closed, "2026-07-10")).toBe(false);
    const open = [window("2026-09-12", null)];
    expect(isDateSuspended(open, "2026-09-11")).toBe(false);
    expect(isDateSuspended(open, "2026-09-12")).toBe(true);
    expect(isDateSuspended(open, "2027-01-01")).toBe(true);
    expect(isDateSuspended([], "2026-09-12")).toBe(false);
    expect(isDateSuspended(undefined, "2026-09-12")).toBe(false);
    expect(isDateSuspended({ scheduleSuspensions: open }, "2026-09-12")).toBe(true);
    expect(isDateSuspended([window("2026-09-12", "2026-09-12")], "2026-09-12")).toBe(false);
  });

  it("accepts an explicit suspensions override when hydrating", () => {
    const suspensions = [window("2026-07-01", "2026-07-10")];
    const shifted = generatePeptideDosingTimeline(upHoldDown(), { suspensions });
    expect(hydratePeptideDosingStrategy({ dosingStrategy: upHoldDown(), timeline: shifted }, { suspensions }).mode).toBe("structured");
    expect(hydratePeptideDosingStrategy({ dosingStrategy: upHoldDown(), timeline: shifted, scheduleSuspensions: suspensions }, { suspensions: [] }).mode).toBe("legacy_custom");
  });
});

function base(overrides = {}) {
  return {
    pattern: "stay",
    startingDose: { amount: "0.5", unit: "mg" },
    startDate: "2026-05-21",
    stepAmount: "0.5",
    stepInterval: 1,
    stepUnit: "weeks",
    targetDose: "0.5",
    holdDuration: 1,
    holdUnit: "weeks",
    decreaseAmount: "0.5",
    decreaseInterval: 1,
    decreaseUnit: "weeks",
    landingDose: "0.5",
    endDate: null,
    ...overrides,
  };
}
function upHoldDown(overrides = {}) {
  return base({
    pattern: "up_hold_down",
    targetDose: "2",
    holdDuration: 6,
    decreaseAmount: "0.5",
    decreaseInterval: 1,
    decreaseUnit: "weeks",
    landingDose: "0.5",
    ...overrides,
  });
}
function retatrutideShapedTimeline() {
  return [
    phase("2026-05-21", "2026-05-27", "0.5"),
    phase("2026-05-28", "2026-06-03", "1"),
    phase("2026-06-04", "2026-06-10", "1.5"),
    phase("2026-06-11", "2026-07-22", "2", "Hold for 6 weeks"),
    phase("2026-07-23", "2026-07-29", "1.5"),
    phase("2026-07-30", "2026-08-05", "1"),
    phase("2026-08-06", null, "0.5"),
  ];
}
function window(pausedFrom, resumedOn) {
  return {
    pausedFrom,
    resumedOn,
    pausedAt: `${pausedFrom}T09:00:00.000Z`,
    resumedAt: resumedOn ? `${resumedOn}T09:00:00.000Z` : null,
    reason: null,
    pausedExecutionRevision: 3,
    resumedExecutionRevision: resumedOn ? 4 : null,
  };
}
function phase(startDate, endDate, amount, notes = "") { return { startDate, endDate, dose: { amount, unit: "mg" }, notes }; }
function expectContiguous(timeline) {
  for (let index = 0; index < timeline.length; index += 1) {
    const current = timeline[index];
    if (current.endDate) expect(current.endDate >= current.startDate).toBe(true);
    if (index < timeline.length - 1) {
      const next = timeline[index + 1];
      const dayAfterEnd = new Date(`${current.endDate}T12:00:00Z`);
      dayAfterEnd.setUTCDate(dayAfterEnd.getUTCDate() + 1);
      expect(dayAfterEnd.toISOString().slice(0, 10)).toBe(next.startDate);
    }
  }
}

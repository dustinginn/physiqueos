// Shared-layer and policy properties over hand-shaped variants of generated
// periods (breaks, increases, week-long and early leads). Narrative language
// is validated by the holistic synthesis suite.

import { describe, expect, it } from "vitest";
import { BriefingPatternKind, createBriefingIntelligence, dateRange, shiftDate } from "./BriefingIntelligence.js";
import { BRIEFING_INTELLIGENCE_POLICIES } from "./BriefingIntelligencePolicies.js";
import { SYNTHETIC_SCENARIOS, generateSyntheticPeriod } from "../../../testSupport/briefingIntelligenceSynthetic.js";

const weekly = BRIEFING_INTELLIGENCE_POLICIES.weekly;

function intelligenceFor(days, window, policy = weekly) {
  return createBriefingIntelligence({ window, days, policy });
}

// Hand-shaped variants over generated routines, so every lead kind and
// direction is exercised — not only the late-week break.
function variants() {
  const out = [];
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    for (const scenario of SYNTHETIC_SCENARIOS) {
      const period = generateSyntheticPeriod({ seed, scenario });
      out.push({ name: `${scenario}#${seed}`, days: period.days, window: period.truth.window });
    }
    const base = generateSyntheticPeriod({ seed, scenario: "stable" });
    const inWindow = (day) => day.date >= base.truth.window.startDate;
    const whole = structuredClone(base.days);
    for (const day of whole.filter(inWindow)) {
      day.nutrition.calories = Math.round(day.nutrition.calories * 1.3);
      day.nutrition.protein = Math.round(day.nutrition.protein * 1.3);
    }
    out.push({ name: `intake_up_all_week#${seed}`, days: whole, window: base.truth.window });
    const moreActive = structuredClone(base.days);
    for (const day of moreActive.filter(inWindow).slice(2, 5)) {
      day.activity.activeKcal = Math.round(day.activity.activeKcal * 1.8);
      day.activity.exerciseMinutes = Math.round(day.activity.exerciseMinutes * 1.8);
    }
    out.push({ name: `activity_up_midweek#${seed}`, days: moreActive, window: base.truth.window });
    const early = structuredClone(base.days);
    for (const day of early.filter(inWindow).slice(0, 3)) {
      day.training.sessions = 0;
      day.activity.activeKcal = Math.round(day.activity.activeKcal * 0.4);
      day.activity.exerciseMinutes = Math.round(day.activity.exerciseMinutes * 0.2);
    }
    out.push({ name: `early_break#${seed}`, days: early, window: base.truth.window });
  }
  return out.map((item) => ({ ...item, intelligence: intelligenceFor(item.days, item.window) }))
    .filter((item) => item.intelligence.characterization.length);
}

const realized = variants(); // generated variants with a characterization

describe("routine-shift structure", () => {
  it("a routine shift joins overlapping days, one member per signal family, and needs two behavior domains", () => {
    for (const { name, intelligence } of realized) {
      const byId = new Map(intelligence.patterns.map((item) => [item.id, item]));
      for (const shift of intelligence.patterns.filter((item) => item.kind === BriefingPatternKind.ROUTINE_SHIFT)) {
        const members = shift.members.map((id) => byId.get(id));
        const families = members.map((item) => item.signal.startsWith("activity.") ? "activity" : item.signal);
        expect(new Set(families).size, name).toBe(families.length);
        expect(new Set(members.map((item) => item.domain).filter((domain) => domain !== "body")).size, name).toBeGreaterThanOrEqual(2);
      }
    }
  });

});

describe("shared-layer fixes", () => {
  it("one finding per signal: opposite-direction findings on intake never lead together", () => {
    for (const { name, intelligence } of realized) {
      const signals = intelligence.characterization.filter((item) => item.signal).map((item) => item.signal);
      expect(new Set(signals).size, name).toBe(signals.length);
    }
  });

  it("a break that began before the window is not counted as an earlier recurrence", () => {
    const period = generateSyntheticPeriod({ seed: 9, scenario: "stable" });
    const start = period.truth.window.startDate;
    for (const day of period.days) {
      if (day.date >= shiftDate(start, -2) && day.date <= shiftDate(start, 1)) {
        day.training.sessions = 0;
        day.activity.activeKcal = Math.round(day.activity.activeKcal * 0.3);
        day.activity.exerciseMinutes = Math.round(day.activity.exerciseMinutes * 0.1);
      }
    }
    const intelligence = intelligenceFor(period.days, period.truth.window);
    const shift = intelligence.patterns.find((item) => item.kind === BriefingPatternKind.ROUTINE_SHIFT);
    if (shift) expect(shift.recurrence?.priorSpans?.some((span) => span.endDate === shiftDate(start, -1)) ?? false).toBe(false);
  });

  it("unreliable baseline days are excluded from the routine they would bias", () => {
    const period = generateSyntheticPeriod({ seed: 4, scenario: "stable" });
    const baselineDays = period.days.filter((day) => day.date < period.truth.window.startDate);
    // Genuinely incomplete logs (a fraction of the day, few entries, no
    // full-day assertion) — not merely unusual days.
    for (const day of baselineDays.slice(3, 6)) {
      day.nutrition = { ...day.nutrition, calories: Math.round(day.nutrition.calories * 0.3), protein: Math.round(day.nutrition.protein * 0.25),
        evidence: { artifacts: [], observations: [], entries: 2, fullDayAsserted: false } };
    }
    const intelligence = intelligenceFor(period.days, period.truth.window);
    expect(intelligence.limitations).toContainEqual({ reason: "unreliable_baseline_days_excluded", count: 3 });
    expect(intelligence.baselines.find((item) => item.signal === "nutrition.calories").n).toBe(baselineDays.length - 3);
  });

  it("a routine shift is ranked from its members, not a fixed floor", () => {
    for (const { name, intelligence } of realized) {
      const byId = new Map(intelligence.patterns.map((item) => [item.id, item]));
      for (const shift of intelligence.patterns.filter((item) => item.kind === BriefingPatternKind.ROUTINE_SHIFT)) {
        const strongest = Math.max(...shift.members.map((id) => byId.get(id)?.materiality ?? 0));
        expect(shift.materiality, name).toBeGreaterThanOrEqual(strongest);
        expect(shift.materiality, name).toBeLessThanOrEqual(strongest * 2.5 + 0.5);
      }
    }
  });
});

describe("briefing policies can express their role", () => {
  it("Monthly builds routine shifts from runs and gaps it does not itself characterize", () => {
    let shifts = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const period = generateSyntheticPeriod({ seed, scenario: "late_disruption", baselineDays: 56, windowDays: 28 });
      const intelligence = intelligenceFor(period.days, period.truth.window, BRIEFING_INTELLIGENCE_POLICIES.monthly);
      const allowed = new Set(BRIEFING_INTELLIGENCE_POLICIES.monthly.admissibleKinds);
      for (const item of intelligence.characterization) expect(allowed.has(item.kind)).toBe(true);
      if (intelligence.characterization.some((item) => item.kind === BriefingPatternKind.ROUTINE_SHIFT)) shifts += 1;
    }
    expect(shifts).toBeGreaterThanOrEqual(3);
  });

  it("DEXA and Photo characterize a preceding-execution window, never beyond the event date", () => {
    for (const type of ["dexa", "photo"]) {
      const policy = BRIEFING_INTELLIGENCE_POLICIES[type];
      expect(policy.contextWindowDays).toBeGreaterThan(7);
      const period = generateSyntheticPeriod({ seed: 2, scenario: "late_disruption", baselineDays: 56, windowDays: policy.contextWindowDays });
      const intelligence = intelligenceFor(period.days, period.truth.window, policy);
      expect(dateRange(intelligence.horizon.window.startDate, intelligence.horizon.window.endDate)).toHaveLength(policy.contextWindowDays);
      expect(intelligence.patterns.every((item) => !item.span || item.span.endDate <= period.truth.window.endDate)).toBe(true);
      expect(intelligence.policy.cadence).toBe(type);
    }
  });

});

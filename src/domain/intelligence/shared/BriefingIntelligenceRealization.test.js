// Realization and policy properties: the recap language stays grammatical,
// honest and internally consistent for every lead kind, direction and span
// the shared layer can produce; each briefing policy can express its role.

import { describe, expect, it } from "vitest";
import { BriefingPatternKind, createBriefingIntelligence, dateRange, shiftDate } from "./BriefingIntelligence.js";
import { BRIEFING_INTELLIGENCE_POLICIES } from "./BriefingIntelligencePolicies.js";
import { realizePeriodCharacterizationV3 } from "../v3/PeriodCharacterizationLanguageV3.js";
import { findNarrativeV3VoiceViolations } from "../v3/NarrativeV3CompositionService.js";
import { SYNTHETIC_SCENARIOS, generateSyntheticPeriod } from "../../../testSupport/briefingIntelligenceSynthetic.js";

const weekly = BRIEFING_INTELLIGENCE_POLICIES.weekly;
const realize = (intelligence) => realizePeriodCharacterizationV3({ intelligence, goalLabel: "the goal", nextEvidenceName: "the next check" });

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
    .map((item) => ({ ...item, period: realize(item.intelligence) }))
    .filter((item) => item.period);
}

const realized = variants();

describe("recap language across lead kinds, directions and spans", () => {
  it("covers breaks, increases and single-signal leads (the suite is not vacuous)", () => {
    const tones = new Set(realized.map((item) => item.period.tone));
    expect(tones.has("break")).toBe(true);
    expect(tones.has("increase")).toBe(true);
    expect(realized.some((item) => item.intelligence.characterization[0].kind !== BriefingPatternKind.ROUTINE_SHIFT)).toBe(true);
    expect(realized.length).toBeGreaterThan(20);
  });

  it("is grammatical: subject agreement, whole clauses, budgeted headline", () => {
    for (const { name, period } of realized) {
      const sections = [period.result, period.meaning, period.action, period.watch, period.coachTake];
      expect(findNarrativeV3VoiceViolations(sections.join("\n")), name).toEqual([]);
      expect(period.result.length, name).toBeLessThanOrEqual(160);
      for (const text of sections) expect(text, name).toMatch(/[.]$/u);
      expect(period.result, name).not.toMatch(/(?:through|and|or|,)\.$/u);
      expect(period.meaning, name).not.toMatch(/\bis small\b[^.]*\bdo not\b/u);
      expect(period.meaning, name).not.toMatch(/\bare small\b[^.]*\bdoes not\b/u);
      expect(period.meaning, name).not.toMatch(/\bthe the\b/u);
      expect(period.coachTake, name).not.toMatch(/\blog for [^,]*(?:through|and) [A-Z][a-z]+day (?:look|repeat|cover)\b/u);
      expect(period.coachTake, name).not.toMatch(/\blogs for [A-Z][a-z]+day (?:looks|repeats|covers)\b/u);
    }
  });

  it("never assumes progress or contradicts itself", () => {
    for (const { name, period, intelligence } of realized) {
      const all = [period.result, period.meaning, period.action, period.watch, period.coachTake].join(" ");
      expect(all, name).not.toMatch(/undo the progress|your progress/u);
      if (intelligence.characterization[0].recurrence) expect(all, name).not.toMatch(/one-off/u);
      if (period.tone !== "break") {
        expect(period.action, name).not.toMatch(/^Get back to/u);
        expect(all, name).not.toMatch(/\bbreak\b/u);
      }
    }
  });

  it("the action only names what the headline told", () => {
    const told = { training: /training/iu, "weigh-in": /weigh-ins/iu, activity: /activity/iu, intake: /intake/iu };
    for (const { name, period } of realized) {
      if (!/^Get back to your usual/u.test(period.action)) continue;
      for (const [target, headline] of Object.entries(told)) {
        if (period.action.includes(target)) expect(period.result, `${name}: ${target}`).toMatch(headline);
      }
    }
  });

  it("reliability wording matches the finding and stays within this recap's scope", () => {
    const period = generateSyntheticPeriod({ seed: 3, scenario: "late_disruption" });
    const last = period.days.at(-1);
    const previous = period.days.at(-2);
    last.nutrition = { ...previous.nutrition, calories: previous.nutrition.calories + 0.3 };
    const text = realize(intelligenceFor(period.days, period.truth.window)).coachTake;
    expect(text).toMatch(/repeats the previous day's totals, so this recap does not read intake on that day either way\./u);
    expect(text).not.toMatch(/look(?:s)? incomplete/u);
  });
});

describe("second-review fixes", () => {
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

  it("intake is advised against the plan, never against the person's usual", () => {
    for (const { name, period } of realized) {
      expect(period.action, name).not.toMatch(/usual intake|intake range|intake back toward your usual/u);
      if (/intake/iu.test(period.result)) expect(period.action, name).toMatch(/Keep intake on plan/u);
      expect(period.watch, name).not.toMatch(/intake settles back toward your usual/u);
      if (/^Intake /u.test(period.result)) expect(period.action, name).not.toMatch(/usual routine/u);
    }
  });

  it("span words match the lead's span", () => {
    for (const { name, period, intelligence } of realized) {
      const spanDays = intelligence.characterization[0].span.days;
      const all = [period.meaning, period.watch, period.coachTake].join(" ");
      if (spanDays < 7) expect(all, name).not.toMatch(/\b(?:One|one) week\b|second week/u);
      if (spanDays > 4) expect(all, name).not.toMatch(/\bshort break\b/u);
    }
  });

  it("the reliability note names each day once", () => {
    const period = generateSyntheticPeriod({ seed: 5, scenario: "late_disruption" });
    const last = period.days.at(-1);
    last.nutrition.protein = Math.round(last.nutrition.protein * 0.25);
    last.nutrition.completeness = "partial";
    const text = realize(intelligenceFor(period.days, period.truth.window)).coachTake;
    const note = text.slice(text.search(/The nutrition log/u));
    const weekday = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date(`${last.date}T12:00:00Z`).getUTCDay()];
    expect(note.split(weekday).length - 1).toBe(1);
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
    for (const day of baselineDays.slice(3, 6)) day.nutrition.protein = Math.round(day.nutrition.protein * 0.25);
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

  it("only the Weekly recap language is wired in Phase 1", () => {
    const period = generateSyntheticPeriod({ seed: 1, scenario: "late_disruption" });
    for (const type of ["midweek", "monthly", "dexa", "photo"]) {
      const intelligence = intelligenceFor(period.days, period.truth.window, BRIEFING_INTELLIGENCE_POLICIES[type]);
      expect(realize(intelligence)).toBeNull();
    }
  });
});

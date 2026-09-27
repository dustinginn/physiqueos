import { describe, expect, it } from "vitest";
import { BriefingPatternKind, createBriefingIntelligence, dateRange } from "./BriefingIntelligence.js";
import { BRIEFING_INTELLIGENCE_POLICIES } from "./BriefingIntelligencePolicies.js";
import { SYNTHETIC_SCENARIOS, generateSyntheticPeriod } from "../../../testSupport/briefingIntelligenceSynthetic.js";

const SEEDS = Array.from({ length: 40 }, (_, index) => index + 1);
const weekly = BRIEFING_INTELLIGENCE_POLICIES.weekly;

function run(seed, scenario, policy = weekly) {
  const period = generateSyntheticPeriod({ seed, scenario });
  const intelligence = createBriefingIntelligence({ window: period.truth.window, days: period.days, policy });
  return { ...period, intelligence };
}

const all = SYNTHETIC_SCENARIOS.flatMap((scenario) => SEEDS.map((seed) => ({ scenario, seed })));
const byScenario = (scenario) => SEEDS.map((seed) => run(seed, scenario));
const nutritionBehavior = (intelligence) => intelligence.patterns.filter((item) =>
  item.domain === "nutrition" && item.kind !== BriefingPatternKind.ROUTINE_SHIFT);

describe("Briefing Intelligence — properties across generated periods", () => {
  it("is deterministic and does not mutate its input", () => {
    for (const { scenario, seed } of all.filter((_, index) => index % 7 === 0)) {
      const period = generateSyntheticPeriod({ seed, scenario });
      const snapshot = JSON.stringify(period.days);
      const first = createBriefingIntelligence({ window: period.truth.window, days: period.days, policy: weekly });
      const second = createBriefingIntelligence({ window: period.truth.window, days: period.days, policy: weekly });
      expect(JSON.stringify(first)).toBe(JSON.stringify(second));
      expect(JSON.stringify(period.days)).toBe(snapshot);
    }
  });

  it("never treats a single day as a pattern, and never claims a cause beyond co-occurrence", () => {
    for (const { scenario, seed } of all) {
      const { intelligence } = run(seed, scenario);
      for (const item of intelligence.patterns) {
        expect(["none", "co_occurrence"]).toContain(item.causalClaim);
        if ([BriefingPatternKind.VALUE_RUN, BriefingPatternKind.ROUTINE_GAP].includes(item.kind)) {
          expect(item.span.days).toBeGreaterThanOrEqual(2);
        }
        if (item.kind === BriefingPatternKind.ROUTINE_SHIFT) {
          expect(item.causalClaim).toBe("co_occurrence");
          expect(item.domains.length).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it("claims an absence only on days the person was otherwise observable", () => {
    for (const { scenario, seed } of all) {
      const { days, intelligence } = run(seed, scenario);
      const day = new Map(days.map((item) => [item.date, item]));
      for (const gap of intelligence.patterns.filter((item) => item.kind === BriefingPatternKind.ROUTINE_GAP)) {
        for (const date of gap.dates) {
          const record = day.get(date);
          expect(Boolean(record.nutrition || record.activity || record.body.weighIn)).toBe(true);
          if (gap.signal === "training.session") expect(record.training.sessions).toBe(0);
          if (gap.signal === "body.weigh_in") expect(record.body.weighIn).toBe(false);
        }
      }
    }
  });

  it("a data outage is a limitation, never missed training or missed weigh-ins", () => {
    for (const { truth, intelligence } of byScenario("data_outage")) {
      const gaps = intelligence.patterns.filter((item) => item.kind === BriefingPatternKind.ROUTINE_GAP);
      for (const gap of gaps) expect(gap.dates.some((date) => truth.perturbed.includes(date))).toBe(false);
      expect(intelligence.limitations.some((item) => item.reason === "unobservable_days" &&
        truth.perturbed.every((date) => item.dates.includes(date)))).toBe(true);
    }
  });

  it("an unreliable nutrition day is reported as reliability, never read as behavior", () => {
    for (const scenario of ["underlogged_day", "duplicate_day"]) {
      for (const { truth, intelligence } of byScenario(scenario)) {
        const flagged = intelligence.reliability.filter((item) => truth.perturbed.includes(item.date));
        expect(flagged.length, `${scenario} seed ${truth.seed}`).toBeGreaterThan(0);
        for (const item of nutritionBehavior(intelligence)) {
          for (const date of item.dates) expect(intelligence.reliability.some((r) => r.date === date)).toBe(false);
        }
      }
    }
  });

  it("a stable routine yields an empty characterization in nearly every generated week", () => {
    const nonEmpty = byScenario("stable").filter(({ intelligence }) => intelligence.characterization.length > 0);
    expect(nonEmpty.length).toBeLessThanOrEqual(2);
  });

  it("one unusual day never becomes a nutrition pattern", () => {
    for (const { truth, intelligence } of byScenario("single_spike")) {
      const claims = nutritionBehavior(intelligence).filter((item) => item.dates.includes(truth.perturbed[0]) &&
        item.kind !== BriefingPatternKind.DISPERSION_CHANGE);
      expect(claims, `seed ${truth.seed}`).toEqual([]);
    }
  });

  it("consecutive high-intake days hidden inside a near-target weekly average are detected", () => {
    let hiddenByAverage = 0;
    for (const { truth, days, intelligence } of byScenario("intake_run")) {
      const run = intelligence.patterns.find((item) => item.kind === BriefingPatternKind.VALUE_RUN &&
        item.signal === "nutrition.calories" && item.direction === "above");
      expect(run, `seed ${truth.seed}`).toBeTruthy();
      expect(truth.perturbed.every((date) => run.dates.includes(date))).toBe(true);
      const window = days.filter((day) => day.date >= truth.window.startDate);
      const average = window.reduce((sum, day) => sum + day.nutrition.calories, 0) / window.length;
      if (Math.abs(average / truth.routine.intake - 1) <= 0.1) hiddenByAverage += 1;
    }
    // Most generated runs sit inside a ±10% weekly average — exactly the
    // masking the day-level view exists to see through.
    expect(hiddenByAverage).toBeGreaterThan(SEEDS.length / 2);
  });

  it("missed training is surfaced only when the person's own weekday routine expected sessions there", () => {
    let surfaced = 0;
    for (const { truth, intelligence } of byScenario("training_gap")) {
      const baseline = intelligence.baselines.find((item) => item.signal === "training.session");
      for (const gap of intelligence.patterns.filter((item) => item.kind === BriefingPatternKind.ROUTINE_GAP &&
        item.signal === "training.session")) {
        const rates = gap.dates.map((date) => baseline.weekdayRates[new Date(`${date}T12:00:00Z`).getUTCDay()]);
        expect(gap.magnitude.chanceUnderRoutine).toBeLessThanOrEqual(0.2);
        expect(rates.reduce((sum, value) => sum + value, 0)).toBeGreaterThanOrEqual(1.45);
        if (truth.perturbed.every((date) => gap.dates.includes(date))) surfaced += 1;
      }
    }
    // Most generated gaps land on days the routine trains; those are found.
    expect(surfaced).toBeGreaterThan(SEEDS.length / 3);
  });

  it("scheduled rest days in a stable week are never reported as missed training", () => {
    for (const { intelligence } of byScenario("stable")) {
      const baseline = intelligence.baselines.find((item) => item.signal === "training.session");
      for (const gap of intelligence.patterns.filter((item) => item.kind === BriefingPatternKind.ROUTINE_GAP &&
        item.signal === "training.session")) {
        const expectedMissed = gap.dates.reduce((sum, date) =>
          sum + baseline.weekdayRates[new Date(`${date}T12:00:00Z`).getUTCDay()], 0);
        expect(expectedMissed).toBeGreaterThanOrEqual(1.45);
      }
    }
  });

  it("a late-week disruption leads the characterization; it is a routine shift when training was expected too", () => {
    let shifts = 0;
    for (const { truth, intelligence } of byScenario("late_disruption")) {
      const lead = intelligence.characterization[0];
      expect(lead, `seed ${truth.seed}`).toBeTruthy();
      expect(lead.span.endDate).toBe(truth.window.endDate);
      // Training joins exactly when the routine expected sessions on the
      // disrupted days — a scheduled rest day is not a missed session, and a
      // shift needs two behavior domains (weigh-ins only support one).
      const baseline = intelligence.baselines.find((item) => item.signal === "training.session");
      const expectedMissed = truth.perturbed.reduce((sum, date) =>
        sum + baseline.weekdayRates[new Date(`${date}T12:00:00Z`).getUTCDay()], 0);
      if (expectedMissed >= 2) {
        expect(lead.kind, `seed ${truth.seed}`).toBe(BriefingPatternKind.ROUTINE_SHIFT);
        expect(lead.domains).toEqual(expect.arrayContaining(["activity", "training"]));
        expect(lead.position).toBe("late");
        shifts += 1;
      } else if (lead.kind !== BriefingPatternKind.ROUTINE_SHIFT) {
        expect(["activity", "training"], `seed ${truth.seed}`).toContain(lead.domain);
      }
    }
    // Non-vacuous: several generated weeks disrupt expected training days.
    expect(shifts).toBeGreaterThanOrEqual(5);
  });

  it("wearable noise without a sustained change does not become a characterization", () => {
    const flagged = byScenario("wearable_noise").filter(({ intelligence }) => intelligence.characterization
      .some((item) => item.kind !== BriefingPatternKind.ROUTINE_SHIFT && item.domain === "activity" &&
        item.kind === BriefingPatternKind.VALUE_RUN && item.span.days < 3));
    expect(flagged.length).toBeLessThanOrEqual(3);
  });

  it("ranks by materiality: a larger, longer deviation outranks a smaller one", () => {
    const base = generateSyntheticPeriod({ seed: 3, scenario: "stable" });
    const lift = (factor, length) => {
      const days = structuredClone(base.days);
      for (const day of days.filter((item) => item.date >= base.truth.window.startDate).slice(0, length)) {
        day.nutrition.calories = Math.round(day.nutrition.calories * factor);
        day.nutrition.protein = Math.round(day.nutrition.protein * factor);
      }
      const result = createBriefingIntelligence({ window: base.truth.window, days, policy: weekly });
      return result.patterns.find((item) => item.kind === BriefingPatternKind.VALUE_RUN &&
        item.signal === "nutrition.calories")?.materiality ?? 0;
    };
    expect(lift(1.6, 3)).toBeGreaterThan(lift(1.35, 2));
    expect(lift(1.6, 3)).toBeGreaterThan(lift(1.6, 2));
  });

  it("each briefing type only receives its admissible pattern kinds (Midweek never concludes a level shift)", () => {
    for (const { scenario, seed } of all.filter((_, index) => index % 3 === 0)) {
      const { intelligence } = run(seed, scenario, BRIEFING_INTELLIGENCE_POLICIES.midweek);
      const allowed = new Set(BRIEFING_INTELLIGENCE_POLICIES.midweek.admissibleKinds);
      for (const item of intelligence.characterization) expect(allowed.has(item.kind)).toBe(true);
      expect(intelligence.patterns.some((item) => item.kind === BriefingPatternKind.LEVEL_SHIFT)).toBe(false);
    }
  });

  it("baselines never read the briefed window itself", () => {
    const { intelligence } = run(5, "intake_run");
    const window = dateRange(intelligence.horizon.window.startDate, intelligence.horizon.window.endDate);
    expect(window.includes(intelligence.horizon.baselineWindow.endDate)).toBe(false);
  });
});

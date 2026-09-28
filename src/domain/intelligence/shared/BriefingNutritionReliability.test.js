// Nutrition reliability is completeness, not normality. A day is left out
// only on completeness evidence (a partial-day source marker, a record built
// from another day's source artifacts, or a sparse record); an unusual day on
// a usable record is behavior — kept in every average and reported.

import { describe, expect, it } from "vitest";
import { createBriefingIntelligence } from "./BriefingIntelligence.js";
import { BRIEFING_INTELLIGENCE_POLICIES } from "./BriefingIntelligencePolicies.js";
import { buildEvidencePicture } from "./BriefingEvidencePicture.js";
import { goalEvidencePolicyFor } from "./GoalEvidencePolicies.js";

const START = "2026-06-01";
function dateOf(offset) {
  const date = new Date(`${START}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

// 56 baseline days and a 28-day window of ordinary, complete, device-asserted
// days, each with its own evidence; `overrides` replaces chosen window days.
function series(overrides = {}) {
  const days = [];
  for (let index = 0; index < 84; index += 1) {
    const date = dateOf(index);
    const wobble = (index % 5) * 20;
    days.push({ date, training: { sessions: index % 7 < 5 ? 1 : 0 }, activity: { activeKcal: 700 + wobble, exerciseMinutes: 60 },
      body: { weighIn: true, weight: 180 + index * 0.02 },
      nutrition: { calories: 2480 + wobble, protein: 178 + (index % 3), carbs: 230, fat: 90, completeness: "complete",
        evidence: { artifacts: [], observations: [`obs_${date}`], entries: null, fullDayAsserted: true } } });
  }
  for (const [offset, nutrition] of Object.entries(overrides)) {
    const day = days[56 + Number(offset)];
    day.nutrition = { ...day.nutrition, ...nutrition, evidence: { ...day.nutrition.evidence, ...(nutrition.evidence ?? {}) } };
  }
  const window = { startDate: dateOf(56), endDate: dateOf(83) };
  return { days, window, at: (offset) => dateOf(56 + offset) };
}

function run(overrides) {
  const { days, window, at } = series(overrides);
  const intelligence = createBriefingIntelligence({ window, days, policy: BRIEFING_INTELLIGENCE_POLICIES.monthly });
  const excluded = (offset) => intelligence.reliability.filter((item) => item.date === at(offset)).map((item) => item.kind);
  const anomalies = (offset) => intelligence.anomalies.filter((item) => item.date === at(offset)).map((item) => item.kind);
  return { intelligence, excluded, anomalies, at };
}

describe("nutrition reliability: completeness, never normality", () => {
  it("an ordinary complete day is used and unremarkable", () => {
    const { excluded, anomalies } = run({});
    expect(excluded(10)).toEqual([]);
    expect(anomalies(10)).toEqual([]);
  });

  it("a complete high-intake day stays in, however extreme", () => {
    const { excluded } = run({ 5: { calories: 4600, protein: 190, carbs: 520, fat: 190 } });
    expect(excluded(5)).toEqual([]);
  });

  it("a complete low-intake day stays in", () => {
    const { excluded } = run({ 5: { calories: 1500, protein: 150, carbs: 120, fat: 40 } });
    expect(excluded(5)).toEqual([]);
  });

  it("a sparse low day without a full-day assertion and few entries is left out on completeness", () => {
    const { excluded } = run({ 5: { calories: 700, protein: 25, carbs: 90, fat: 20,
      evidence: { fullDayAsserted: false, entries: 2, observations: [], artifacts: [] } } });
    expect(excluded(5)).toEqual(["sparse_day"]);
  });

  it("the same low total with a full-day assertion is kept: low is not evidence of incomplete", () => {
    const { excluded } = run({ 5: { calories: 700, protein: 25, carbs: 90, fat: 20 } });
    expect(excluded(5)).toEqual([]);
  });

  it("an unusual macro profile with strong entry coverage is kept and reported as behavior", () => {
    const { excluded, anomalies } = run({ 5: { calories: 2900, protein: 80, carbs: 420, fat: 100,
      evidence: { fullDayAsserted: false, entries: 14, observations: [], artifacts: ["IMG_9001.jpeg"] } } });
    expect(excluded(5)).toEqual([]);
    expect(anomalies(5)).toEqual(["low_protein"]);
  });

  it("matching totals on independent evidence are a repeated day, not bad data", () => {
    const same = { calories: 2555.5, protein: 181.25, carbs: 240.5, fat: 95.5 };
    const { excluded, anomalies } = run({ 5: same, 6: same });
    expect(excluded(6)).toEqual([]);
    expect(anomalies(6)).toContain("repeated_day_totals");
  });

  it("a record built from another day's source artifacts is left out; generic labels prove nothing", () => {
    const reused = run({ 5: { evidence: { artifacts: ["IMG_2489.png", "IMG_2490.jpeg"] } },
      6: { evidence: { artifacts: ["IMG_2488.jpeg", "IMG_2489.png", "IMG_2490.jpeg"] } } });
    expect(reused.excluded(6)).toEqual(["duplicate_source_evidence"]);
    expect(reused.intelligence.reliability.find((item) => item.date === reused.at(6)).evidence.sameSourceAs).toBe(reused.at(5));
    const generic = run({ 5: { evidence: { artifacts: ["Photo 1", "Photo 2"] } }, 6: { evidence: { artifacts: ["Photo 1", "Photo 2"] } } });
    expect(generic.excluded(6)).toEqual([]);
  });

  it("one shared file, or a partial overlap, is not proof of reuse", () => {
    const single = run({ 5: { evidence: { artifacts: ["IMG_3001.png"] } }, 6: { evidence: { artifacts: ["IMG_3001.png"] } } });
    expect(single.excluded(6)).toEqual([]);
    const partial = run({ 5: { evidence: { artifacts: ["IMG_3001.png", "IMG_3002.png", "IMG_3003.png"] } },
      6: { evidence: { artifacts: ["IMG_3002.png", "IMG_3003.png", "IMG_3010.png"] } } });
    expect(partial.excluded(6)).toEqual([]);
  });

  it("a source's partial-day marker is left out on completeness", () => {
    const { excluded } = run({ 5: { calories: 1200, completeness: "partial", evidence: { fullDayAsserted: false } } });
    expect(excluded(5)).toEqual(["partial_day"]);
  });

  it("a run of high days is kept whole, and every exclusion is completeness-based", () => {
    const high = { calories: 3900, protein: 185, carbs: 420, fat: 170 };
    const { intelligence, excluded } = run({ 3: high, 4: high, 5: { ...high, calories: 4100 } });
    for (const offset of [3, 4, 5]) expect(excluded(offset)).toEqual([]);
    for (const item of intelligence.reliability) expect(item.basis).toBe("completeness");
    for (const item of intelligence.anomalies) expect(item.effect).toBe("kept_and_reported");
  });

  it("a high day that moves the monthly average moves it: it is counted", () => {
    const base = run({});
    const withHigh = run({ 5: { calories: 5200, protein: 200, carbs: 600, fat: 220 } });
    const average = (intelligence) => {
      const picture = buildEvidencePicture({ intelligence, goalPolicy: goalEvidencePolicyFor("build_lean_mass"),
        goalFacts: { energy: { intake: { state: "on_plan", observed: 2500, target: 2500 } } } });
      return picture.domains.find((item) => item.domain === "nutrition").facts.reliableIntakeAverage;
    };
    expect(average(withHigh.intelligence) - average(base.intelligence)).toBeGreaterThan(80);
  });
});

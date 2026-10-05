// Graduated Sleep as V3 recovery context, end to end: period-day slot, the
// Recovery assessor's bounded semantics, and the real Weekly V3 pipeline.
// Product rules, not copy: Sleep never moves Goal Confidence or the
// recommendation, three nights are never a personal baseline, one short night
// is never a story, Sleep is silent when it is not strategically relevant, and
// when it is mentioned it is context (never a headline, step or cause).

import { describe, expect, it } from "vitest";
import { buildBriefingPeriodDays } from "./BriefingPeriodEvidence.js";
import { DOMAIN_ASSESSORS, RECOVERY_SLEEP_POLICY } from "./BriefingEvidencePicture.js";
import { EVIDENCE_DOMAINS } from "./GoalEvidencePolicies.js";
import { synthesizeBriefing } from "./BriefingHolisticSynthesis.js";
import { BRIEFING_REALIZABLE_KINDS, realizeHolisticBriefingV3 } from "../v3/HolisticNarrativeV3.js";
import { findNarrativeV3VoiceViolations } from "../v3/NarrativeV3CompositionService.js";
import { overlayGraduatedHealthKitSleepNights } from "../../services/HealthKitSleepGraduation.js";
import { resolveHealthKitGraduationPolicy, HEALTHKIT_GRADUATION_POLICY_SCHEMA_VERSION } from "../../services/HealthKitGraduation.js";
import { resolveHealthKitSleepActivationPolicy, HEALTHKIT_SLEEP_ACTIVATION_POLICY_SCHEMA_VERSION } from "../../services/HealthKitSleepPolicies.js";
import { computeCorrectedEnergyObservations, prepareWeeklyV3, weeklyPiEnvelope } from "../../../testSupport/briefingFamilyV3Harness.js";
import { SYNTHETIC_SCENARIOS, generateSyntheticPeriod, syntheticCanonicalRecords } from "../../../testSupport/briefingIntelligenceSynthetic.js";
import { prepareMidweekV3 } from "../../../testSupport/briefingFamilyV3Harness.js";

const TZ = "America/Los_Angeles";
const graduationPolicy = resolveHealthKitGraduationPolicy({
  schemaVersion: HEALTHKIT_GRADUATION_POLICY_SCHEMA_VERSION, historicalBriefingRegeneration: false,
  evidenceEligibility: { enabled: true, domains: ["sleep"], startLocalDate: "2026-07-01", endLocalDate: null },
});
const activationPolicy = resolveHealthKitSleepActivationPolicy({
  status: "enabled", schemaVersion: HEALTHKIT_SLEEP_ACTIVATION_POLICY_SCHEMA_VERSION, mode: "validation_only",
  effectiveSleepDay: "2026-07-01", timeZone: TZ, openEnded: true, strategicEvidenceEligibility: "quarantined", historicalBackfill: false,
});

function shift(date, days) { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
function row(sleepDay, minutes, { staged = true } = {}) {
  const asleepSeconds = minutes * 60;
  const core = Math.round(asleepSeconds * 0.55); const deep = Math.round(asleepSeconds * 0.2);
  return {
    id: `healthkit_sleep_day_${sleepDay}`, sleepDay, revision: 1, algorithmVersion: "sleep-canon-v3", status: "asleep_recorded",
    ingestionPurpose: "validation_only", timeZone: TZ, windowClosesAt: `${shift(sleepDay, 1)}T01:00:00.000Z`, computedAt: `${sleepDay}T15:00:00.000Z`,
    mainEpisodeIndex: 0,
    mainSleep: { asleepSeconds, awakeSeconds: 1500, inBedSeconds: asleepSeconds + 2400, coreSeconds: staged ? core : 0,
      deepSeconds: staged ? deep : 0, remSeconds: staged ? asleepSeconds - core - deep : 0, unspecifiedSeconds: staged ? 0 : asleepSeconds },
    episodes: [{ kind: "main", start: `${shift(sleepDay, -1)}T06:30:00.000Z`, end: `${sleepDay}T14:30:00.000Z`, timeZone: TZ,
      primarySource: { sourceClass: "third_party", sourceFamily: "oura" },
      completeness: { asleepData: "present", stageDetail: staged ? "staged" : "stage_detail_absent", sourceBasis: "sensor" } }],
  };
}
// Graduated sleep_night evidence through the real overlay, as a briefing tick sees it.
function sleepEvidence(nights, asOf) {
  return overlayGraduatedHealthKitSleepNights({ sleepDays: nights.map(([date, minutes]) => row(date, minutes)),
    graduationPolicy, activationPolicy, asOf: new Date(asOf) }).objects;
}

const WINDOW = { startDate: "2026-09-13", endDate: "2026-09-19" };
const windowDates = Array.from({ length: 7 }, (_, index) => shift(WINDOW.startDate, index));
const priorDates = (count) => Array.from({ length: count }, (_, index) => shift(WINDOW.startDate, -(index + 1))).reverse();
const ASOF = "2026-09-20T10:00:00.000Z";
const usualMinutes = (date) => 450 + (Number(date.slice(-1)) % 3) * 10; // 7.5-7.8 h, the person's own usual

const piEnvelope = () => weeklyPiEnvelope({ energyObservations: computeCorrectedEnergyObservations().observations });
async function weekly({ seed = 3, scenario = "stable", sleep = [] } = {}) {
  const period = generateSyntheticPeriod({ seed, scenario });
  const { canonicalObjects, weightEntries } = syntheticCanonicalRecords({ days: period.days });
  return prepareWeeklyV3({ piEnvelope: piEnvelope(), periodEvidence: {
    window: period.truth.window, timeZone: TZ, canonicalObjects: [...canonicalObjects, ...sleepEvidence(sleep, ASOF)], weightEntries, dexaScans: [] } });
}
const texts = (prepared) => {
  const { composition } = prepared.narrativePlan;
  return [composition.headline, composition.coachTake, ...Object.values(composition.sections ?? {})].filter(Boolean).join("\n");
};
const recoveryOf = (prepared) => prepared.narrativePlan.holisticSynthesis.considered.find((item) => item.domain === "recovery");

describe("V3 period days: the Recovery slot", () => {
  it("is filled only by graduated sleep_night evidence, one night per wake date", () => {
    const evidence = sleepEvidence([["2026-09-18", 420], ["2026-09-19", 400]], ASOF);
    const days = buildBriefingPeriodDays({ canonicalObjects: [...evidence, ...evidence, { evidence_type: "recovery_day", payload: { evidence_type: "recovery_day", observed_at: "2026-09-17", sleep_hours: 9 } }],
      timeZone: TZ, startDate: "2026-09-17", endDate: "2026-09-19" });
    expect(days.map((day) => day.recovery?.sleepHours ?? null)).toEqual([null, 7, 6.67]);
    expect(days[2].recovery.sleep).toMatchObject({ asleepSeconds: 24000, stageDetail: "staged", revision: 1 });
  });

  it("an incomplete current night is absent from the slot (its window is still open at the tick)", () => {
    const evidence = sleepEvidence([["2026-09-19", 400], ["2026-09-20", 410]], ASOF);
    const days = buildBriefingPeriodDays({ canonicalObjects: evidence, timeZone: TZ, startDate: "2026-09-19", endDate: "2026-09-20" });
    expect(days.map((day) => Boolean(day.recovery))).toEqual([true, false]);
  });
});

describe("Recovery assessor: bounded Sleep semantics", () => {
  const assess = (nights, window = WINDOW) => {
    const days = buildBriefingPeriodDays({ canonicalObjects: sleepEvidence(nights, ASOF), timeZone: TZ,
      startDate: shift(window.startDate, -28), endDate: window.endDate });
    return DOMAIN_ASSESSORS[EVIDENCE_DOMAINS.RECOVERY]({ days, window,
      windowDays: days.filter((day) => day.date >= window.startDate && day.date <= window.endDate) });
  };

  it("three nights are represented with explicit uncertainty and never a personal baseline", () => {
    // A Midweek-sized window fully covered by the first three nights.
    const midweek = { startDate: "2026-09-17", endDate: "2026-09-19" };
    const result = assess(windowDates.slice(-3).map((date) => [date, 360]), midweek);
    expect(result).toMatchObject({ status: "insufficient", state: "no_personal_baseline_yet", insights: [] });
    expect(result.facts).toMatchObject({ windowNights: 3, windowDays: 3, priorNights: 0, baselineEstablished: false,
      usualAsleepMinutes: null, uncertainty: "short_history_no_personal_baseline", meanAsleepMinutes: 360 });
    // The same three nights inside a seven-day Weekly window cover too little of it to say anything.
    expect(assess(windowDates.slice(-3).map((date) => [date, 360]))).toMatchObject({ status: "insufficient", state: "too_few_nights",
      insights: [], facts: { windowNights: 3, windowDays: 7, uncertainty: "short_history_no_personal_baseline" } });
  });

  it("is unavailable without any night and insufficient with too few nights in the window", () => {
    expect(assess([])).toMatchObject({ status: "unavailable", state: "no_recovery_evidence_yet" });
    expect(assess([...priorDates(20).map((date) => [date, usualMinutes(date)]), [windowDates[6], 300], [windowDates[5], 300]]))
      .toMatchObject({ status: "insufficient", state: "too_few_nights", insights: [] });
  });

  it("is silent (no insight) when the nights are within the person's own usual", () => {
    const result = assess([...priorDates(28), ...windowDates].map((date) => [date, usualMinutes(date)]));
    expect(result).toMatchObject({ status: "assessed", state: "within_personal_usual", polarity: "neutral", insights: [] });
    expect(result.facts.baselineEstablished).toBe(true);
  });

  it("never turns one short night into a finding", () => {
    const result = assess([...priorDates(28).map((date) => [date, usualMinutes(date)]),
      ...windowDates.map((date, index) => [date, index === 3 ? 240 : usualMinutes(date)])]);
    expect(result.insights).toEqual([]);
  });

  it("a consistent shortfall against the established usual is modest recovery context, never a risk", () => {
    const result = assess([...priorDates(28).map((date) => [date, usualMinutes(date)]), ...windowDates.map((date) => [date, 375])]);
    expect(result).toMatchObject({ status: "assessed", state: "below_personal_usual", polarity: "concern" });
    expect(result.insights).toHaveLength(1);
    const [insight] = result.insights;
    expect(insight).toMatchObject({ kind: "sleep_below_usual", role: "execution", polarity: "concern", requiresCompleteWindow: true });
    expect(insight.strength).toBeLessThanOrEqual(RECOVERY_SLEEP_POLICY.maxStrength);
    expect(insight.facts).toMatchObject({ shortNights: 7, windowNights: 7, extentDays: 7, priorNights: 28 });
    expect(insight.facts.affectedDates).toEqual(windowDates);
    expect(BRIEFING_REALIZABLE_KINDS.has("sleep_below_usual")).toBe(true);
  });
});

describe("Graduated Sleep through the Weekly V3 pipeline", () => {
  let base;
  const baseline = async () => (base ??= await weekly());
  const consistentShortfall = [...priorDates(28).map((date) => [date, usualMinutes(date)]), ...windowDates.map((date) => [date, 360])];

  it("never moves Goal Confidence or the recommendation, whatever the nights say", async () => {
    const reference = await baseline();
    for (const sleep of [
      windowDates.slice(-3).map((date) => [date, 300]),
      [...priorDates(28), ...windowDates].map((date) => [date, usualMinutes(date)]),
      consistentShortfall,
    ]) {
      const prepared = await weekly({ sleep });
      expect(prepared.confidence.currentPercentage).toBe(reference.confidence.currentPercentage);
      expect(prepared.confidence.delta).toBe(reference.confidence.delta);
      expect(prepared.strategicInterpretation.recommendation.action).toBe(reference.strategicInterpretation.recommendation.action);
    }
  });

  it("three nights: recovery is considered with its uncertainty, and the narrative says nothing about sleep", async () => {
    const prepared = await weekly({ sleep: windowDates.slice(-3).map((date) => [date, 300]) });
    expect(recoveryOf(prepared)).toMatchObject({ status: "insufficient" });
    expect(texts(prepared)).not.toMatch(/sleep/iu);
    expect(texts(prepared)).toBe(texts(await baseline()));
  });

  it("irrelevant sleep (within the usual) leaves the narrative exactly as without Sleep", async () => {
    const prepared = await weekly({ sleep: [...priorDates(28), ...windowDates].map((date) => [date, usualMinutes(date)]) });
    expect(recoveryOf(prepared)).toMatchObject({ status: "assessed", state: "within_personal_usual" });
    expect(texts(prepared)).toBe(texts(await baseline()));
  });

  it("a strategically relevant shortfall can be told — as context, never the headline, a step or a cause", async () => {
    const prepared = await weekly({ sleep: consistentShortfall });
    const { holisticSynthesis, composition } = prepared.narrativePlan;
    expect(recoveryOf(prepared)).toMatchObject({ status: "assessed", state: "below_personal_usual" });
    const selected = holisticSynthesis.selected.find((item) => item.id === "recovery|sleep_below_usual");
    const omitted = holisticSynthesis.omitted.find((item) => item.id === "recovery|sleep_below_usual");
    // Either told or omitted with an explicit reason — never silently dropped.
    expect(Boolean(selected) !== Boolean(omitted)).toBe(true);
    // Telling it never costs the briefing its holistic narrative.
    expect(holisticSynthesis).toMatchObject({ realized: true, failureCode: null });
    if (selected) expect(texts(prepared)).toMatch(/sleep ran shorter than your recent usual on all seven recorded nights/iu);
    expect(composition.headline).not.toMatch(/sleep/iu);
    expect(composition.sections.action ?? "").not.toMatch(/sleep/iu);
    expect(texts(prepared)).not.toMatch(/insomnia|apnea|disorder|because of (?:your )?sleep|sleep (?:caused|is causing|hurt)/iu);
    expect(findNarrativeV3VoiceViolations(texts(prepared))).toEqual([]);
  });
});

describe("Sleep never degrades a briefing (property sweep)", () => {
  it("across every synthetic Weekly situation: same Confidence and recommendation, holistic narrative kept, voice clean, never a headline", async () => {
    const shortfall = [...priorDates(28).map((date) => [date, usualMinutes(date)]), ...windowDates.map((date) => [date, 330])];
    for (const scenario of SYNTHETIC_SCENARIOS) {
      for (const seed of [1, 2, 3, 4]) {
        const without = await weekly({ seed, scenario });
        const withSleep = await weekly({ seed, scenario, sleep: shortfall });
        const label = `${scenario} seed ${seed}`;
        expect(withSleep.confidence.currentPercentage, label).toBe(without.confidence.currentPercentage);
        expect(withSleep.confidence.delta, label).toBe(without.confidence.delta);
        expect(withSleep.strategicInterpretation.recommendation.action, label).toBe(without.strategicInterpretation.recommendation.action);
        if (without.narrativePlan.holisticSynthesis.realized) {
          expect(withSleep.narrativePlan.holisticSynthesis, label).toMatchObject({ realized: true, failureCode: null });
        }
        expect(withSleep.narrativePlan.composition.headline, label).not.toMatch(/sleep/iu);
        expect(findNarrativeV3VoiceViolations(texts(withSleep)), label).toEqual([]);
        // Sleep is told only as its one recovery clause, or not at all.
        const mentions = texts(withSleep).match(/[^.\n]*\bsleep[^.\n]*/giu) ?? [];
        for (const sentence of mentions) expect(sentence, label).toMatch(/sleep ran shorter than your recent usual/iu);
      }
    }
  }, 120_000);

  it("a three-night Midweek window never concludes a Sleep finding", async () => {
    const midweekWindow = { startDate: "2026-09-13", endDate: "2026-09-15" };
    const nights = [...priorDates(28).map((date) => [date, usualMinutes(date)]),
      ["2026-09-13", 300], ["2026-09-14", 300], ["2026-09-15", 300]];
    const period = generateSyntheticPeriod({ seed: 2, scenario: "stable", windowEnd: "2026-09-15", windowDays: 3 });
    const { canonicalObjects, weightEntries } = syntheticCanonicalRecords({ days: period.days });
    const prepared = await prepareMidweekV3({ periodEvidence: { window: midweekWindow, timeZone: TZ,
      canonicalObjects: [...canonicalObjects, ...sleepEvidence(nights, "2026-09-16T10:00:00.000Z")], weightEntries, dexaScans: [] } });
    const baselineMidweek = await prepareMidweekV3({ periodEvidence: { window: midweekWindow, timeZone: TZ, canonicalObjects, weightEntries, dexaScans: [] } });
    expect(prepared.confidence.currentPercentage).toBe(baselineMidweek.confidence.currentPercentage);
    const selectedIds = prepared.narrativePlan.holisticSynthesis.selected?.map((item) => item.id) ?? [];
    expect(selectedIds).not.toContain("recovery|sleep_below_usual");
    expect(texts(prepared)).not.toMatch(/sleep/iu);
  });
});

describe("Holistic realization of a Sleep finding", () => {
  // A quiet week where Sleep is the one notable thing: it is told in the recap
  // with the young-baseline caveat, and nothing else changes shape.
  const picture = (priorNights) => ({
    schemaVersion: "briefing_evidence_picture_v1", goalType: "build_lean_mass", window: WINDOW, outlook: null, strategy: null,
    domains: [
      { domain: "routine", weight: 0.8, status: "assessed", state: "steady", polarity: "supportive", facts: {},
        insights: [{ id: "routine|routine_steady", domain: "routine", kind: "routine_steady", role: "execution", polarity: "supportive", strength: 0.7, facts: {} }] },
      { domain: "recovery", weight: 0.6, status: "assessed", state: "below_personal_usual", polarity: "concern", facts: {},
        insights: [{ id: "recovery|sleep_below_usual", domain: "recovery", kind: "sleep_below_usual", role: "execution", polarity: "concern",
          strength: 1.8, requiresCompleteWindow: true,
          facts: { shortNights: 5, windowNights: 6, priorNights, extentDays: 5, affectedDates: windowDates.slice(1, 6) } }] },
    ],
  });
  const realize = (priorNights) => {
    const synthesis = synthesizeBriefing({ picture: picture(priorNights),
      budget: { purpose: "recap", maxInsights: 3, maxLimitations: 1, floor: 0.9, heroInsights: 2 }, realizableKinds: BRIEFING_REALIZABLE_KINDS });
    return { synthesis, realized: realizeHolisticBriefingV3({ cadence: "weekly", synthesis, picture: picture(priorNights),
      goalPolicy: { goalType: "build_lean_mass", domains: {} }, goalLabel: "the goal" }) };
  };

  it("is selected and told as recovery context, with uncertainty while the usual is young", () => {
    const { synthesis, realized } = realize(16);
    expect(synthesis.selected.map((item) => item.id)).toContain("recovery|sleep_below_usual");
    const all = JSON.stringify(realized);
    expect(realized.recap).toBe("Sleep ran shorter than your recent usual on five of six recorded nights, against a usual that is still only a few weeks old.");
    expect(realized.headline).not.toMatch(/sleep/iu);
    expect(realized.action).toBe("Keep the current setup in place.");
    expect(realized.sectionAudit.text).toMatchObject({ ok: true, issues: [] });
    expect(realized.result).toMatch(/not a reason on their own to change the plan/u);
    expect(all).not.toMatch(/insomnia|apnea|disorder|caus/iu);
  });

  it("drops the caveat once the usual rests on four or more weeks of nights", () => {
    const { realized } = realize(40);
    expect(realized.recap).toBe("Sleep ran shorter than your recent usual on five of six recorded nights.");
    expect(JSON.stringify(realized)).not.toMatch(/still only a few weeks old/u);
  });

  it("a Monthly review tells it only as a Recovery theme line, never as a step", () => {
    const synthesis = synthesizeBriefing({ picture: picture(40),
      budget: { purpose: "review", maxInsights: 5, maxLimitations: 2, floor: 0.5, heroInsights: 3, persistence: true }, realizableKinds: BRIEFING_REALIZABLE_KINDS });
    const realized = realizeHolisticBriefingV3({ cadence: "monthly", synthesis, picture: picture(40),
      goalPolicy: { goalType: "build_lean_mass", domains: {} }, goalLabel: "the goal" });
    const all = JSON.stringify(realized);
    expect(all).toMatch(/Sleep ran shorter than your recent usual on five of six recorded nights/u);
    expect(all).not.toMatch(/insomnia|apnea|disorder|caus/iu);
  });

  it("supporting context never takes a lead slot from goal evidence, even a neutral finding", async () => {
    const { leadInsights } = await import("./BriefingSectionContracts.js");
    const synthesis = { selected: [
      { id: "training|training_progress", kind: "training_progress", polarity: "supportive" },
      { id: "recovery|sleep_below_usual", kind: "sleep_below_usual", polarity: "concern", supportingContext: true },
      { id: "body_trajectory|weight_trend", kind: "weight_trend", polarity: "neutral" },
    ] };
    expect(leadInsights(synthesis, { recap: { maxInsights: 2 } }).map((item) => item.id))
      .toEqual(["training|training_progress", "body_trajectory|weight_trend"]);
    // Nothing else to tell: it may still fill a slot.
    expect(leadInsights({ selected: synthesis.selected.slice(0, 2) }, { recap: { maxInsights: 2 } }).map((item) => item.id))
      .toEqual(["training|training_progress", "recovery|sleep_below_usual"]);
  });

  it("irrelevant Sleep never changes how sparse the picture reads (coaching wording unchanged)", () => {
    const thin = (recovery) => ({ schemaVersion: "briefing_evidence_picture_v1", goalType: "build_lean_mass", window: WINDOW, outlook: null, strategy: null,
      domains: [
        { domain: "routine", weight: 0.8, status: "assessed", state: "steady", polarity: "supportive", facts: {},
          insights: [{ id: "routine|routine_steady", domain: "routine", kind: "routine_steady", role: "execution", polarity: "supportive", strength: 2, facts: {} }] },
        ...["nutrition", "activity", "body_trajectory"].map((domain) => ({ domain, weight: 0.6, status: "insufficient", state: "thin", polarity: "neutral", facts: {}, insights: [] })),
        recovery,
      ] });
    const run = (recovery) => {
      const picture = thin(recovery);
      const synthesis = synthesizeBriefing({ picture, budget: { purpose: "recap", maxInsights: 3, maxLimitations: 1, floor: 0.9, heroInsights: 2 }, realizableKinds: BRIEFING_REALIZABLE_KINDS });
      return realizeHolisticBriefingV3({ cadence: "weekly", synthesis, picture, goalPolicy: { goalType: "build_lean_mass", domains: {} }, goalLabel: "the goal" });
    };
    const before = run({ domain: "recovery", weight: 0.6, status: "unavailable", state: "no_recovery_evidence_yet", polarity: "neutral", facts: {}, insights: [] });
    const after = run({ domain: "recovery", weight: 0.6, status: "assessed", state: "within_personal_usual", polarity: "neutral", facts: {}, insights: [] });
    expect(after).toEqual(before);
  });

  it("cannot be concluded from a partial window", () => {
    const synthesis = synthesizeBriefing({ picture: picture(40),
      budget: { purpose: "so_far", maxInsights: 2, maxLimitations: 1, floor: 0.5, partialWindow: true }, realizableKinds: BRIEFING_REALIZABLE_KINDS });
    expect(synthesis.selected.map((item) => item.id)).not.toContain("recovery|sleep_below_usual");
    expect(synthesis.omitted.find((item) => item.id === "recovery|sleep_below_usual")?.reason).toBe("partial_window_cannot_conclude");
  });
});

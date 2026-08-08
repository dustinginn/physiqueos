import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { monthlyPreviewFixtures } from "../../fixtures/monthlyBriefingPreview";
import { composeMonthlyBriefingPreview } from "./MonthlyBriefingPreviewService";
import { buildMonthlyEnergySeries, composeMonthlyBriefingPresentation } from "./MonthlyBriefingPresentationService";
import { auditPIEditorialVoice } from "./PIEditorialTranslationService";

const source = fs.readFileSync(new URL("./MonthlyBriefingPresentationService.js", import.meta.url), "utf8");
const canonicalConfidence = Object.freeze({
  score: 58,
  band: "moderate",
  priorScore: 44,
  delta: 14,
  movementDirection: "increased",
  movementMagnitude: "material",
  primaryReason: "Current evidence supports the plan more strongly.",
  supportingReasons: ["Training is progressing across the body."],
  limitingReasons: ["Body-composition change still needs more time."],
  unresolvedUncertainty: ["A later DEXA is still needed."],
  assessmentId: "assessment-58",
  assessmentContext: {
    goalId: "goal-build-lean-mass",
    phaseId: "phase-establish-maintenance",
    operatingState: "calibration",
  },
  evidenceCutoff: "2026-07-26T06:59:59.999Z",
  assessmentTimestamp: "2026-07-26T17:22:00.000Z",
  source: "canonical_pi_snapshot",
  modelVersion: "pi_goal_confidence_assessment_v1",
  piVersion: "pi_v3",
  historyRecordId: "history-58",
  selectionSource: "canonical_pi_history_at_or_before",
  temporalCutoff: "2026-07-29T23:59:59.999Z",
});

function compose(fixtureName) {
  const fixture = monthlyPreviewFixtures[fixtureName];
  const narrative = composeMonthlyBriefingPreview({
    ...fixture,
    generatedAt: "2026-07-30T20:00:00.000Z",
    goalConfidence: canonicalConfidence,
  });
  return {
    narrative,
    presentation: composeMonthlyBriefingPresentation({
      narrative,
      decision: narrative.editorialDecision,
      fixture,
    }),
  };
}

function presentationNarration(result) {
  return [
    result.hero.title,
    result.hero.thesis,
    result.hero.confidence?.presentationExplanation,
    ...result.hero.highlights.map((item) => item.detail),
    result.newBaseline?.title,
    result.newBaseline?.summary,
    result.newBaseline?.callout,
    result.training?.title,
    result.training?.summary,
    result.training?.interpretation,
    result.training?.next,
    result.energy?.summary,
    result.energy?.whyItMatters,
    ...(result.changes?.themes ?? []).flatMap((item) => [item.title, item.body]),
    ...(result.moments?.moments ?? []).flatMap((item) => [item.label, item.body]),
    result.strategy?.title,
    result.strategy?.thesis,
    ...(result.strategy?.items ?? []).map((item) => item.detail),
    result.monthAhead?.title,
    result.monthAhead?.thesis,
    ...(result.monthAhead?.guidance ?? []).map((item) => item.detail),
  ].filter(Boolean);
}

describe("Monthly briefing presentation composition", () => {
  it("maps the canonical Monthly narrative into the accepted editorial roles", () => {
    const { presentation: result } = compose("julyContinuation");
    expect(result.hero.title).toContain("starting line");
    expect(result.hero.period).toBe("July 1–31 · Delivered August 1");
    expect(result.hero.confidence).toMatchObject({
      score: 58,
      band: "moderate",
      priorScore: 44,
      delta: 14,
      movementDirection: "increased",
      assessmentId: "assessment-58",
      goalId: "goal-build-lean-mass",
      source: "canonical_pi_snapshot",
    });
    expect(result.milestone).toMatchObject({ goalName: "Visible Abs", date: "2026-07-18", result: "7.7%" });
    expect(result.training.stats.map((stat) => stat.label)).toEqual(["Signal", "Limit", "Next test"]);
    expect(result.energy.summaryMetrics.map((metric) => metric.label)).toEqual([
      "Avg intake",
      "Avg expenditure",
      "Avg balance",
      "Balance magnitude",
    ]);
    expect(result.newBaseline.facts.map((fact) => fact.value)).toEqual(expect.arrayContaining(["7.7%", "147.5 lb", "12.8 lb"]));
    expect(result.changes.themes.map((theme) => theme.label)).toEqual(["Training", "Calories", "Weight"]);
    const trainingChange = result.changes.themes.find((theme) => theme.label === "Training");
    expect(trainingChange.body).toMatch(/getting stronger matters more.*no single signal tells the whole story/i);
    expect(trainingChange.body).not.toMatch(/scoreboard|judge execution|judge sustainability|monitor pace/i);
    expect(result.moments.moments).toHaveLength(5);
    expect(result.source).toMatchObject({
      boundedMilestoneIds: [expect.any(String)],
      translationVersion: "pi_editorial_translation_v1",
    });
  });

  it("selects translated prose instead of authoring interpretation in presentation", () => {
    const { narrative, presentation } = compose("julyContinuation");
    expect(presentation.hero.title).toBe(narrative.monthlyNarrative.hero.title);
    expect(presentation.training.summary).toBe(narrative.monthlyNarrative.training.summary);
    expect(presentation.energy.summary).toBe(narrative.monthlyNarrative.energy.summary);
    expect(presentation.strategy).toBeUndefined();
    expect(presentation.monthAhead.guidance).toEqual(narrative.monthlyNarrative.monthAhead.guidance);
    expect(source).not.toMatch(/composePIEditorialParagraph|describeMissingInformationNaturally/);
    expect(source).not.toMatch(/dailyBriefings|current\\.score\\s*[-+]|score\\s*>=/);
    expect(source).toContain("Monthly presentation requires a canonical Monthly narrative model.");
  });

  it("does not fabricate confidence or a zero delta when canonical confidence is absent", () => {
    const fixture = monthlyPreviewFixtures.julyContinuation;
    const narrative = composeMonthlyBriefingPreview({
      ...fixture,
      generatedAt: "2026-07-30T20:00:00.000Z",
    });
    const presentation = composeMonthlyBriefingPresentation({
      narrative,
      decision: narrative.editorialDecision,
      fixture,
    });

    expect(presentation.hero.confidence).toBeNull();
    expect(source).not.toMatch(/score:\\s*\\d{1,3}|delta:\\s*0/);
  });

  it("keeps claims bounded without treating the baseline as muscle gain", () => {
    const { presentation: result } = compose("julyContinuation");
    const text = presentationNarration(result).join(" ");
    expect(text).toMatch(/did not prove that you gained muscle/i);
    expect(text).toMatch(/the next DEXA will show whether lean mass is increasing/i);
    expect(text).not.toMatch(/lean.mass (?:improved|increased|gain confirmed)/i);
  });

  it("passes the canonical coach-voice audit without exposing internal vocabulary", () => {
    const { presentation: result } = compose("julyContinuation");
    expect(auditPIEditorialVoice(presentationNarration(result))).toMatchObject({
      passes: true,
      issues: [],
    });
    expect(presentationNarration(result).join(" ")).not.toMatch(
      /Build Lean Mass|Visible Abs|latest session|movement areas|observed coverage|preview|continuation|forward signal|visual thread|earned patience|assignment|calibration|PI(?:'|â€™)?s verdict/i,
    );
  });

  it("retains formal Goal names only in dedicated badges", () => {
    const { presentation: result } = compose("julyContinuation");
    expect(result.hero.goal).toBe("Build Lean Mass");
    expect(result.milestone.goalName).toBe("Visible Abs");
    expect(presentationNarration(result).join(" ")).not.toMatch(/Build Lean Mass|Visible Abs/);
  });

  it("gracefully omits transition-specific roles for the ordinary control", () => {
    const { presentation: result } = compose("ordinaryMonth");
    expect(result.milestone).toBeNull();
    expect(result.newBaseline).toBeNull();
    expect(result.energy).toBeTruthy();
    expect(result.changes.themes.some((theme) => theme.label === "Training")).toBe(true);
    expect(result.monthAhead.guidance.some((item) => item.label === "DEXA")).toBe(false);
  });

  it("builds both Energy variants from the active formal Goal window without coverage narration", () => {
    const series = buildMonthlyEnergySeries(monthlyPreviewFixtures.julyContinuation);
    const weeklyValues = series.weekly.filter((week) => !week.missing);
    const dailyValues = series.dailyWeeks.flatMap((week) => week.days).filter((day) => !day.missing);
    expect(series.window).toMatchObject({ startDate: "2026-07-19", endDate: "2026-07-31" });
    expect(dailyValues.map((day) => day.balance)).toEqual([-190, -160]);
    expect(weeklyValues.at(-1).balance).toBe(-175);
    expect(series.summary).toMatchObject({ observedDays: 0, previewDays: 2, possibleDays: 13 });
    expect(series.summary.metrics.map((metric) => metric.label)).not.toContain("Coverage");
  });

  it("keeps missing Energy days factual without labeling synthetic mechanics", () => {
    const series = buildMonthlyEnergySeries(monthlyPreviewFixtures.julyContinuation);
    const days = series.dailyWeeks.flatMap((week) => week.days);
    expect(days.some((day) => day.missing)).toBe(true);
    expect(days.find((day) => day.date === "2026-07-28")).toMatchObject({ missing: true, synthetic: false });
    expect(days.find((day) => day.date === "2026-07-29")).toMatchObject({ missing: false, synthetic: true });
  });
});

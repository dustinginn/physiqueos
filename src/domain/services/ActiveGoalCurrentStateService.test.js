import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  composeComposition, composeGoalConfidence, composeGoalGuardrail, composeGoalProgress, composeGoalTurningPoints,
  findGoalCoachingLanguageViolations, projectLatestBriefingCoachTake, selectAuthoritativeGoalDexaScans,
  selectGoalCompositionAnchors, selectLatestPublishedV3Briefing,
} from "./ActiveGoalCurrentStateService";
import { composeGoalTrainingProgressToDate, createGoalTrainingProgressToDate, trainingRegionForCategory } from "./GoalTrainingProgressService";
import { composePhaseAwareActiveGoalPreview } from "./PhaseAwareActiveGoalPreviewService";
import { createMidweekEvidenceWindow } from "./BriefingEvidenceWindowService";
import { composeMidweekBriefingPreview } from "./MidweekBriefingPreviewService";
import { midweekPreviewFixtures } from "../../fixtures/midweekBriefingPreview";

// Production-shaped fixtures (values mirror the canonical records proven by the
// read-only forensic probe; they live only in tests).
const scan = (date, lean, fat, bodyFat, total, extra = {}) => ({ id: `dexa_${date}`, measuredAt: date,
  leanMass: { value: lean, unit: "lb" }, fatMass: { value: fat, unit: "lb" }, bodyFatPercentage: bodyFat,
  totalMass: { value: total, unit: "lb" }, canonicalLifecycleStatus: "current", ...extra });
const jun20Superseded = { id: "dexa_2026-06-20_superseded", measuredAt: "2026-06-20", canonicalLifecycleStatus: "superseded" };
const jun20 = scan("2026-06-20", 146.2, 18.4, 10.7, 171.7, { canonicalLifecycleStatus: undefined });
const jul18 = scan("2026-07-18", 147.5, 12.8, 7.7, 167.4);
const aug15 = scan("2026-08-15", 148.3, 12.8, 7.6, 168.3);
const sep12 = scan("2026-09-12", 153.3, 14.2, 8.1, 174.7, { dexaRevision: { revision: 1 } });
const productionScans = [jun20, jun20Superseded, jul18, aug15, sep12];
const JOURNEY_START = "2026-07-19";
const target = { type: "numeric_change", metric: "lean_mass", unit: "lb", amount: 10, direction: "increase", targetDate: "2026-10-31" };
const goal = { id: "goal-build", type: "build_lean_mass", status: "active", title: "Build Lean Mass", target,
  timeline: { startDate: JOURNEY_START, targetDate: "2026-10-31" },
  guardrails: [{ id: "guardrail_body_fat", text: "Maintain approximately 8–9% body fat.", accepted: true },
    { id: "guardrail_gradual", text: "Keep weight gain gradual.", accepted: true }],
  phases: [
    { id: "p1", name: "Establish Maintenance", purpose: "Establish a sustainable maintenance baseline.", status: "completed", order: 0, timingMode: "fixed_duration", startDate: JOURNEY_START, startedAt: JOURNEY_START, completedAt: "2026-08-16T07:10:44.450Z", duration: { value: 4, unit: "weeks" } },
    { id: "p2", name: "Lean Mass Build", purpose: "Build meaningful lean mass while protecting body composition.", status: "active", order: 1, timingMode: "target_date", startDate: "2026-08-15", startedAt: "2026-08-15", targetDate: "2026-10-31", strategicReviewCadence: "monthly", strategicReviewAnchor: "dexa_body_composition" },
  ],
  currentPhaseId: "p2" };
const anchorsFor = (scans) => selectGoalCompositionAnchors({ dexaScans: scans, journeyStartDate: JOURNEY_START });

describe("Active Goal current state — DEXA authority", () => {
  it("keeps the goal baseline as baseline and makes the latest authoritative DEXA current", () => {
    const anchors = anchorsFor(productionScans);
    expect(anchors.baseline.date).toBe("2026-07-18");
    expect(anchors.current.date).toBe("2026-09-12");
    const composition = composeComposition(anchors);
    expect(composition.baseline).toMatchObject({ role: "goal_baseline", date: "2026-07-18", leanMassLb: 147.5, fatMassLb: 12.8, bodyFatPercent: 7.7, weightLb: 167.4 });
    expect(composition.current).toMatchObject({ role: "latest", date: "2026-09-12", leanMassLb: 153.3, fatMassLb: 14.2, bodyFatPercent: 8.1, weightLb: 174.7 });
    expect(composition.change).toEqual({ leanMassLb: 5.8, fatMassLb: 1.4, bodyFatPoints: 0.4, weightLb: 7.3 });
    expect(composition.sameAsBaseline).toBe(false);
  });

  it("never lets a superseded, failed, retracted, removed or measurement-less revision become current", () => {
    const newer = [
      scan("2026-09-20", 160, 10, 5.9, 171, { canonicalLifecycleStatus: "superseded" }),
      scan("2026-09-21", 160, 10, 5.9, 171, { canonicalLifecycleStatus: "failed" }),
      scan("2026-09-22", 160, 10, 5.9, 171, { retracted: true }),
      scan("2026-09-23", 160, 10, 5.9, 171, { removed: true }),
      scan("2026-09-24", 160, 10, 5.9, 171, { supersededBy: "dexa_other" }),
      { id: "no-measurement", measuredAt: "2026-09-25", canonicalLifecycleStatus: "current" },
      scan("2026-09-26", 160, 10, 5.9, 171, { leanMass: { value: 72.6, unit: "kg" } }),
    ];
    const anchors = anchorsFor([...productionScans, ...newer]);
    expect(anchors.current.date).toBe("2026-09-12");
    expect(anchors.scans.map((item) => item.date)).not.toContain("2026-06-20_superseded");
  });

  it("uses the highest live revision when a scan date has several revisions", () => {
    const revised = scan("2026-09-12", 153.9, 14.0, 8.0, 175.1, { id: "dexa_2026-09-12_r2", dexaRevision: { revision: 2 } });
    const scans = selectAuthoritativeGoalDexaScans([sep12, revised, jul18]);
    expect(scans.filter((item) => item.date === "2026-09-12")).toHaveLength(1);
    expect(scans.at(-1)).toMatchObject({ id: "dexa_2026-09-12_r2", leanMassLb: 153.9 });
  });

  it("marks current as the baseline itself when no scan follows it, instead of inventing change", () => {
    const composition = composeComposition(anchorsFor([jun20, jul18]));
    expect(composition.sameAsBaseline).toBe(true);
    expect(composition.change).toBeNull();
    expect(composition.current.role).toBe("goal_baseline");
  });
});

describe("Active Goal current state — progress arithmetic", () => {
  it("reconciles baseline, target and current exactly", () => {
    const { baseline, current } = anchorsFor(productionScans);
    expect(composeGoalProgress({ target, baseline, current })).toMatchObject({
      status: "measured", baselineDate: "2026-07-18", currentDate: "2026-09-12",
      targetAmount: 10, achievedAmount: 5.8, remainingAmount: 4.2, rawPercent: 58, percentComplete: 58,
    });
  });

  it("is zero while awaiting a follow-up scan, and clamps once the target is exceeded", () => {
    const only = anchorsFor([jul18]);
    expect(composeGoalProgress({ target, ...only })).toMatchObject({ status: "awaiting_follow_up", achievedAmount: 0, percentComplete: 0 });
    const beyond = anchorsFor([jul18, scan("2026-10-20", 158.9, 14, 8.1, 176)]);
    expect(composeGoalProgress({ target, ...beyond })).toMatchObject({ status: "reached", achievedAmount: 11.4, remainingAmount: 0, percentComplete: 100 });
  });

  it("returns no progress for unsupported targets rather than guessing", () => {
    expect(composeGoalProgress({ target: { ...target, unit: "kg" }, ...anchorsFor(productionScans) })).toBeNull();
  });
});

describe("Active Goal current state — guardrail", () => {
  const progress = { achievedAmount: 5.8 };
  it("classifies the latest DEXA with the V3 evaluator and explains what it means for the build", () => {
    const guardrail = composeGoalGuardrail({ goal, current: anchorsFor(productionScans).current, progress });
    expect(guardrail).toMatchObject({ title: "Maintain approximately 8–9% body fat", label: "8–9% body fat",
      range: { min: 8, max: 9, unit: "%" }, measurement: { value: 8.1, date: "2026-09-12", source: "DEXA" },
      status: "clear", position: "within" });
    expect(guardrail.interpretation).toMatch(/inside the 8–9% range/);
    expect(guardrail.interpretation).toMatch(/adding lean mass without pushing body fat out of range/);
    expect(guardrail.interpretation).not.toMatch(/below/);
  });

  it("follows the engine severity bands and consequence policy outside the range", () => {
    const at = (value) => composeGoalGuardrail({ goal, current: { date: "2026-09-12", bodyFatPercent: value }, progress });
    expect(at(7.6)).toMatchObject({ status: "watch", position: "below", deviation: 0.4 });
    expect(at(7.6).interpretation).toMatch(/0\.4 points below the 8–9% range/);
    expect(at(7.4)).toMatchObject({ status: "pressured", position: "below" });
    expect(at(9.7)).toMatchObject({ status: "pressured", position: "above" });
    expect(at(9.7).interpretation).toMatch(/further fat gain would work against the build/);
    expect(at(10.6)).toMatchObject({ status: "breached", position: "above" });
    for (const value of [7.6, 7.4, 9.7, 10.6, 8.5]) expect(findGoalCoachingLanguageViolations(at(value).interpretation)).toEqual([]);
  });

  it("follows the engine's guardrail source precedence: a configured V3 array is authoritative", () => {
    const configuredWithoutBodyFat = { ...goal, v3Guardrails: [{ guardrailId: "recovery", metricCapability: "execution.recovery", evaluation: { mode: "minimum", threshold: 0 }, severityBands: [] }] };
    expect(composeGoalGuardrail({ goal: configuredWithoutBodyFat, current: { date: "2026-09-12", bodyFatPercent: 8.1 } })).toBeNull();
    const alias = { ...goal, v3Guardrails: [{ guardrailId: "bf", capability: "body_composition.body_fat_percentage", text: "Hold body fat",
      evaluation: { mode: "allowed_range", allowedRange: { min: 8, max: 9 } }, severityBands: [{ status: "watch", minimumDeviation: 0 }] }] };
    expect(composeGoalGuardrail({ goal: alias, current: { date: "2026-09-12", bodyFatPercent: 9.4 } })).toMatchObject({ title: "Hold body fat", status: "watch", position: "above" });
  });

  it("never throws when a configured V3 guardrail carries no text", () => {
    const configured = { ...goal, v3Guardrails: [{ guardrailId: "bf", metricCapability: "body_composition.body_fat_percentage",
      evaluation: { mode: "allowed_range", allowedRange: { min: 8, max: 9 } }, severityBands: [{ status: "watch", minimumDeviation: 0 }], consequencePolicy: {} }] };
    expect(composeGoalGuardrail({ goal: configured, current: { date: "2026-09-12", bodyFatPercent: 8.1 } })).toMatchObject({ status: "clear", title: "Body-fat guardrail" });
  });

  it("reports not assessed without a body-fat measurement", () => {
    expect(composeGoalGuardrail({ goal, current: null })).toMatchObject({ status: "not_assessed", measurement: null, interpretation: null });
  });
});

const v3Presentation = {
  status: "canonical_v3", piVersion: "confidence_v3", modelVersion: "canonical_confidence_assessment_v3",
  value: 79, label: "Moderate", movement: "held", delta: 0, priorScore: 79, assessmentId: "confidence_assessment_v3|current",
  originatingPublisher: "midweek_briefing", originatingArtifactId: "midweek_briefing_user_20260920_20260922",
  publicationTimestamp: "2026-09-23T10:01:29.328Z",
  primaryReason: "Confidence holds. This progress supports the current approach, but one update does not change the overall goal outlook.",
  explanationDetail: {
    schemaVersion: "home_confidence_presentation_v3",
    whyConfidence: "You are more than halfway to the 10 lb lean-mass goal. The build plan is clearly working. There is enough time to finish ahead of schedule if this level of progress continues.",
    whatIncreasedIt: ["You added 5.0 lb of lean mass since August 15.", "Body fat stayed controlled at 8.1%."],
    whatSupportsItNow: ["4.2 lb remain with 49 days left."],
    whatIsHoldingItBack: ["One excellent response does not guarantee the same result until the next DEXA."],
    whatCouldRaiseIt: ["The next DEXA showing that the progress continues."],
    whatCouldLowerIt: ["Body fat moving outside the intended range of 8–9%."],
    assumptions: ["This is a coaching outlook, not a measured statistical probability."],
    uncertaintyStatement: "Confidence holds. This progress supports the current approach, but one update does not change the overall goal outlook.",
  },
};

describe("Active Goal current state — Confidence V3", () => {
  it("uses the V3 goal-level explanation with publisher provenance, never the briefing's movement sentence", () => {
    const confidence = composeGoalConfidence(v3Presentation, { timeZone: "America/Los_Angeles" });
    expect(confidence).toMatchObject({ score: 79, band: "Moderate", movement: "held", summarySource: "narrative_v3.why_confidence",
      publishedBy: { publisherType: "midweek_briefing", label: "Midweek Briefing", publishedOn: "2026-09-23" } });
    expect(confidence.summary).toBe(v3Presentation.explanationDetail.whyConfidence);
    expect(JSON.stringify(confidence)).not.toMatch(/one update/);
    expect(confidence.detail.whatSupportsIt).toEqual(["You added 5.0 lb of lean mass since August 15.", "Body fat stayed controlled at 8.1%.", "4.2 lb remain with 49 days left."]);
  });

  it("never falls back to legacy text when a valid V3 assessment exists, and withholds jargon instead of rewriting it", () => {
    const jargon = { ...v3Presentation, explanationDetail: { ...v3Presentation.explanationDetail, whyConfidence: "Confidence holds; one update does not change the outlook." } };
    expect(composeGoalConfidence(jargon).summary).toBeNull();
    const missing = { ...v3Presentation, explanationDetail: { ...v3Presentation.explanationDetail, whyConfidence: null } };
    expect(composeGoalConfidence(missing).summary).toBeNull();
  });

  it("never throws on an unparseable publication timestamp", () => {
    expect(composeGoalConfidence({ ...v3Presentation, publicationTimestamp: "garbage" }).publishedBy.publishedOn).toBeNull();
  });

  it("uses the V2 goal-surface explanation only for a V2 assessment", () => {
    const v2 = { status: "canonical", piVersion: "confidence_v2", value: 62, label: "Moderate", presentationExplanation: "The plan is on track.", publicationTimestamp: "2026-09-16T07:04:38.549Z", originatingPublisher: "midweek_briefing" };
    expect(composeGoalConfidence(v2)).toMatchObject({ summary: "The plan is on track.", summarySource: "confidence_v2.goal_surface", detail: null });
  });
});

describe("Active Goal current state — training progress", () => {
  const observation = (name, category, status, pct, confidence = "high") => ({
    exercise: { key: name.toLowerCase().replace(/\W+/g, "_"), name, primaryNavigationCategory: category }, status, confidence,
    evidence_date_range: { start: "2026-08-20", end: "2026-09-20" }, supporting_session_ids: [`${name}-1`, `${name}-2`],
    explanation_data: { last_session: { set_count: 3 }, previous_comparable_session: { set_count: 3 },
      volume_trend: { latest: 1000 * (1 + pct / 100), previous: 1000, percent_change: pct }, pr_detection: { detected: status === "improving", prs: status === "improving" ? [{ kind: "load" }] : [] } },
  });
  it("summarizes structured training through today with Server-owned meaning", () => {
    const report = { exerciseObservations: [
      observation("Hack Squats", "quads", "improving", 48.1), observation("Hip Thrusts", "glutes", "improving", 11.3),
      observation("Shoulder Press Machine", "shoulders", "improving", 6.7), observation("Bench Press", "chest", "plateauing", 5),
      observation("Single-Leg Leg Press", "quads", "regressing", -16.5, "moderate"), observation("Spider Curls", "biceps", "improving", 4),
      observation("One-off", "quads", "insufficient_data", 0, "low"),
    ] };
    const training = composeGoalTrainingProgressToDate({ start: "2026-08-15", today: "2026-09-25", report, sessionCount: 40, trainingDayCount: 36 });
    expect(training).toMatchObject({ state: "established", periodStart: "2026-08-15", periodEnd: "2026-09-25", sessionCount: 40, trainingDayCount: 36,
      comparableMovementCount: 6, improvingCount: 4, steadyCount: 1, regressingCount: 1 });
    expect(training.highlights.map((item) => item.name)).toEqual(["Hack Squats", "Hip Thrusts", "Shoulder Press Machine"]);
    expect(training.summary).toMatch(/^4 of 6 comparable movements are improving, led by .*lower body/);
    expect(training.summary).toMatch(/Single-Leg Leg Press is down\./);
    expect(training.summary).toMatch(/supports adding lean mass/);
    expect(findGoalCoachingLanguageViolations(training.summary)).toEqual([]);
  });
  it("counts live resistance sessions and training days, never raw evidence revisions or other evidence types", () => {
    const session = (id, date, extra = {}) => ({ id, evidence_type: "training", observed_at: `${date}T17:00:00Z`, session_type: "resistance",
      exercises: [{ name: "Hack Squats", sets: [{ reps: 8, weight: 200 }] }], ...extra });
    const objects = [session("s1", "2026-08-20"), session("s1", "2026-08-20"), session("s2", "2026-08-20"), session("s3", "2026-08-22"),
      { id: "meal", evidence_type: "nutrition", observed_at: "2026-08-21T12:00:00Z" }, { id: "w", evidence_type: "weight", observed_at: "2026-08-21T12:00:00Z" }];
    const training = createGoalTrainingProgressToDate({ phase: { id: "p2", startDate: "2026-08-15" }, canonicalObjects: objects,
      currentDate: new Date("2026-09-25T18:00:00Z"), timeZone: "America/Los_Angeles" });
    expect(training.sessionCount).toBe(3);
    expect(training.trainingDayCount).toBe(2);
    expect(training.periodEnd).toBe("2026-09-25");
  });

  it("assigns sessions to the user's local training day, not the UTC date", () => {
    const evening = { id: "late", evidence_type: "training", observed_at: "2026-09-26T02:30:00Z", session_type: "resistance",
      exercises: [{ name: "Hack Squats", sets: [{ reps: 8, weight: 200 }] }] };
    const training = createGoalTrainingProgressToDate({ phase: { id: "p2", startDate: "2026-08-15" }, canonicalObjects: [evening],
      currentDate: new Date("2026-09-26T03:00:00Z"), timeZone: "America/Los_Angeles" });
    expect(training.periodEnd).toBe("2026-09-25");
    expect(training.sessionCount).toBe(1);
    expect(training.trainingDayCount).toBe(1);
  });

  it("waits honestly when nothing is comparable", () => {
    const training = composeGoalTrainingProgressToDate({ start: "2026-08-15", today: "2026-08-16", report: { exerciseObservations: [] } });
    expect(training).toMatchObject({ state: "waiting_for_evidence", comparableMovementCount: 0 });
    expect(training.summary).not.toMatch(/review/i);
  });
  it("maps canonical muscle categories to regions", () => {
    expect(["quads", "Glutes", "chest", "biceps", "core", "Lower Body", "unmapped"].map(trainingRegionForCategory))
      .toEqual(["lower body", "lower body", "upper body", "arms", "core", "lower body", null]);
  });
});

describe("Active Goal current state — turning points", () => {
  const guardrail = composeGoalGuardrail({ goal, current: anchorsFor(productionScans).current });
  const points = (scans) => {
    const anchors = anchorsFor(scans);
    return composeGoalTurningPoints({ baseline: anchors.baseline, sinceBaseline: anchors.sinceBaseline, journeyStartDate: JOURNEY_START,
      phases: goal.phases, target, guardrail: { ...guardrail, definition: { evaluation: { mode: "allowed_range", allowedRange: { min: 8, max: 9 } },
        severityBands: [{ status: "breached", minimumDeviation: 1.5 }, { status: "pressured", minimumDeviation: 0.5 }, { status: "watch", minimumDeviation: 0 }] } } });
  };
  it("includes the later material DEXA and the correct Aug 15 arithmetic", () => {
    const result = points(productionScans);
    expect(result.map((item) => [item.date, item.kind])).toEqual([
      ["2026-07-18", "dexa_baseline"], ["2026-08-15", "phase_transition"], ["2026-09-12", "dexa_milestone"]]);
    expect(result[1].body).toMatch(/148\.3 lb of lean mass, \+0\.8 lb from the goal baseline/);
    expect(result[2]).toMatchObject({ title: "Past halfway to the lean-mass target" });
    expect(result[2].body).toBe("The Sep 12 DEXA measured 153.3 lb of lean mass, +5.0 lb since the Aug 15 scan and +5.8 lb from the goal baseline. Body fat moved into the 8–9% range at 8.1%.");
    expect(JSON.stringify(result)).not.toMatch(/Planned phase review|Goal destination|Future evidence/);
  });
  it("is selective: an immaterial scan does not become a turning point", () => {
    const result = points([...productionScans, scan("2026-10-09", 153.6, 14.3, 8.2, 175.1)]);
    expect(result.map((item) => item.date)).not.toContain("2026-10-09");
    const material = points([...productionScans, scan("2026-10-09", 155.1, 14.3, 8.2, 176.6)]);
    expect(material.at(-1)).toMatchObject({ date: "2026-10-09", title: "Lean mass up 1.8 lb" });
  });
});

function midweekV3Artifact({ id = "midweek-v3", generatedAt = "2026-09-23T10:01:29.328Z", suppressCoachTake = false } = {}) {
  const window = createMidweekEvidenceWindow({ now: new Date("2026-07-22T19:00:00Z"), timeZone: "America/Los_Angeles" });
  const briefing = structuredClone(composeMidweekBriefingPreview({ ...midweekPreviewFixtures.trainingImprovement, window, generatedAt }));
  briefing.narrativeV3 = { summary: "Canonical V3 headline.", detail: "Canonical V3 detail.",
    sections: { result: "Canonical V3 result.", meaning: "Canonical V3 meaning.", action: "Keep executing consistently.", watch: "Canonical V3 watch.", confidence: "Canonical V3 confidence." },
    coachTake: "Canonical V3 coach take.", strategicInterpretationId: "interpretation-v3" };
  briefing.goalConfidence = { score: 79, band: "moderate", assessmentId: `${id}-assessment`, modelVersion: "canonical_confidence_assessment_v3", piVersion: "confidence_v3" };
  briefing.activeGoal = { id: "goal-build" }; briefing.activePhase = { id: "p2" };
  const artifact = { id, cadence: "midweek", generatedAt, lifecycle: { generationStatus: "completed" },
    evidenceWindow: { ...window, id: `${id}-window`, startDate: "2026-09-20", endDate: "2026-09-22" },
    goalContext: { goalId: "goal-build", phaseId: "p2" },
    confidencePublication: { schemaVersion: "briefing_confidence_binding_v3", assessmentId: `${id}-assessment` }, briefing };
  const assessment = { id: `${id}-assessment`, assessmentId: `${id}-assessment`, schemaVersion: "canonical_confidence_assessment_v3",
    briefingArtifactId: id, evidenceWindowId: `${id}-window`, goalId: "goal-build", phaseId: "p2", currentPercentage: 79, confidenceBand: "moderate",
    movement: "no_meaningful_change", narrativeExplanation: { text: "Canonical V3 confidence." }, structuredInterpretationId: "interpretation-v3",
    narrativeAssessmentId: "plan-v3",
    strategicInterpretation: { id: "interpretation-v3", coachingObservationSelection: { selected: [
      { candidateId: "c-result", topicKey: "training|press|heaviest_load", subjectId: "press", subjectLabel: "Press" },
      ...(suppressCoachTake ? [{ candidateId: "c-coach", topicKey: "training|row|heaviest_load", subjectId: "row", subjectLabel: "Row" }] : [])] } },
    narrativePlan: { id: "plan-v3", strategicInterpretationId: "interpretation-v3", uncertaintyTypes: [], composition: { sectionAllocations: {
      result: { topicKeys: ["training|press|heaviest_load"] }, meaning: { topicKeys: ["goal_implication"] }, action: { topicKeys: ["recommendation"] },
      watch: { topicKeys: ["energy_ambiguity"] }, confidence: { topicKeys: ["confidence_movement"] },
      coachTake: { topicKeys: suppressCoachTake ? ["training|row|heaviest_load"] : [] } } } } };
  return { artifact, assessment };
}

function weeklyV3Artifact({ id = "weekly-v3", generatedAt = "2026-09-27T12:34:05.415Z", lifecycle = {} } = {}) {
  return { id, cadence: "weekly", generatedAt, lifecycle, evidenceWindow: { startDate: "2026-09-20", endDate: "2026-09-26" },
    confidencePublication: { schemaVersion: "briefing_confidence_binding_v3", assessmentId: `${id}-assessment` },
    briefing: { narrativeV3: { summary: "Weekly headline.", coachTake: "Weekly coach take.",
      sections: { result: "r", meaning: "m", action: "Weekly action.", watch: "Weekly watch.", confidence: "c" } } } };
}

describe("Active Goal current state — latest published briefing Coach's Take", () => {
  it("selects the latest published V3 briefing and skips failed, in-progress, preview and V2 artifacts", () => {
    const { artifact: midweek } = midweekV3Artifact();
    const failed = weeklyV3Artifact({ id: "weekly-failed", lifecycle: { generationStatus: "failed" } });
    const inProgress = weeklyV3Artifact({ id: "weekly-running", lifecycle: { status: "in_progress" } });
    const preview = { ...weeklyV3Artifact({ id: "weekly-preview" }), artifactType: "preview" };
    const v2 = { ...weeklyV3Artifact({ id: "weekly-v2" }), confidencePublication: { schemaVersion: "briefing_confidence_binding_v2" } };
    expect(selectLatestPublishedV3Briefing([failed, inProgress, preview, v2, midweek]).id).toBe("midweek-v3");
    expect(selectLatestPublishedV3Briefing([midweek, weeklyV3Artifact()]).id).toBe("weekly-v3");
  });

  it("excludes superseded, invalid, retired and preview briefings like Home's current-published selection", () => {
    const valid = weeklyV3Artifact({ id: "weekly-valid", generatedAt: "2026-09-20T12:00:00.000Z" });
    valid.evidenceWindow = { startDate: "2026-09-13", endDate: "2026-09-19" };
    const newer = (id, patch) => ({ ...weeklyV3Artifact({ id, generatedAt: "2026-09-28T12:00:00.000Z" }), ...patch });
    for (const bad of [
      newer("superseded", { lifecycle: { generationStatus: "superseded" } }),
      newer("invalid", { status: "invalid" }),
      newer("retired", { lifecycle: { status: "retired" } }),
      newer("lifecycle-preview", { lifecycle: { preview: true } }),
      newer("bad-instant", { generatedAt: "not-a-date" }),
    ]) expect(selectLatestPublishedV3Briefing([valid, bad]).id).toBe("weekly-valid");
  });

  it("ranks by the evidence a briefing covers, so a regenerated older-week briefing never replaces newer coaching", () => {
    const { artifact: midweek } = midweekV3Artifact();
    const regeneratedOldWeekly = { ...weeklyV3Artifact({ id: "weekly-regen", generatedAt: "2026-09-26T12:00:00.000Z" }),
      evidenceWindow: { startDate: "2026-09-13", endDate: "2026-09-19" } };
    expect(selectLatestPublishedV3Briefing([regeneratedOldWeekly, midweek]).id).toBe("midweek-v3");
    const nextWeekly = weeklyV3Artifact({ id: "weekly-next", generatedAt: "2026-09-27T12:00:00.000Z" });
    expect(selectLatestPublishedV3Briefing([regeneratedOldWeekly, midweek, nextWeekly]).id).toBe("weekly-next");
  });

  it("renders the Midweek Coach's Take exactly as the briefing served it, with provenance", () => {
    const { artifact, assessment } = midweekV3Artifact();
    const coach = projectLatestBriefingCoachTake({ artifact, assessment, timeZone: "America/Los_Angeles" });
    expect(coach).toMatchObject({ artifactId: "midweek-v3", cadence: "midweek", artifactType: "scheduled", briefingLabel: "Midweek Briefing",
      publishedOn: "2026-09-23", evidenceWindow: { startDate: "2026-09-20", endDate: "2026-09-22" },
      attribution: "Sep 23 Midweek Briefing · Coach's Take" });
    expect(coach.sections.map((item) => [item.kind, item.title, item.text])).toEqual([
      ["coachTake", "Biggest Takeaway", "Canonical V3 coach take."],
      ["action", "What To Do", "Keep executing consistently."],
      ["watch", "What To Watch", "Canonical V3 watch."]]);
    expect(JSON.stringify(coach)).not.toMatch(/My Recommendation/);
  });

  it("fails closed (no Coach's Take) when the Midweek artifact cannot be served as V3", () => {
    const { artifact, assessment } = midweekV3Artifact();
    artifact.briefing.goalConfidence.piVersion = "confidence_v2";
    expect(projectLatestBriefingCoachTake({ artifact, assessment })).toBeNull();
    expect(projectLatestBriefingCoachTake({ artifact: midweekV3Artifact().artifact, assessment: null })).toBeNull();
  });

  it("omits a section the Midweek contract suppressed (a second movement) rather than re-adding it", () => {
    const { artifact, assessment } = midweekV3Artifact({ suppressCoachTake: true });
    const coach = projectLatestBriefingCoachTake({ artifact, assessment });
    expect(coach.sections.map((item) => item.kind)).toEqual(["action", "watch"]);
  });

  it("renders canonical V3 fields for other families and never a V2 artifact", () => {
    const coach = projectLatestBriefingCoachTake({ artifact: weeklyV3Artifact(), timeZone: "America/Los_Angeles" });
    expect(coach.attribution).toBe("Sep 27 Weekly Briefing · Coach's Take");
    expect(coach.sections.map((item) => item.text)).toEqual(["Weekly coach take.", "Weekly action.", "Weekly watch."]);
    expect(projectLatestBriefingCoachTake({ artifact: { ...weeklyV3Artifact(), confidencePublication: { schemaVersion: "briefing_confidence_binding_v2" } } })).toBeNull();
  });
});

describe("Active Goal preview — production-shaped end to end", () => {
  const compose = (overrides = {}) => composePhaseAwareActiveGoalPreview({ user: { timezone: "America/Los_Angeles" }, goal,
    dexaScans: productionScans, protocols: [], canonicalEvidence: [], currentDate: new Date("2026-09-26T02:45:00Z"), ...overrides });

  it("projects baseline, current state, progress, guardrail, turning points and Coach's Take in one contract", () => {
    const { artifact, assessment } = midweekV3Artifact();
    const result = compose({ latestBriefing: artifact, store: { goalConfidenceHistory: [{ assessmentId: assessment.assessmentId, assessment }] } });
    const state = result.currentState;
    expect(state.schemaVersion).toBe("active_goal_current_state_v1");
    expect(state.composition.baseline.date).toBe("2026-07-18");
    expect(state.composition.current.date).toBe("2026-09-12");
    expect(state.progress).toMatchObject({ achievedAmount: 5.8, remainingAmount: 4.2, percentComplete: 58 });
    expect(state.guardrail).toMatchObject({ status: "clear", position: "within" });
    expect(state.phase).toMatchObject({ name: "Lean Mass Build", measurementCadence: "Measured by monthly DEXA" });
    expect(state.coachTake.attribution).toBe("Sep 23 Midweek Briefing · Coach's Take");
    expect(state.turningPoints.map((item) => item.date)).toEqual(["2026-07-18", "2026-08-15", "2026-09-12"]);
    // Build 60 legacy fields carry the corrected facts too.
    expect(result.guardrail.observation).toEqual({ relation: "within", label: "8.1% on Sep 12 DEXA — within the 8–9% range" });
    expect(result.guardrail.body).toBe(state.guardrail.interpretation);
    expect(result.evidence.current).toMatchObject({ date: "2026-09-12", leanMass: "153.3 lb", bodyFat: "8.1%" });
    expect(result.turningPoints.find((item) => item.date === "2026-08-15").body).toMatch(/\+0\.8 lb from the goal baseline/);
    expect(result.journey[1].dates).toBe("Started Aug 15 · Monthly DEXA");
  });

  it("contains no fictional review or process jargon anywhere in the payload", () => {
    const payload = JSON.stringify(compose());
    for (const phrase of [/next review/i, /Goal review comes next/i, /Evidence keeps accumulating/i, /Weekly evidence monitors/i, /one update/i, /Planned phase review/i, /Monthly review/i, /My Recommendation/i]) {
      expect(payload).not.toMatch(phrase);
    }
  });

  it("updates automatically when a newer authoritative DEXA or briefing is published", () => {
    const newerScan = scan("2026-10-09", 155.4, 14.5, 8.3, 177.4);
    const updated = compose({ dexaScans: [...productionScans, newerScan], latestBriefing: weeklyV3Artifact() }).currentState;
    expect(updated.composition.current.date).toBe("2026-10-09");
    expect(updated.progress).toMatchObject({ achievedAmount: 7.9, percentComplete: 79 });
    expect(updated.coachTake.artifactId).toBe("weekly-v3");
    expect(updated.composition.baseline.date).toBe("2026-07-18");
  });

  it("keeps the payload bounded", () => {
    const { artifact, assessment } = midweekV3Artifact();
    const payload = compose({ latestBriefing: artifact, store: { goalConfidenceHistory: [{ assessmentId: assessment.assessmentId, assessment }] } });
    expect(Buffer.byteLength(JSON.stringify(payload))).toBeLessThan(24_000);
  });

  it("hard-codes no Founder identity, date or measurement in product code", () => {
    for (const file of ["./ActiveGoalCurrentStateService.js", "./PhaseAwareActiveGoalPreviewService.js"]) {
      const source = fs.readFileSync(new URL(file, import.meta.url), "utf8");
      for (const fragment of ["2026-", "153.3", "147.5", "148.3", "8.1%", "8–9%", "user_founder", "6353e12e"]) expect(source).not.toContain(fragment);
    }
  });
});

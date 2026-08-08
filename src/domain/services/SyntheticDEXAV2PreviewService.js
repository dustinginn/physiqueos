import { createSyntheticDexaV2PreviewFixture } from "../../fixtures/syntheticDexaV2PreviewFixture";
import { InterpretationEngine } from "../interpretation/InterpretationEngine";
import { ForecastEngine } from "../forecast/ForecastEngine";
import { NarrativeEngine } from "../narrative/NarrativeEngine";
import { projectSyntheticDEXAV2Confidence } from "./SyntheticDEXAV2ConfidenceProjectionService";
import { createPhaseReviewPreview } from "./PhaseReviewPreviewService";

export const SYNTHETIC_DEXA_V2_PREVIEW_VERSION = "synthetic_dexa_v2_preview_v1";

export function createSyntheticDexaV2Preview() {
  const fixture = createSyntheticDexaV2PreviewFixture();
  const { interpretationInput, previousForecastContext, scenario } = fixture;
  const structuredInterpretation = InterpretationEngine.interpret(interpretationInput);
  const forecastAssessment = ForecastEngine.forecast({
    goalContract: interpretationInput.goalContract,
    structuredInterpretation,
    previousForecastContext,
  });
  const narrativeAssessment = NarrativeEngine.explain({
    goalContract: interpretationInput.goalContract,
    forecastAssessment,
  });
  const confidenceProjection = projectSyntheticDEXAV2Confidence({
    forecastAssessment, narrativeAssessment, previousForecastContext,
  });
  const presentation = projectDEXAPresentation({
    scenario, structuredInterpretation, forecastAssessment, narrativeAssessment,
    confidenceProjection,
  });
  const phaseReview = createPhaseReviewPreview({
    recommendation: "begin_next_phase",
    recommendationLabel: "Begin Phase 2 — Lean Mass Build",
    explanation: "Phase 1 appears to have accomplished its purpose, and body fat remains controlled enough to begin the dedicated lean-mass phase. The result is encouraging without guaranteeing the same response ahead.",
    currentPhase: { id: "phase_maintenance_calibration", name: "Establish Maintenance", shortName: "Phase 1" },
    nextPhase: { id: "phase_lean_mass_build", name: "Lean Mass Build", shortName: "Phase 2" },
    originalReviewDate: scenario.current.scanDate,
    recommendedDurationDays: 14,
    nextPhaseReviewIntervalDays: 28,
    reasoningLineage: [structuredInterpretation.id, forecastAssessment.id, narrativeAssessment.id],
    decisionSource: "synthetic_dexa_phase_review_preview",
  });
  return deepFreeze({
    schemaVersion: SYNTHETIC_DEXA_V2_PREVIEW_VERSION,
    previewOnly: true,
    deterministic: true,
    fixtureId: fixture.id,
    presentation,
    phaseReview,
    diagnostics: {
      syntheticFixture: structuredClone(scenario),
      normalizedGoalContract: structuredClone(interpretationInput.goalContract),
      structuredInterpretation,
      forecastAssessment,
      narrativeAssessment,
      confidenceProjection,
      previousForecastContext: structuredClone(previousForecastContext),
      presentationInputs: {
        sourceRefs: {
          interpretationRef: structuredInterpretation.id,
          forecastRef: forecastAssessment.id,
          narrativeRef: narrativeAssessment.id,
        },
        confidenceBand: forecastAssessment.confidenceBand,
        confidenceMovement: forecastAssessment.movement.direction,
        confidenceScore: confidenceProjection.score,
        coachingDirection: narrativeAssessment.recommendedCoachingDirection.state,
      },
      mutationSafetyReport: {
        repositoryAccess: false,
        evidencePersistence: false,
        forecastPersistence: false,
        publication: false,
        homeMutation: false,
        briefingHistoryMutation: false,
        founderMutation: false,
        goalMutation: false,
        phaseMutation: false,
        phaseReviewPersistence: false,
        notificationMutation: false,
        protocolMutation: false,
        july18ArtifactMutation: false,
      },
    },
  });
}

function projectDEXAPresentation({ scenario, structuredInterpretation, forecastAssessment, narrativeAssessment, confidenceProjection }) {
  const { baseline, current } = scenario;
  const delta = (key) => Number((current[key] - baseline[key]).toFixed(1));
  const headline = [
    comparison("DEXA Weight", baseline.weight, current.weight, "lb"),
    comparison("Body Fat", baseline.bodyFat, current.bodyFat, "pts", "%"),
    comparison("Fat Mass", baseline.fatMass, current.fatMass, "lb"),
    comparison("Lean Tissue", baseline.leanMass, current.leanMass, "lb"),
  ];
  const regionalFat = [
    comparison("Arms", 1.5, 1.7, "lb"), comparison("Legs", 3.9, 4.3, "lb"),
    comparison("Trunk", 6.7, 7.6, "lb"),
  ];
  const regionalLean = [
    comparison("Arms", 21.8, 22.4, "lb"), comparison("Legs", 50.5, 51.3, "lb"),
    comparison("Trunk", 67.0, 68.1, "lb"),
  ];
  const supplemental = [
    comparison("Visceral Fat", 0.15, 0.17, "lb", "lb", 2),
    comparison("A/G Ratio", 0.73, 0.74, "", "", 2),
    comparison("RMR", baseline.rmr, current.rmr, "cal/day", "cal/day", 0),
  ];
  return {
    schemaVersion: "dexa_event_v2_synthetic_preview_v1",
    semanticGoalType: "lean_mass_gain",
    scanDate: current.scanDate,
    priorScanDate: baseline.scanDate,
    hero: {
      title: "Lean tissue rose meaningfully, with fat gain to watch",
      body: `Measured lean tissue increased ${delta("leanMass").toFixed(1)} lb while body fat held at ${current.bodyFat.toFixed(1)}%; fat mass also rose ${delta("fatMass").toFixed(1)} lb. You’re on track, so the plan stays steady while the pace of weight and fat gain remains the main thing to watch.`,
      results: [
        { emoji: "💪", label: "Lean Tissue", value: `+${delta("leanMass").toFixed(1)} lb`, context: "Measured since the July 18 baseline" },
        { emoji: "📈", label: "Body Fat", value: `${current.bodyFat.toFixed(1)}%`, context: `Up ${delta("bodyFat").toFixed(1)} points; still inside the accepted range` },
      ],
      confidence: confidenceProjection,
    },
    snapshot: { ...current, daysBetweenScans: 28 },
    progress: {
      headline, regionalFat, regionalLean, supplemental,
      timelineLabel: "Since the July 18 baseline",
      timeline: {
        available: true, elapsedDays: 28, simulated: true,
        scans: [{ scanId: "synthetic-july-18", date: baseline.scanDate }, { scanId: "synthetic-aug-15", date: current.scanDate }],
        metrics: [
          timelineMetric("bodyFat", "Body Fat", "%", baseline.bodyFat, current.bodyFat),
          timelineMetric("fatMass", "Fat Mass", "lb", baseline.fatMass, current.fatMass),
          timelineMetric("leanMass", "Lean Tissue", "lb", baseline.leanMass, current.leanMass),
        ],
        summary: {
          bodyFat: summary(baseline.bodyFat, current.bodyFat),
          fatMass: summary(baseline.fatMass, current.fatMass),
          leanMass: summary(baseline.leanMass, current.leanMass),
        },
      },
    },
    interpretation: {
      opening: "July 18 is still the starting point, and August 15 is the first real check against it. The result is encouraging, but another scan is needed before treating it as a trend.",
      fatLoss: `Body fat is still comfortably inside your target range at ${current.bodyFat.toFixed(1)}%, so no corrective change is needed. Fat mass did rise ${delta("fatMass").toFixed(1)} lb, making the pace the main thing to watch to keep the surplus honest.`,
      leanMass: `Measured lean tissue rose ${delta("leanMass").toFixed(1)} lb, which is a very good first sign. It is too early to call all of it permanent muscle, so preparation stays consistent and the next scan provides confirmation.`,
      regional: "The increase showed up across your arms, legs, and trunk rather than coming from one area. That makes the result more encouraging, but it doesn’t change the plan by itself.",
      phaseMeaning: `Nothing changes yet. The current plan is working well enough to continue, while the ${delta("weight").toFixed(1)} lb monthly gain is a reason not to push the surplus any higher.`,
      stoodOut: "Your stronger priority lifts, upward scale trend, and fuller photos all fit the story this scan is telling. The slight softness in the photos keeps the pace under watch instead of supporting more food.",
      supportingEvidence: "You followed the plan consistently, recovered well enough, and gave the training and nutrition time to work. That makes this a fair test of the plan, even though execution alone can’t prove where every pound went.",
      uncertainty: "This is still only the first follow-up, and DEXA lean tissue can move with hydration, glycogen, and preparation—not just muscle. The September scan will show whether this is a pattern that can be trusted.",
    },
    interpretationLabels: { bodyFat: "Body-fat range", strategy: "What This Tells Us", uncertainty: "What We Still Need to Learn" },
    coachInsight: {
      biggestWin: "This is exactly the kind of first check the plan was built to produce: lean tissue is up and body fat is still controlled. The plan appears to be working, with the pace of fat gain the main thing to keep under review.",
      protect: "Calories and training stay exactly where they are. One encouraging scan is a reason to stay consistent, not a reason to cut or overhaul the program.",
      watch: "The 28-day weight trend and any continued softness in the photos are the two things to watch. If both continue accelerating, the surplus should be trimmed before body fat becomes a problem.",
      next: "Keep photo conditions and DEXA preparation consistent, then scan again between September 12 and 19. That result will determine whether to keep the surplus unchanged or tighten it slightly.",
    },
    coachLabels: { biggestWin: "🎉 Biggest Takeaway", protect: "💪 Recommendation", watch: "👀 What to Watch", next: "🎯 Next Actions" },
    milestones: [],
    canonicalRefs: {
      interpretation: structuredInterpretation.id,
      forecast: forecastAssessment.id,
      narrative: narrativeAssessment.id,
    },
  };
}

function comparison(label, previous, current, unit, displayUnit = unit, precision = 1) {
  return { label, previous, current, delta: Number((current - previous).toFixed(precision)), unit, displayUnit, precision };
}
function summary(previous, current) { return { previous, current, delta: Number((current - previous).toFixed(1)) }; }
function timelineMetric(key, label, unit, previous, current) {
  return { key, label, unit, delta: Number((current - previous).toFixed(1)), points: [
    { scanId: "synthetic-july-18", date: "2026-07-18", value: previous },
    { scanId: "synthetic-aug-15", date: "2026-08-15", value: current },
  ] };
}
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

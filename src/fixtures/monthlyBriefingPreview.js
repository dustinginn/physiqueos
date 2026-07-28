const MONTHLY_JULY_FIXTURE_ID = "monthly_monthly_preview_july_2026_v2";
const MONTHLY_JULY_FIXTURE_VERSION = "monthly-preview-fixture-v2";
const MONTHLY_JULY_FIXTURE_SEED = "monthly-preview-july-2026-seed-v2";
const MONTHLY_CONTROL_FIXTURE_ID = "monthly_monthly_preview_control_v1";
const MONTHLY_CONTROL_FIXTURE_VERSION = "monthly-preview-control-v1";
const MONTHLY_CONTROL_FIXTURE_SEED = "monthly-preview-control-seed-v1";

const makeSyntheticRecord = (record, fixtureSeed = MONTHLY_JULY_FIXTURE_SEED, syntheticDateRange = null) => ({
  ...record,
  isSynthetic: true,
  source: "preview_fixture",
  fixtureId: MONTHLY_JULY_FIXTURE_ID,
  fixtureVersion: MONTHLY_JULY_FIXTURE_VERSION,
  fixtureSeed,
  syntheticDateRange,
});

export const monthlyPreviewFixtures = {
  julyContinuation: {
    fixtureId: MONTHLY_JULY_FIXTURE_ID,
    fixtureVersion: MONTHLY_JULY_FIXTURE_VERSION,
    fixtureSeed: MONTHLY_JULY_FIXTURE_SEED,
    syntheticDateRange: null,
    weights: [
      { id: "jun-01", measuredAt: "2026-06-01", weight: { value: 177.1, unit: "lb" } },
      { id: "jun-15", measuredAt: "2026-06-15", weight: { value: 171.6, unit: "lb" } },
      { id: "jun-30", measuredAt: "2026-06-30", weight: { value: 166.8, unit: "lb" } },
    ],
    dexaScans: [
      {
        id: "dexa-jun-20",
        measuredAt: "2026-06-20",
        leanMass: { value: 148.7, unit: "lb" },
        fatMass: { value: 18.9, unit: "lb" },
        bodyFatPercentage: { value: 10.8, unit: "%" },
        source: "real",
      },
    ],
    progressPhotos: [
      { id: "photo-06-05", capturedAt: "2026-06-05", view: "front", imagePath: "private/founder/photos/2026-06-05-front.JPEG", source: { type: "photo", name: "Founder Historical Progress Photos" } },
      { id: "photo-06-26", capturedAt: "2026-06-26", view: "front", imagePath: "private/founder/photos/2026-06-26-front.JPEG", source: { type: "photo", name: "Founder Historical Progress Photos" } },
    ],
    energyContinuations: [
      { id: "real-energy-06-07", date: "2026-06-07", balance: -820, estimatedIntake: 2470, estimatedExpenditure: 3290, source: "real" },
      { id: "real-energy-06-14", date: "2026-06-14", balance: -760, estimatedIntake: 2580, estimatedExpenditure: 3340, source: "real" },
      { id: "real-energy-06-21", date: "2026-06-21", balance: -520, estimatedIntake: 2530, estimatedExpenditure: 3050, source: "real" },
      { id: "real-energy-06-28", date: "2026-06-28", balance: -490, estimatedIntake: 2440, estimatedExpenditure: 2930, source: "real" },
    ],
    trainingObservations: [
      { id: "train-06-06", date: "2026-06-06", movement: "bench", direction: "improving", area: "upper" },
      { id: "train-06-12", date: "2026-06-12", movement: "squat", direction: "improving", area: "lower" },
      { id: "train-06-20", date: "2026-06-20", movement: "row", direction: "stable", area: "back" },
      { id: "train-06-27", date: "2026-06-27", movement: "deadlift", direction: "improving", area: "lower" },
    ],
    dailyBriefings: [
      {
        id: "daily-close-june",
        generatedAt: "2026-06-30T18:00:00Z",
        hero: { confidence: 90 },
        goalStatus: { primary: { progress: 92 } },
        progressEvidence: {
          dexa: { summary: "June DEXA confirmed fat reduction while preserving structure." },
          photos: { summary: "Photo sequence remained directional." },
        },
      },
    ],
    goal: {
      id: "goal-visible-abs",
      title: "Visible Abs at Rest",
      timeline: {
        startDate: "2026-05-01",
        targetDate: "2026-07-18",
      },
      phases: [
        { id: "phase-visible-abs", name: "Visible Abs", startDate: "2026-05-01", status: "completed", duration: { value: 8, unit: "weeks" } },
        { id: "phase-build-lean-mass", name: "Build Lean Mass", startDate: "2026-06-29", status: "active", duration: { value: 16, unit: "weeks" } },
      ],
    },
    syntheticContinuation: {
      fixtureId: MONTHLY_JULY_FIXTURE_ID,
      fixtureVersion: MONTHLY_JULY_FIXTURE_VERSION,
      fixtureSeed: MONTHLY_JULY_FIXTURE_SEED,
      syntheticDateRange: { startDate: null, endDate: "2026-07-30" },
      weights: [
        makeSyntheticRecord({ id: "jul-08", measuredAt: "2026-07-08", weight: { value: 166.7, unit: "lb" } }),
        makeSyntheticRecord({ id: "jul-22", measuredAt: "2026-07-22", weight: { value: 166.6, unit: "lb" } }),
        makeSyntheticRecord({ id: "jul-30", measuredAt: "2026-07-30", weight: { value: 166.5, unit: "lb" } }),
      ],
      dexaScans: [
        makeSyntheticRecord({
          id: "dexa-jul-18",
          measuredAt: "2026-07-18",
          leanMass: { value: 147.5, unit: "lb" },
          fatMass: { value: 12.8, unit: "lb" },
          bodyFatPercentage: { value: 7.7, unit: "%" },
          isNewBaseline: true,
          baselineRole: "goal_transition_reference",
        }),
      ],
      progressPhotos: [
        makeSyntheticRecord({
          id: "photo-07-16",
          capturedAt: "2026-07-16",
          view: "front",
          imagePath: "private/founder/photos/2026-07-16-front.JPEG",
          source: { type: "photo", name: "preview_fixture" },
        }),
        makeSyntheticRecord({
          id: "photo-07-30",
          capturedAt: "2026-07-30",
          view: "front",
          imagePath: "private/founder/photos/2026-07-30-front.JPEG",
          source: { type: "photo", name: "preview_fixture" },
        }),
      ],
      energyContinuations: [
        makeSyntheticRecord({ id: "energy-2026-07-05", date: "2026-07-05", balance: -650, estimatedIntake: 2450, estimatedExpenditure: 3100 }),
        makeSyntheticRecord({ id: "energy-2026-07-12", date: "2026-07-12", balance: -520, estimatedIntake: 2460, estimatedExpenditure: 2980 }),
        makeSyntheticRecord({ id: "energy-2026-07-19", date: "2026-07-19", balance: -310, estimatedIntake: 2425, estimatedExpenditure: 2735 }),
        makeSyntheticRecord({ id: "energy-2026-07-26", date: "2026-07-26", balance: -160, estimatedIntake: 2410, estimatedExpenditure: 2570 }),
      ],
      trainingObservations: [
        makeSyntheticRecord({ id: "train-07-02", date: "2026-07-02", movement: "bench", direction: "improving", issue: null }),
        makeSyntheticRecord({ id: "train-07-09", date: "2026-07-09", movement: "squat", direction: "improving", issue: null }),
        makeSyntheticRecord({ id: "train-07-16", date: "2026-07-16", movement: "row", direction: "plateauing", issue: "plateauing" }),
        makeSyntheticRecord({ id: "train-07-23", date: "2026-07-23", movement: "deadlift", direction: "improving", issue: null }),
      ],
    },
  },
  ordinaryMonth: {
    fixtureId: MONTHLY_CONTROL_FIXTURE_ID,
    fixtureVersion: MONTHLY_CONTROL_FIXTURE_VERSION,
    fixtureSeed: MONTHLY_CONTROL_FIXTURE_SEED,
    syntheticDateRange: null,
    weights: [
      { id: "ord-06-02", measuredAt: "2026-06-02", weight: { value: 170.6, unit: "lb" } },
      { id: "ord-06-09", measuredAt: "2026-06-09", weight: { value: 170.5, unit: "lb" } },
      { id: "ord-06-16", measuredAt: "2026-06-16", weight: { value: 170.2, unit: "lb" } },
      { id: "ord-06-30", measuredAt: "2026-06-30", weight: { value: 170.0, unit: "lb" } },
    ],
    dexaScans: [],
    progressPhotos: [
      { id: "ord-photo-06-07", capturedAt: "2026-06-07", view: "front", imagePath: "private/founder/photos/2026-06-07-front.JPEG", source: { type: "photo", name: "Founder Historical Progress Photos" } },
      { id: "ord-photo-06-18", capturedAt: "2026-06-18", view: "front", imagePath: "private/founder/photos/2026-06-18-front.JPEG", source: { type: "photo", name: "Founder Historical Progress Photos" } },
      { id: "ord-photo-06-28", capturedAt: "2026-06-28", view: "front", imagePath: "private/founder/photos/2026-06-28-front.JPEG", source: { type: "photo", name: "Founder Historical Progress Photos" } },
    ],
    energyContinuations: [
      { id: "ord-energy-06-05", date: "2026-06-05", balance: -340, estimatedIntake: 2380, estimatedExpenditure: 2720, source: "real" },
      { id: "ord-energy-06-12", date: "2026-06-12", balance: -270, estimatedIntake: 2360, estimatedExpenditure: 2630, source: "real" },
      { id: "ord-energy-06-20", date: "2026-06-20", balance: -180, estimatedIntake: 2420, estimatedExpenditure: 2600, source: "real" },
      { id: "ord-energy-06-26", date: "2026-06-26", balance: -120, estimatedIntake: 2435, estimatedExpenditure: 2495, source: "real" },
    ],
    trainingObservations: [
      { id: "ord-train-06-07", date: "2026-06-07", movement: "bench", direction: "improving", area: "upper" },
      { id: "ord-train-06-14", date: "2026-06-14", movement: "row", direction: "improving", area: "back" },
      { id: "ord-train-06-21", date: "2026-06-21", movement: "squat", direction: "stable", area: "lower" },
      { id: "ord-train-06-28", date: "2026-06-28", movement: "deadlift", direction: "improving", area: "lower" },
    ],
    dailyBriefings: [
      {
        id: "ord-daily-close",
        generatedAt: "2026-06-05T18:00:00Z",
        hero: { confidence: 72, decision: "maintain_structure", recommendation: "Sustain training frequency while adding 1 mobility block" },
        goalStatus: { primary: { progress: 62 } },
        progressEvidence: { photos: { summary: "Photos stayed routine across the month." } },
      },
      {
        id: "ord-daily-end",
        generatedAt: "2026-06-30T18:00:00Z",
        hero: { confidence: 82, decision: "maintain_structure", recommendation: "Keep volume stable and tighten protein timing" },
        goalStatus: { primary: { progress: 62 } },
        progressEvidence: { photos: { summary: "Photos stayed routine across the month." } },
      },
    ],
    goal: {
      id: "goal-build-lean-mass",
      title: "Build Lean Mass",
      timeline: {
        startDate: "2026-02-01",
        targetDate: "2026-10-31",
      },
      phases: [
        { id: "phase-consistency", name: "Establish Consistency", startDate: "2026-02-01", status: "active", duration: { value: 12, unit: "weeks" } },
      ],
    },
    syntheticContinuation: {
      fixtureId: MONTHLY_CONTROL_FIXTURE_ID,
      fixtureVersion: MONTHLY_CONTROL_FIXTURE_VERSION,
      fixtureSeed: MONTHLY_CONTROL_FIXTURE_SEED,
      syntheticDateRange: null,
      weights: [],
      dexaScans: [],
      progressPhotos: [],
      energyContinuations: [],
      trainingObservations: [],
    },
  },
};

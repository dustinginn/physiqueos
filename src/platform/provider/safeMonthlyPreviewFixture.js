const disabled = Object.freeze({
  fixtureId: "provider-preview-disabled",
  fixtureVersion: "provider-safe-v1",
  fixtureSeed: "provider-safe",
  previewWindow: Object.freeze({}),
  weights: Object.freeze([]),
  dexaScans: Object.freeze([]),
  progressPhotos: Object.freeze([]),
  dailyBriefings: Object.freeze([]),
  energyContinuations: Object.freeze([]),
  trainingObservations: Object.freeze([]),
  syntheticContinuation: Object.freeze({}),
  goal: null,
});

export const monthlyPreviewFixtures = Object.freeze({
  julyContinuation: disabled,
  ordinaryMonth: disabled,
});

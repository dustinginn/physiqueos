export function createPhase4CommandParityFixtureCollections(ownerUserId) {
  const ownerId = requiredIdentity(ownerUserId, "Phase 4 command-parity owner");
  const record = (id, extra = {}) => ({ id, userId: ownerId, version: 1, ...extra });
  return Object.freeze({
    goals: [record("synthetic-goal"), record("synthetic-transition-goal")],
    protocols: [record("synthetic-protocol")],
    executionItems: [record("synthetic-priority", { completionHistory: [] })],
    evidenceReviews: ["edit", "confirm", "dispose", "nutrition", "photo", "dexa"]
      .map((kind) => record(`synthetic-review-${kind}`, { status: "pending" })),
    trainingPerformanceEvents: [record("synthetic-training-correct"), record("synthetic-training-draft", { reconciliations: [] })],
    weightEntries: [],
    dailyCheckIns: [],
    evidencePackages: [],
    goalTransitionDrafts: [],
    progressPhotos: [],
    dexaScans: [],
  });
}

export function createPhase4CommandParityMemoryCollections({
  canonicalOwner,
  expectedOwnerUserId,
  fixtureCollections,
} = {}) {
  const ownerUserId = requiredIdentity(expectedOwnerUserId, "Phase 4 command-parity expected owner");
  if (!canonicalOwner || typeof canonicalOwner !== "object" || Array.isArray(canonicalOwner)) {
    throw new Error("Phase 4 command parity requires the synthetic package's canonical owner.");
  }
  if (String(canonicalOwner.id ?? "") !== ownerUserId ||
      (canonicalOwner.userId != null && String(canonicalOwner.userId) !== ownerUserId)) {
    throw new Error("Phase 4 command-parity owner identity does not match the synthetic package.");
  }
  if (!fixtureCollections || typeof fixtureCollections !== "object" || Array.isArray(fixtureCollections)) {
    throw new Error("Phase 4 command parity requires fixture collections.");
  }
  if (Object.hasOwn(fixtureCollections, "user")) {
    throw new Error("Phase 4 command-parity shared fixtures must not replace the package owner.");
  }
  return Object.freeze({
    ...structuredClone(fixtureCollections),
    user: Object.freeze([Object.freeze(structuredClone(canonicalOwner))]),
  });
}

function requiredIdentity(value, label) {
  const identity = String(value ?? "").trim();
  if (!identity) throw new Error(`${label} identity is required.`);
  return identity;
}

export const CanonicalWriteDisposition = Object.freeze({
  READ_ONLY: "read-only",
  CANONICAL_WRITE: "canonical-write",
});

const repositoryMethods = Object.freeze({
  users: classify(["getCurrentUser", "getUserById"], ["updateUser"]),
  goals: classify(["listGoals", "getActiveGoal", "getGoalById"], ["saveGoal", "updateGoal"]),
  goalTransitionDrafts: classify(["getById", "getLatestActiveForSourceGoal"], ["save"]),
  goalProtocolTransitionDrafts: classify(["getById", "getLatestActiveForGoalTransition"], ["save"]),
  weights: classify(["listWeightEntries", "getLatestWeightEntry"], ["addWeightEntry", "importWeightEntries"]),
  dexaScans: classify(["listDEXAScans", "listAllDEXAScans", "getLatestDEXAScan"], ["addDEXAScan", "upsertDEXAScan", "attachDEXAFile"]),
  protocols: classify(["listProtocols", "listActiveProtocols", "getProtocolById", "getActiveProtocolByType"], ["saveProtocol", "updateProtocol"]),
  protocolVersions: classify(["listVersions", "getVersionById", "getCurrentVersion"], ["appendVersion", "supersedeVersion"]),
  energyStrategyLinks: classify(["getActiveLink"], ["saveLink"]),
  executionItems: classify(["listExecutionItems", "getExecutionItemById"], ["saveExecutionItem"]),
  reminders: classify(["listReminders", "listActiveReminders", "getReminderById"], ["saveReminder", "completeReminder", "completeReminderFromEvidence"]),
  nutritionContext: classify(["getNutritionContext"], ["saveNutritionContext", "updateNutritionContext"]),
  operatingPlan: classify(["getOperatingPlan"], ["saveOperatingPlan", "updateOperatingPlan"]),
  operatingRhythm: classify(["getOperatingRhythm"], []),
  adaptiveTrust: classify(["getAdaptiveTrustProfile"], []),
  milestones: classify(["listMilestones"], ["saveMilestone", "updateMilestone"]),
  progressPhotos: classify(["listPhotos", "getPhotosByDate", "getLatestPhotos"], ["createPhoto", "upsertPhoto", "importPhotos"]),
  dailyCheckIns: classify(["getCheckInForDate", "listCheckIns"], ["saveCheckIn", "updateCheckIn"]),
  dailyBriefings: classify([
    "listDailyBriefings", "getLatestDailyBriefing", "getLatestScheduledDailyBriefing", "getLatestWeeklyBriefing",
    "getLatestMidweekBriefing", "getLatestMonthlyBriefing", "getLatestEventBriefing", "getLatestBriefingArtifact",
    "listCompletedBriefingsInWindow", "getLatestScheduledBriefing", "getBriefingByEvidenceWindow", "getLatestActiveEventBriefing",
  ], [
    "claimScheduledBriefing", "completeScheduledBriefing", "failScheduledBriefing", "markBriefingOpened",
    "markBriefingConsumed", "markBriefingSurfaced", "createDailyBriefing",
  ]),
  briefingReconciliationWorkItems: classify(["listWorkItems", "getWorkItemById"], ["saveWorkItem"]),
  analyses: classify(["listAnalyses", "getLatestAnalysis", "getLatestAnalysisByType", "getAnalysisById"], ["createAnalysis"]),
  evidencePackages: classify(["getEvidencePackageById", "listEvidencePackages", "getLatestEvidencePackage"], ["saveEvidencePackage"]),
  evidenceReviews: classify(["getReviewById", "listReviews"], [
    "createReview", "updateReview", "updateReviewIfCurrent", "claimPendingReviewReprocess",
    "completePendingReviewReprocess", "failPendingReviewReprocess",
  ]),
  trainingPerformanceEvents: classify(["listTrainingPerformanceEvents", "getTrainingPerformanceEventById", "listTrainingPerformanceEventsBySession"], []),
  goalConfidence: classify([
    "getCurrentSnapshot", "listHistory", "getHistoryRecord", "getHistoryByAssessmentId", "getContinuitySeed", "getContinuitySeedById",
  ], ["stageReplaceSnapshot", "stageAppendHistory", "stageCreateContinuitySeed"]),
  canonicalEvidence: classify([
    "listCanonicalEvidenceObjects", "getRecoveryEvidenceById", "listRecoveryEvidenceInWindow",
  ], [
    "reconcileFromEvidencePackages", "reconcileCanonicalHistory", "reconcileConfirmedEvidencePackage",
    "upsertCanonicalEvidenceObjects", "saveRecoveryEvidence",
  ]),
});

export const CANONICAL_WRITE_ENTRY_POINTS = Object.freeze([
  entry("founder-repositories", "src/data/repositories/founderRepositories.js", "all classified repository mutation methods", "repository proxy", true, "legacy-json", "blocked"),
  entry("founder-runtime-persist", "src/data/repositories/founderRuntimeStore.js", "persistFounderRuntimeStore", "atomic runtime-store commit", true, "legacy-json", "blocked"),
  entry("founder-unit-of-work", "src/data/repositories/FounderStoreUnitOfWork.js", "transaction.commit", "atomic runtime-store unit of work", true, "legacy-json", "blocked"),
  entry("universal-evidence-upload", "src/app/log/upload/route.js", "POST", "FounderRepositories.evidencePackages", true, "legacy-json", "fail-before-file-write"),
  entry("training-reconciliation", "src/app/log/training/reconcile/route.js", "POST/PUT", "FounderRepositories.evidencePackages", true, "legacy-json", "blocked"),
  entry("photo-upload", "src/app/evidence/photos/actions.js", "saveProgressPhotoEvidence", "FounderRepositories.progressPhotos", true, "legacy-json", "fail-before-file-write"),
  entry("dexa-upload", "src/app/evidence/dexa/actions.js", "saveDEXAEvidence", "FounderRepositories.dexaScans", true, "legacy-json", "fail-before-file-write"),
  entry("phase3-command-service", "src/application/commands/Phase3CommandService.js", "all Phase 3 commands", "transactional canonical ports", true, "explicit", "epoch-bound-receipt"),
  entry("founder-operational-scripts", "scripts/*.js|scripts/*.mjs", "explicit guarded repair/migration commands", "FounderStoreUnitOfWork or isolated targets", true, "explicit", "operator-guarded"),
  entry("training-drafts", "src/domain/services/TrainingLoggerDraftRecoveryService.js", "browser draft save/resume/cancel", "browser-local draft only", false, "none", "may-continue-no-replay"),
]);

export function classifyFounderRepositoryMethod(repositoryName, methodName) {
  const repository = repositoryMethods[repositoryName];
  const disposition = repository?.[methodName];
  if (!disposition) {
    const error = new Error(`Founder repository method is not classified: ${repositoryName}.${String(methodName)}.`);
    error.code = "UNCLASSIFIED_CANONICAL_WRITE_PATH";
    throw error;
  }
  return disposition;
}

export function listFounderRepositoryMethodInventory() {
  return Object.freeze(Object.entries(repositoryMethods).flatMap(([repository, methods]) =>
    Object.entries(methods).map(([method, disposition]) => Object.freeze({ repository, method, disposition }))));
}

function classify(readMethods, writeMethods) {
  return Object.freeze(Object.fromEntries([
    ...readMethods.map((method) => [method, CanonicalWriteDisposition.READ_ONLY]),
    ...writeMethods.map((method) => [method, CanonicalWriteDisposition.CANONICAL_WRITE]),
  ]));
}

function entry(id, source, handler, persistence, canonical, epochProtection, migrationBehavior) {
  return Object.freeze({
    id,
    source,
    handler,
    applicationCommand: id === "phase3-command-service" ? "Phase3CommandService" : null,
    repositoryOrService: persistence,
    fenceInterception: canonical ? "required-and-implemented" : "not-required",
    idempotency: id === "phase3-command-service" ? "command-receipt" : id.includes("upload") ? "source-identity-or-package-identity" : "operation-specific",
    epochProtection,
    canonical,
    blockedDuringMigration: canonical,
    migrationBehavior,
  });
}

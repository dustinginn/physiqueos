import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const runtimePath = path.join(process.cwd(), "private", "founder", "runtime-store.json");
const store = JSON.parse(fs.readFileSync(runtimePath, "utf8"));
const reconciledAt = new Date().toISOString();
const reconciliationId = `founder_reconciliation_2026_07_11_${reconciledAt.replace(/\D/g, "")}`;
const photos = store.progressPhotos.filter((photo) => photo.date === "2026-07-11");
const canonicalPhotos = photos.map((photo, index) => {
  const filePath = path.join(process.cwd(), photo.imagePath);
  const hash = crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
  const poseId = `${photo.view}-${photo.pose}`;
  const duplicate = poseId === "back-flexed" && index === photos.findLastIndex((item) => `${item.view}-${item.pose}` === poseId);
  return {
    canonicalId: `canonical_${photo.id}`,
    createdAt: reconciledAt,
    evidence_type: "progress_photo",
    firstObservedAt: photo.capturedAt,
    lastObservedAt: photo.capturedAt,
    payload: {
      canonicalPhotoId: `canonical_${photo.id}`,
      captureDate: photo.date,
      conditions: {
        morning: { value: false, source: "founder_reconciliation", confidence: "high", userConfirmed: true },
        fasted: { value: false, source: "founder_reconciliation", confidence: "high", userConfirmed: true },
        postWorkout: { value: true, source: "founder_reconciliation", confidence: "high", userConfirmed: true },
        pump: { value: "unknown", source: "not_confirmed", confidence: "unknown", userConfirmed: false },
        lighting: { value: "broadly_similar", source: "founder_reconciliation", confidence: "medium" },
        location: { value: "broadly_similar", source: "founder_reconciliation", confidence: "medium" },
      },
      ingestionTimestamp: photo.uploadedAt,
      occurrenceTimestamp: photo.capturedAt,
      orientation: photo.view,
      pose: photo.pose,
      rawPoseLabel: photo.pose,
      sourceHashes: [hash],
      sourceIds: [photo.id],
      status: duplicate ? "duplicate" : "active",
      duplicateOf: duplicate ? `canonical_${photos.find((item) => item.view === "back" && item.pose === "flexed").id}` : null,
      view: photo.view,
    },
    provenance: { reconciliationId, source_artifact_refs: [photo.id], source_hashes: [hash] },
    quality: { status: duplicate ? "duplicate" : "active" },
    updatedAt: reconciledAt,
    userId: photo.userId,
  };
});
const active = canonicalPhotos.filter((item) => item.quality.status === "active");
const analyses = store.analyses.filter((analysis) => active.some((photo) => analysis.evidenceIds?.includes(photo.payload.sourceIds[0])));
const synthesis = analyses.flatMap((analysis) => (analysis.metadata?.structuredObservations ?? []).map((observation) => ({
  ...observation,
  comparisonLimitations: ["Current photos were captured post-workout; fullness comparisons require qualification."],
  conditionSensitivity: /full|shoulder|arm|back/i.test(`${observation.region} ${observation.change}`) ? "high" : "low",
  confirmedAcrossViews: false,
  confidenceAdjustment: "post_workout_qualified",
  pumpSensitive: /full|shoulder|arm/i.test(`${observation.region} ${observation.change}`),
  poseSensitive: /lat|back|shoulder/i.test(`${observation.region} ${observation.change}`),
  sourceEvidenceIds: analysis.evidenceIds,
})));
const session = {
  canonicalId: "photo_session_user_founder_001_2026-07-11",
  createdAt: reconciledAt,
  evidence_type: "photo_session",
  firstObservedAt: "2026-07-11",
  lastObservedAt: "2026-07-11",
  payload: {
    evidence_type: "photo_session",
    sessionId: "photo_session_user_founder_001_2026-07-11",
    userId: "user_founder_001",
    captureDate: "2026-07-11",
    expectedPoseContract: { id: "founder-alpha-weekly-v1", requiredPoseIds: ["front-relaxed", "back-relaxed", "back-flexed"] },
    activePhotoIdsByPose: Object.fromEntries(active.map((item) => [`${item.payload.view}-${item.payload.pose}`, item.canonicalId])),
    missingPoses: [], completionState: "complete",
    duplicateRetrySourceReferences: canonicalPhotos.filter((item) => item.quality.status === "duplicate").flatMap((item) => item.payload.sourceIds),
    photos: canonicalPhotos.map((item) => item.payload),
    sessionConditions: active[0]?.payload.conditions,
    synthesis, synthesisStatus: "complete",
    synthesisOutputReference: `photo_synthesis_2026_07_11_${reconciliationId}`,
  },
  provenance: { reconciliationId, source_artifact_refs: photos.map((photo) => photo.id) },
  quality: { status: "active" }, updatedAt: reconciledAt, userId: "user_founder_001",
};
const ids = new Set([...canonicalPhotos, session].map((item) => item.canonicalId));
store.canonicalEvidenceObjects = [...store.canonicalEvidenceObjects.filter((item) => !ids.has(item.canonicalId)), ...canonicalPhotos, session];
store.reconciliationAudit = [...(store.reconciliationAudit ?? []), {
  id: reconciliationId, appliedAt: reconciledAt, type: "append_only_founder_evidence_reconciliation",
  preservedSourceIds: photos.map((photo) => photo.id), activeCanonicalPhotoIds: active.map((item) => item.canonicalId),
  duplicateCanonicalPhotoIds: canonicalPhotos.filter((item) => item.quality.status === "duplicate").map((item) => item.canonicalId),
  photoSessionId: session.canonicalId,
  trainingSessionId: "training|2026-07-04|traditional strength training|||||197",
  trainingExpectedSetCount: 8,
}];
store.updatedAt = reconciledAt;
fs.writeFileSync(runtimePath, `${JSON.stringify(store, null, 2)}\n`);
console.log(JSON.stringify(store.reconciliationAudit.at(-1), null, 2));

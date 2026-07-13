import { createHash } from "node:crypto";
import { createCanonicalPhotoSession, normalizePhotoCondition } from "../models/photoSession";
import {
  getProgressPhotoCategoryId,
  normalizeProgressPhotoCategory,
} from "../models/progressPhotoPoseVocabulary";

export function createPhotoSourceHash(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function createPhotoIntakeIdentity({ userId, captureDate, poseId, sourceHash }) {
  return ["photo", userId, captureDate, poseId, sourceHash].join("|");
}

export function reconcilePhotoIntoSession({ existingSession = null, photo, userId }) {
  const normalized = normalizeProgressPhotoCategory(photo);
  const poseId = getProgressPhotoCategoryId(normalized);
  const existingPhotos = existingSession?.photos ?? [];
  const binaryMatch = existingPhotos.find((item) =>
    item.sourceHashes?.some((hash) => normalized.sourceHashes?.includes(hash))
  );
  const activePoseMatch = existingPhotos.find(
    (item) => item.status === "active" && getProgressPhotoCategoryId(item) === poseId
  );
  const status = binaryMatch || activePoseMatch ? "duplicate" : "active";
  const canonicalPhoto = {
    ...normalized,
    canonicalPhotoId: normalized.canonicalPhotoId ?? normalized.id,
    duplicateOf: binaryMatch?.canonicalPhotoId ?? activePoseMatch?.canonicalPhotoId ?? null,
    status,
  };
  const photos = binaryMatch
    ? existingPhotos.map((item) =>
        item.canonicalPhotoId === binaryMatch.canonicalPhotoId
          ? {
              ...item,
              sourceHashes: unique([...(item.sourceHashes ?? []), ...(normalized.sourceHashes ?? [])]),
              sourceIds: unique([...(item.sourceIds ?? []), ...(normalized.sourceIds ?? [])]),
            }
          : item
      )
    : [...existingPhotos, canonicalPhoto];

  return createCanonicalPhotoSession({
    ...(existingSession ?? {}),
    captureDate: normalized.captureDate,
    observed_at: normalized.occurrenceTimestamp,
    photos,
    sessionConditions: normalized.conditions,
    sessionId: existingSession?.sessionId ?? `photo_session_${userId}_${normalized.captureDate}`,
    userId,
  });
}

export function createAuthoritativePhotoConditions(values = {}, provenance = {}) {
  return {
    fasted: normalizePhotoCondition(values.fasted, provenance.fasted),
    morning: normalizePhotoCondition(values.morning, provenance.morning),
    postWorkout: normalizePhotoCondition(values.postWorkout, provenance.postWorkout),
    pump: normalizePhotoCondition(values.pump, provenance.pump),
    lighting: normalizeQualifiedCondition(values.lighting),
    location: normalizeQualifiedCondition(values.location),
  };
}

export function synthesizePhotoSessionObservations(perViewAnalyses = []) {
  const observations = perViewAnalyses.flatMap((analysis) =>
    (analysis.structuredObservations ?? []).map((observation) => ({
      ...observation,
      comparisonLimitations: observation.comparisonLimitations ?? [],
      conditionSensitivity: observation.conditionSensitivity ?? "unknown",
      confirmedAcrossViews: false,
      confidenceAdjustment: observation.confidenceAdjustment ?? "none",
      pumpSensitive: observation.pumpSensitive ?? false,
      poseSensitive: observation.poseSensitive ?? false,
      sourceEvidenceIds: unique([
        ...(observation.sourceEvidenceIds ?? []),
        ...(analysis.evidenceIds ?? []),
      ]),
    }))
  );
  const regionCounts = observations.reduce((counts, item) => {
    const key = String(item.region ?? "").toLowerCase();
    if (key) counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});

  return observations.map((observation) => ({
    ...observation,
    confirmedAcrossViews: (regionCounts[String(observation.region ?? "").toLowerCase()] ?? 0) > 1,
    robustAcrossConditions:
      observation.robustAcrossConditions ??
      (!observation.pumpSensitive && observation.conditionSensitivity !== "high"),
  }));
}

function normalizeQualifiedCondition(value) {
  if (!value) return { confidence: "unknown", source: "not_provided", value: "unknown" };
  return typeof value === "object" ? value : { confidence: "medium", source: "user", value };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

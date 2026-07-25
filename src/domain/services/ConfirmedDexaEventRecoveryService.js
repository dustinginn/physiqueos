import { createSeedRepositories } from "../../data/repositories/createSeedRepositories";
import { interpretPdfEvidence } from "../interpreters/PdfInterpreter";
import { createAnalysis } from "../models/analysis";
import { assertValidDexaScan } from "./DEXAContract";
import { createDEXAEventNarrativeService } from "./DEXAEventNarrativeService";
import { createDEXAInterpretation } from "./DEXAInterpretationService";
import { toDexaReadModel, selectValidDexaScans } from "./DEXAReadModelAdapter";
import { GoalEvaluationService } from "./GoalEvaluationService";

const INCIDENT = {
  packageId: "dexa_package_2026-06-20",
  reviewId: "evidence_review_20260718144114248",
  sourcePath: "private/founder/evidence/uploads/evidence_submission_20260718144114116-1-7-18-26-DEXA.pdf",
  wrongObjectId: "evidence_submission_20260718144114116_pdf_1_2026_06_20",
};

export async function reprocessConfirmedDexaEventInPlace({
  pdfBuffer,
  store,
  now = () => new Date(),
} = {}) {
  if (!store || !pdfBuffer) throw new Error("Recovery requires an isolated runtime-store candidate and retained PDF bytes.");
  const candidate = structuredClone(store);
  const existingRecovery = candidate.evidenceReviews
    ?.find((review) => review.id === INCIDENT.reviewId)
    ?.recovery;
  if (existingRecovery?.operation === "reprocessConfirmedDexaEventInPlace" && existingRecovery?.status === "completed") {
    return recoverSupplementalFields({ candidate, existingRecovery, pdfBuffer, now });
  }

  const packageIndex = candidate.evidencePackages.findIndex((item) => item.package_id === INCIDENT.packageId);
  const reviewIndex = candidate.evidenceReviews.findIndex((item) => item.id === INCIDENT.reviewId);
  if (packageIndex < 0 || reviewIndex < 0) throw new Error("Target DEXA package or review was not found.");
  const originalPackage = candidate.evidencePackages[packageIndex];
  const review = candidate.evidenceReviews[reviewIndex];
  if (review.status !== "confirmed") throw new Error("Recovery is limited to the confirmed incident review.");
  const retainedArtifact = originalPackage.provenance?.source_artifacts?.find((item) =>
    String(item.storage_path ?? "").replaceAll("\\", "/") === INCIDENT.sourcePath
  );
  if (!retainedArtifact) throw new Error("The retained incident PDF provenance does not match the recovery target.");

  const recoveredAt = now().toISOString();
  const interpretation = await interpretPdfEvidence({
    capturedAt: originalPackage.captured_at,
    files: [{
      buffer: pdfBuffer,
      capturedAt: originalPackage.captured_at,
      fileName: retainedArtifact.file_name,
      id: "evidence_submission_20260718144114116_pdf_1",
      userId: review.userId,
    }],
    userId: review.userId,
  });
  const corrected = interpretation.scan;
  assertValidDexaScan(corrected, { production: true });
  if (corrected.measuredAt !== "2026-07-18") throw new Error(`Recovery extracted unexpected scan date ${corrected.measuredAt}.`);

  const correctedPackage = {
    ...interpretation.evidencePackage,
    package_id: originalPackage.package_id,
    userId: originalPackage.userId,
    captured_at: originalPackage.captured_at,
    observed_date: corrected.measuredAt,
    provenance: {
      ...originalPackage.provenance,
      evidence_date: corrected.measuredAt,
      source_artifacts: originalPackage.provenance.source_artifacts,
    },
    recovery: {
      operation: "reprocessConfirmedDexaEventInPlace",
      status: "completed",
      recoveredAt,
      originalObjectId: INCIDENT.wrongObjectId,
      correctedObjectId: corrected.id,
      sourcePath: INCIDENT.sourcePath,
    },
  };
  candidate.evidencePackages[packageIndex] = correctedPackage;

  const wrongCanonical = candidate.canonicalEvidenceObjects.find((item) =>
    item.payload?.id === INCIDENT.wrongObjectId || item.canonicalId?.includes(INCIDENT.wrongObjectId)
  );
  if (!wrongCanonical) throw new Error("The corrupted canonical DEXA was not found.");
  wrongCanonical.quality = { ...(wrongCanonical.quality ?? {}), status: "superseded" };
  wrongCanonical.recovery = { supersededAt: recoveredAt, supersededBy: corrected.id, reason: "Incorrect fixture-derived DEXA interpretation." };

  const canonicalId = `dexa_scan|${corrected.measuredAt}|${corrected.id}`;
  const canonical = {
    canonicalId,
    createdAt: recoveredAt,
    updatedAt: recoveredAt,
    evidence_type: "dexa_scan",
    firstObservedAt: corrected.measuredAt,
    lastObservedAt: corrected.measuredAt,
    payload: { ...corrected, evidence_type: "dexa_scan", observed_at: corrected.measuredAt, removed: false },
    provenance: {
      evidence_package_ids: [originalPackage.package_id],
      source_artifact_refs: corrected.provenance.source_artifact_refs,
      contributing_evidence_object_ids: [corrected.id],
    },
    quality: { status: "active" },
    userId: review.userId,
  };
  candidate.canonicalEvidenceObjects = candidate.canonicalEvidenceObjects.filter((item) => item.canonicalId !== canonicalId);
  candidate.canonicalEvidenceObjects.push(canonical);

  const malformed = candidate.dexaScans.find((scan) => scan.id === INCIDENT.wrongObjectId);
  if (!malformed) throw new Error("The corrupted compatibility DEXA was not found.");
  malformed.canonicalLifecycleStatus = "superseded";
  malformed.recovery = { supersededAt: recoveredAt, supersededBy: corrected.id, reason: "Null compatibility mapping." };
  candidate.dexaScans = candidate.dexaScans.filter((scan) => scan.id !== corrected.id);
  candidate.dexaScans.push(toDexaReadModel(corrected, { canonicalId, now: recoveredAt, userId: review.userId }));

  const repositories = createSeedRepositories(candidate, { onChange() {} });
  const prior = selectValidDexaScans(candidate.dexaScans)
    .filter((scan) => scan.measuredAt < corrected.measuredAt)
    .at(-1);
  if (!prior || prior.measuredAt !== "2026-06-20") throw new Error("The expected Jun 20 prior DEXA was not resolved.");
  const analysis = createDEXAInterpretation({
    canonicalScan: canonical,
    priorScan: { canonicalId: prior.canonicalId ?? prior.id, payload: prior },
    interpreterVersion: "dexa-v2",
  });
  await repositories.analyses.createAnalysis(analysis);

  const [goals, weights, photos, protocols, nutritionContext] = await Promise.all([
    repositories.goals.listGoals(review.userId),
    repositories.weights.listWeightEntries(review.userId),
    repositories.progressPhotos.listPhotos(review.userId),
    repositories.protocols.listProtocols(review.userId),
    repositories.nutritionContext.getNutritionContext(review.userId),
  ]);
  const evaluations = GoalEvaluationService.getGoalEvaluations({
    goals,
    dexaScans: await repositories.dexaScans.listDEXAScans(review.userId),
    weightEntries: weights,
    progressPhotos: photos,
    protocols,
    nutritionContext,
  });
  const goalAnalysis = createAnalysis({
    id: `goal_evaluation_${originalPackage.package_id}_recovered_2026_07_18`,
    createdAt: recoveredAt,
    title: "Goal Evaluation Refreshed",
    summary: "Goal Evaluation recomputed from validated Jul 18 DEXA evidence.",
    evidenceIds: [corrected.id],
    evidenceTypes: ["dexa_scan"],
    metadata: { evaluationVersion: "dexa-recovery-v1", evaluations, source: "GoalEvaluationService" },
  });
  await repositories.analyses.createAnalysis(goalAnalysis);

  const oldEvent = candidate.dailyBriefings.find((item) => item.id === `dexa_event_${INCIDENT.wrongObjectId}`);
  if (oldEvent) {
    oldEvent.lifecycle = { ...(oldEvent.lifecycle ?? {}), generationStatus: "superseded", supersededAt: recoveredAt, supersededByScanId: corrected.id };
  }
  const event = await createDEXAEventNarrativeService({ repositories, now }).generate({
    userId: review.userId,
    scanId: corrected.id,
  });
  validateRecoveredEvent(event);

  candidate.evidenceReviews[reviewIndex] = {
    ...review,
    interpretedEvidence: correctedPackage,
    evidenceTypes: ["dexa_scan"],
    recovery: {
      operation: "reprocessConfirmedDexaEventInPlace",
      status: "completed",
      recoveredAt,
      sourcePackageId: originalPackage.package_id,
      correctedCanonicalId: canonicalId,
      correctedAnalysisId: analysis.id,
      correctedGoalEvaluationId: goalAnalysis.id,
      correctedEventBriefingId: event.artifactId ?? event.id,
      superseded: {
        canonicalId: wrongCanonical.canonicalId,
        compatibilityId: malformed.id,
        eventBriefingId: oldEvent?.id ?? null,
      },
    },
    updatedAt: recoveredAt,
  };

  supersedeIncidentAnalyses(candidate.analyses, { analysisId: analysis.id, goalAnalysisId: goalAnalysis.id, recoveredAt });
  reconcileScheduledCompletion(candidate, { canonicalId, recoveredAt });
  assertRecoveryInvariants(candidate, { canonicalId, corrected, prior, event });
  candidate.updatedAt = recoveredAt;

  return { candidate, changed: true, recovery: candidate.evidenceReviews[reviewIndex].recovery };
}

async function recoverSupplementalFields({ candidate, existingRecovery, pdfBuffer, now }) {
  const reviewIndex = candidate.evidenceReviews.findIndex((item) => item.id === INCIDENT.reviewId);
  const packageIndex = candidate.evidencePackages.findIndex((item) => item.package_id === INCIDENT.packageId);
  const review = candidate.evidenceReviews[reviewIndex];
  const originalPackage = candidate.evidencePackages[packageIndex];
  if (reviewIndex < 0 || packageIndex < 0 || review?.status !== "confirmed") {
    throw new Error("Supplemental recovery requires the confirmed incident review and package.");
  }
  const retainedArtifact = originalPackage.provenance?.source_artifacts?.find((item) =>
    String(item.storage_path ?? "").replaceAll("\\", "/") === INCIDENT.sourcePath
  );
  if (!retainedArtifact) throw new Error("The retained incident PDF provenance does not match the supplemental recovery target.");
  const interpretation = await interpretPdfEvidence({
    capturedAt: originalPackage.captured_at,
    files: [{
      buffer: pdfBuffer,
      capturedAt: originalPackage.captured_at,
      fileName: retainedArtifact.file_name,
      id: "evidence_submission_20260718144114116_pdf_1",
      userId: review.userId,
    }],
    userId: review.userId,
  });
  const parsed = interpretation.scan;
  assertValidDexaScan(parsed, { production: true });
  const canonical = candidate.canonicalEvidenceObjects.find((item) => item.canonicalId === existingRecovery.correctedCanonicalId);
  const readModel = candidate.dexaScans.find((item) => item.id === parsed.id && item.canonicalLifecycleStatus !== "superseded");
  if (!canonical || !readModel) throw new Error("The active recovered Jul 18 canonical/read-model pair was not found.");
  assertCoreUnchanged(canonical.payload, parsed);
  assertCoreUnchanged(readModel, parsed);

  const supplemental = pickSupplemental(parsed);
  if (JSON.stringify(pickSupplemental(readModel)) === JSON.stringify(supplemental)) {
    return { candidate, changed: false, recovery: existingRecovery };
  }
  const briefingBefore = JSON.stringify(candidate.dailyBriefings);
  const analysesBefore = JSON.stringify(candidate.analyses);
  const goalsBefore = JSON.stringify(candidate.goals);
  Object.assign(canonical.payload, supplemental);
  Object.assign(readModel, supplemental);
  updatePackageSupplemental(originalPackage, parsed.id, supplemental);
  updatePackageSupplemental(review.interpretedEvidence, parsed.id, supplemental);
  const recoveredAt = now().toISOString();
  review.recovery = {
    ...existingRecovery,
    supplementalRecovery: {
      operation: "recoverConfirmedDexaSupplementalFieldsInPlace",
      status: "completed",
      recoveredAt,
      fields: Object.keys(supplemental),
    },
  };
  if (JSON.stringify(candidate.dailyBriefings) !== briefingBefore) throw new Error("Supplemental recovery changed a briefing.");
  if (JSON.stringify(candidate.analyses) !== analysesBefore) throw new Error("Supplemental recovery changed an analysis.");
  if (JSON.stringify(candidate.goals) !== goalsBefore) throw new Error("Supplemental recovery changed a goal.");
  return { candidate, changed: true, recovery: review.recovery };
}

function pickSupplemental(scan) {
  return {
    visceralAdiposeTissue: structuredClone(scan.visceralAdiposeTissue),
    androidFatPercentage: scan.androidFatPercentage,
    gynoidFatPercentage: scan.gynoidFatPercentage,
    androidGynoidRatio: scan.androidGynoidRatio,
    boneDensity: structuredClone(scan.boneDensity),
  };
}

function updatePackageSupplemental(evidencePackage, objectId, supplemental) {
  const object = evidencePackage?.evidence_objects?.find((item) => item.id === objectId);
  if (object) Object.assign(object, structuredClone(supplemental));
}

function assertCoreUnchanged(existing, parsed) {
  const core = (scan) => ({
    measuredAt: scan.measuredAt ?? scan.observed_at,
    totalMass: scan.totalMass,
    bodyFatPercentage: scan.bodyFatPercentage,
    fatMass: scan.fatMass,
    leanMass: scan.leanMass,
    boneMineralContent: scan.boneMineralContent,
    restingMetabolicRate: scan.restingMetabolicRate,
    sourceFileId: scan.sourceFileId,
  });
  if (JSON.stringify(core(existing)) !== JSON.stringify(core(parsed))) {
    throw new Error("Supplemental recovery would change a validated Jul 18 core field or source reference.");
  }
}

function validateRecoveredEvent(event) {
  const snapshot = event?.briefing?.dexaEventNarrative?.snapshot;
  for (const field of ["weight", "bodyFat", "fatMass", "leanMass"]) {
    if (!Number.isFinite(snapshot?.[field])) throw new Error(`Recovered Event Briefing ${field} is invalid.`);
  }
  if (snapshot.scanDate !== "2026-07-18") throw new Error("Recovered Event Briefing date is invalid.");
}

function supersedeIncidentAnalyses(analyses, { analysisId, goalAnalysisId, recoveredAt }) {
  for (const item of analyses) {
    if (item.id === analysisId || item.id === goalAnalysisId) continue;
    if (item.id?.includes(INCIDENT.wrongObjectId) || item.id === `goal_evaluation_${INCIDENT.packageId}`) {
      item.lifecycle = { ...(item.lifecycle ?? {}), status: "superseded", supersededAt: recoveredAt, supersededBy: item.id.startsWith("goal_evaluation_") ? goalAnalysisId : analysisId };
    }
  }
}

function reconcileScheduledCompletion(store, { canonicalId, recoveredAt }) {
  for (const item of store.executionItems ?? []) {
    item.completionHistory = (item.completionHistory ?? []).map((entry) =>
      entry.canonicalEvidenceId?.includes(INCIDENT.wrongObjectId)
        ? { ...entry, status: "superseded", supersededAt: recoveredAt, supersededBy: canonicalId }
        : entry
    );
    if (item.id === "execution_dexa") {
      const id = `reminder_dexa:2026-07-18:${canonicalId}`;
      if (!item.completionHistory.some((entry) => entry.id === id)) {
        item.completionHistory.push({ id, completedAt: "2026-07-18T12:00:00.000Z", canonicalEvidenceId: canonicalId, evidenceType: "dexa", source: "ConfirmedDexaEventRecoveryService" });
      }
      item.completedAt = "2026-07-18T12:00:00.000Z";
      item.completedByEvidenceId = canonicalId;
      item.updatedAt = recoveredAt;
    }
  }
}

function assertRecoveryInvariants(store, { canonicalId, corrected, prior, event }) {
  assertValidDexaScan(corrected, { production: true });
  const activeJul18 = store.canonicalEvidenceObjects.filter((item) =>
    item.evidence_type === "dexa_scan" && item.quality?.status === "active" && item.lastObservedAt === "2026-07-18"
  );
  if (activeJul18.length !== 1 || activeJul18[0].canonicalId !== canonicalId) throw new Error("Recovery did not produce exactly one active Jul 18 canonical DEXA.");
  if (prior.measuredAt !== "2026-06-20") throw new Error("Recovery prior-scan invariant failed.");
  validateRecoveredEvent(event);
}

export { INCIDENT as CONFIRMED_DEXA_INCIDENT };

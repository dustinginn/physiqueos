"use server";

import fs from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FounderRepositories } from "../../../../data/repositories/founderRepositories";
import { createEvidenceReviewService } from "../../../../domain/services/EvidenceReviewService";
import { reconcileEvidencePackageIntoCanonicalHistory } from "../../../../domain/services/CanonicalEvidenceService";
import { createWeightEntry } from "../../../../domain/models/weightEntry";
import { createDEXAScan } from "../../../../domain/models/dexaScan";
import { createProgressPhoto } from "../../../../domain/models/progressPhoto";
import { createAnalysis } from "../../../../domain/models/analysis";
import { createCanonicalPhotoSession } from "../../../../domain/models/photoSession";
import { createPostConfirmationOrchestrator } from "../../../../domain/services/PostConfirmationOrchestrator";
import { evaluateScheduledCompletion } from "../../../../domain/services/ScheduledCompletionService";
import { synthesizePhotoSessionObservations } from "../../../../domain/services/PhotoSessionService";
import { createTrainingPerformanceIntelligenceReport } from "../../../../domain/services/TrainingPerformanceIntelligenceService";
import { createDailyBriefingService } from "../../../../domain/services/DailyBriefingService";
import { interpretPhotoSetWithVision } from "../../../../domain/interpreters/PhotoInterpreterService";
import { normalizePhotoInterpretationToStructuredObservations } from "../../../../domain/interpreters/PhotoObservationModel";
import { createDEXAInterpretation } from "../../../../domain/services/DEXAInterpretationService";
import { GoalEvaluationService } from "../../../../domain/services/GoalEvaluationService";

export async function confirmEvidenceReview(formData) {
  const reviewId = String(formData.get("reviewId") ?? "");
  const review = await FounderRepositories.evidenceReviews.getReviewById(reviewId);
  const user = await FounderRepositories.users.getCurrentUser();
  if (!review || !user || review.userId !== user.id) throw new Error("Evidence review is unavailable.");
  let evidencePackage;
  try { evidencePackage = JSON.parse(String(formData.get("evidenceJson") ?? "")); }
  catch { throw new Error("The reviewed evidence contains invalid JSON."); }
  evidencePackage = applyPersistedItemDecisions(evidencePackage, review.itemDecisions);

  const service = createEvidenceReviewService({ repositories: FounderRepositories });
  await service.beginCommit(reviewId);
  try {
    const currentReview = await FounderRepositories.evidenceReviews.getReviewById(reviewId);
    const orchestrator = createPostConfirmationOrchestrator({ reviewService: service, handlers: createHandlers({ evidencePackage, user }) });
    await orchestrator.run({ reviewId, evidencePackage, userId: user.id, commitProgress: currentReview.commitProgress ?? {} });
    await service.confirm(reviewId, { evidencePackage, confirmedBy: user.id });
  } catch (error) {
    await service.failCommit(reviewId, error);
    throw error;
  }
  ["/", "/briefing/daily", "/progress", "/progress/photos", "/progress/dexa", "/progress/training", "/timeline"].forEach(revalidatePath);
  redirect(`/evidence/review/${reviewId}?confirmed=1`);
}

export async function updateEvidenceReviewItemDecision(formData) {
  const reviewId = String(formData.get("reviewId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const user = await FounderRepositories.users.getCurrentUser();
  const review = await FounderRepositories.evidenceReviews.getReviewById(reviewId);
  if (!user || !review || review.userId !== user.id) throw new Error("Evidence review is unavailable.");
  await createEvidenceReviewService({ repositories: FounderRepositories }).setItemDecision(reviewId, {
    itemId, included: String(formData.get("included")) === "true", decidedBy: user.id,
  });
  revalidatePath(`/evidence/review/${reviewId}`);
}

function applyPersistedItemDecisions(evidencePackage, decisions = {}) {
  return { ...evidencePackage, evidence_objects: (evidencePackage.evidence_objects ?? []).map((item) => ({
    ...item, removed: decisions[item.id]?.included === false,
  })) };
}

function createHandlers({ evidencePackage, user }) {
  let canonical = null;
  let analyses = [];
  const committedPackage = { ...evidencePackage, evidence_objects: (evidencePackage.evidence_objects ?? []).filter((item) => item.removed !== true) };
  return {
    canonical_commit: async () => {
      const existing = await FounderRepositories.canonicalEvidence.listCanonicalEvidenceObjects(user.id);
      canonical = expandCanonicalPhotoSessions(reconcileEvidencePackageIntoCanonicalHistory({ evidencePackage: committedPackage, existingCanonicalObjects: existing, userId: user.id }), committedPackage, user.id);
      await FounderRepositories.canonicalEvidence.upsertCanonicalEvidenceObjects(canonical);
      return { status: "completed", canonicalEvidenceIds: canonical.filter((item) => item.quality?.status !== "superseded").map((item) => item.canonicalId) };
    },
    compatibility_writes: async () => ({ status: "completed", records: await commitCompatibilityRepositories({ evidencePackage, user }) }),
    scheduled_completion: async () => {
      canonical ??= await FounderRepositories.canonicalEvidence.listCanonicalEvidenceObjects(user.id);
      const results = evaluateScheduledCompletion({ canonicalObjects: canonical, evidencePackage });
      const completionRecords = [];
      for (const result of results.filter((item) => item.satisfied)) {
        const reminderId = { weight: "reminder_morning_weight", photo_session: "reminder_weekly_progress_photo_set", dexa: "reminder_dexa" }[result.evidenceType];
        if (!reminderId) continue;
        const completion = { id: `${reminderId}:${result.observedDate}:${result.canonicalEvidenceId}`, completedAt: `${result.observedDate}T12:00:00.000Z`, canonicalEvidenceId: result.canonicalEvidenceId, evidenceType: result.evidenceType, source: "PostConfirmationOrchestrator" };
        const record = await FounderRepositories.reminders.completeReminderFromEvidence(reminderId, completion);
        if (record) completionRecords.push(record.id);
        else if (result.evidenceType === "dexa") {
          const item = await FounderRepositories.executionItems.getExecutionItemById("execution_dexa");
          if (item) {
            const history = item.completionHistory ?? [];
            const next = history.some((entry) => entry.id === completion.id) ? history : [...history, completion];
            await FounderRepositories.executionItems.saveExecutionItem({ ...item, completedAt: completion.completedAt, completedByEvidenceId: completion.canonicalEvidenceId, completionHistory: next, updatedAt: new Date().toISOString() });
            completionRecords.push(completion.id);
          }
        }
      }
      return { status: "completed", results, completionRecordIds: completionRecords };
    },
    analysis: async () => {
      canonical ??= await FounderRepositories.canonicalEvidence.listCanonicalEvidenceObjects(user.id);
      analyses = await runDomainAnalysis({ canonical, evidencePackage, user });
      return { status: "completed", analysisIds: analyses.map((item) => item.id), synthesisIds: analyses.filter((item) => item.metadata?.photoSessionSynthesis).map((item) => item.id) };
    },
    goal_evaluation: async () => refreshGoalEvaluations({ evidencePackage, user }),
    event_eligibility: async () => {
      const eventObjects = (evidencePackage.evidence_objects ?? []).filter((item) => !item.removed && ["photo_session", "dexa", "dexa_scan", "body_composition"].includes(item.evidence_type));
      return { status: "completed", eligible: eventObjects.filter((item) => item.evidence_type !== "photo_session" || isCompletePhotoSession(item)).map((item) => item.evidence_type) };
    },
    briefing: async ({ results }) => {
      const eligible = results.event_eligibility?.eligible ?? [];
      const artifacts = [];
      for (const type of eligible) {
        const object = (evidencePackage.evidence_objects ?? []).find((item) => item.evidence_type === type || (type === "dexa" && ["dexa_scan", "body_composition"].includes(item.evidence_type)));
        const canonicalId = getStableCanonicalId(object, user.id);
        const artifact = await createDailyBriefingService({ repositories: FounderRepositories }).generateEventBriefing({ userId: user.id, trigger: { evidenceId: canonicalId, evidenceType: type === "photo_session" ? "photo_session" : "dexa", analysisId: analyses[0]?.id ?? results.analysis?.analysisIds?.[0] } });
        artifacts.push(artifact.artifactId);
      }
      return { status: "completed", artifactIds: artifacts, freshness: eligible.length ? "event_generated" : "scheduled_preserved" };
    },
    home_refresh: async ({ results }) => {
      revalidatePath("/");
      revalidatePath("/briefing/daily");
      return { status: "completed", invalidatedPaths: ["/", "/briefing/daily"], refreshKey: `home_${evidencePackage.package_id}`, artifactIds: results.briefing?.artifactIds ?? [] };
    },
  };
}

async function commitCompatibilityRepositories({ evidencePackage, user }) {
  const records = [];
  for (const object of evidencePackage.evidence_objects ?? []) {
    if (object.removed === true) continue;
    if (["morning_weight", "weight"].includes(object.evidence_type)) {
      const date = String(object.observed_at).slice(0, 10);
      const entry = createWeightEntry({
        id: `weight_${date.replaceAll("-", "_")}`,
        userId: user.id, measuredAt: date,
        weight: { value: Number(object.value), unit: object.unit ?? "lb" },
        context: object.context ?? {}, notes: object.notes ?? null,
        reliability: "confirmed", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      await FounderRepositories.weights.addWeightEntry(entry);
      records.push(entry.id);
    }
    if (["dexa_scan", "dexa", "body_composition"].includes(object.evidence_type)) {
      const metadata = object.metadata ?? {};
      const date = String(object.observed_at).slice(0, 10);
      const existing = await FounderRepositories.dexaScans.listDEXAScans(user.id);
      if (!existing.some((item) => item.id === object.id || (item.measuredAt === date && item.sourceFileId === object.source_file))) {
        const scan = createDEXAScan({
          id: object.id, userId: user.id, measuredAt: date,
          totalMass: { value: metadata.totalMass ?? null, unit: "lb" },
          bodyFatPercentage: metadata.bodyFatPercentage ?? null,
          fatMass: { value: metadata.fatMass ?? null, unit: "lb" },
          leanMass: { value: metadata.leanMass ?? null, unit: "lb" },
          boneMineralContent: { value: metadata.boneMineralContent ?? null, unit: "lb" },
          restingMetabolicRate: { value: metadata.restingMetabolicRate ?? null, unit: "kcal/day" },
          sourceFileId: object.source_file, rawReportPath: object.source_file,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        });
        await FounderRepositories.dexaScans.addDEXAScan(scan);
        records.push(scan.id);
      }
    }
    if (object.evidence_type === "photo_session") {
      const date = String(object.observed_at).slice(0, 10);
      const existing = await FounderRepositories.progressPhotos.getPhotosByDate(user.id, date);
      for (const photo of (object.photos ?? []).filter((item) => item.active !== false)) {
        const id = `progress_photo_${user.id}_${date}_${photo.view}_${photo.pose}`;
        if (existing.some((item) => item.imagePath === photo.storage_path)) continue;
        const record = createProgressPhoto({ id, userId: user.id, date, capturedAt: date, uploadedAt: object.created_at ?? new Date().toISOString(), imagePath: photo.storage_path, view: photo.view, pose: photo.pose, conditions: object.conditions, source: { type: "manual", name: "Confirmed Photo Session", confidence: "high" }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        await FounderRepositories.progressPhotos.upsertPhoto(record);
        records.push(id);
      }
    }
  }
  return records;
}

function expandCanonicalPhotoSessions(canonicalObjects, evidencePackage, userId) {
  const byId = new Map(canonicalObjects.map((item) => [item.canonicalId, item]));
  for (const object of (evidencePackage.evidence_objects ?? []).filter((item) => item.evidence_type === "photo_session" && !item.removed)) {
    const date = String(object.observed_at).slice(0, 10);
    const photos = (object.photos ?? []).map((photo) => ({ ...photo, canonicalPhotoId: `canonical_photo_${userId}_${date}_${photo.view}_${photo.pose}`, captureDate: date, occurrenceTimestamp: date, sourceIds: [photo.id], sourceHashes: [photo.source_hash].filter(Boolean), status: photo.active === false ? "inactive" : "active" }));
    const session = createCanonicalPhotoSession({ ...object, provisional: false, captureDate: date, sessionId: `photo_session_${userId}_${date}`, userId, photos });
    const sessionObject = { canonicalId: session.sessionId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), evidence_type: "photo_session", firstObservedAt: date, lastObservedAt: date, payload: { ...session, evidence_type: "photo_session", observed_at: date }, provenance: object.provenance ?? {}, quality: { status: "active" }, userId };
    byId.set(sessionObject.canonicalId, sessionObject);
    photos.forEach((photo) => byId.set(photo.canonicalPhotoId, { canonicalId: photo.canonicalPhotoId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), evidence_type: "progress_photo", firstObservedAt: date, lastObservedAt: date, payload: { ...photo, evidence_type: "progress_photo", observed_at: date }, provenance: { source_artifact_refs: photo.sourceIds, source_hashes: photo.sourceHashes }, quality: { status: photo.status }, userId }));
  }
  return [...byId.values()];
}

async function runDomainAnalysis({ canonical, evidencePackage, user }) {
  const created = [];
  for (const object of (evidencePackage.evidence_objects ?? []).filter((item) => !item.removed)) {
    if (object.evidence_type === "photo_session") {
      const sessionId = `photo_session_${user.id}_${String(object.observed_at).slice(0, 10)}`;
      const perView = [];
      for (const photo of (object.photos ?? []).filter((item) => item.active !== false)) {
        const canonicalPhotoId = `canonical_photo_${user.id}_${String(object.observed_at).slice(0, 10)}_${photo.view}_${photo.pose}`;
        const prior = findPriorCanonicalPhoto(canonical, photo, object.observed_at);
        const currentInput = await photoInterpreterInput(photo, object);
        const priorInput = prior ? await canonicalPhotoInterpreterInput(prior) : null;
        const interpretationResult = await interpretPhotoSetWithVision({ captureDate: object.observed_at, goalContext: "Visible Abs at Rest", photoSetId: canonicalPhotoId, photos: [currentInput], previousPhotoSet: priorInput ? { photoSetId: prior.canonicalId, captureDate: prior.lastObservedAt, photos: [priorInput] } : null });
        if (interpretationResult.provider !== "openai") throw new Error(`Photo Interpreter provider did not complete canonical analysis for ${canonicalPhotoId}: ${interpretationResult.warning ?? "provider unavailable"}`);
        const interpretation = interpretationResult.interpretation;
        const structuredObservations = interpretation.structured_observations ?? normalizePhotoInterpretationToStructuredObservations(interpretation);
        const interpreterVersion = interpretation.interpreter_version ?? "photo-interpreter-production-v1";
        const analysis = createAnalysis({ id: stableAnalysisId([canonicalPhotoId, "v1", prior?.canonicalId ?? "baseline", interpreterVersion]), createdAt: new Date().toISOString(), title: `${photo.view} ${photo.pose} interpreted`, summary: interpretation.user_facing_summary, evidenceIds: [canonicalPhotoId], evidenceTypes: ["progress_photo"], findings: structuredObservations.map((item) => ({ title: item.region, detail: item.change })), metadata: { canonicalPhotoId, canonicalVersion: "v1", interpreterVersion, priorComparisonId: prior?.canonicalId ?? null, provider: interpretationResult.provider, warning: interpretationResult.warning, photoInterpretation: interpretation, structuredObservations } });
        await FounderRepositories.analyses.createAnalysis(analysis); created.push(analysis); perView.push({ evidenceIds: analysis.evidenceIds, structuredObservations, analysisId: analysis.id });
      }
      if (perView.length !== 3) throw new Error(`PhotoSession synthesis requires three successful per-view analyses; received ${perView.length}.`);
      const synthesis = synthesizePhotoSessionObservations(perView);
      const synthesisId = stableAnalysisId([sessionId, "v1", ...perView.map((item) => item.analysisId).sort(), "synthesis-v1"]);
      const analysis = createAnalysis({ id: synthesisId, createdAt: new Date().toISOString(), title: "Photo Session Synthesis", summary: "Canonical multi-view synthesis completed from three production Photo Interpreter analyses.", evidenceIds: [sessionId], evidenceTypes: ["photo_session"], metadata: { photoSessionSynthesis: synthesis, sourceAnalysisIds: perView.map((item) => item.analysisId), synthesisVersion: "synthesis-v1" } });
      await FounderRepositories.analyses.createAnalysis(analysis); created.push(analysis);
    } else if (["dexa", "dexa_scan", "body_composition"].includes(object.evidence_type)) {
      const canonicalScan = canonical.find((item) => ["dexa", "dexa_scan", "body_composition"].includes(item.evidence_type) && String(item.lastObservedAt).slice(0, 10) === String(object.observed_at).slice(0, 10));
      if (!canonicalScan) throw new Error("Confirmed canonical DEXA was not available for interpretation.");
      const priorScan = canonical.filter((item) => ["dexa", "dexa_scan", "body_composition"].includes(item.evidence_type) && item.quality?.status !== "superseded" && String(item.lastObservedAt) < String(canonicalScan.lastObservedAt)).sort((a, b) => String(b.lastObservedAt).localeCompare(String(a.lastObservedAt)))[0] ?? null;
      const analysis = createDEXAInterpretation({ canonicalScan, priorScan });
      await FounderRepositories.analyses.createAnalysis(analysis); created.push(analysis);
    }
  }
  if ((evidencePackage.evidence_objects ?? []).some((item) => item.evidence_type === "training" && !item.removed)) {
    const report = createTrainingPerformanceIntelligenceReport({ canonicalObjects: canonical });
    const analysis = createAnalysis({ id: `analysis_training_${evidencePackage.package_id}`, createdAt: new Date().toISOString(), title: "Training Performance Refreshed", summary: report.summary, evidenceIds: canonical.filter((item) => item.evidence_type === "training").map((item) => item.canonicalId), evidenceTypes: ["training"], metadata: { trainingPerformance: report } });
    await FounderRepositories.analyses.createAnalysis(analysis); created.push(analysis);
  }
  return created;
}

function isCompletePhotoSession(object) {
  const poses = new Set((object.photos ?? []).filter((photo) => photo.active !== false).map((photo) => `${photo.view}-${photo.pose}`));
  return ["front-relaxed", "back-relaxed", "back-flexed"].every((pose) => poses.has(pose));
}

function getStableCanonicalId(object, userId) {
  const date = String(object?.observed_at ?? "").slice(0, 10);
  return object?.evidence_type === "photo_session" ? `photo_session_${userId}_${date}` : object?.id ?? `dexa_${userId}_${date}`;
}

async function refreshGoalEvaluations({ evidencePackage, user }) {
  const [goals, dexaScans, weightEntries, progressPhotos, protocols, nutritionContext] = await Promise.all([
    FounderRepositories.goals.listGoals(user.id), FounderRepositories.dexaScans.listDEXAScans(user.id), FounderRepositories.weights.listWeightEntries(user.id), FounderRepositories.progressPhotos.listPhotos(user.id), FounderRepositories.protocols.listProtocols(user.id), FounderRepositories.nutritionContext.getNutritionContext?.(user.id),
  ]);
  const evaluations = GoalEvaluationService.getGoalEvaluations({ goals, dexaScans, weightEntries, progressPhotos, protocols, nutritionContext });
  const versionId = `goal_evaluation_${evidencePackage.package_id}`;
  const record = createAnalysis({ id: versionId, createdAt: new Date().toISOString(), title: "Goal Evaluation Refreshed", summary: "Goal Evaluation recomputed from confirmed canonical-compatible evidence.", evidenceIds: (evidencePackage.evidence_objects ?? []).filter((item) => !item.removed).map((item) => item.id), evidenceTypes: [...new Set((evidencePackage.evidence_objects ?? []).map((item) => item.evidence_type))], metadata: { evaluationVersion: versionId, evaluations, source: "GoalEvaluationService" } });
  await FounderRepositories.analyses.createAnalysis(record);
  return { status: "completed", evaluationVersionId: versionId, affectedGoalIds: evaluations.map((item) => item.goalId ?? item.id).filter(Boolean) };
}

function findPriorCanonicalPhoto(canonical, photo, observedAt) {
  return canonical.filter((item) => item.evidence_type === "progress_photo" && item.quality?.status === "active" && item.payload?.view === photo.view && item.payload?.pose === photo.pose && String(item.lastObservedAt) < String(observedAt)).sort((left, right) => String(right.lastObservedAt).localeCompare(String(left.lastObservedAt)))[0] ?? null;
}

async function photoInterpreterInput(photo, session) {
  return { fileName: path.basename(photo.storage_path ?? photo.imagePath ?? "photo.jpg"), dataUrl: await privateImagePathToDataUrl(photo.storage_path ?? photo.imagePath), mimeType: mimeType(photo.storage_path ?? photo.imagePath), view: photo.view, pose: photo.pose, capturedAt: session.observed_at, conditions: session.conditions ?? {} };
}

async function canonicalPhotoInterpreterInput(canonical) {
  const photo = canonical.payload ?? {};
  const sourcePath = photo.storage_path ?? photo.imagePath ?? photo.sourcePath;
  if (!sourcePath) return null;
  return { fileName: path.basename(sourcePath), dataUrl: await privateImagePathToDataUrl(sourcePath), mimeType: mimeType(sourcePath), view: photo.view, pose: photo.pose, capturedAt: canonical.lastObservedAt, conditions: photo.conditions ?? {} };
}

async function privateImagePathToDataUrl(filePath) {
  if (!filePath) throw new Error("Confirmed photo storage path is missing.");
  const root = path.resolve(process.cwd(), "private", "founder");
  const relative = String(filePath).replace(/^private[\\/]founder[\\/]/i, "");
  const absolute = path.resolve(root, relative);
  if (!absolute.startsWith(root)) throw new Error("Confirmed photo path is outside private evidence storage.");
  const buffer = await fs.readFile(absolute);
  return `data:${mimeType(filePath)};base64,${buffer.toString("base64")}`;
}

function mimeType(filePath) {
  const extension = path.extname(String(filePath)).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/jpeg";
}

function stableAnalysisId(parts) {
  return `analysis_${parts.join("|").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "")}`;
}

export async function discardEvidenceReview(formData) {
  const reviewId = String(formData.get("reviewId") ?? "");
  const user = await FounderRepositories.users.getCurrentUser();
  await createEvidenceReviewService({ repositories: FounderRepositories }).discard(reviewId, { confirmedBy: user?.id });
  redirect(`/evidence/review/${reviewId}?discarded=1`);
}

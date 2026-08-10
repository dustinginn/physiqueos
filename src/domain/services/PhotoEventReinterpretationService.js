import fs from "node:fs/promises";
import path from "node:path";
import { createAnalysis } from "../models/analysis";
import { interpretPhotoSetWithVision } from "../interpreters/PhotoInterpreterService";
import { normalizePhotoInterpretationToStructuredObservations } from "../interpreters/PhotoObservationModel";
import { createPhotoSessionReadModels } from "./CanonicalPhotoSessionReadService";
import { createPhotoInterpreterGoalContext, resolvePhotoEventContext } from "./PhotoEventContextService";
import { createPhotoEventNarrativeService } from "./PhotoEventNarrativeService";
import { synthesizePhotoSessionObservations } from "./PhotoSessionService";

export const PHOTO_REINTERPRETATION_VERSION = "photo_interpreter_v2_magnitude_first";

export function createPhotoEventReinterpretationService({
  repositories,
  interpret = interpretPhotoSetWithVision,
  now = () => new Date(),
  readImage = privateImagePathToDataUrl,
  photoEventService = createPhotoEventNarrativeService({ repositories, now }),
} = {}) {
  return {
    async inspect({ userId, sessionId }) {
      const state = await readState(repositories, userId);
      const sessions = createPhotoSessionReadModels(state);
      const session = sessions.find((item) => item.id === sessionId || item.hiddenProvenanceAliases?.includes(sessionId));
      if (!session || session.sourceMode !== "canonical") return blocked("canonical_photo_session_unavailable");
      if (!session.views.length) return blocked("photo_session_has_no_views");
      const missing = session.views.filter((view) => !view.imageReference || !view.comparison?.previousImageReference);
      if (missing.length) return blocked("matched_view_image_unavailable", { missingPoseIds: missing.map((view) => view.poseId) });
      const artifact = state.artifacts.find((item) => item.id === `event_briefing_progress_photo_${session.id}`) ?? null;
      return {
        status: "ready",
        sessionId: session.id,
        eventDate: session.captureDate,
        poseIds: session.views.map((view) => view.poseId),
        viewCount: session.views.length,
        existingArtifactId: artifact?.id ?? null,
        existingArtifactGeneratedAt: artifact?.generatedAt ?? null,
        analysisTargetIds: session.views.map((view) => view.canonicalPhotoId),
      };
    },

    async regenerate({ userId, sessionId, reason, replacementAuthorized = false }) {
      if (!reason) throw new Error("Photo Event reinterpretation requires an explicit reason.");
      if (replacementAuthorized !== true) throw new Error("Photo Event reinterpretation requires explicit replacement authorization.");
      const inspection = await this.inspect({ userId, sessionId });
      if (inspection.status !== "ready") return inspection;
      const state = await readState(repositories, userId);
      const session = createPhotoSessionReadModels(state).find((item) => item.id === inspection.sessionId);
      const goalContext = await resolvePhotoEventContext({ repositories, userId, evidenceDate: session.captureDate });
      const interpreterGoalContext = createPhotoInterpreterGoalContext(goalContext, session.confirmationIntent);
      const prepared = [];

      // Complete every provider call before the first persistence write. A single
      // failed pose therefore leaves the accepted event and analyses untouched.
      for (const view of session.views) {
        const current = await interpreterInput(view, session.captureDate, readImage);
        const previous = await interpreterInput({
          ...view,
          imageReference: view.comparison.previousImageReference,
          pose: view.comparison.previousPose ?? view.pose,
        }, view.comparison.previousDate ?? view.comparison.captureDate, readImage);
        const result = await interpret({
          captureDate: session.captureDate,
          goalContext: interpreterGoalContext,
          photoSetId: view.canonicalPhotoId,
          photos: [current],
          previousPhotoSet: {
            photoSetId: view.comparison.previousSessionId ?? view.comparison.canonicalViewId,
            captureDate: view.comparison.previousDate ?? view.comparison.captureDate,
            photos: [previous],
          },
        });
        if (result.provider !== "openai") throw new Error(`Photo Interpreter did not complete ${view.poseId}: ${result.warning ?? "provider unavailable"}`);
        const interpretation = result.interpretation;
        const structuredObservations = interpretation.structured_observations ?? normalizePhotoInterpretationToStructuredObservations(interpretation);
        prepared.push({ view, interpretation, structuredObservations });
      }

      const currentArtifact = (await repositories.dailyBriefings.listDailyBriefings(userId))
        .find((item) => item.id === inspection.existingArtifactId);
      if ((currentArtifact?.generatedAt ?? null) !== inspection.existingArtifactGeneratedAt) {
        return blocked("photo_event_changed_during_reinterpretation");
      }

      const createdAt = now().toISOString();
      const perView = [];
      for (const item of prepared) {
        const priorId = item.view.comparison.previousCanonicalViewId ?? item.view.comparison.canonicalViewId ?? "baseline";
        const analysis = createAnalysis({
          id: stableId([item.view.canonicalPhotoId, priorId, PHOTO_REINTERPRETATION_VERSION]),
          createdAt,
          title: `${item.view.label} interpreted`,
          summary: item.interpretation.user_facing_summary,
          evidenceIds: [item.view.canonicalPhotoId],
          evidenceTypes: ["progress_photo"],
          findings: item.structuredObservations.map((observation) => ({ title: observation.region, detail: observation.change })),
          metadata: {
            canonicalPhotoId: item.view.canonicalPhotoId,
            canonicalVersion: "v2",
            interpreterVersion: PHOTO_REINTERPRETATION_VERSION,
            priorComparisonId: priorId,
            provider: "openai",
            photoInterpretation: item.interpretation,
            structuredObservations: item.structuredObservations,
          },
          source: { type: "openai", name: "PhysiqueOS Photo Interpreter V2", confidence: "moderate" },
        });
        await repositories.analyses.createAnalysis(analysis);
        perView.push({ analysisId: analysis.id, evidenceIds: analysis.evidenceIds, structuredObservations: item.structuredObservations });
      }
      const synthesis = synthesizePhotoSessionObservations(perView);
      const synthesisAnalysis = createAnalysis({
        id: stableId([session.id, PHOTO_REINTERPRETATION_VERSION, ...perView.map((item) => item.analysisId).sort()]),
        createdAt,
        title: "Photo Session Synthesis",
        summary: `Canonical multi-view synthesis completed from ${perView.length} magnitude-first Photo Interpreter analyses.`,
        evidenceIds: [session.id],
        evidenceTypes: ["photo_session"],
        metadata: {
          photoSessionSynthesis: synthesis,
          sourceAnalysisIds: perView.map((item) => item.analysisId),
          synthesisVersion: "synthesis-v3-magnitude-first",
        },
        source: { type: "computed", name: "PhysiqueOS Photo Session Synthesis", confidence: "moderate" },
      });
      await repositories.analyses.createAnalysis(synthesisAnalysis);

      const event = await photoEventService.regenerate({
        userId,
        sessionId: session.id,
        reason,
        replacementAuthorized: true,
      });
      if (event.status !== "completed") return event;
      return {
        status: "completed",
        sessionId: session.id,
        eventDate: session.captureDate,
        artifactId: event.artifactId,
        artifact: event.artifact,
        analysisIds: perView.map((item) => item.analysisId),
        synthesisAnalysisId: synthesisAnalysis.id,
        poseReads: prepared.map((item) => ({
          poseId: item.view.poseId,
          observations: item.structuredObservations.map((observation) => ({
            change: observation.change,
            magnitude: observation.magnitude,
            direction: observation.direction,
            confidence: observation.confidence,
          })),
        })),
      };
    },
  };
}

async function readState(repositories, userId) {
  const [canonicalObjects, legacyPhotos, weights, analyses, artifacts] = await Promise.all([
    repositories.canonicalEvidence.listCanonicalEvidenceObjects(userId),
    repositories.progressPhotos.listPhotos(userId),
    repositories.weights.listWeightEntries(userId),
    repositories.analyses.listAnalyses(userId),
    repositories.dailyBriefings.listDailyBriefings(userId),
  ]);
  return { canonicalObjects, legacyPhotos, weights, analyses, artifacts };
}

async function interpreterInput(view, captureDate, readImage) {
  return {
    fileName: path.basename(view.imageReference),
    dataUrl: await readImage(view.imageReference),
    mimeType: mimeType(view.imageReference),
    view: view.pose?.view,
    pose: view.pose?.pose,
    capturedAt: captureDate,
    conditions: view.conditions ?? {},
  };
}

async function privateImagePathToDataUrl(filePath) {
  const root = path.resolve(process.cwd(), "private", "founder");
  const relative = String(filePath).replace(/^private[\\/]founder[\\/]/i, "");
  const absolute = path.resolve(root, relative);
  if (!absolute.startsWith(root)) throw new Error("Photo path is outside private evidence storage.");
  const buffer = await fs.readFile(absolute);
  return `data:${mimeType(filePath)};base64,${buffer.toString("base64")}`;
}

function mimeType(filePath) {
  const extension = path.extname(String(filePath)).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/jpeg";
}

function stableId(values) {
  const text = values.join("|");
  let hash = 2166136261;
  for (const character of text) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return `analysis_photo_v2_${(hash >>> 0).toString(16)}`;
}

function blocked(code, details = {}) {
  return { status: "blocked", code, ...details };
}

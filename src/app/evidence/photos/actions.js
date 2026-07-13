"use server";

import fs from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAnalysis, AnalysisTone } from "../../../domain/models/analysis";
import { createProgressPhoto } from "../../../domain/models/progressPhoto";
import {
  normalizeProgressPhotoPose,
  normalizeProgressPhotoView as normalizeProgressPhotoViewModel,
} from "../../../domain/models/progressPhotoPoseVocabulary";
import { interpretPhotoSetWithVision } from "../../../domain/interpreters/PhotoInterpreterService";
import { normalizePhotoInterpretationToStructuredObservations } from "../../../domain/interpreters/PhotoObservationModel";
import { createDailyBriefingService } from "../../../domain/services/DailyBriefingService";
import {
  createAuthoritativePhotoConditions,
  createPhotoIntakeIdentity,
  createPhotoSourceHash,
  reconcilePhotoIntoSession,
  synthesizePhotoSessionObservations,
} from "../../../domain/services/PhotoSessionService";
import { FounderRepositories } from "../../../data/repositories/founderRepositories";
import { createEvidenceReviewService } from "../../../domain/services/EvidenceReviewService";
import { createProvisionalPhotoSession } from "../../../domain/services/ProvisionalPhotoSessionService";

const VISIBLE_ABS_GOAL_ID = "goal_visible_abs_at_rest";

export async function saveProgressPhotoEvidence(formData) {
  const user = await FounderRepositories.users.getCurrentUser();

  if (!user) throw new Error("Founder user is not available.");

  const files = formData.getAll("photos").filter((file) => file && typeof file.arrayBuffer === "function" && file.size > 0);
  if (files.length === 0) {
    const legacyFile = formData.get("photo");
    if (legacyFile && typeof legacyFile.arrayBuffer === "function" && legacyFile.size > 0) files.push(legacyFile);
  }
  const capturedAt = String(formData.get("capturedAt") || getTodayKey());
  const notes = normalizeOptionalText(formData.get("notes"));
  const returnTo = normalizeReturnTo(formData.get("returnTo"));

  if (files.length === 0) throw new Error("Select at least one progress photo.");
  const conditions = createAuthoritativePhotoConditions({
    fasted: parseTriState(formData.get("fasted")),
    lighting: normalizeOptionalText(formData.get("lighting")),
    location: normalizeOptionalText(formData.get("location")),
    morning: parseTriState(formData.get("morning")),
    postWorkout: parseTriState(formData.get("postWorkout")),
    pump: parseTriState(formData.get("pump")),
  });

  const uploadedAt = new Date().toISOString();
  const requestedPoses = formData.getAll("pose");
  const defaults = ["front-relaxed", "back-relaxed", "back-flexed"];
  const provisionalPhotos = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    await assertValidProgressPhotoFile(file);
    const category = normalizeCategoryValue(requestedPoses[index] ?? defaults[index] ?? "front-relaxed");
    const sourceHash = createPhotoSourceHash(Buffer.from(await file.arrayBuffer()));
    const storedPath = await storePrivateUpload({ directory: path.join("private", "founder", "photos", "uploads"), file, prefix: `${capturedAt}-${category.view}-${category.pose}` });
    provisionalPhotos.push({ id: `provisional_photo_${uploadedAt.replace(/\D/g, "")}_${index}`, storage_path: storedPath, source_hash: sourceHash, view: category.view, pose: category.pose, active: true, order: index });
  }
  const packageId = `photo_review_${uploadedAt.replace(/\D/g, "")}`;
  const provisionalSession = createProvisionalPhotoSession({ captureDate: capturedAt, photos: provisionalPhotos, conditions });
  const review = await createEvidenceReviewService({ repositories: FounderRepositories }).stage({
    userId: user.id,
    source: "dedicated_progress_photo",
    evidencePackage: {
      package_id: packageId,
      review_metadata: {
        requiredPoses: ["front-relaxed", "back-relaxed", "back-flexed"],
        provisionalPhotoSessionId: provisionalSession.id,
      },
      evidence_objects: [{ ...provisionalSession, provenance: { source_artifact_refs: provisionalPhotos.map((photo) => photo.storage_path) } }],
    },
  });
  redirect(`/evidence/review/${review.id}`);

  /* Legacy confirmed-commit path retained temporarily below for extraction into the shared committer. */
  const [sameDayWeights, dexaScans] = await Promise.all([
    FounderRepositories.weights.listWeightEntries(user.id, {
      start: capturedAt,
      end: capturedAt,
    }),
    FounderRepositories.dexaScans.listDEXAScans(user.id),
  ]);
  const existingPhotos = await FounderRepositories.progressPhotos.listPhotos(user.id);
  const poseId = `${view}-${pose}`;
  const intakeIdentity = createPhotoIntakeIdentity({
    captureDate: capturedAt,
    poseId,
    sourceHash,
    userId: user.id,
  });
  const photo = createProgressPhoto({
    id: `progress_photo_${capturedAt.replaceAll("-", "_")}_${view}_${pose}_${Date.now()}`,
    userId: user.id,
    date: capturedAt,
    capturedAt,
    uploadedAt,
    imagePath: storedPath,
    relatedGoalIds: [VISIBLE_ABS_GOAL_ID],
    view,
    pose,
    conditions: { ...conditions, notes },
    linkedWeightEntryId: sameDayWeights[0]?.id ?? null,
    nearestDexaScanId: getNearestDexaScanId(dexaScans, capturedAt),
    source: {
      type: "manual",
      name: "Founder Progress Photo Upload",
      externalId: null,
      importedAt: uploadedAt,
      confidence: "high",
      notes: "Founder-uploaded progress photo with explicit tri-state condition metadata.",
    },
    fieldProvenance: {
      imported: [
        "date",
        "capturedAt",
        "uploadedAt",
        "imagePath",
        "view",
        "pose",
        "conditions",
        "relatedGoalIds",
      ],
      computed: ["linkedWeightEntryId", "nearestDexaScanId"],
    },
    createdAt: uploadedAt,
    updatedAt: uploadedAt,
  });

  await FounderRepositories.progressPhotos.createPhoto(photo);
  const interpretationResult = await interpretPhotoSetWithVision({
    captureDate: capturedAt,
    goalContext: "Visible Abs at Rest",
    photoSetId: photo.id,
    photos: [
      {
        fileName: file.name,
        dataUrl: await fileToDataUrl(file),
        mimeType: file.type || "image/jpeg",
        view,
        pose,
        capturedAt,
        conditions: photo.conditions,
      },
    ],
    previousPhotoSet: await getPreviousPhotoSet({
      captureDate: capturedAt,
      existingPhotos,
      pose,
      userId: user.id,
      view,
    }),
  });
  const analysis = createPhotoInterpretationAnalysis({
    createdAt: uploadedAt,
    interpretationResult,
    photo,
  });

  await FounderRepositories.analyses.createAnalysis(analysis);
  const canonicalObjects = await FounderRepositories.canonicalEvidence.listCanonicalEvidenceObjects(user.id);
  const existingSessionObject = canonicalObjects.find(
    (object) => object.evidence_type === "photo_session" && object.payload?.captureDate === capturedAt && object.quality?.status !== "superseded"
  );
  const canonicalPhoto = {
    canonicalPhotoId: `canonical_${photo.id}`,
    captureDate: capturedAt,
    conditions,
    ingestionTimestamp: uploadedAt,
    intakeIdentity,
    occurrenceTimestamp: capturedAt,
    orientation: view,
    pose,
    priorComparisonReference: interpretationResult.comparison?.previous_photo_set_id ?? null,
    rawPoseLabel: String(formData.get("category") ?? poseId),
    sourceHashes: [sourceHash],
    sourceIds: [photo.id],
    view,
  };
  const session = reconcilePhotoIntoSession({
    existingSession: existingSessionObject?.payload,
    photo: canonicalPhoto,
    userId: user.id,
  });
  const sessionAnalyses = await FounderRepositories.analyses.listAnalyses(user.id);
  session.synthesis = synthesizePhotoSessionObservations(
    sessionAnalyses
      .filter((item) => session.photos.some((itemPhoto) => item.evidenceIds?.includes(itemPhoto.sourceIds?.[0])))
      .map((item) => ({
        evidenceIds: item.evidenceIds,
        structuredObservations: item.metadata?.structuredObservations,
      }))
  );
  session.synthesisStatus = session.completionState === "complete" ? "complete" : "partial";
  await FounderRepositories.canonicalEvidence.upsertCanonicalEvidenceObjects([
    {
      canonicalId: canonicalPhoto.canonicalPhotoId,
      createdAt: uploadedAt,
      evidence_type: "progress_photo",
      firstObservedAt: capturedAt,
      lastObservedAt: capturedAt,
      payload: canonicalPhoto,
      provenance: { source_artifact_refs: [photo.id], source_hashes: [sourceHash] },
      quality: { status: session.photos.find((item) => item.canonicalPhotoId === canonicalPhoto.canonicalPhotoId)?.status ?? "duplicate" },
      updatedAt: uploadedAt,
      userId: user.id,
    },
    {
      canonicalId: session.sessionId,
      createdAt: existingSessionObject?.createdAt ?? uploadedAt,
      evidence_type: "photo_session",
      firstObservedAt: existingSessionObject?.firstObservedAt ?? capturedAt,
      lastObservedAt: capturedAt,
      payload: { ...session, evidence_type: "photo_session" },
      provenance: { source_artifact_refs: session.photos.flatMap((item) => item.sourceIds ?? []) },
      quality: { status: "active" },
      updatedAt: uploadedAt,
      userId: user.id,
    },
  ]);
  if (session.completionState === "complete") {
    await createDailyBriefingService({ repositories: FounderRepositories }).generateEventBriefing({
      userId: user.id,
      trigger: { evidenceId: session.sessionId, evidenceType: "photo_session", analysisId: analysis.id },
    });
  }

  revalidatePath("/");
  revalidatePath("/briefing/daily");
  revalidatePath("/progress");
  revalidatePath("/progress/photos");
  revalidatePath("/timeline");
  if (returnTo) redirect(returnTo);
  redirect("/briefing/daily");
}

function normalizeCategoryValue(value) {
  const normalized = String(value).replace("rear-", "back-");
  if (normalized === "back-flexed" || normalized === "rear-double-biceps") return { view: "back", pose: "flexed" };
  const [view = "front", pose = "relaxed"] = normalized.split("-");
  return { view: normalizeProgressPhotoView(view), pose: normalizeProgressPhotoPoseValue(pose, view) };
}

function parseTriState(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["true", "yes", "1"].includes(normalized)) return true;
  if (["false", "no", "0"].includes(normalized)) return false;
  return "unknown";
}

function createPhotoInterpretationAnalysis({ createdAt, interpretationResult, photo }) {
  const interpretation = interpretationResult.interpretation;
  const structuredObservations =
    interpretation.structured_observations ??
    normalizePhotoInterpretationToStructuredObservations(interpretation);

  return createAnalysis({
    id: `analysis_progress_photo_${createdAt.replace(/\D/g, "")}`,
    createdAt,
    title: "Progress Photo Interpreted",
    summary: interpretation.user_facing_summary,
    evidenceIds: [photo.id],
    evidenceTypes: ["progress_photo"],
    findings: [
      ...structuredObservations.slice(0, 4).map((observation) => ({
        title: observation.region,
        detail: observation.change,
      })),
      ...interpretation.body_composition_observations.slice(0, 2).map((detail) => ({
        title: "Body-composition read",
        detail,
      })),
    ],
    impacts: [
      {
        area: "goal",
        detail: interpretation.goal_relevance.join(" "),
      },
      {
        area: "confidence",
        detail: interpretation.confidence_notes.join(" "),
      },
      ...(interpretationResult.warning
        ? [
            {
              area: "interpreter",
              detail: interpretationResult.warning,
            },
          ]
        : []),
    ],
    recommendation: {
      title: interpretation.suggested_priorities[0] ?? "Keep photo evidence comparable",
      rationale: interpretation.coach_briefing_insert,
      action: "/progress/photos",
    },
    confidenceBefore: 0.68,
    confidenceAfter: interpretationResult.provider === "openai" ? 0.74 : 0.7,
    homeChanges: [
      {
        section: "daily_briefing",
        change: "progress_photo_interpreted",
      },
    ],
    tone: AnalysisTone.POSITIVE,
    source: {
      type: interpretationResult.provider,
      name:
        interpretationResult.provider === "openai"
          ? "OpenAI PhotoInterpreter"
          : "Founder Alpha PhotoInterpreter Fallback",
      confidence: interpretationResult.provider === "openai" ? "medium" : "low",
      notes: interpretationResult.warning,
    },
    metadata: {
      photoInterpretation: interpretation,
      structuredObservations,
    },
  });
}

async function getPreviousPhotoSet({ captureDate, existingPhotos, pose, userId, view }) {
  const previous = [...existingPhotos]
    .filter((photo) => {
      const photoDate = String(photo.capturedAt ?? photo.date ?? "");

      return (
        photo.userId === userId &&
        photo.view === view &&
        photo.pose === pose &&
        photoDate &&
        (!captureDate || photoDate < captureDate)
      );
    })
    .sort((a, b) => String(b.capturedAt ?? b.date).localeCompare(String(a.capturedAt ?? a.date)))[0];

  if (!previous) return null;

  return {
    photoSetId: previous.id,
    captureDate: previous.capturedAt ?? previous.date,
    photos: [
      {
        fileName: path.basename(previous.imagePath ?? ""),
        dataUrl: await privateImagePathToDataUrl(previous.imagePath),
        mimeType: getMimeType(previous.imagePath),
        view: previous.view,
        pose: previous.pose,
        capturedAt: previous.capturedAt ?? previous.date,
        conditions: previous.conditions ?? {},
      },
    ],
  };
}

async function privateImagePathToDataUrl(imagePath) {
  if (!imagePath) return null;

  try {
    const normalizedPath = path.normalize(imagePath);
    const photosRoot = path.join(process.cwd(), "private", "founder", "photos");
    const relativePhotoPath = normalizedPath
      .replace(/^private[\\/]+founder[\\/]+photos[\\/]+/i, "");
    const absolutePath = path.join(photosRoot, relativePhotoPath);

    if (!absolutePath.startsWith(photosRoot)) return null;

    const buffer = await fs.readFile(absolutePath);

    return `data:${getMimeType(imagePath)};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

async function fileToDataUrl(file) {
  const buffer = Buffer.from(await file.arrayBuffer());

  return `data:${file.type || "image/jpeg"};base64,${buffer.toString("base64")}`;
}

async function assertValidProgressPhotoFile(file) {
  const buffer = Buffer.from(await file.arrayBuffer());

  if (buffer.length < 128 || !hasSupportedImageSignature(buffer)) {
    throw new Error("Please upload a valid progress photo image.");
  }
}

function hasSupportedImageSignature(buffer) {
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;
  const isWebp =
    buffer.slice(0, 4).toString("ascii") === "RIFF" &&
    buffer.slice(8, 12).toString("ascii") === "WEBP";

  return isJpeg || isPng || isWebp;
}

function getMimeType(filePath = "") {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";

  return "image/jpeg";
}

async function storePrivateUpload({ directory, file, prefix }) {
  const extension = path.extname(file.name || "").toLowerCase() || ".jpg";
  const safeName = `${sanitizeFileName(prefix)}-${Date.now()}${extension}`;
  const relativePath = path.join(directory, safeName);
  const absolutePath = path.join(process.cwd(), relativePath);
  const buffer = Buffer.from(await file.arrayBuffer());

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);

  return relativePath.replaceAll("\\", "/");
}

function getNearestDexaScanId(scans, dateKey) {
  const target = new Date(`${dateKey}T00:00:00`).getTime();

  return [...scans]
    .filter((scan) => scan.measuredAt)
    .sort(
      (a, b) =>
        Math.abs(new Date(`${a.measuredAt}T00:00:00`).getTime() - target) -
        Math.abs(new Date(`${b.measuredAt}T00:00:00`).getTime() - target)
    )[0]?.id ?? null;
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeOptionalText(value) {
  const text = String(value ?? "").trim();

  return text.length > 0 ? text : null;
}

function normalizeProgressPhotoView(value) {
  const view = normalizeProgressPhotoViewModel(value);

  return view === "unknown" ? "front" : view;
}

function normalizeProgressPhotoPoseValue(value, view) {
  return normalizeProgressPhotoPose(value, view);
}

function normalizeProgressPhotoCategory(formData) {
  const category = String(formData.get("category") ?? "").trim().toLowerCase();

  if (category === "back-flexed") {
    return { pose: "flexed", view: "back" };
  }
  if (category === "back-relaxed") {
    return { pose: "relaxed", view: "back" };
  }
  if (category === "side-relaxed") {
    return { pose: "relaxed", view: "side" };
  }
  if (category === "front-relaxed") {
    return { pose: "relaxed", view: "front" };
  }

  const view = normalizeProgressPhotoView(formData.get("view"));

  return {
    pose: normalizeProgressPhotoPoseValue(formData.get("pose"), view),
    view,
  };
}

function normalizeReturnTo(value) {
  const text = normalizeOptionalText(value);
  if (!text) return null;
  if (["/log?session=morning", "/log?session=afternoon", "/log?session=evening"].includes(text)) {
    return text;
  }

  return null;
}

function sanitizeFileName(value) {
  return String(value).replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "");
}

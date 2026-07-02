"use server";

import fs from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAnalysis, AnalysisTone } from "../../../domain/models/analysis";
import { createProgressPhoto } from "../../../domain/models/progressPhoto";
import { interpretPhotoSetWithVision } from "../../../domain/interpreters/PhotoInterpreterService";
import { createDailyBriefingService } from "../../../domain/services/DailyBriefingService";
import { FounderRepositories } from "../../../data/repositories/founderRepositories";

const VISIBLE_ABS_GOAL_ID = "goal_visible_abs_at_rest";

export async function saveProgressPhotoEvidence(formData) {
  const user = await FounderRepositories.users.getCurrentUser();

  if (!user) throw new Error("Founder user is not available.");

  const file = formData.get("photo");
  const view = String(formData.get("view") || "front");
  const pose = String(formData.get("pose") || "relaxed");
  const capturedAt = String(formData.get("capturedAt") || getTodayKey());
  const notes = normalizeOptionalText(formData.get("notes"));

  if (!file || typeof file.arrayBuffer !== "function" || file.size === 0) {
    throw new Error("Progress photo is required.");
  }

  const uploadedAt = new Date().toISOString();
  const storedPath = await storePrivateUpload({
    directory: path.join("private", "founder", "photos", "uploads"),
    file,
    prefix: `${capturedAt}-${view}-${pose}`,
  });
  const [sameDayWeights, dexaScans] = await Promise.all([
    FounderRepositories.weights.listWeightEntries(user.id, {
      start: capturedAt,
      end: capturedAt,
    }),
    FounderRepositories.dexaScans.listDEXAScans(user.id),
  ]);
  const existingPhotos = await FounderRepositories.progressPhotos.listPhotos(user.id);
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
    conditions: {
      morning: true,
      fasted: true,
      sameLighting: true,
      sameMirror: true,
      postWorkout: false,
      pump: false,
      notes,
    },
    linkedWeightEntryId: sameDayWeights[0]?.id ?? null,
    nearestDexaScanId: getNearestDexaScanId(dexaScans, capturedAt),
    source: {
      type: "manual",
      name: "Founder Progress Photo Upload",
      externalId: null,
      importedAt: uploadedAt,
      confidence: "high",
      notes: "Founder-uploaded progress photo using default Founder Alpha photo context.",
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
  await createDailyBriefingService({
    repositories: FounderRepositories,
  }).generateDailyBriefing({
    userId: user.id,
    trigger: {
      evidenceId: photo.id,
      evidenceType: "progress_photo",
      analysisId: analysis.id,
    },
  });

  revalidatePath("/");
  revalidatePath("/briefing/daily");
  revalidatePath("/progress");
  revalidatePath("/progress/photos");
  revalidatePath("/timeline");
  redirect("/briefing/daily");
}

function createPhotoInterpretationAnalysis({ createdAt, interpretationResult, photo }) {
  const interpretation = interpretationResult.interpretation;

  return createAnalysis({
    id: `analysis_progress_photo_${createdAt.replace(/\D/g, "")}`,
    createdAt,
    title: "Progress Photo Interpreted",
    summary: interpretation.user_facing_summary,
    evidenceIds: [photo.id],
    evidenceTypes: ["progress_photo"],
    findings: [
      ...interpretation.body_composition_observations.slice(0, 3).map((detail) => ({
        title: "Visual observation",
        detail,
      })),
      ...interpretation.visual_changes_observed.slice(0, 2).map((detail) => ({
        title: "Visual change",
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
    },
  });
}

async function getPreviousPhotoSet({ existingPhotos, pose, userId, view }) {
  const previous = [...existingPhotos]
    .filter((photo) => photo.userId === userId && photo.view === view && photo.pose === pose)
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

function sanitizeFileName(value) {
  return String(value).replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "");
}

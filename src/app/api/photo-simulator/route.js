import { NextResponse } from "next/server";
import { interpretPhotoSetWithVision } from "../../../domain/interpreters/PhotoInterpreterService";

export const runtime = "nodejs";

export async function POST(request) {
  const startedAt = Date.now();
  const formData = await request.formData();
  const currentFiles = formData
    .getAll("currentPhotos")
    .filter((file) => typeof file.arrayBuffer === "function" && file.size > 0);
  const previousFiles = formData
    .getAll("previousPhotos")
    .filter((file) => typeof file.arrayBuffer === "function" && file.size > 0);
  const currentPhotoMetadata = parseMetadataList(formData.get("currentPhotoMetadata"));
  const previousPhotoMetadata = parseMetadataList(formData.get("previousPhotoMetadata"));
  const captureDate = normalizeString(formData.get("captureDate")) || getTodayKey();
  const previousCaptureDate =
    normalizeString(formData.get("previousCaptureDate")) || captureDate;
  const goalContext = normalizeString(formData.get("goalContext"));
  const interpreterGoalContext = goalContext || "General physique progress photo review";
  const currentView = normalizeString(formData.get("currentView")) || "unknown";
  const previousView = normalizeString(formData.get("previousView")) || "unknown";
  const currentPose = normalizeString(formData.get("currentPose")) || "unknown";
  const previousPose = normalizeString(formData.get("previousPose")) || "unknown";

  if (currentFiles.length === 0) {
    return NextResponse.json(
      { error: "Upload at least one current progress photo." },
      { status: 400 }
    );
  }

  const currentPhotos = await Promise.all(
    currentFiles.map((file, index) =>
      fileToPhotoInput({
        fallbackCapturedAt: captureDate,
        file,
        metadata: currentPhotoMetadata[index],
        fallbackPose: currentPose,
        fallbackView: currentView,
      })
    )
  );
  const previousPhotos = await Promise.all(
    previousFiles.map((file, index) =>
      fileToPhotoInput({
        fallbackCapturedAt: previousCaptureDate,
        file,
        metadata: previousPhotoMetadata[index],
        fallbackPose: previousPose,
        fallbackView: previousView,
      })
    )
  );
  const resolvedCurrentDate = getResolvedSetDate(currentPhotos) ?? captureDate;
  const resolvedPreviousDate = getResolvedSetDate(previousPhotos) ?? previousCaptureDate;
  const metadataDebug = createMetadataDebug({
    currentPhotos,
    previousPhotos,
    resolvedCurrentDate,
    resolvedPreviousDate,
  });
  const photoSetId = `sim_photo_set_${resolvedCurrentDate ?? "unknown"}_${Date.now()}`;
  const previousPhotoSet =
    previousPhotos.length > 0
      ? {
          photoSetId: `sim_previous_photo_set_${resolvedPreviousDate ?? "unknown"}_${Date.now()}`,
          captureDate: resolvedPreviousDate,
          metadataDebug,
          photos: previousPhotos,
        }
      : null;

  try {
    const result = await interpretPhotoSetWithVision({
      captureDate: resolvedCurrentDate,
      goalContext: interpreterGoalContext,
      photoSetId,
      photos: currentPhotos,
      previousPhotoSet,
    });
    const latencyMs = Date.now() - startedAt;

    return NextResponse.json({
      ...result,
      simulator: {
        model: process.env.OPENAI_PHOTO_INTERPRETER_MODEL || "gpt-4.1-mini",
        openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
        latencyMs,
        simulationOnly: true,
        persisted: false,
      },
      metadataDebug,
      previews: createSimulationPreviews({
        currentPhotos,
        goalContext,
        interpretation: result.interpretation,
        previousPhotoSet,
        provider: result.provider,
        warning: result.warning,
      }),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error.message,
        simulator: {
          model: process.env.OPENAI_PHOTO_INTERPRETER_MODEL || "gpt-4.1-mini",
          openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
          latencyMs: Date.now() - startedAt,
          simulationOnly: true,
          persisted: false,
        },
      },
      { status: 500 }
    );
  }
}

async function fileToPhotoInput({
  fallbackCapturedAt,
  fallbackPose,
  fallbackView,
  file,
  metadata = {},
}) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const filenameMetadata = parseFilenameMetadata(file.name);
  const exifDate = extractExifDate(buffer);
  const resolvedDate = exifDate ?? filenameMetadata.date ?? normalizeDate(metadata.date) ?? fallbackCapturedAt ?? null;
  const metadataSource = exifDate
    ? "EXIF"
    : filenameMetadata.date
      ? "filename"
      : normalizeDate(metadata.date)
        ? "manual"
        : "unknown";
  const resolvedView = normalizeView(metadata.view) !== "unknown"
    ? normalizeView(metadata.view)
    : inferView(file.name, fallbackView);
  const resolvedPose = normalizePose(metadata.pose) !== "unknown"
    ? normalizePose(metadata.pose)
    : inferPose(file.name, fallbackPose);

  return {
    fileName: file.name,
    dataUrl: bufferToDataUrl(buffer, file.type || "image/jpeg"),
    mimeType: file.type || "image/jpeg",
    view: resolvedView,
    pose: resolvedPose,
    capturedAt: resolvedDate,
    metadataSource,
    parsedMetadata: {
      exifDate,
      filenameDate: filenameMetadata.date,
      manualDate: normalizeDate(metadata.date),
      source: metadataSource,
    },
    conditions: {
      morning: true,
      fasted: true,
      sameLighting: true,
      sameMirror: true,
      postWorkout: false,
      pump: false,
    },
  };
}

function bufferToDataUrl(buffer, mimeType) {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function createSimulationPreviews({
  currentPhotos,
  goalContext,
  interpretation,
  previousPhotoSet,
  provider,
  warning,
}) {
  const now = new Date().toISOString();
  const photoRecords = currentPhotos.map((photo, index) => ({
    id: `would_create_progress_photo_${index + 1}`,
    evidenceType: "progress_photo",
    capturedAt: photo.capturedAt,
    view: photo.view,
    pose: photo.pose,
    fileName: photo.fileName,
    relatedGoal: goalContext ?? null,
    futureGoalEngineContribution:
      goalContext
        ? `Would support future goal reasoning for: ${goalContext}.`
        : "Would become visual evidence that a future Goal Engine could connect to a goal later.",
    source: provider === "openai" ? "OpenAI PhotoInterpreter" : "PhotoInterpreter fallback",
    simulationOnly: true,
  }));
  const analysisRecord = {
    id: `would_create_analysis_${Date.now()}`,
    evidenceIds: photoRecords.map((record) => record.id),
    evidenceTypes: ["progress_photo"],
    summary: interpretation.user_facing_summary,
    recommendation: interpretation.suggested_priorities?.[0] ?? null,
    coachBriefingInsert: interpretation.coach_briefing_insert,
    source: provider,
    warning,
    simulationOnly: true,
    createdAt: now,
  };

  return {
    evidenceObjects: [...photoRecords, analysisRecord],
    dailyBriefingPreview: {
      section: "Daily Briefing",
      wouldAdd: interpretation.coach_briefing_insert,
      confidenceNote: interpretation.confidence_notes?.[0] ?? null,
      comparisonUsed: Boolean(previousPhotoSet?.photos?.length),
      simulationOnly: true,
    },
    futureGoalEnginePreview: {
      section: "Future Goal Engine",
      wouldContribute:
        "Visual trend, comparison quality, limitations, and suggested follow-up evidence.",
      goalContext: goalContext ?? "No goal supplied",
      summary: interpretation.goal_relevance?.join(" ") || interpretation.user_facing_summary,
      simulationOnly: true,
    },
  };
}

function inferView(fileName, fallback) {
  const lower = String(fileName ?? "").toLowerCase();

  if (lower.includes("front")) return "front";
  if (lower.includes("side")) return "side";
  if (lower.includes("back") || lower.includes("rear")) return "back";

  return normalizeView(fallback);
}

function inferPose(fileName, fallback) {
  const lower = String(fileName ?? "").toLowerCase();

  if (lower.includes("double-biceps") || lower.includes("double_biceps") || lower.includes("double") || lower.includes("flex")) return "flexed";
  if (lower.includes("relaxed")) return "relaxed";

  return normalizePose(fallback);
}

function normalizeView(view) {
  const normalized = String(view ?? "unknown").toLowerCase();

  if (["front", "side", "back"].includes(normalized)) return normalized;
  if (normalized === "rear") return "back";

  return "unknown";
}

function normalizePose(pose) {
  const normalized = String(pose ?? "unknown").toLowerCase().replaceAll("-", "_");

  if (normalized === "double_biceps") return "flexed";
  if (["relaxed", "flexed"].includes(normalized)) return normalized;

  return "unknown";
}

function parseMetadataList(value) {
  try {
    const parsed = JSON.parse(normalizeString(value) || "[]");

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseFilenameMetadata(fileName) {
  return {
    date: parseDateFromFilename(fileName),
    pose: inferPose(fileName, "unknown"),
    view: inferView(fileName, "unknown"),
  };
}

function parseDateFromFilename(fileName) {
  const value = String(fileName ?? "");
  const isoMatch = value.match(/\b(20\d{2})[-_](\d{2})[-_](\d{2})\b/);

  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const usMatch = value.match(/\b(\d{2})[-_](\d{2})[-_](20\d{2})\b/);

  if (usMatch) return `${usMatch[3]}-${usMatch[1]}-${usMatch[2]}`;

  return null;
}

function extractExifDate(buffer) {
  const text = buffer.toString("latin1");
  const match = text.match(/\b(20\d{2}):(\d{2}):(\d{2}) \d{2}:\d{2}:\d{2}\b/);

  if (!match) return null;

  return `${match[1]}-${match[2]}-${match[3]}`;
}

function normalizeDate(value) {
  const text = normalizeString(value);

  if (!text) return null;

  const date = new Date(`${text}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString().slice(0, 10);
}

function getResolvedSetDate(photos) {
  return photos.find((photo) => photo.capturedAt)?.capturedAt ?? null;
}

function createMetadataDebug({
  currentPhotos,
  previousPhotos,
  resolvedCurrentDate,
  resolvedPreviousDate,
}) {
  const currentPhoto = currentPhotos[0] ?? null;
  const previousPhoto = previousPhotos[0] ?? null;

  return {
    previousCaptureDate: resolvedPreviousDate ?? null,
    currentCaptureDate: resolvedCurrentDate ?? null,
    daysElapsed: getDaysElapsed(resolvedPreviousDate, resolvedCurrentDate),
    previousView: previousPhoto?.view ?? "unknown",
    currentView: currentPhoto?.view ?? "unknown",
    previousPose: previousPhoto?.pose ?? "unknown",
    currentPose: currentPhoto?.pose ?? "unknown",
    matchStatus: getMatchStatus({ currentPhoto, previousPhoto }),
    metadataSource: {
      current: currentPhoto?.metadataSource ?? "unknown",
      previous: previousPhoto?.metadataSource ?? "unknown",
    },
    currentPhotos: currentPhotos.map(toDebugPhoto),
    previousPhotos: previousPhotos.map(toDebugPhoto),
  };
}

function toDebugPhoto(photo) {
  return {
    capturedAt: photo.capturedAt,
    fileName: photo.fileName,
    metadataSource: photo.metadataSource,
    pose: photo.pose,
    view: photo.view,
  };
}

function getMatchStatus({ currentPhoto, previousPhoto }) {
  if (!currentPhoto || !previousPhoto) return "mismatch";
  if (
    currentPhoto.view !== "unknown" &&
    currentPhoto.view === previousPhoto.view &&
    currentPhoto.pose !== "unknown" &&
    currentPhoto.pose === previousPhoto.pose
  ) {
    return "exact_match";
  }
  if (
    currentPhoto.view !== "unknown" &&
    currentPhoto.view === previousPhoto.view
  ) {
    return "view_only_match";
  }

  return "mismatch";
}

function getDaysElapsed(previousDate, currentDate) {
  if (!previousDate || !currentDate) return null;

  const previousTime = Date.parse(`${previousDate}T00:00:00Z`);
  const currentTime = Date.parse(`${currentDate}T00:00:00Z`);

  if (Number.isNaN(previousTime) || Number.isNaN(currentTime)) return null;

  return Math.round((currentTime - previousTime) / 86_400_000);
}

function normalizeString(value) {
  const text = String(value ?? "").trim();

  return text.length > 0 ? text : null;
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

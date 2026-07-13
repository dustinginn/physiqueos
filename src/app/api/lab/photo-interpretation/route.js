import { NextResponse } from "next/server";
import { interpretPhotoSetWithVision } from "../../../../domain/interpreters/PhotoInterpreterService";

export const runtime = "nodejs";

export async function POST(request) {
  const formData = await request.formData();
  const files = formData.getAll("photos").filter((file) => typeof file.arrayBuffer === "function");
  const captureDate = normalizeString(formData.get("captureDate")) || getTodayKey();
  const goalContext = normalizeString(formData.get("goalContext")) || "Visible Abs at Rest";
  const view = normalizeString(formData.get("view")) || "unknown";
  const pose = normalizeString(formData.get("pose")) || "unknown";
  const previousRaw = normalizeString(formData.get("previousPhotoSet"));
  const previousPhotoSet = previousRaw ? JSON.parse(previousRaw) : null;

  if (files.length === 0) {
    return NextResponse.json(
      { error: "At least one photo is required for interpretation." },
      { status: 400 }
    );
  }

  const photos = await Promise.all(
    files.map(async (file) => ({
      fileName: file.name,
      dataUrl: await fileToDataUrl(file),
      mimeType: file.type || "image/jpeg",
      view: inferView(file.name, view),
      pose: inferPose(file.name, pose),
      capturedAt: captureDate,
      conditions: {
        morning: true,
        fasted: true,
        sameLighting: true,
        sameMirror: true,
        postWorkout: false,
        pump: false,
      },
    }))
  );

  const result = await interpretPhotoSetWithVision({
    captureDate,
    goalContext,
    photoSetId: `lab_photo_set_${captureDate}_${Date.now()}`,
    photos,
    previousPhotoSet,
  });

  return NextResponse.json(result);
}

async function fileToDataUrl(file) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "image/jpeg";

  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function inferView(fileName, fallback) {
  const lower = String(fileName ?? "").toLowerCase();

  if (lower.includes("front")) return "front";
  if (lower.includes("side")) return "side";
  if (lower.includes("back") || lower.includes("rear")) return "back";

  return fallback;
}

function inferPose(fileName, fallback) {
  const lower = String(fileName ?? "").toLowerCase();

  if (lower.includes("double") || lower.includes("flex")) return "flexed";
  if (lower.includes("relaxed")) return "relaxed";

  return fallback;
}

function normalizeString(value) {
  const text = String(value ?? "").trim();

  return text.length > 0 ? text : null;
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { FounderRepositories } from "../../../data/repositories/founderRepositories";
import { createProgressPhoto } from "../../../domain/models/progressPhoto";
import {
  normalizeProgressPhotoPose,
  normalizeProgressPhotoView,
} from "../../../domain/models/progressPhotoPoseVocabulary";
import { reconcileEvidencePackageIntoCanonicalHistory } from "../../../domain/services/CanonicalEvidenceService";
import { processEvidenceIntakeSubmission } from "../../../domain/services/EvidenceIntakeService";
import { createEvidenceReviewService } from "../../../domain/services/EvidenceReviewService";

export const runtime = "nodejs";

const DEFAULT_TIME_ZONE = "America/Los_Angeles";

export async function POST(request) {
  let evidencePackage = null;

  try {
    const formData = await request.formData();
    const user = await FounderRepositories.users.getCurrentUser();

    if (!user) throw new Error("Founder user is not available.");

    const files = formData
      .getAll("evidenceFiles")
      .filter((file) => typeof file?.arrayBuffer === "function" && file.size > 0);
    const evidenceDate = normalizeDateKey(formData.get("evidenceDate")) ?? getTodayKey();
    const typedEvidence = normalizeOptionalText(formData.get("evidenceNote"));
    const isHistoricalEvidence = evidenceDate < getTodayKey();

    if (files.length === 0 && !typedEvidence) {
      return redirectToLog({ error: "empty-intake" });
    }

    const result = await processEvidenceIntakeSubmission({
      evidenceDate,
      expectedEvidenceType: "auto",
      files,
      typedEvidence,
      userId: user.id,
    });
    evidencePackage = result.evidencePackage;
    await FounderRepositories.evidencePackages.saveEvidencePackage(evidencePackage);
    const review = await createEvidenceReviewService({ repositories: FounderRepositories }).stage({
      userId: user.id, evidencePackage,
      source: isHistoricalEvidence ? "historical_universal_intake" : "universal_intake",
    });
    const reviewUrl = `/evidence/review/${review.id}`;
    if (request.headers.get("accept")?.includes("application/json")) {
      return NextResponse.json({ reviewId: review.id, reviewUrl });
    }
    return NextResponse.redirect(new URL(reviewUrl, request.url), 303);
  } catch (error) {
    console.warn("[EvidenceIntake] Upload Anything route failed.", {
      error: error?.message,
      evidencePackageId: evidencePackage?.package_id ?? null,
      stack: error?.stack,
    });

    return redirectToLog({ error: "intake-failed" });
  }
}

async function reconcileCanonicalEvidencePackage({ evidencePackage, userId }) {
  if (!FounderRepositories.canonicalEvidence) return;

  const existingCanonicalObjects =
    await FounderRepositories.canonicalEvidence.listCanonicalEvidenceObjects(userId);
  const reconciledObjects = reconcileEvidencePackageIntoCanonicalHistory({
    evidencePackage,
    existingCanonicalObjects,
    userId,
  });

  await FounderRepositories.canonicalEvidence.upsertCanonicalEvidenceObjects(
    reconciledObjects
  );
}

async function saveDexaScansFromEvidencePackage({ evidencePackage, userId }) {
  const dexaObjects = (evidencePackage.evidence_objects ?? []).filter((object) =>
    ["dexa_scan", "dexa", "body_composition"].includes(object.evidence_type)
  );

  if (dexaObjects.length === 0) return;

  const existingScans = await FounderRepositories.dexaScans.listDEXAScans(userId);
  const existingIdentities = new Set(existingScans.map(createDexaIdentity));

  for (const object of dexaObjects) {
    const identity = createDexaIdentity(object);

    if (existingIdentities.has(identity)) continue;

    await FounderRepositories.dexaScans.addDEXAScan({
      ...object,
      measuredAt: object.measuredAt ?? object.observed_at,
      updatedAt: new Date().toISOString(),
      userId,
    });
    existingIdentities.add(identity);
  }
}

async function saveProgressPhotosFromEvidencePackage({ evidencePackage, userId }) {
  const photoSessions = (evidencePackage.evidence_objects ?? []).filter(
    (object) => object.evidence_type === "photo_session"
  );

  if (photoSessions.length === 0 || !FounderRepositories.progressPhotos) return;

  const existingPhotos = await FounderRepositories.progressPhotos.listPhotos(userId);
  const existingPaths = new Set(existingPhotos.map((photo) => photo.imagePath));
  const now = new Date().toISOString();

  for (const session of photoSessions) {
    for (const photo of session.photos ?? []) {
      if (!photo.storage_path || existingPaths.has(photo.storage_path)) continue;
      if (!isValidStoredImage(photo.storage_path)) continue;

      const capturedAt = photo.captured_at ?? session.observed_at ?? getTodayKey();
      const view = normalizeProgressPhotoView(photo.view);
      const pose = normalizeProgressPhotoPose(photo.pose, view);
      const progressPhoto = createProgressPhoto({
        id: `progress_photo_${capturedAt.replaceAll("-", "_")}_${view}_${pose}_${photo.id}`,
        userId,
        date: capturedAt,
        capturedAt,
        uploadedAt: now,
        imagePath: photo.storage_path,
        relatedGoalIds: ["goal_visible_abs_at_rest"],
        view,
        pose,
        conditions: {
          morning: null,
          fasted: null,
          sameLighting: null,
          sameMirror: null,
          postWorkout: null,
          pump: null,
          notes: "Uploaded through Upload Anything.",
        },
        source: {
          type: "photo",
          name: "Upload Anything Progress Photos",
          externalId: session.id,
          importedAt: now,
          confidence: session.confidence?.extraction ?? "medium",
          notes: "Progress photo evidence preserved from Upload Anything.",
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
          computed: [],
          sourceArtifactRefs: [photo.source_artifact_ref].filter(Boolean),
          evidencePackageIds: [evidencePackage.package_id].filter(Boolean),
        },
        createdAt: now,
        updatedAt: now,
      });

      await FounderRepositories.progressPhotos.createPhoto(progressPhoto);
      existingPaths.add(photo.storage_path);
    }
  }
}

function isValidStoredImage(relativePath) {
  try {
    const absolutePath = getSafePrivatePath(relativePath);
    if (!absolutePath) return false;

    const stat = fs.statSync(absolutePath);
    if (!stat.isFile() || stat.size < 128) return false;

    const buffer = Buffer.alloc(12);
    const file = fs.openSync(absolutePath, "r");

    try {
      fs.readSync(file, buffer, 0, buffer.length, 0);
    } finally {
      fs.closeSync(file);
    }

    return hasSupportedImageSignature(buffer);
  } catch {
    return false;
  }
}

function getSafePrivatePath(relativePath = "") {
  const normalizedPath = path.normalize(relativePath);
  const privateRoot = path.join(process.cwd(), "private");
  const relativePrivatePath = normalizedPath.replace(/^private[\\/]+/i, "");
  const absolutePath = path.join(privateRoot, relativePrivatePath);

  return absolutePath.startsWith(privateRoot) ? absolutePath : null;
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

function redirectToLog(params = {}) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value) searchParams.set(key, value);
  });

  const query = searchParams.toString();

  return new NextResponse(null, {
    headers: {
      Location: query ? `/log?${query}` : "/log",
    },
    status: 303,
  });
}

function revalidateDailyDriverPaths({ includeDailyBriefing = true } = {}) {
  revalidatePath("/");
  revalidatePath("/log");
  revalidatePath("/progress");
  revalidatePath("/progress/weight");
  revalidatePath("/timeline");
  if (includeDailyBriefing) revalidatePath("/briefing/daily");
}

function createDexaIdentity(scan) {
  return [
    scan.provider,
    scan.measuredAt ?? scan.observed_at,
    scan.totalMass?.value,
    scan.bodyFatPercentage,
    scan.fatMass?.value,
    scan.leanMass?.value,
    scan.boneMineralContent?.value,
  ].join("|");
}

function summarizeEvidenceObjectCounts(evidencePackage) {
  const counts = (evidencePackage.detected_evidence_objects ?? [])
    .map((item) => `${item.count} ${item.canonical_name}`)
    .join(", ");

  return counts || `${evidencePackage.evidence_objects?.length ?? 0} evidence objects`;
}

export function getEvidenceViewTarget(evidencePackage) {
  const evidenceTypes = new Set(
    (evidencePackage.evidence_objects ?? []).map((object) => object.evidence_type)
  );

  if (evidenceTypes.has("photo_session") || evidenceTypes.has("progress_photo")) {
    return "photos";
  }
  if (evidenceTypes.has("nutrition")) return "nutrition";
  if (evidenceTypes.has("activity_day")) {
    return "activity";
  }
  if (evidenceTypes.has("training")) {
    return "training";
  }
  if (
    evidenceTypes.has("dexa_scan") ||
    evidenceTypes.has("dexa") ||
    evidenceTypes.has("body_composition")
  ) {
    return "dexa";
  }

  return "timeline";
}

function getTodayKey() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: DEFAULT_TIME_ZONE,
    year: "numeric",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return year && month && day
    ? `${year}-${month}-${day}`
    : now.toISOString().slice(0, 10);
}

function normalizeDateKey(value) {
  const text = String(value ?? "").trim();

  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function normalizeOptionalText(value) {
  const text = String(value ?? "").trim();

  return text.length > 0 ? text : null;
}

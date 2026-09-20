import path from "node:path";
import { createApplicationStoredArtifactLoader } from "./ApplicationUploadService.js";

// The vision model reads a small rendition, never a canonical original. A
// ProRAW/DNG original is the canonical source artifact (tens of MB); its linked
// JPEG derivative is the analysis artifact. Base64-encoding a 40 MB original
// into a data URL would hold it several times over in the worker heap, so the
// loader refuses anything that is not a bounded, vision-supported rendition
// instead of trusting every caller to pass the derivative.
export const PHOTO_ANALYSIS_VISION_MIME_TYPES = Object.freeze([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
// The largest observed derivative or prior rendition is about 4.6 MB and the
// provider limit for one image is 20 MB. This bound sits between the two.
export const PHOTO_ANALYSIS_MAX_IMAGE_BYTES = 16 * 1024 * 1024;

export function createPhotoAnalysisMediaLoader({
  userId,
  loadArtifact = createApplicationStoredArtifactLoader({ userId }),
} = {}) {
  if (typeof loadArtifact !== "function") {
    throw new Error("Photo analysis requires a stored-media loader.");
  }
  return async function loadPhotoAnalysisMedia({ reference, contentType = null } = {}) {
    const storagePath = String(reference ?? "").trim();
    if (!storagePath) throw new Error("Confirmed photo storage path is missing.");
    // Refuse a declared original before any bytes are downloaded.
    if (contentType && !isVisionMimeType(contentType)) throw unsupported();
    const artifact = {
      storage_path: storagePath,
      ...(contentType ? { mime_type: contentType } : {}),
    };
    const loaded = await loadArtifact({ artifact });
    const resolvedContentType = String(loaded?.contentType ?? contentType ?? "").trim();
    if (!Buffer.isBuffer(loaded?.buffer) || !isVisionMimeType(resolvedContentType)) {
      throw unsupported();
    }
    if (loaded.buffer.length > PHOTO_ANALYSIS_MAX_IMAGE_BYTES) {
      throw Object.assign(
        new Error("Confirmed photo media exceeds the bounded analysis rendition size."),
        { code: "PHOTO_ANALYSIS_MEDIA_TOO_LARGE" },
      );
    }
    return Object.freeze({
      fileName: path.basename(storagePath.replace(/^media:\/\//, "")) || "photo",
      dataUrl: `data:${resolvedContentType};base64,${loaded.buffer.toString("base64")}`,
      mimeType: resolvedContentType,
    });
  };
}

function isVisionMimeType(value) {
  return PHOTO_ANALYSIS_VISION_MIME_TYPES.includes(String(value ?? "").trim().toLowerCase());
}

function unsupported() {
  return Object.assign(
    new Error("Confirmed photo media is not a supported image."),
    { code: "PHOTO_ANALYSIS_MEDIA_UNSUPPORTED" },
  );
}

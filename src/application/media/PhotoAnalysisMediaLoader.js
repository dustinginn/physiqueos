import path from "node:path";
import { createApplicationStoredArtifactLoader } from "./ApplicationUploadService.js";

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
    const artifact = {
      storage_path: storagePath,
      ...(contentType ? { mime_type: contentType } : {}),
    };
    const loaded = await loadArtifact({ artifact });
    const resolvedContentType = String(loaded?.contentType ?? contentType ?? "").trim();
    if (!Buffer.isBuffer(loaded?.buffer) || !resolvedContentType.startsWith("image/")) {
      throw new Error("Confirmed photo media is not a supported image.");
    }
    return Object.freeze({
      fileName: path.basename(storagePath.replace(/^media:\/\//, "")) || "photo",
      dataUrl: `data:${resolvedContentType};base64,${loaded.buffer.toString("base64")}`,
      mimeType: resolvedContentType,
    });
  };
}

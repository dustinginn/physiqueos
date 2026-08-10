import { describe, expect, it } from "vitest";
import {
  extractOriginalImageCaptureMetadata,
  inferPhotoSessionCaptureMetadata,
  normalizeReviewedPhotoSessionMetadata,
  resolvePhotoSessionGoalRelationship,
} from "./PhotoSessionMetadataService";

describe("Photo session metadata", () => {
  it("uses reliable EXIF DateTimeOriginal once for the capture session", () => {
    const metadata = extractOriginalImageCaptureMetadata(jpegWithExif("2026:08:08 15:42:10"), { mimeType: "image/jpeg" });
    expect(metadata).toMatchObject({ status: "reliable", localDateTime: "2026-08-08T15:42:10", timeOfDay: "afternoon", source: "exif_datetime_original" });
    expect(inferPhotoSessionCaptureMetadata([
      { originalCaptureMetadata: metadata },
      { originalCaptureMetadata: metadata },
    ], { evidenceDate: "2026-08-08" })).toMatchObject({ status: "inferred", timeOfDay: "afternoon" });
  });

  it("falls back safely to one session-level review when EXIF is missing or contradictory", () => {
    expect(inferPhotoSessionCaptureMetadata([], { evidenceDate: "2026-08-08" })).toMatchObject({ status: "needs_review", capturedAt: null, timeOfDay: null });
    const metadata = extractOriginalImageCaptureMetadata(jpegWithExif("2026:08:09 09:15:00"), { mimeType: "image/jpeg" });
    expect(inferPhotoSessionCaptureMetadata([{ originalCaptureMetadata: metadata }], { evidenceDate: "2026-08-08" })).toMatchObject({ status: "needs_review", capturedAt: null });
    expect(normalizeReviewedPhotoSessionMetadata({ timeOfDay: "evening" }).captureMetadata).toMatchObject({ status: "reviewed", timeOfDay: "evening", capturedAt: null });
  });

  it("rejects impossible EXIF calendar timestamps instead of normalizing them", () => {
    expect(extractOriginalImageCaptureMetadata(jpegWithExif("2026:02:31 09:15:00"), { mimeType: "image/jpeg" }))
      .toMatchObject({ status: "unavailable", capturedAt: null, timeOfDay: null });
  });

  it("resolves an unambiguous scheduled Goal and leaves real ambiguity reviewable", () => {
    const goals = [{ id: "build", title: "Build Lean Mass", status: "active", primary: true, startDate: "2026-08-01" }, { id: "support", title: "Support", status: "active", startDate: "2026-08-01" }];
    const scheduled = [{ title: "Progress Photos", linkedEvidenceTypes: ["progress_photo"], linkedGoalIds: ["build"], preferredSchedule: { daysOfWeek: ["saturday"] }, cadence: { type: "weekly" } }];
    expect(resolvePhotoSessionGoalRelationship({ evidenceDate: "2026-08-08", executionItems: scheduled, goals })).toMatchObject({ status: "resolved", goalIds: ["build"], source: "scheduled_progress_photo_occurrence" });
    expect(resolvePhotoSessionGoalRelationship({ evidenceDate: "2026-08-08", goals: goals.map((goal) => ({ ...goal, primary: false })) })).toMatchObject({ status: "needs_review", goalIds: [] });
  });
});

function jpegWithExif(timestamp) {
  const ascii = Buffer.from(`${timestamp}\0`, "ascii");
  const tiff = Buffer.alloc(44 + ascii.length);
  tiff.write("II", 0, "ascii");
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8);
  tiff.writeUInt16LE(0x8769, 10);
  tiff.writeUInt16LE(4, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt32LE(26, 18);
  tiff.writeUInt32LE(0, 22);
  tiff.writeUInt16LE(1, 26);
  tiff.writeUInt16LE(0x9003, 28);
  tiff.writeUInt16LE(2, 30);
  tiff.writeUInt32LE(ascii.length, 32);
  tiff.writeUInt32LE(44, 36);
  tiff.writeUInt32LE(0, 40);
  ascii.copy(tiff, 44);
  const exif = Buffer.concat([Buffer.from("Exif\0\0", "binary"), tiff]);
  const header = Buffer.alloc(4);
  header[0] = 0xff; header[1] = 0xe1; header.writeUInt16BE(exif.length + 2, 2);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), header, exif, Buffer.from([0xff, 0xd9])]);
}

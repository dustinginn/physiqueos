import { describe, expect, it, vi } from "vitest";
import {
  createPhotoAnalysisMediaLoader,
  PHOTO_ANALYSIS_MAX_IMAGE_BYTES,
} from "./PhotoAnalysisMediaLoader.js";

describe("photo analysis media loader", () => {
  it("converts provider-owned media bytes into the existing interpreter input shape", async () => {
    const loadArtifact = vi.fn(async () => ({
      buffer: Buffer.from([1, 2, 3]),
      contentType: "image/png",
    }));
    const load = createPhotoAnalysisMediaLoader({ userId: "founder", loadArtifact });

    await expect(load({
      reference: "media://01a054d6-a827-766f-9546-dc4874c6f357",
    })).resolves.toEqual({
      fileName: "01a054d6-a827-766f-9546-dc4874c6f357",
      dataUrl: "data:image/png;base64,AQID",
      mimeType: "image/png",
    });
    expect(loadArtifact).toHaveBeenCalledWith({
      artifact: { storage_path: "media://01a054d6-a827-766f-9546-dc4874c6f357" },
    });
  });

  it("preserves explicit legacy image content types through the same boundary", async () => {
    const loadArtifact = vi.fn(async () => ({
      buffer: Buffer.from("legacy"),
      contentType: "image/jpeg",
    }));
    const load = createPhotoAnalysisMediaLoader({ userId: "founder", loadArtifact });
    await expect(load({
      reference: "private/founder/photos/front.jpeg",
      contentType: "image/jpeg",
    })).resolves.toMatchObject({ fileName: "front.jpeg", mimeType: "image/jpeg" });
  });

  it("fails closed when loaded content is not a verified image", async () => {
    const load = createPhotoAnalysisMediaLoader({
      userId: "founder",
      loadArtifact: vi.fn(async () => ({ buffer: Buffer.from("bad"), contentType: "application/octet-stream" })),
    });
    await expect(load({ reference: "media://missing" }))
      .rejects.toThrow("Confirmed photo media is not a supported image.");
  });

  it("loads a complete five-view canonical PhotoSession in stable order", async () => {
    const references = ["back-flexed", "back-relaxed", "right-side-relaxed", "front-relaxed", "front-flexed"]
      .map((pose) => `media://${pose}`);
    const loadArtifact = vi.fn(async ({ artifact }) => ({
      buffer: Buffer.from(artifact.storage_path),
      contentType: "image/jpeg",
    }));
    const load = createPhotoAnalysisMediaLoader({ userId: "founder", loadArtifact });
    const inputs = [];
    for (const reference of references) inputs.push(await load({ reference }));

    expect(inputs.map((input) => input.fileName)).toEqual(references.map((reference) => reference.slice(8)));
    expect(loadArtifact.mock.calls.map(([input]) => input.artifact.storage_path)).toEqual(references);
  });
});

describe("photo analysis media loader excludes canonical originals from the vision path", () => {
  it("refuses a declared DNG original before downloading any bytes", async () => {
    const loadArtifact = vi.fn();
    const load = createPhotoAnalysisMediaLoader({ userId: "founder", loadArtifact });
    await expect(load({ reference: "media://dng-original", contentType: "image/x-adobe-dng" }))
      .rejects.toMatchObject({ code: "PHOTO_ANALYSIS_MEDIA_UNSUPPORTED" });
    expect(loadArtifact).not.toHaveBeenCalled();
  });

  it("refuses HEIC and DNG content even when the declared type was missing", async () => {
    for (const contentType of ["image/x-adobe-dng", "image/heic", "image/heif", "application/pdf"]) {
      const load = createPhotoAnalysisMediaLoader({
        userId: "founder",
        loadArtifact: vi.fn(async () => ({ buffer: Buffer.from("x"), contentType })),
      });
      await expect(load({ reference: "media://original" })).rejects.toMatchObject({ code: "PHOTO_ANALYSIS_MEDIA_UNSUPPORTED" });
    }
  });

  it("refuses an image larger than the bounded analysis rendition before base64 encoding it", async () => {
    const load = createPhotoAnalysisMediaLoader({
      userId: "founder",
      loadArtifact: vi.fn(async () => ({
        buffer: Buffer.alloc(PHOTO_ANALYSIS_MAX_IMAGE_BYTES + 1),
        contentType: "image/jpeg",
      })),
    });
    await expect(load({ reference: "media://huge" })).rejects.toMatchObject({ code: "PHOTO_ANALYSIS_MEDIA_TOO_LARGE" });
  });

  it("accepts the observed analysis derivative and prior renditions with headroom", async () => {
    for (const bytes of [600 * 1024, Math.round(4.6 * 1024 * 1024)]) {
      const load = createPhotoAnalysisMediaLoader({
        userId: "founder",
        loadArtifact: vi.fn(async () => ({ buffer: Buffer.alloc(bytes, 7), contentType: "image/jpeg" })),
      });
      await expect(load({ reference: "media://derivative", contentType: "image/jpeg" }))
        .resolves.toMatchObject({ mimeType: "image/jpeg" });
    }
  });
});

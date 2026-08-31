import { describe, expect, it } from "vitest";
import { resolveProgressPhotoMedia } from "./ProgressPhotoMediaResolutionService.js";
import { createPhotoSessionReadModels } from "../../domain/services/CanonicalPhotoSessionReadService.js";

const media = (overrides = {}) => ({
  id: "01a049eb-ea13-75e8-948d-6b82752ae101",
  evidence_record_id: "legacy-front",
  provenance: { sourceRelativePath: "photos/uploads/2026-08-08/front.jpg" },
  sha256: "hash-front",
  state: "verified",
  ...overrides,
});

describe("provider Progress Photo media resolution", () => {
  it("maps legacy paths to opaque provider media identities", () => {
    const result = resolveProgressPhotoMedia({
      canonicalEvidenceObjects: [{
        canonicalId: "session",
        lastObservedAt: "2026-08-08",
        payload: {
          evidence_type: "photo_session",
          observed_at: "2026-08-08",
          photos: [{ storage_path: "private/founder/photos/uploads/2026-08-08/front.jpg" }],
        },
      }],
      mediaObjects: [media()],
      progressPhotos: [{ id: "legacy-front", imagePath: "private/founder/photos/uploads/2026-08-08/front.jpg" }],
    });
    expect(result.canonicalEvidenceObjects[0].payload.photos[0].storage_path).toBe("media://01a049eb-ea13-75e8-948d-6b82752ae101");
    expect(result.canonicalEvidenceObjects[0].payload.captureDate).toBe("2026-08-08");
    expect(result.progressPhotos[0].imagePath).toBe("media://01a049eb-ea13-75e8-948d-6b82752ae101");
  });

  it("keeps verified provider references and fails closed without a catalog mapping", () => {
    const result = resolveProgressPhotoMedia({
      canonicalEvidenceObjects: [],
      mediaObjects: [media({ id: "01a049eb-ea13-75e8-948d-6b82752ae102", provenance: {}, sha256: null })],
      progressPhotos: [
        { id: "new", imagePath: "media://01a049eb-ea13-75e8-948d-6b82752ae102" },
        { id: "missing", imagePath: "private/founder/photos/uploads/missing.jpg" },
      ],
    });
    expect(result.progressPhotos.map((photo) => photo.imagePath)).toEqual(["media://01a049eb-ea13-75e8-948d-6b82752ae102", null]);
  });

  it("does not mutate source records", () => {
    const source = [{ id: "legacy-front", imagePath: "private/founder/photos/uploads/2026-08-08/front.jpg" }];
    resolveProgressPhotoMedia({ canonicalEvidenceObjects: [], mediaObjects: [media()], progressPhotos: source });
    expect(source[0].imagePath).toContain("private/founder");
  });

  it("hydrates thumbnail, gallery, and prior-comparison URLs through provider media", () => {
    const priorMedia = media();
    const currentMedia = media({
      id: "01a049eb-ea13-75e8-948d-6b82752ae103",
      evidence_record_id: "current-front",
      provenance: { sourceRelativePath: "photos/uploads/2026-08-22/front.jpg" },
      sha256: "hash-current",
    });
    const session = (id, date, storagePath, sourceId, hash) => ({
      canonicalId: id,
      evidence_type: "photo_session",
      lastObservedAt: date,
      quality: { status: "active" },
      payload: {
        evidence_type: "photo_session",
        sessionId: id,
        captureDate: date,
        photos: [{
          canonicalPhotoId: `${id}-front`,
          orientation: "front",
          contractionState: "relaxed",
          poseVariant: "standard",
          identityStatus: "confirmed",
          userConfirmedIdentity: true,
          sourceIds: [sourceId],
          sourceHashes: [hash],
          storage_path: storagePath,
        }],
      },
    });
    const resolved = resolveProgressPhotoMedia({
      canonicalEvidenceObjects: [
        session("prior", "2026-08-08", "private/founder/photos/uploads/2026-08-08/front.jpg", "legacy-front", "hash-front"),
        session("current", "2026-08-22", "private/founder/photos/uploads/2026-08-22/front.jpg", "current-front", "hash-current"),
      ],
      mediaObjects: [priorMedia, currentMedia],
      progressPhotos: [],
    });
    const sessions = createPhotoSessionReadModels({ canonicalObjects: resolved.canonicalEvidenceObjects });
    expect(sessions[0].thumbnailHref).toBe("/api/private-evidence/media/01a049eb-ea13-75e8-948d-6b82752ae103");
    expect(sessions[0].views[0].imageHref).toBe(sessions[0].thumbnailHref);
    expect(sessions[0].views[0].comparison.previousImageUrl)
      .toBe("/api/private-evidence/media/01a049eb-ea13-75e8-948d-6b82752ae101");
  });
});

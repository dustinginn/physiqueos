import { describe, expect, it } from "vitest";
import { presentEvidenceObject } from "./EvidenceReviewPresentationService.js";

const source = (object, artifacts) => presentEvidenceObject(object, { provenance: { source_artifacts: artifacts } }).sourceLabel;
const photoSession = (extra = {}) => ({ evidence_type: "photo_session", photos: [], source: { modality: "photo", application: "Upload Anything" }, ...extra });
const artifact = (kind, mime_type, file_name = "file") => ({ kind, mime_type, file_name });

describe("review source label comes from provenance, never from the file format", () => {
  it.each([
    ["Apple ProRAW DNG", "image/x-adobe-dng"],
    ["HEIC", "image/heic"],
    ["JPEG", "image/jpeg"],
    ["PNG", "image/png"],
    ["WebP", "image/webp"],
    ["a future raw format", "image/x-vendor-raw"],
  ])("labels %s Progress Photos as photos, not screenshots", (_, mime) => {
    expect(source(photoSession(), [artifact("progress_photo", mime), artifact("progress_photo", mime)])).toBe("Progress photos");
  });

  it("labels a photo session as photos even when the package predates recorded artifact kinds", () => {
    expect(source(photoSession(), [{ mime_type: "image/jpeg" }])).toBe("Progress photos");
    expect(source({ evidence_type: "photo_session", photos: [] }, [{ mime_type: "image/heic" }])).toBe("Progress photos");
    expect(source(photoSession(), [])).not.toBe("Screenshot");
  });

  it("still labels actual screenshot evidence as a Screenshot", () => {
    expect(source({ evidence_type: "training" }, [artifact("screenshot", "image/png")])).toBe("Screenshot");
    expect(source({ evidence_type: "nutrition" }, [artifact("screenshot", "image/jpeg"), artifact("screenshot", "image/jpeg")])).toBe("Screenshot");
    expect(source({ evidence_type: "activity_day", source: { modality: "screenshot" } }, [])).toBe("Screenshot");
  });

  it("keeps the earlier reading for legacy packages without a recorded kind: an image is a Screenshot unless the evidence is a photo session", () => {
    expect(source({ evidence_type: "training" }, [{ mime_type: "image/png" }])).toBe("Screenshot");
    expect(source({ evidence_type: "photo_session" }, [{ mime_type: "image/png" }])).toBe("Progress photos");
  });

  it("combines sources honestly, and leaves non-image evidence alone", () => {
    expect(source({ evidence_type: "training" }, [artifact("screenshot", "image/png"), { kind: "typed_evidence", type: "typed_evidence", text: "typed workout" }])).toBe("Screenshot + Typed evidence");
    expect(source({ evidence_type: "dexa_scan" }, [artifact("pdf", "application/pdf")])).not.toContain("Screenshot");
    expect(source({ evidence_type: "dexa_scan" }, [artifact("pdf", "application/pdf")])).not.toContain("Progress photos");
    expect(source(photoSession({ correctionStatus: "corrected" }), [artifact("progress_photo", "image/x-adobe-dng")])).toBe("Progress photos + Correction");
  });

  it("does not label a photo session's declared screenshot artifact as a photo", () => {
    expect(source(photoSession(), [artifact("screenshot", "image/png")])).toBe("Screenshot");
  });
});

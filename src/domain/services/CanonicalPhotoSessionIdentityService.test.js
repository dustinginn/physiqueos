import { describe, expect, it } from "vitest";
import {
  createCanonicalPhotoSessionRecord,
  createPhotoSessionSemanticFingerprint,
  getStablePhotoSessionId,
  selectActiveCanonicalPhotoSessions,
} from "./CanonicalPhotoSessionIdentityService";

const payload = (overrides = {}) => ({
  evidence_type: "photo_session",
  captureDate: "2026-08-22",
  observed_at: "2026-08-22",
  sessionId: "photo_session_owner_2026-08-22",
  photos: [{
    canonicalPhotoId: "photo-front",
    orientation: "front",
    contractionState: "relaxed",
    poseVariant: "standard",
    sourceHashes: ["hash-front"],
    status: "active",
    identityStatus: "confirmed",
    userConfirmedIdentity: true,
  }],
  ...overrides,
});

describe("canonical Photo Session identity", () => {
  it("uses owner and capture date for the session while retaining stored photo IDs", () => {
    expect(getStablePhotoSessionId({ userId: "owner", captureDate: "2026-08-22T18:00:00Z" }))
      .toBe("photo_session_owner_2026-08-22");
    expect(createPhotoSessionSemanticFingerprint(payload({ photos: [...payload().photos].reverse() })))
      .toBe(createPhotoSessionSemanticFingerprint(payload()));
  });

  it("preserves Goal/Phase attribution and one revision of corrected session history", () => {
    const sourceObject = {
      goalId: "goal",
      phaseId: "phase",
      goalPhaseAttribution: { goalId: "goal", phaseId: "phase", source: "legacy_effective_date_fallback" },
      provenance: { evidence_package_ids: ["package-1"] },
    };
    const first = createCanonicalPhotoSessionRecord({
      canonicalId: payload().sessionId,
      payload: payload(),
      sourceObject,
      now: "2026-08-22T12:00:00.000Z",
      userId: "owner",
    });
    const correction = createCanonicalPhotoSessionRecord({
      canonicalId: payload().sessionId,
      payload: payload({ photos: [{ ...payload().photos[0], sourceHashes: ["hash-corrected"] }] }),
      existingObject: first,
      sourceObject: { ...sourceObject, provenance: { evidence_package_ids: ["package-2"] } },
      now: "2026-08-23T12:00:00.000Z",
      userId: "owner",
    });
    expect(correction).toMatchObject({
      goalId: "goal",
      phaseId: "phase",
      photoSessionRevision: { revision: 2 },
      provenance: { evidence_package_ids: ["package-1", "package-2"] },
    });
    expect(correction.photoSessionRevisionHistory).toHaveLength(1);
  });

  it("fails closed diagnostically when two active session lineages share one owner/date", () => {
    const record = (canonicalId) => ({
      canonicalId,
      evidence_type: "photo_session",
      payload: payload({ sessionId: canonicalId }),
      quality: { status: "active" },
      userId: "owner",
    });
    expect(selectActiveCanonicalPhotoSessions([
      record("legacy-session"),
      record("another-session"),
    ], { userId: "owner" })).toMatchObject({
      diagnostics: [{
        code: "PHOTO_SESSION_ACTIVE_DUPLICATE",
        canonicalIds: ["another-session", "legacy-session"],
      }],
      records: [expect.any(Object)],
    });
  });
});

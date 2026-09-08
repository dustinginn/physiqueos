import { describe, expect, it } from "vitest";
import {
  NATIVE_FOUNDER_PHOTO_ACCEPTANCE_SCHEMA_VERSION,
  readNativeFounderPhotoAcceptanceConfig,
} from "./NativeFounderPhotoAcceptanceConfig.js";

const MEDIA_ONE = "0193e5b5-2fd0-7d6a-8f2c-411d8e8d28a1";
const MEDIA_TWO = "0193e5b5-2fd0-7d6a-8f2c-411d8e8d28a2";

function environment(overrides = {}) {
  return {
    PHYSIQUEOS_NATIVE_FOUNDER_PHOTO_ACCEPTANCE_ENABLED: "1",
    PHYSIQUEOS_CANONICAL_OWNER_USER_ID: "user_founder_001",
    PHYSIQUEOS_NATIVE_SANDBOX_OWNER_USER_ID: "user_native_sandbox_founder_acceptance",
    PHYSIQUEOS_NATIVE_FOUNDER_PHOTO_ACCEPTANCE_ALLOWLIST: JSON.stringify({
      schemaVersion: NATIVE_FOUNDER_PHOTO_ACCEPTANCE_SCHEMA_VERSION,
      sessions: [{
        photoSessionId: "photo-session-one",
        photos: [
          { photoId: "photo-one", mediaId: MEDIA_ONE, poseId: "front-relaxed", captureDate: "2026-05-24" },
          { photoId: "photo-two", mediaId: MEDIA_TWO, poseId: "back-relaxed", captureDate: "2026-05-24" },
        ],
      }],
    }),
    ...overrides,
  };
}

describe("Native Founder photo acceptance configuration", () => {
  it("is disabled unless the bridge is explicitly enabled", () => {
    expect(readNativeFounderPhotoAcceptanceConfig({})).toEqual({ enabled: false });
  });

  it("accepts a bounded, typed allowlist while preserving distinct authorities", () => {
    const result = readNativeFounderPhotoAcceptanceConfig(environment());
    expect(result).toMatchObject({
      enabled: true,
      founderOwnerUserId: "user_founder_001",
      sandboxOwnerUserId: "user_native_sandbox_founder_acceptance",
    });
    expect(result.sessions[0].photos).toHaveLength(2);
    expect(result.sessions[0].photos[0]).toEqual({
      photoId: "photo-one",
      mediaId: MEDIA_ONE,
      poseId: "front-relaxed",
      captureDate: "2026-05-24",
    });
  });

  it.each([
    ["same authority", { PHYSIQUEOS_NATIVE_SANDBOX_OWNER_USER_ID: "user_founder_001" }],
    ["malformed JSON", { PHYSIQUEOS_NATIVE_FOUNDER_PHOTO_ACCEPTANCE_ALLOWLIST: "{" }],
    ["missing allowlist", { PHYSIQUEOS_NATIVE_FOUNDER_PHOTO_ACCEPTANCE_ALLOWLIST: "" }],
  ])("fails closed for %s", (_label, overrides) => {
    expect(() => readNativeFounderPhotoAcceptanceConfig(environment(overrides)))
      .toThrow(/photo|authority|allowlist|JSON/i);
  });

  it("rejects path traversal, unknown poses, duplicate IDs, and oversized enumeration", () => {
    const base = JSON.parse(environment().PHYSIQUEOS_NATIVE_FOUNDER_PHOTO_ACCEPTANCE_ALLOWLIST);
    const invalidDocuments = [
      { ...base, sessions: [{ ...base.sessions[0], photoSessionId: "../outside" }] },
      { ...base, sessions: [{ ...base.sessions[0], photos: [{ ...base.sessions[0].photos[0], poseId: "unknown" }] }] },
      { ...base, sessions: [{ ...base.sessions[0], photos: [base.sessions[0].photos[0], base.sessions[0].photos[0]] }] },
      { ...base, sessions: Array.from({ length: 5 }, (_, index) => ({
        photoSessionId: `photo-session-${index}`,
        photos: [{ ...base.sessions[0].photos[0], photoId: `photo-${index}`, mediaId: `0193e5b5-2fd0-7d6a-8f2c-411d8e8d28b${index}` }],
      })) },
    ];
    for (const document of invalidDocuments) {
      expect(() => readNativeFounderPhotoAcceptanceConfig(environment({
        PHYSIQUEOS_NATIVE_FOUNDER_PHOTO_ACCEPTANCE_ALLOWLIST: JSON.stringify(document),
      }))).toThrow();
    }
  });
});

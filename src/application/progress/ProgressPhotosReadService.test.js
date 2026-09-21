import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createSeedRepositories } from "../../data/repositories/createSeedRepositories.js";
import { getPhotosTimelineReport } from "../../domain/services/PhotosEvidenceContextService.js";
import { createPhase5SyntheticRuntime } from "../../platform/migration/phase5SyntheticPackage.js";
import { createRepositoryProgressPhotosReadStore } from "../../platform/database/PostgresProgressPhotosReadStore.js";
import { createProgressPhotosReadService } from "./ProgressPhotosReadService.js";

describe("provider-native Progress Photos reads", () => {
  it("preserves the legacy report and timeline presentation from narrow inputs", async () => {
    const runtime = createPhase5SyntheticRuntime();
    const narrowRepositories = createSeedRepositories(structuredClone(runtime), { allowStagedMutations: false });
    const legacyRepositories = createSeedRepositories(structuredClone(runtime), { allowStagedMutations: false });
    const options = { context: "all", currentDate: new Date("2026-08-30T12:00:00Z") };
    const narrow = await createProgressPhotosReadService({
      store: createRepositoryProgressPhotosReadStore({ repositories: narrowRepositories }),
    }).getPhotosTimeline(options);
    const legacy = await getPhotosTimelineReport({ ...options, repositories: legacyRepositories });
    expect(narrow).toEqual(legacy);
  });

  it("uses each narrow source once", async () => {
    const store = {
      run: vi.fn((_name, callback) => callback()),
      getUser: vi.fn(async () => ({ id: "u", timezone: "America/Los_Angeles" })),
      listGoals: vi.fn(async () => []),
      listWeightEntries: vi.fn(async () => []),
      getPhotoInputs: vi.fn(async () => ({ canonicalEvidenceObjects: [], progressPhotos: [] })),
      listPhotoAnalyses: vi.fn(async () => []),
      listPhotoBriefings: vi.fn(async () => []),
      listMediaObjects: vi.fn(async () => []),
    };
    await createProgressPhotosReadService({ store }).getPhotosTimeline({ context: "all" });
    expect(store.run).toHaveBeenCalledWith("progress.photos", expect.any(Function));
    expect(store.getPhotoInputs).toHaveBeenCalledOnce();
    expect(store.listMediaObjects).toHaveBeenCalledOnce();
    expect(store.listMediaObjects).toHaveBeenCalledWith({
      objectIds: [], normalizedPaths: [], basenames: [], sourceHashes: [], sourceIds: [],
    });
  });

  it("uses canonical same-pose comparison logic for the bounded Native projection", async () => {
    const currentMedia = "media-1fadfe2c43970a9c6268b3b9f3ef4c3f-62a670131e57";
    const priorMedia = "media-2fadfe2c43970a9c6268b3b9f3ef4c3f-62a670131e58";
    const canonical = [
      photoSession("session-current", "2026-07-11", "photo-current", currentMedia, 4),
      photoSession("session-prior", "2026-07-03", "photo-prior", priorMedia, 2),
    ];
    const store = {
      run: vi.fn((_name, callback) => callback()),
      getUser: vi.fn(async () => ({ id: "u", timezone: "America/Los_Angeles" })),
      listGoals: vi.fn(async () => []),
      listWeightEntries: vi.fn(async () => []),
      getPhotoInputs: vi.fn(async () => ({ canonicalEvidenceObjects: canonical, progressPhotos: [] })),
      listPhotoAnalyses: vi.fn(async () => []),
      listPhotoBriefings: vi.fn(async () => []),
      listMediaObjects: vi.fn(async () => [
        { id: currentMedia, state: "verified", evidence_record_id: "photo-current" },
        { id: priorMedia, state: "verified", evidence_record_id: "photo-prior" },
      ]),
    };
    const result = await createProgressPhotosReadService({ store })
      .getNativePhotosTimeline({ context: "all", limit: 1 });
    expect(result).toMatchObject({
      sessions: [{
        sessionId: "session-current", revision: 4, intendedCaptureDate: "2026-07-11",
        goalId: "goal-1", phaseId: "phase-1",
        photos: [{
          photoId: "photo-current", poseId: "front-relaxed", comparisonStatus: "comparable",
          mediaReference: `/api/private-evidence/media/${currentMedia}`,
          prior: {
            sessionId: "session-prior", photoId: "photo-prior",
            intendedCaptureDate: "2026-07-03",
            mediaReference: `/api/private-evidence/media/${priorMedia}`,
          },
        }],
      }],
      page: { limit: 1, count: 1, hasMore: true },
    });
  });

  it("projects the canonical DNG session, not a duplicate legacy session, as the Native latest set", async () => {
    const original = "media-3fadfe2c43970a9c6268b3b9f3ef4c3f-62a670131e59";
    const derivative = "media-4fadfe2c43970a9c6268b3b9f3ef4c3f-62a670131e5a";
    const canonical = photoSession("photo_session_user_founder_001_2026-09-19", "2026-09-19", "photo-dng", original, 1);
    Object.assign(canonical.payload.photos[0], {
      mime_type: "image/x-adobe-dng",
      analysis_mime_type: "image/jpeg",
      analysis_storage_path: `media://${derivative}`,
    });
    // The evidence-review confirmation projection stores the ORIGINAL as the legacy imagePath.
    const legacyOnOriginal = { id: "progress_photo_2026-09-19_front_relaxed", date: "2026-09-19", capturedAt: "2026-09-19", view: "front", pose: "relaxed", imagePath: `media://${original}` };
    const store = {
      run: vi.fn((_name, callback) => callback()),
      getUser: vi.fn(async () => ({ id: "u", timezone: "America/Los_Angeles" })),
      listGoals: vi.fn(async () => []),
      listWeightEntries: vi.fn(async () => []),
      getPhotoInputs: vi.fn(async () => ({ canonicalEvidenceObjects: [canonical], progressPhotos: [legacyOnOriginal] })),
      listPhotoAnalyses: vi.fn(async () => []),
      listPhotoBriefings: vi.fn(async () => []),
      listMediaObjects: vi.fn(async () => [
        { id: original, state: "verified", evidence_record_id: "photo-dng" },
        { id: derivative, state: "verified", evidence_record_id: "photo-dng" },
      ]),
    };
    const result = await createProgressPhotosReadService({ store })
      .getNativePhotosTimeline({ context: "all", limit: 5 });
    expect(result.sessions.map((session) => session.sessionId)).toEqual(["photo_session_user_founder_001_2026-09-19"]);
    expect(result.sessions[0].photos).toHaveLength(1);
    expect(result.sessions[0].photos[0].mediaReference).toBe(`/api/private-evidence/media/${derivative}`);
    expect(result.page).toMatchObject({ count: 1, hasMore: false });
  });

  it("removes compatibility runtime composition from the route", () => {
    const route = fs.readFileSync("src/app/progress/photos/page.js", "utf8");
    expect(route).toContain("getProductionProgressPhotosReadService");
    expect(route).not.toMatch(/getPhotosTimelineReport|FounderRepositories|loadCanonicalRuntime/);
  });
});

function photoSession(canonicalId, captureDate, canonicalPhotoId, mediaId, version) {
  return {
    canonicalId,
    evidence_type: "photo_session",
    goalId: "goal-1",
    phaseId: "phase-1",
    version,
    lastObservedAt: captureDate,
    quality: { status: "active" },
    payload: {
      evidence_type: "photo_session",
      sessionId: canonicalId,
      captureDate,
      completionState: "complete",
      photos: [{
        canonicalPhotoId,
        view: "front",
        pose: "relaxed",
        status: "active",
        storage_path: `media://${mediaId}`,
      }],
    },
  };
}

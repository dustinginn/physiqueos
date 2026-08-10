import { describe, expect, it, vi } from "vitest";
import { createPhotoEventReinterpretationService } from "./PhotoEventReinterpretationService";

describe("Photo Event reinterpretation lifecycle", () => {
  it("inspects the accepted canonical session without writing", async () => {
    const fixture = repositories();
    const service = createPhotoEventReinterpretationService({ repositories: fixture.repositories });
    await expect(service.inspect({ userId: "user", sessionId: "photo_session_user_2026-08-08" }))
      .resolves.toMatchObject({ status: "ready", eventDate: "2026-08-08", poseIds: ["front-relaxed"], existingArtifactId: "event_briefing_progress_photo_photo_session_user_2026-08-08" });
    expect(fixture.createAnalysis).not.toHaveBeenCalled();
  });

  it("finishes every vision call before writing and aborts on provider fallback", async () => {
    const fixture = repositories();
    const service = createPhotoEventReinterpretationService({
      repositories: fixture.repositories,
      interpret: vi.fn(async () => ({ provider: "fallback", warning: "unavailable" })),
      readImage: vi.fn(async () => "data:image/jpeg;base64,test"),
    });
    await expect(service.regenerate({ userId: "user", sessionId: "photo_session_user_2026-08-08", reason: "test", replacementAuthorized: true }))
      .rejects.toThrow(/did not complete/);
    expect(fixture.createAnalysis).not.toHaveBeenCalled();
  });

  it("rejects an empty pose read before any replacement write", async () => {
    const fixture = repositories();
    const service = createPhotoEventReinterpretationService({
      repositories: fixture.repositories,
      interpret: vi.fn(async () => ({ provider: "openai", interpretation: { user_facing_summary: "No pose read.", structured_observations: [] } })),
      readImage: vi.fn(async () => "data:image/jpeg;base64,test"),
    });
    await expect(service.regenerate({ userId: "user", sessionId: "photo_session_user_2026-08-08", reason: "test", replacementAuthorized: true }))
      .rejects.toThrow(/structured front-relaxed read/);
    expect(fixture.createAnalysis).not.toHaveBeenCalled();
  });

  it("replaces per-view analysis, synthesizes, and explicitly regenerates the Event", async () => {
    const fixture = repositories();
    const regenerate = vi.fn(async () => ({ status: "completed", artifactId: "event", artifact: { id: "event" } }));
    const service = createPhotoEventReinterpretationService({
      repositories: fixture.repositories,
      interpret: vi.fn(async () => ({
        provider: "openai",
        interpretation: {
          user_facing_summary: "No meaningful visible difference is apparent.",
          structured_observations: [{
            region: "Overall physique", metric: "visual_stability", direction: "stable", magnitude: "none",
            change: "No meaningful visible difference is apparent.", confidence: "moderate", limitations: [],
          }],
        },
      })),
      readImage: vi.fn(async () => "data:image/jpeg;base64,test"),
      photoEventService: { regenerate },
      now: () => new Date("2026-08-10T20:00:00Z"),
    });
    const result = await service.regenerate({ userId: "user", sessionId: "photo_session_user_2026-08-08", reason: "Photo Event V2", replacementAuthorized: true });
    expect(result).toMatchObject({ status: "completed", eventDate: "2026-08-08", artifactId: "event" });
    expect(fixture.createAnalysis).toHaveBeenCalledTimes(2);
    expect(regenerate).toHaveBeenCalledWith(expect.objectContaining({ replacementAuthorized: true, reason: "Photo Event V2" }));
    expect(result.poseReads[0].observations[0]).toMatchObject({ magnitude: "none", direction: "stable" });
  });
});

function repositories() {
  const createAnalysis = vi.fn(async (analysis) => analysis);
  const canonicalObjects = [
    {
      canonicalId: "photo_session_user_2026-07-25", evidence_type: "photo_session", lastObservedAt: "2026-07-25", quality: { status: "active" },
      payload: {
        sessionId: "photo_session_user_2026-07-25", captureDate: "2026-07-25", completionState: "complete", conditions: {},
        photos: [{ canonicalPhotoId: "canonical_prior_front", storage_path: "private/founder/photos/prior.jpeg", sourceIds: ["prior"], sourceOrder: 0, status: "active", view: "front", pose: "relaxed" }],
      },
    },
    {
      canonicalId: "photo_session_user_2026-08-08", evidence_type: "photo_session", lastObservedAt: "2026-08-08", quality: { status: "active" },
      payload: {
        sessionId: "photo_session_user_2026-08-08", captureDate: "2026-08-08", completionState: "complete", conditions: {},
        photos: [{ canonicalPhotoId: "canonical_current_front", storage_path: "private/founder/photos/current.jpeg", sourceIds: ["current"], sourceOrder: 0, status: "active", view: "front", pose: "relaxed" }],
      },
    },
  ];
  const artifact = { id: "event_briefing_progress_photo_photo_session_user_2026-08-08", generatedAt: "2026-08-09T00:00:00Z" };
  return {
    createAnalysis,
    repositories: {
      canonicalEvidence: { listCanonicalEvidenceObjects: async () => canonicalObjects },
      progressPhotos: { listPhotos: async () => [] },
      weights: { listWeightEntries: async () => [] },
      analyses: { listAnalyses: async () => [], createAnalysis },
      dailyBriefings: { listDailyBriefings: async () => [artifact] },
      goals: { getActiveGoal: async () => ({ id: "goal", title: "Build Lean Mass", status: "active" }), listGoals: async () => [] },
      executionItems: { listExecutionItems: async () => [] },
      dexaScans: { listDEXAScans: async () => [] },
    },
  };
}

import { describe, expect, it, vi } from "vitest";
import { createCompletedGoalReadService } from "./CompletedGoalReadService.js";

const mediaId = "media-c324bb746c3aca53584a2ab3f21fbc1d-29830c5f8d06";

describe("CompletedGoalReadService", () => {
  it("composes the completed Visible Abs keepsake from bounded provider inputs", async () => {
    const store = { load: vi.fn(async () => ({
      goals: [
        { id: "goal_visible_abs_at_rest", title: "Visible abs at rest", status: "completed", startDate: "2026-05-24" },
        { id: "goal-build", title: "Build Lean Mass", status: "active", primary: true },
      ],
      currentGoal: { id: "goal-build", title: "Build Lean Mass", status: "active", primary: true },
      dexaScans: [
        { id: "baseline", measuredAt: "2026-05-24", bodyFatPercentage: 13.6, leanMass: { value: 149.1 }, fatMass: { value: 24.7 }, totalMass: { value: 180.9 } },
        { id: "final", measuredAt: "2026-07-18", bodyFatPercentage: 7.7, leanMass: { value: 147.5 }, fatMass: { value: 12.8 }, totalMass: { value: 167.4 } },
      ],
      progressPhotos: [{ id: "first", date: "2026-05-21", imagePath: "private/founder/photos/first.jpeg", view: "front", pose: "relaxed", relatedGoalIds: ["goal_visible_abs_at_rest"] }],
      briefings: [{ id: "completion", briefing: { photoEventNarrative: { eventDate: "2026-07-18", goalCompletionHandoff: { goalId: "goal_visible_abs_at_rest", qualifiedViewId: "final-photo" }, completionExperience: { journeyComparison: { final: { id: "final-photo", poseId: "front-relaxed", captureDate: "2026-07-18", imageHref: "private/founder/photos/final.jpeg" } } } } } }],
      mediaObjects: [
        { id: mediaId, evidence_record_id: "first", original_filename: "first.jpeg", provenance: { sourceRelativePath: "photos/first.jpeg" }, state: "verified" },
        { id: "media-9d63ef950fbe33bb008dbad5f3d693e5-4756132cce7d", evidence_record_id: "final-photo", original_filename: "final.jpeg", provenance: { sourceRelativePath: "photos/final.jpeg" }, state: "verified" },
      ],
    })) };

    const result = await createCompletedGoalReadService({ store }).getVisibleAbs();

    expect(store.load).toHaveBeenCalledOnce();
    expect(result.hero).toMatchObject({ title: "Visible Abs at Rest", status: "Completed", achievement: "7.7% Body Fat" });
    expect(result.photos.beginning.href).toBe(`/api/private-evidence/media/${mediaId}`);
    expect(result.photos.completion.href).toBe("/api/private-evidence/media/media-9d63ef950fbe33bb008dbad5f3d693e5-4756132cce7d");
    expect(result.unlocked.title).toBe("Build Lean Mass");
  });
});

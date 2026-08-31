import { describe, expect, it } from "vitest";
import { composeCompletedGoalPreview, resolveCompletedGoalPhoto } from "./CompletedGoalPreviewService";

const goals = [
  { id: "goal_visible_abs_at_rest", title: "Visible abs at rest", status: "completed", startDate: "2026-05-24" },
  { id: "goal_preserve_lean_mass", title: "Preserve lean mass", status: "active" },
  { id: "goal_maintain_8_9_body_fat", title: "Maintain 8-9% body fat", status: "active" },
];
const dexaScans = [
  { id: "baseline", measuredAt: "2026-05-24", bodyFatPercentage: 13.6, leanMass: { value: 149.1 }, fatMass: { value: 24.7 }, totalMass: { value: 180.9 } },
  { id: "final", measuredAt: "2026-07-18", bodyFatPercentage: 7.7, leanMass: { value: 147.5 }, fatMass: { value: 12.8 }, totalMass: { value: 167.4 } },
];
const progressPhotos = [
  { id: "first", date: "2026-05-21", imagePath: "private/founder/photos/first.jpeg", view: "front", pose: "relaxed", relatedGoalIds: ["goal_visible_abs_at_rest"] },
  { id: "july-11", date: "2026-07-11", imagePath: "private/founder/photos/july-11.jpeg", view: "front", pose: "relaxed", relatedGoalIds: ["goal_visible_abs_at_rest"] },
];
const finalEvidenceId = "canonical_photo_user_founder_001_2026-07-18_provisional_photo_20260718224124049_0";
const briefings = [{ id: "event_briefing_progress_photo_photo_session_user_founder_001_2026-07-18", briefing: { photoEventNarrative: {
  eventDate: "2026-07-18",
  goalCompletionHandoff: { goalId: "goal_visible_abs_at_rest", qualifiedViewId: finalEvidenceId },
  completionExperience: { journeyComparison: { final: { id: finalEvidenceId, poseId: "front-relaxed", captureDate: "2026-07-18", imageHref: "/api/private-evidence/founder/photos/final.jpeg" } } },
  cardContent: { progress: { comparisons: [{ id: finalEvidenceId, poseId: "front-relaxed", imageHref: "/api/private-evidence/founder/photos/final.jpeg" }] } },
} } }];

describe("CompletedGoalPreviewService", () => {
  it("composes one read-only Visible Abs keepsake from historical evidence", () => {
    const result = composeCompletedGoalPreview({ goals, dexaScans, progressPhotos, briefings, currentGoal: { id: "build", title: "Build Lean Mass" } });
    expect(result.preview).toEqual({ readOnly: true, canonicalGoalId: "goal_visible_abs_at_rest", supportingGoalIds: ["goal_preserve_lean_mass", "goal_maintain_8_9_body_fat"] });
    expect(result.hero).toMatchObject({ title: "Visible Abs at Rest", status: "Completed", dates: "May 24 → Jul 18", achievement: "7.7% Body Fat" });
    expect(result.photos.beginning.href).toBe("/api/private-evidence/founder/photos/first.jpeg");
    expect(result.photos.completion).toEqual({ date: "2026-07-18", href: "/api/private-evidence/founder/photos/final.jpeg", evidenceId: finalEvidenceId });
    expect(result.photos.completion.href).not.toContain("july-11");
    expect(result.photos.historyHref).toBe("/progress/photos");
    expect(result.finalComposition).toMatchObject({ scanId: "final", bodyFat: "7.7%", leanMass: "147.5 lb", fatMass: "12.8 lb", weight: "167.4 lb", briefingHref: "/briefings/dexa/final" });
    expect(result.unlocked.title).toBe("Build Lean Mass");
  });

  it("represents legacy supporting goals as evidence and does not reinterpret history through the active goal", () => {
    const result = composeCompletedGoalPreview({ goals, dexaScans, progressPhotos, briefings, currentGoal: { id: "build", title: "Build Lean Mass" } });
    expect(result.achievedBy).toEqual(expect.arrayContaining([expect.stringMatching(/Lean mass largely preserved/), expect.stringMatching(/Body fat reduced/)]));
    expect(JSON.stringify({ recap: result.recap, highlights: result.highlights, finalComposition: result.finalComposition, achievedBy: result.achievedBy })).not.toMatch(/Build Lean Mass/);
    expect(goals).toHaveLength(3);
  });

  it("gracefully omits What This Unlocked when there is no subsequent goal", () => {
    const result = composeCompletedGoalPreview({ goals, dexaScans, progressPhotos, briefings, currentGoal: goals[0] });
    expect(result.unlocked).toBeNull();
  });

  it("prefers explicit qualified completion linkage over canonical and repository fallbacks", () => {
    const result = resolveCompletedGoalPhoto({ briefings, goalPhotos: progressPhotos, goalId: "goal_visible_abs_at_rest", completionDate: "2026-07-18" });
    expect(result).toEqual({ date: "2026-07-18", href: "/api/private-evidence/founder/photos/final.jpeg", evidenceId: finalEvidenceId });
  });

  it("uses canonical completion-date pose evidence when explicit journey linkage is absent", () => {
    const canonicalOnly = structuredClone(briefings);
    delete canonicalOnly[0].briefing.photoEventNarrative.completionExperience;
    const result = resolveCompletedGoalPhoto({ briefings: canonicalOnly, goalPhotos: progressPhotos, goalId: "goal_visible_abs_at_rest", completionDate: "2026-07-18" });
    expect(result.evidenceId).toBe(finalEvidenceId);
    expect(result.date).toBe("2026-07-18");
  });

  it("uses an exact-date front-relaxed repository record before a conservative prior-date fallback", () => {
    const exact = { id: "exact", date: "2026-07-18", imagePath: "private/founder/photos/exact.jpeg", view: "front", pose: "relaxed" };
    expect(resolveCompletedGoalPhoto({ goalPhotos: [...progressPhotos, exact], goalId: "goal_visible_abs_at_rest", completionDate: "2026-07-18" }).evidenceId).toBe("exact");
    const fallback = resolveCompletedGoalPhoto({ goalPhotos: progressPhotos, goalId: "goal_visible_abs_at_rest", completionDate: "2026-07-18" });
    expect(fallback).toEqual({ date: "2026-07-11", href: "/api/private-evidence/founder/photos/july-11.jpeg", evidenceId: "july-11" });
  });

  it("routes migrated canonical media references without exposing provider keys", () => {
    const objectId = "media-a3a031ce26f383ba894e2bed8caff41b-b160b460356d";
    const result = resolveCompletedGoalPhoto({
      goalPhotos: [{ id: "exact", date: "2026-07-18", imagePath: `media://${objectId}`, view: "front", pose: "relaxed" }],
      goalId: "goal_visible_abs_at_rest",
      completionDate: "2026-07-18",
    });
    expect(result.href).toBe(`/api/private-evidence/media/${objectId}`);
    expect(result.href).not.toContain("private/");
  });
});

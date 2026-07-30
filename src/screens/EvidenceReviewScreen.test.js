import fs from "node:fs";
import { describe, expect, it } from "vitest";

const screen = fs.readFileSync(new URL("./EvidenceReviewScreen.jsx", import.meta.url), "utf8");
const page = fs.readFileSync(
  new URL("../app/evidence/review/[reviewId]/page.js", import.meta.url),
  "utf8"
);
const actions = fs.readFileSync(
  new URL("../app/evidence/review/[reviewId]/actions.js", import.meta.url),
  "utf8"
);

describe("EvidenceReviewScreen selection interaction", () => {
  it("uses viewer-facing save terminology throughout the review controls", () => {
    expect(screen).toContain("Exclude from log");
    expect(screen).toContain("Include in log");
    expect(screen).toContain("Save included evidence");
    expect(screen).toContain("Select at least one item to continue.");
    expect(screen).not.toMatch(/check-in|Execute from check-in|Logging evidence/i);
  });

  it("uses the persisted pending review as the confirmation surface and real action pending state for Saving", () => {
    expect(screen).toContain("Does this look right?");
    expect(screen).toContain("experience.reviewingBody");
    expect(screen).toContain("experience.reviewingTitle");
    expect(screen).toContain("createEvidenceExperiencePresentation(review)");
    expect(screen).toContain("useFormStatus()");
    expect(screen).toContain("savingLabel");
    expect(screen).not.toMatch(/setTimeout|Personal Best|Protein Target Reached|Volume record/);
  });

  it("shows quiet success only for a confirmed review and continues through the existing Log destination", () => {
    expect(screen).toContain('status === "confirmed"');
    expect(screen).toContain("<EvidenceSavedScreen");
    expect(screen).toContain("createEvidenceSuccessNavigation");
    expect(screen).toContain("window.location.assign(destination)");
    expect(screen).toContain('type="button">Continue</button>');
    expect(screen).not.toMatch(/router\.refresh|router\.push|href="\/log\?saved=1"/);
    expect(screen).toContain("Continue");
  });

  it("extends the existing saved screen with the persisted Training achievement receipt", () => {
    expect(screen).toContain("createTrainingPerformanceSuccessPresentation(review)");
    expect(screen).toContain("trainingAchievements.items.map");
    expect(screen).toContain("trainingAchievements.heading");
    expect(screen).toContain("trainingAchievements.summary");
    expect(screen).toContain("<EvidenceSavedScreen");
    expect(screen).not.toMatch(/existingEvents|TrainingPerformanceIntelligenceService|canonicalEvidence/);
  });

  it("removes Original details from every shared review card while preserving useful interpreted content", () => {
    expect(screen).not.toContain("Original details");
    expect(screen).not.toContain("item.sourceFiles");
    expect(screen).not.toContain("item.typedEvidence");
    expect(screen).toContain("item.metrics.length");
    expect(screen).toContain("item.meals?.length");
    expect(screen).toContain("meal.foods.map");
    expect(screen).toContain("item.included");
    expect(screen).toContain("item.date");
  });

  it("keeps every card rendered while toggling local inclusion state", () => {
    expect(screen).toContain("presentation.items.map");
    expect(screen).toContain("toggleEvidenceReviewItemDecision");
    expect(screen).toContain('type="button"');
    expect(screen).not.toContain("decisionAction");
    expect(page).not.toContain("updateEvidenceReviewItemDecision");
  });

  it("updates the live count and disables final logging when nothing is included", () => {
    expect(screen).toContain("presentation.summary.included");
    expect(screen).toContain("presentation.summary.excluded");
    expect(screen).toContain("!presentation.summary.included || blockingPhotoIssue");
  });

  it("renders secure refresh-safe previews and independent canonical pose controls", () => {
    expect(screen).toContain("Match each photo to its pose");
    expect(screen).toContain("CanonicalProgressPhotoCategories.map");
    expect(screen).toContain('name="sourceArtifactRef"');
    expect(screen).toContain('name="expectedUpdatedAt"');
    expect(screen).toContain("data-artifact-id");
    expect(screen).toContain('replace(/^private[\\\\/]/i, "")');
    expect(screen).not.toContain('replace(/^private[\\\\/]founder[\\\\/]/');
    expect(screen).toContain("object-contain");
    expect(screen).toContain("Choose a pose for every included photo before saving.");
    expect(page).toContain("updateEvidenceReviewPhotoPose");
    expect(actions).toContain("mergeAuthoritativePhotoSessions");
    expect(actions).toContain("assertIncludedPhotoSessionsReady");
  });

  it("offers a bounded continuation after a partial commit without upload or edit controls", () => {
    expect(screen).toContain('const canContinue = status === "partially_committed"');
    expect(screen).toContain("Your ${experience.noun} is saved");
    expect(screen).toContain("Finish saving");
    expect(screen).toContain("without re-uploading or repeating completed work");
  });

  it("submits local decisions only with final confirmation", () => {
    expect(screen).toContain('name="itemDecisionsJson"');
    expect(actions).toContain('formData.get("itemDecisionsJson")');
    expect(actions).toContain("applyPersistedItemDecisions(evidencePackage, submittedItemDecisions)");
    expect(screen).not.toMatch(/revalidatePath|createEvidenceReviewService/);
  });

  it("preserves save-for-later, discard, and reprocessing controls", () => {
    expect(screen).toContain("Save and return later");
    expect(screen).toContain("Discard review");
    expect(screen).toContain("Read upload again");
  });

  it("keeps the discard confirmation human and free of storage details", () => {
    expect(screen).toContain("Discard this review?");
    expect(screen).toContain("This review will not be added to your history.");
    expect(screen).toContain("you will need to start a new upload.");
    expect(screen).not.toMatch(/evidence-retention|uploaded files may remain|storage implementation|backend retention/i);
  });
});

describe("EvidenceReviewScreen new exercise gate", () => {
  it("keeps resolution inline and disables final save until it is complete", () => {
    expect(screen).toContain("New exercise detected");
    expect(screen).toContain("Add new");
    expect(screen).toContain("Map existing");
    expect(screen).toContain("Remove from workout");
    expect(screen).toContain("Canonical exercise name");
    expect(screen).toContain("unresolvedExercises.length > 0");
    expect(screen).toContain("Resolve ${unresolvedCount} new exercise");
  });
});

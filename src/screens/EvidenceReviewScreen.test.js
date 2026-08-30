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
    expect(screen).not.toMatch(/Execute from check-in|Logging evidence/i);
    expect(screen).toContain("Back to Morning Check-In");
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

  it("shows quiet success for durable canonical save and continues through the existing Log destination", () => {
    expect(screen).toContain('status === "confirmed"');
    expect(screen).toContain("isEvidenceReviewCanonicalSaveComplete(review)");
    expect(screen).toContain("<EvidenceSavedScreen");
    expect(screen).toContain("Evidence saved");
    expect(screen).toContain("Your evidence has been added. PhysiqueOS is finishing updates in the background.");
    expect(screen).toContain("Some follow-up processing still needs attention.");
    expect(screen).toContain("createEvidenceSuccessNavigation");
    expect(screen).toContain("window.location.assign(destination)");
    expect(screen).toContain('processing ? "Back to Log" : "Continue"');
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

  it("reviews shared photo metadata once at the session level", () => {
    expect(screen).toContain("Shared session details");
    expect(screen).toContain("These values apply once to every photo in this capture session.");
    expect(screen).toContain('name="timeOfDay"');
    expect(screen).toContain('name="goalId"');
    expect(screen).toContain("Inferred from image metadata");
    expect(screen).toContain("blockingPhotoSessionMetadata");
    expect(page).toContain("updateEvidenceReviewPhotoSessionMetadata");
    expect(actions).toContain("setPhotoSessionMetadata");
  });

  it("locks every photo review control while one edit is pending and refreshes stale edits", () => {
    expect(screen).toContain("const [photoEditPending, setPhotoEditPending] = useState(false)");
    expect(screen).toContain("const photoEditPendingRef = useRef(false)");
    expect(screen).toContain("if (!action || photoEditPendingRef.current) return");
    expect(screen).toContain("submitPhotoEdit(photoPoseAction, formData)");
    expect(screen).toContain("submitPhotoEdit(photoSessionMetadataAction, formData)");
    expect(screen).toContain("photoEditPending={photoEditPending}");
    expect(screen).toContain("disabled={!canEdit || !action || pending}");
    expect(screen).toContain('aria-busy={pending}');
    expect(screen).toContain("Photo update in progress\\u2026");
    expect(screen).toContain("Your saved selections are intact, and the current review has been refreshed.");
    expect(actions).toContain('error?.code === "REVIEW_STALE"');
    expect(actions).toContain('?photo=stale');
  });

  it("loads the review through the narrow provider read model", () => {
    expect(page).toContain("getProductionEvidenceReviewReadService().getReview(reviewId)");
    expect(page).not.toContain("FounderRepositories.withReadScope");
    expect(page).not.toContain("listCanonicalEvidenceObjects");
    expect(page).not.toContain("getEvidencePackageById");
  });

  it("keeps pre-save failure copy distinct from durable post-save success", () => {
    expect(screen).toContain("const canContinue = hasCommitFailure(review)");
    expect(screen).toContain("Evidence was not saved");
    expect(screen).toContain('retry ? "Continue"');
    expect(screen).toContain("PhysiqueOS couldn’t complete the save.");
    expect(screen).toContain("Some follow-up processing still needs attention.");
  });

  it("auto-continues once per durable checkpoint and shows pending feedback", () => {
    expect(screen).toContain("createEvidenceReviewContinuationKey(review)");
    expect(screen).toContain("submitEvidenceReviewContinuation({");
    expect(screen).toContain("[continuationKey]");
    expect(screen).not.toContain("const submittedRef = useRef(false)");
    expect(screen).toContain("function EvidenceContinuationButton()");
    expect(screen).toContain('disabled={pending}');
    expect(screen).toContain('pending ? "Continuing\\u2026" : "Continue saving"');
  });

  it("does not present continuation controls after canonical save", () => {
    expect(screen).toContain("if (canonicalSaved)");
    expect(screen.indexOf("if (canonicalSaved)")).toBeLessThan(screen.indexOf("<EvidenceCommitRecoveryForm"));
    expect(screen).toContain("processingNeedsAttention");
  });

  it("submits local decisions only with final confirmation", () => {
    expect(screen).toContain('name="itemDecisionsJson"');
    expect(actions).toContain('formData.get("itemDecisionsJson")');
    expect(actions).toContain("applyPersistedItemDecisions(evidencePackage, submittedItemDecisions)");
    expect(screen).not.toMatch(/revalidatePath|createEvidenceReviewService/);
  });

  it("presents a bounded same-date Nutrition replacement decision", () => {
    expect(page).toContain("prepareNutritionEvidencePackageForReview");
    expect(screen).toContain("Update this Nutrition Day");
    expect(screen).toContain("Replace existing");
    expect(screen).toContain("Add as a distinct meal");
    expect(screen).toContain("blockingNutrition");
    expect(actions).toContain("mergeAuthoritativeNutritionDays");
    expect(actions).toContain("sourceReviewId: reviewId");
  });

  it("presents meal replacement against the projected whole-day total", () => {
    expect(screen).toContain("relationship.projectedPreview ?? incoming");
    expect(screen).toContain("Projected daily total:");
    expect(screen).toContain("will remain unchanged.");
    expect(screen).toContain("formatMealList(unchangedMeals)");
    expect(screen).not.toContain(">Daily total:");
  });

  it("reserves Nutrition conflict copy for the true duplicate-active invariant", () => {
    expect(screen).toContain('dispositionStatus !== "already_committed"');
    expect(screen).toContain('status === "blocked_duplicate_active_days"');
    expect(screen).toContain("Saving is paused because this date has conflicting active Nutrition records.");
    expect(screen).toContain("This Nutrition Day is ready to save with the selected update.");
    expect(screen).not.toMatch(/status === "already_committed"[\s\S]{0,400}conflicting active Nutrition records/);
  });

  it("preserves save-for-later, discard, and reprocessing controls", () => {
    expect(screen).toContain("Save and return later");
    expect(screen).toContain("Discard review");
    expect(screen).toContain("Read upload again");
    expect(screen).toContain("reprocessEligibility.eligible");
    expect(page).toContain("resolveEvidenceReviewReprocessEligibility");
  });

  it("shows explicit updated, current, and failed outcomes after a re-read", () => {
    expect(page).toContain('query?.reprocess');
    expect(page).toContain('reprocessOutcome={reprocessOutcome}');
    expect(screen).toContain('reprocessOutcome === "updated"');
    expect(screen).toContain("Review updated from the original evidence.");
    expect(screen).toContain('reprocessOutcome === "current"');
    expect(screen).toContain("No newer interpretation is available.");
    expect(screen).toContain('reprocessOutcome === "failed"');
    expect(screen).toContain("Re-read failed. Your previous review is still intact.");
    expect(screen).toContain('aria-live="polite"');
    expect(screen).toContain('aria-live="assertive"');
  });

  it("edits DEXA extraction in Evidence Review and blocks invalid canonicalization", () => {
    expect(screen).toContain("Review PDF measurements");
    expect(screen).toContain('name="measuredAt"');
    expect(screen).toContain('name="totalMass"');
    expect(screen).toContain('name="bodyFatPercentage"');
    expect(screen).toContain('name="fatMass"');
    expect(screen).toContain('name="leanMass"');
    expect(screen).toContain('name="boneMineralContent"');
    expect(screen).toContain('name="restingMetabolicRate"');
    expect(screen).toContain('name="vatMass"');
    expect(screen).toContain('name="vatVolume"');
    expect(screen).toContain("blockingDexaIssues");
    expect(page).toContain("updateEvidenceReviewDexaMeasurements");
    expect(actions).toContain("mergeAuthoritativeDexaScans");
  });

  it("renders Superset review as one editable structure without exposing internal ids", () => {
    expect(screen).toContain("Superset needs review");
    expect(screen).toContain("Save Superset");
    expect(screen).toContain("Remove Superset");
    expect(screen).toContain('name="memberExerciseId"');
    expect(screen).toContain("blockingStructuralIssues");
    expect(page).toContain("exerciseRelationshipAction");
    expect(actions).toContain("updateTrainingExerciseRelationship");
    expect(screen).not.toContain("memberExerciseIds.join");
  });

  it("shows authoritative Logger set details with variants and human Superset context", () => {
    expect(screen).toContain("Recorded sets");
    expect(screen).toContain("item.strengthSetDetails");
    expect(screen).toContain("exercise.variantLabel");
    expect(screen).toContain("Superset with {exercise.supersetWith.join(\" + \")}");
    expect(screen).toContain("New exercise");
    expect(screen).toContain("formatRecordedExerciseSets(exercise.sets)");
    expect(screen).not.toContain('exercise.sets.join(" Â· ")');
    const recordedSetDetails = screen.match(
      /function RecordedStrengthSetDetails[\s\S]*?\n}\n\nfunction GroupedExerciseReviewRow/
    )?.[0] ?? "";
    expect(recordedSetDetails).not.toContain("canonicalExerciseId");
  });

  it("routes every action outcome through revalidation and a visible query result", () => {
    expect(actions).toContain('outcome = result.changed ? "updated" : "current"');
    expect(actions).toContain('let outcome = "failed"');
    expect(actions).toContain('revalidatePath(`/evidence/review/${reviewId}`)');
    expect(actions).toContain('`/evidence/review/${reviewId}?reprocess=${outcome}`');
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
    expect(screen).toContain("Resolve ${blockingCount} exercise");
    expect(screen).toContain("New exercise");
    expect(screen).toContain("href={`#new-exercise-${exercise.provisionalExerciseId}`}");
    expect(screen).toContain("Optional details");
    expect(screen).toContain("Search exercises");
    expect(screen).toContain("matchingCanonicalExercises.map");
  });

  it("uses the shared canonical muscle-group search and select only for Add New", () => {
    expect(screen).toContain("searchCanonicalTrainingMuscleGroups");
    expect(screen).toContain('name="primaryMuscleGroupId"');
    expect(screen).toContain('aria-label="Primary muscle group"');
    expect(screen).toContain("Choose a muscle group");
    expect(screen).toContain("No matching muscle group.");
    expect(screen).toContain("Suggested from the exercise name.");
    expect(screen).toContain('mode === "new"');
    expect(screen).not.toContain('name="primaryMuscleGroup"');
    expect(actions).toContain('formData.get("primaryMuscleGroupId")');
    expect(actions).not.toContain('formData.get("primaryMuscleGroup")');
  });

  it("clears canonical muscle-group state when switching modes", () => {
    expect(screen).toContain("setPrimaryMuscleGroupId(");
    expect(screen).toContain('nextMode === "new"');
    expect(screen).toContain('setMuscleGroupQuery("")');
    expect(screen).toContain('setSearchQuery("")');
  });
});

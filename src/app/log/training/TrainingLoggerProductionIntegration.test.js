import fs from "node:fs";
import { describe, expect, it } from "vitest";

const logSource = fs.readFileSync(
  new URL("../../../screens/LogHubScreen.jsx", import.meta.url),
  "utf8"
);
const pageSource = fs.readFileSync(new URL("./page.js", import.meta.url), "utf8");
const routeSource = fs.readFileSync(new URL("./reconcile/route.js", import.meta.url), "utf8");
const clientSource = fs.readFileSync(
  new URL("../../../components/training/TrainingLoggerClient.jsx", import.meta.url),
  "utf8"
).replaceAll("\r\n", "\n");
const stateSource = fs.readFileSync(
  new URL("../../preview/training-logger/TrainingLoggerPreviewState.js", import.meta.url),
  "utf8"
);
const reviewActionsSource = fs.readFileSync(
  new URL("../../evidence/review/[reviewId]/actions.js", import.meta.url),
  "utf8"
);
const recoverySource = fs.readFileSync(
  new URL("../../../domain/services/TrainingLoggerDraftRecoveryService.js", import.meta.url),
  "utf8"
);
const appleHealthServiceSource = fs.readFileSync(
  new URL("../../../domain/services/TrainingLoggerAppleHealthService.js", import.meta.url),
  "utf8"
);

describe("production Training Logger integration", () => {
  it("adds a discoverable Log entry without replacing universal upload", () => {
    expect(logSource).toContain('href="/log/training"');
    expect(logSource).toContain("<UploadAnythingCard");
    expect(logSource).toContain("exercises, sets, variants, and supersets.");
    expect(logSource).not.toContain("exercises, sets, Variants, and Supersets.");
  });

  it("loads confirmed canonical Training history and active Goal context", () => {
    expect(pageSource).toContain("listCanonicalEvidenceObjects");
    expect(pageSource).toContain("confirmedTrainingRecords");
    expect(pageSource).toContain("initialPerformedExerciseIds={performedExerciseIds}");
    expect(pageSource).toContain("getActiveGoal");
    expect(pageSource).toContain("initialHistorySessions");
  });

  it("uses a concrete timezone fallback when profile timezone fields are null", () => {
    expect(pageSource).toContain(
      'user.timeZone ?? user.timezone ?? "America/Los_Angeles"'
    );
    expect(pageSource).toContain(
      'const resolvedTimeZone = timeZone || "America/Los_Angeles"'
    );
  });

  it("uses recoverable local draft state without persisting history context", () => {
    expect(clientSource).toContain("window.localStorage");
    expect(clientSource).toContain("serializeTrainingLoggerRecoveryDraft");
    expect(stateSource).toContain("const { productionContext: _productionContext, ...recoverable } = draft");
  });

  it("makes performed history the default picker and exposes the broader catalog explicitly", () => {
    expect(stateSource).toContain("listPerformedTrainingLoggerExerciseIds(historySessions)");
    expect(stateSource).toContain("Array.isArray(performedExerciseIds)");
    expect(clientSource).toContain("TRAINING_LOGGER_EXERCISE_SCOPES.PERFORMED_HISTORY");
    expect(clientSource).toContain("Add new exercise");
    expect(clientSource).toContain("TRAINING_LOGGER_EXERCISE_SCOPES.ALL_CANONICAL");
  });

  it("creates only a provisional name and accepted category inside the Logger", () => {
    expect(clientSource).toContain("Create new exercise");
    expect(clientSource).toContain("Exercise name");
    expect(clientSource).toContain("Category");
    expect(clientSource).toContain("stays provisional until you confirm it in Evidence Review");
    const createForm = clientSource.match(
      /function CreateNewExerciseForm[\s\S]*?\n}\n\nfunction LoggerScreen/
    )?.[0] ?? "";
    expect(createForm).not.toMatch(/equipment|movement pattern|secondary muscle|alias/i);
    const provisionalMutation = stateSource.match(
      /export function addProvisionalTrainingExercise[\s\S]*?\n}\n\nexport function swapTrainingExercise/
    )?.[0] ?? "";
    expect(provisionalMutation).not.toMatch(/fetch\(|canonicalExerciseLibrary|createCanonical/);
    expect(appleHealthServiceSource).toContain("provisionalExercise: structuredClone");
  });

  it("keeps Create new exercise visible above canonical results and the sticky action", () => {
    const picker = clientSource.match(
      /function ExerciseSelectionScreen[\s\S]*?\n}\n\nfunction CreateNewExerciseForm/
    )?.[0] ?? "";
    const searchPosition = picker.indexOf('placeholder={broadCatalog ? "Search all exercises"');
    const createPosition = picker.indexOf("Create new exercise", searchPosition);
    const resultsPosition = picker.indexOf('<div className="space-y-2">', searchPosition);
    const stickyActionPosition = picker.indexOf("<BottomAction", resultsPosition);

    expect(picker).toContain("{production && broadCatalog && (");
    expect(picker).not.toContain("canCreateExercise && available.length === 0");
    expect(picker).not.toContain("canCreateExercise");
    expect(searchPosition).toBeGreaterThan(-1);
    expect(createPosition).toBeGreaterThan(searchPosition);
    expect(resultsPosition).toBeGreaterThan(createPosition);
    expect(stickyActionPosition).toBeGreaterThan(resultsPosition);
  });

  it("uses the same visible create action for Add and Swap and opens the bounded form", () => {
    const picker = clientSource.match(
      /function ExerciseSelectionScreen[\s\S]*?\n}\n\nfunction CreateNewExerciseForm/
    )?.[0] ?? "";
    const createForm = clientSource.match(
      /function CreateNewExerciseForm[\s\S]*?\n}\n\nfunction LoggerScreen/
    )?.[0] ?? "";

    expect(picker).toContain("swappingExercise");
    expect(picker).toContain("setCreatingNewExercise(true)");
    expect(picker).toContain("<CreateNewExerciseForm");
    expect(picker).not.toMatch(/!swappingExercise[\s\S]{0,300}Create new exercise/);
    expect(createForm).toContain("<form onSubmit=");
    expect(createForm).toMatch(/placeholder="Exercise name"\s+required/);
    expect(createForm).toContain("<option value=\"\">Select a category</option>");
    expect(createForm).toMatch(/required\s+value={category}/);
    expect(createForm).toContain('type="submit"');
  });

  it("offers an atomic exercise swap without carrying the old occurrence values", () => {
    expect(clientSource).toContain('label="Swap exercise"');
    expect(clientSource).toContain("swapTrainingExercise(current, swapExerciseId");
    expect(stateSource).toContain("exercise.id === exerciseOccurrenceId ? replacement : exercise");
    const swapMutation = stateSource.match(
      /export function swapTrainingExercise[\s\S]*?\n}\n\nexport function removeTrainingExercise/
    )?.[0] ?? "";
    expect(swapMutation.replace(/export function removeTrainingExercise[\s\S]*/, ""))
      .not.toMatch(/fetch\(|removeTrainingExercise\(|addTrainingExercise\(/);
  });

  it("presents picker metadata through the user-facing presentation boundary", () => {
    expect(clientSource).toContain("createTrainingLoggerExercisePickerPresentation");
    expect(clientSource).not.toContain("`${exercise.body_region} · ${exercise.movement_pattern}`");
  });

  it("offers intentional resume, leave, and confirmed local-only cancellation", () => {
    expect(clientSource).toContain("Workout draft saved");
    expect(clientSource).toContain("Resume workout");
    expect(clientSource).toContain("Leave workout");
    expect(clientSource).toContain("Cancel this workout?");
    expect(clientSource).toContain("Keep workout");
    const cancelBody = clientSource.match(/function cancelWorkout\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? "";
    expect(cancelBody).toContain("discardTrainingLoggerRecoveryDraft");
    expect(cancelBody).not.toContain("fetch(");
    expect(recoverySource).not.toMatch(/FounderRepositories|canonicalEvidence|evidenceReviews|fetch\(/);
  });

  it("stages the real Evidence Review and never confirms canonically in the logger route", () => {
    expect(routeSource).toContain("createEvidenceReviewService");
    expect(routeSource).toContain(".stage({");
    expect(routeSource).not.toContain("confirmEvidenceReview");
    expect(routeSource).not.toContain("upsertCanonicalEvidenceObjects");
    expect(reviewActionsSource).toContain('authoritative.review_metadata?.origin === "training_logger"');
  });

  it("retains the final two-line active Logger heading correction", () => {
    expect(clientSource).toContain('>Training Logger</h1>');
    expect(clientSource).toContain("formatWorkoutContext(draft)");
    expect(clientSource).not.toContain('flex items-baseline gap-2');
  });
});

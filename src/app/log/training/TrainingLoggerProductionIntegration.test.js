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
);
const stateSource = fs.readFileSync(
  new URL("../../preview/training-logger/TrainingLoggerPreviewState.js", import.meta.url),
  "utf8"
);
const reviewActionsSource = fs.readFileSync(
  new URL("../../evidence/review/[reviewId]/actions.js", import.meta.url),
  "utf8"
);

describe("production Training Logger integration", () => {
  it("adds a discoverable Log entry without replacing universal upload", () => {
    expect(logSource).toContain('href="/log/training"');
    expect(logSource).toContain("<UploadAnythingCard");
  });

  it("loads confirmed canonical Training history and active Goal context", () => {
    expect(pageSource).toContain("listCanonicalEvidenceObjects");
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

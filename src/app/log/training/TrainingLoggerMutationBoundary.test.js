import fs from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = fs.readFileSync(new URL("./reconcile/route.js", import.meta.url), "utf8");
const clientSource = fs.readFileSync(
  new URL("../../../components/training/TrainingLoggerClient.jsx", import.meta.url),
  "utf8"
);
const intakeSource = fs.readFileSync(
  new URL("../../../domain/services/EvidenceIntakeService.js", import.meta.url),
  "utf8"
);
const confirmationSource = fs.readFileSync(
  new URL("../../evidence/review/[reviewId]/actions.js", import.meta.url),
  "utf8"
);

describe("Training Logger production mutation boundary", () => {
  it("keeps ordinary workout interaction in the client draft through Workout Review", () => {
    expect(clientSource).toContain("finishTrainingLoggerDraft(current)");
    expect(clientSource).toContain("TRAINING_LOGGER_STEPS.SUMMARY");
    expect(clientSource).not.toContain("upsertCanonicalEvidenceObjects");
    expect(clientSource).not.toContain("confirmEvidenceReview");
  });

  it("uses transient reconciliation when no screenshots are submitted", () => {
    const postSource = routeSource.split("export async function PUT")[0];
    expect(postSource).toContain("if (files.length > 0)");
    expect(postSource).toContain("processEvidenceIntakeSubmission");
    expect(postSource).not.toContain(".stage({");
    expect(postSource).not.toContain("commitConfirmedEvidencePackage");
    expect(clientSource).toContain("Continue without Apple Health");
  });

  it("persists screenshot artifacts and an interpreted package at screenshot submission", () => {
    expect(intakeSource).toContain("storeEvidenceArtifact");
    expect(intakeSource).toContain("await fs.writeFile(absolutePath, buffer)");
    const postSource = routeSource.split("export async function PUT")[0];
    expect(postSource).toContain("saveEvidencePackage(evidencePackage)");
  });

  it("creates the pending review only when continuing to Evidence Review", () => {
    const putSource = routeSource.split("export async function PUT")[1];
    expect(putSource).toContain("saveEvidencePackage(evidencePackage)");
    expect(putSource).toContain("createEvidenceReviewService");
    expect(putSource).toContain(".stage({");
    expect(putSource).not.toContain("commitConfirmedEvidencePackage");
  });

  it("creates canonical records and consumes source linkage only during final confirmation", () => {
    expect(confirmationSource).toContain("beginCommit(reviewId");
    expect(confirmationSource).toContain("commitConfirmedEvidencePackage");
    expect(confirmationSource).toContain("committedPackage");
  });
});

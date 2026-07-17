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
  it("uses logging terminology throughout the review controls", () => {
    expect(screen).toContain("Exclude from log");
    expect(screen).toContain("Include in log");
    expect(screen).toContain("Log included evidence");
    expect(screen).toContain("Select at least one item to continue.");
    expect(screen).not.toMatch(/check-in|Execute from check-in/i);
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
    expect(screen).toContain("disabled={!presentation.summary.included || blockingPhotoIssue}");
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
    expect(screen).toContain("Reprocess review");
  });

  it("keeps the discard confirmation human and free of storage details", () => {
    expect(screen).toContain("Discard this review?");
    expect(screen).toContain("This review will not be added to your history.");
    expect(screen).toContain("you will need to start a new upload.");
    expect(screen).not.toMatch(/evidence-retention|uploaded files may remain|storage implementation|backend retention/i);
  });
});

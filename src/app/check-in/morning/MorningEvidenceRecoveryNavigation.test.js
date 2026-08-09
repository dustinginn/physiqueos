import fs from "node:fs";
import { describe, expect, it } from "vitest";

const logPage = fs.readFileSync(new URL("../../log/page.js", import.meta.url), "utf8");
const logRoute = fs.readFileSync(new URL("../../log/upload/route.js", import.meta.url), "utf8");
const logScreen = fs.readFileSync(new URL("../../../screens/LogHubScreen.jsx", import.meta.url), "utf8");
const photoPage = fs.readFileSync(new URL("../../evidence/photos/page.js", import.meta.url), "utf8");
const photoAction = fs.readFileSync(new URL("../../evidence/photos/actions.js", import.meta.url), "utf8");
const reviewPage = fs.readFileSync(new URL("../../evidence/review/[reviewId]/page.js", import.meta.url), "utf8");
const reviewAction = fs.readFileSync(new URL("../../evidence/review/[reviewId]/actions.js", import.meta.url), "utf8");

describe("Morning evidence recovery route wiring", () => {
  it("keeps yesterday selected through dedicated Progress Photo staging", () => {
    expect(photoPage).toContain("recoveryContext?.date ??");
    expect(photoPage).toContain("recoveryContext={recoveryContext}");
    expect(photoAction).toContain("parseEvidenceRecoveryFormData(formData)");
    expect(photoAction).toContain("recoveryContext,");
    expect(photoAction).toContain("appendEvidenceRecoveryContext");
  });

  it("preselects generic intake date/type and stores the recovery context on the review", () => {
    expect(logPage).toContain("parseEvidenceRecoverySearchParams(params)");
    expect(logScreen).toContain("recoveryContext?.date ?? getTodayKey()");
    expect(logScreen).toContain('name="expectedEvidenceType"');
    expect(logRoute).toContain("recoveryContext?.expectedEvidenceType ?? \"auto\"");
    expect(logRoute).toContain("review_metadata:");
  });

  it("re-evaluates Morning Check-In after canonical confirmation", () => {
    expect(reviewPage).toContain("parseEvidenceRecoverySearchParams(query)");
    expect(reviewPage).toContain("recoveryContext={recoveryContext}");
    expect(reviewAction).toContain("revalidatePath(recoveryContext.returnTo)");
    expect(reviewAction).toContain("redirect(recoveryContext.returnTo)");
  });
});

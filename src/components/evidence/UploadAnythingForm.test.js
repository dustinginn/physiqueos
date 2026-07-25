import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(new URL("./UploadAnythingForm.jsx", import.meta.url), "utf8");

describe("UploadAnythingForm production lifecycle presentation", () => {
  it("keeps the existing action and issues one request per active submission", () => {
    expect(source).toContain("if (submitting) return");
    expect(source.match(/fetch\(action/g)).toHaveLength(1);
    expect(source).toContain('method: "POST"');
    expect(source).toContain("router.push(result.reviewUrl)");
  });

  it("ties Uploading to the real request and preserves the selected evidence date", () => {
    expect(source).toContain("setSubmitting(true)");
    expect(source).toContain("setSubmitting(false)");
    expect(source).toContain('formData.get("evidenceDate")');
    expect(source).toContain("Uploading your evidence");
    expect(source).not.toMatch(/setTimeout|percent|OCR|parsing|canonical/i);
  });

  it("does not show review or success after an upload failure", () => {
    expect(source).toContain("setError");
    expect(source).toContain('role="alert"');
    expect(source).not.toMatch(/Evidence Saved|Workout Saved|Nutrition Saved|Does this look right/);
  });
});

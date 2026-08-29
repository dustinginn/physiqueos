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

  it("shares one Founder-local date across Upload and direct weigh-in", () => {
    expect(source).toContain('name="evidenceDate"');
    expect(source).toContain("value={selectedDate}");
    expect(source).toContain("max={defaultDate}");
    expect(source).toContain('formData.set("evidenceDate", selectedDate)');
    expect(source).toContain(">{formatFriendlyDate(selectedDate)}</p>");
  });

  it("keeps direct weigh-in isolated from the multipart upload submission", () => {
    expect(source).toContain("Log weigh-in");
    expect(source).toContain("Save weigh-in");
    expect(source).toContain('formData.set("weight", weight)');
    expect(source).toContain("directWeighInAction(formData)");
    expect(source).toContain("Record your weight for the selected date.");
    expect(source.match(/type="button"/g).length).toBeGreaterThanOrEqual(2);
    expect(source.match(/fetch\(action/g)).toHaveLength(1);
  });

  it("preserves the approved light surface and uses PhysiqueOS tokens in dark mode", () => {
    expect(source).toContain("border-indigo-200 bg-indigo-50/50");
    expect(source).toContain("dark:bg-[color-mix(in_srgb,var(--primary)_10%,var(--surface-elevated))]");
    expect(source).toContain("dark:border-[color-mix(in_srgb,var(--primary)_32%,var(--divider))]");
    expect(source).toContain("bg-[var(--surface-elevated)] text-indigo-600 dark:text-[var(--primary)]");
    expect(source).toContain("dark:text-[var(--text-primary)]");
    expect(source).toContain("dark:text-[var(--text-secondary)]");
    expect(source).not.toMatch(/Log weigh-in[\s\S]{0,400}(opacity-|disabled:)/);
  });

  it("uses Founder-facing copy in both collapsed and expanded states", () => {
    const supportingCopy = "Record your weight for the selected date.";
    expect(source).toContain("Log weigh-in");
    expect(source).toContain(supportingCopy);
    expect(source.indexOf(supportingCopy)).toBeLessThan(source.indexOf("{showWeighIn && ("));
    expect(source).toContain("Weight");
    expect(source).toContain(">{formatFriendlyDate(selectedDate)}</p>");
    expect(source).toContain("Save weigh-in");
    expect(source).not.toContain("Save a structured weight directly. No upload or review required.");
    expect(source).not.toContain("Date: {formatFriendlyDate(selectedDate)}");
  });
});

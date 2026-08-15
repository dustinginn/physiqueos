import fs from "node:fs";
import { describe, expect, it } from "vitest";

const screen = fs.readFileSync(new URL("./DEXAUploadScreen.jsx", import.meta.url), "utf8");
const action = fs.readFileSync(new URL("../app/evidence/dexa/actions.js", import.meta.url), "utf8");

describe("DEXA PDF-first upload screen", () => {
  it("requires only the raw PDF before Evidence Review", () => {
    expect(screen).toContain('name="dexaPdf"');
    expect(screen).toContain("Upload and Continue to Review");
    expect(screen).toContain("review and correct");
    expect(screen).not.toContain('name="measuredAt"');
    expect(screen).not.toContain('name="totalMass"');
    expect(screen).not.toContain('name="bodyFatPercentage"');
    expect(screen).not.toContain('name="confirmed"');
    expect(screen).not.toContain("I confirmed these extracted values");
  });

  it("extracts into a pending review without creating canonical DEXA", () => {
    expect(action).toContain("createDexaPdfReviewPackage");
    expect(action).toContain("createEvidenceReviewService");
    expect(action).toContain('source: "dedicated_dexa"');
    expect(action).not.toContain("addDEXAScan");
    expect(action).not.toContain("upsertDEXAScan");
    expect(action).not.toContain('formData.get("confirmed")');
  });

  it("distinguishes expected upload failures from maintenance", () => {
    expect(screen).toContain('"invalid-pdf"');
    expect(screen).toContain('"missing-pdf"');
    expect(screen).toContain('"pdf-too-large"');
    expect(screen).toContain('"writes-paused"');
  });
});

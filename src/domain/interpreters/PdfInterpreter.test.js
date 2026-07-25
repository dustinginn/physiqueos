import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractPdfText, interpretPdfEvidence, parseBodySpecDexaText } from "./PdfInterpreter";

const retainedPdf = path.join(
  process.cwd(),
  "private",
  "founder",
  "evidence",
  "uploads",
  "evidence_submission_20260718144114116-1-7-18-26-DEXA.pdf"
);

const SCRUBBED_BODY_SPEC_TEXT = `
Client Sex Birth Date Intake Height Intake Weight Measured Date
Founder Male 1/1/1990 76.0 in. 197.0 lbs. 7/18/2026
SUMMARY RESULTS
Measured Date Total Body Fat % Total Mass (lbs) Fat Tissue (lbs) Lean Tissue (lbs) Bone Mineral Content (BMC)
7/18/2026 7.7% 167.4 12.8 147.5 7.1
6/20/2026 10.7% 171.7 18.4 146.2 7.1
REGIONAL ASSESSMENT
Region Total Region Fat % Total Mass (lbs) Fat Tissue (lbs) Lean Tissue (lbs) Bone Mineral Content (BMC)
Arms 5.5% 24.3 1.3 21.9 1.1
Legs 8.3% 58.7 4.9 51.0 2.8
Trunk 6.4% 74.4 4.8 67.6 2.0
Android 5.4% 10.7 0.6 10.0 0.2
Gynoid 7.4% 25.8 1.9 23.2 0.7
Total 7.7% 167.4 12.8 147.5 7.1
SUPPLEMENTAL RESULTS
Resting Metabolic Rate (RMR) Android (A) Gynoid (G) A/G Ratio
1,794 cal/day 5.4% 7.4% 0.73
1,783 cal/day 8.5% 10.4% 0.82
VAT BONE REPORT
Mass (lbs) 0.15
Volume (in 3) 4.51
Total 1.238 0.4 0.4
MUSCLE BALANCE REPORT
`;

describe("BodySpec PDF interpretation", () => {
  it("selects the report date and current summary rather than the historical row", () => {
    const result = parseBodySpecDexaText(SCRUBBED_BODY_SPEC_TEXT);
    expect(result.status).toBe("complete");
    expect(result.measuredAt).toBe("2026-07-18");
    expect({
      totalMass: result.values.totalMass.value,
      bodyFat: result.values.bodyFatPercentage,
      fatMass: result.values.fatMass.value,
      leanMass: result.values.leanMass.value,
      bmc: result.values.boneMineralContent.value,
      rmr: result.values.restingMetabolicRate.value,
    }).toEqual({ totalMass: 167.4, bodyFat: 7.7, fatMass: 12.8, leanMass: 147.5, bmc: 7.1, rmr: 1794 });
  });

  it("fails unsupported text without fixture fallback or invented confidence", async () => {
    const result = await interpretPdfEvidence({
      files: [{ fileName: "unknown.pdf", text: "not a BodySpec report", id: "unknown" }],
    });
    expect(result.status).toBe("failed");
    expect(result.scan).toBeNull();
    expect(result.evidencePackage.quality).toMatchObject({ status: "failed", extraction_confidence: "low" });
  });

  it.runIf(fs.existsSync(retainedPdf))("extracts and interprets the retained Jul 18 PDF locally", async () => {
    const buffer = fs.readFileSync(retainedPdf);
    const extraction = await extractPdfText(buffer);
    expect(extraction.status).toBe("complete");
    const parsed = parseBodySpecDexaText(extraction.text);
    expect(parsed.values).toMatchObject({
      totalMass: { value: 167.4 },
      bodyFatPercentage: 7.7,
      fatMass: { value: 12.8 },
      leanMass: { value: 147.5 },
      boneMineralContent: { value: 7.1 },
    });
    const result = await interpretPdfEvidence({
      capturedAt: "2026-07-18T14:41:14.116Z",
      files: [{ buffer, fileName: "7-18-26-DEXA.pdf", id: "retained", userId: "user_founder_001" }],
    });
    expect(result.scan).toMatchObject({
      measuredAt: "2026-07-18",
      totalMass: { value: 167.4 },
      bodyFatPercentage: 7.7,
      fatMass: { value: 12.8 },
      leanMass: { value: 147.5 },
      boneMineralContent: { value: 7.1 },
      restingMetabolicRate: { value: 1794 },
      visceralAdiposeTissue: {
        mass: { value: 0.15, unit: "lb" },
        volume: { value: 4.51, unit: "in3" },
      },
      androidFatPercentage: 5.4,
      gynoidFatPercentage: 7.4,
      androidGynoidRatio: 0.73,
      boneDensity: {
        totalBMD: 1.238,
        totalBMDUnit: "g/cm2",
        tScore: 0.4,
        zScore: 0.4,
      },
    });
    expect(result.scan.provenance).toMatchObject({ extraction_engine: "pdfjs-dist", fixture: false });
  });
});

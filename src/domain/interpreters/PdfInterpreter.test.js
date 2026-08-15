import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BODYSPEC_PDF_INTERPRETER_VERSION,
  PDF_TEXT_EXTRACTION_ENGINE,
  extractPdfText,
  interpretPdfEvidence,
  parseBodySpecDexaText,
  preparePdfJsTextExtractionRuntime,
} from "./PdfInterpreter";

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

const SYNTHETIC_CURRENT_BODY_SPEC_TEXT = `
Report Generated 3/1/2032
Client Sex Birth Date Intake Height Intake Weight Measured Date
Synthetic Person Female 6/7/2004 68.0 in. 180.0 lbs. 2/14/2032
SUMMARY    RESULTS
This table provides an overview of total body composition.
Bone Mineral
Measured Date Total Body Fat % Total Mass (lbs) Fat Tissue (lbs) Lean Tissue (lbs)
Content (BMC)
2/14/2032   14.2%   180.4   25.6   147.2   7.6
1/10/2032   14.8%   179.9   26.6   145.7   7.6
REGIONAL ASSESSMENT
Region % Fat Total Mass Fat Mass Lean Mass BMC
Arms 13.0% 25.0 3.3 20.6 1.1
Legs 16.0% 62.0 9.9 49.1 3.0
Trunk 13.0% 83.0 10.8 70.0 2.2
Android 12.4% 11.0 1.4 9.4 0.2
Gynoid 15.6% 27.0 4.2 22.1 0.7
Total 14.2% 180.4 25.6 147.2 7.6
SUPPLEMENTAL    RESULTS
Resting Metabolic Rate (RMR) Android (A) Gynoid (G) A/G Ratio
1,888 cal/day   12.4%   15.6%   0.79
VAT BONE REPORT
Mass (lbs) 0.22
Volume (in 3) 6.44
Total 1.250 0.5 0.7
MUSCLE BALANCE REPORT
`;

describe("BodySpec PDF interpretation", () => {
  it("loads Node geometry and fake-worker dependencies before PDF.js in a bundled runtime", async () => {
    const previousMatrix = globalThis.DOMMatrix;
    const previousWorker = globalThis.pdfjsWorker;
    Reflect.deleteProperty(globalThis, "DOMMatrix");
    Reflect.deleteProperty(globalThis, "pdfjsWorker");
    try {
      await preparePdfJsTextExtractionRuntime();
      expect(typeof globalThis.DOMMatrix).toBe("function");
      expect(globalThis.pdfjsWorker?.WorkerMessageHandler).toBeTruthy();
    } finally {
      if (previousMatrix) globalThis.DOMMatrix = previousMatrix;
      else Reflect.deleteProperty(globalThis, "DOMMatrix");
      if (previousWorker) globalThis.pdfjsWorker = previousWorker;
      else Reflect.deleteProperty(globalThis, "pdfjsWorker");
    }
  });

  it("parses the current BodySpec layout without confusing birth or report dates for the scan date", () => {
    const result = parseBodySpecDexaText(SYNTHETIC_CURRENT_BODY_SPEC_TEXT);
    expect(result).toMatchObject({
      status: "complete",
      measuredAt: "2032-02-14",
      values: {
        totalMass: { value: 180.4, unit: "lb" },
        bodyFatPercentage: 14.2,
        fatMass: { value: 25.6, unit: "lb" },
        leanMass: { value: 147.2, unit: "lb" },
        boneMineralContent: { value: 7.6, unit: "lb" },
        restingMetabolicRate: { value: 1888, unit: "kcal/day" },
        visceralAdiposeTissue: {
          mass: { value: 0.22, unit: "lb" },
          volume: { value: 6.44, unit: "in3" },
        },
      },
    });
  });

  it("keeps the measured date unknown when a demographic header has only a birth date", () => {
    const result = parseBodySpecDexaText(`
Client Sex Birth Date Intake Height Intake Weight Measured Date
Synthetic Person Female 6/7/2004 68.0 in. 180.0 lbs.
SUMMARY RESULTS
6/7/2004 14.2 180.4 25.6 147.2 7.6
REGIONAL ASSESSMENT
`);
    expect(result).toMatchObject({ status: "failed", measuredAt: null });
  });

  it("normalizes Unicode spacing but rejects unrelated numeric text", () => {
    const normalized = parseBodySpecDexaText(
      SYNTHETIC_CURRENT_BODY_SPEC_TEXT.replaceAll(" ", "\u202f")
    );
    expect(normalized.measuredAt).toBe("2032-02-14");
    expect(parseBodySpecDexaText("Invoice 2/14/2032 total 180.4 reference 1888"))
      .toMatchObject({ status: "failed", values: null });
  });

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
    expect(result.scan.provenance).toMatchObject({
      extraction_engine_version: PDF_TEXT_EXTRACTION_ENGINE,
      interpreter_version: BODYSPEC_PDF_INTERPRETER_VERSION,
    });
  });
});

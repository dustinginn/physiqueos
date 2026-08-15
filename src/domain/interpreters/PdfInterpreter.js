import { createDEXAScan } from "../models/dexaScan";
import { assertValidDexaScan } from "../services/DEXAContract";

const BODY_FAT_GOAL_ID = "goal_maintain_8_9_body_fat";
const LEAN_MASS_GOAL_ID = "goal_preserve_lean_mass";
const VISIBLE_ABS_GOAL_ID = "goal_visible_abs_at_rest";

export async function extractPdfText(buffer) {
  if (!buffer?.length) {
    return { status: "failed", text: "", pages: [], diagnostics: ["PDF buffer is empty."] };
  }

  try {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const document = await getDocument({
      data: new Uint8Array(buffer),
      disableFontFace: true,
      useSystemFonts: true,
    }).promise;
    const pages = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(reconstructPageText(content.items));
    }

    const text = pages.join("\n\f\n");
    return {
      status: text.trim() ? "complete" : "failed",
      text,
      pages,
      diagnostics: text.trim()
        ? [`Extracted ${pages.length} PDF pages with pdfjs-dist.`]
        : ["The PDF contains no extractable text layer."],
    };
  } catch (error) {
    return {
      status: "failed",
      text: "",
      pages: [],
      diagnostics: [`PDF extraction failed: ${String(error?.message ?? error)}`],
    };
  }
}

function reconstructPageText(items = []) {
  const rows = new Map();
  for (const item of items) {
    const text = String(item?.str ?? "").trim();
    if (!text) continue;
    const x = Number(item.transform?.[4] ?? 0);
    const y = Math.round(Number(item.transform?.[5] ?? 0) * 2) / 2;
    const row = rows.get(y) ?? [];
    row.push({ text, x });
    rows.set(y, row);
  }
  return [...rows.entries()]
    .sort((left, right) => right[0] - left[0])
    .map(([, row]) => row.sort((left, right) => left.x - right.x).map((item) => item.text).join(" "))
    .join("\n");
}

export async function interpretPdfEvidence(evidence = {}) {
  const artifacts = normalizePdfArtifacts(evidence);
  const scans = [];
  const reviewCandidates = [];
  const diagnostics = [];

  for (const artifact of artifacts) {
    const extraction = artifact.text?.trim()
      ? { status: "complete", text: artifact.text, pages: [], diagnostics: ["Used caller-supplied extracted PDF text."] }
      : await extractPdfText(artifact.buffer);
    diagnostics.push(...extraction.diagnostics.map((message) => ({ fileName: artifact.fileName, message })));
    if (extraction.status !== "complete") continue;

    const parsed = parseBodySpecDexaText(extraction.text);
    diagnostics.push(...parsed.diagnostics.map((message) => ({ fileName: artifact.fileName, message })));
    if (parsed.status === "failed") continue;

    const now = artifact.capturedAt ?? new Date().toISOString();
    const scan = createDEXAScan({
      id: `${artifact.id}_${parsed.measuredAt.replaceAll("-", "_")}`,
      userId: artifact.userId,
      measuredAt: parsed.measuredAt,
      relatedGoalIds: [BODY_FAT_GOAL_ID, LEAN_MASS_GOAL_ID, VISIBLE_ABS_GOAL_ID],
      provider: "BodySpec",
      ...parsed.values,
      sourceFileId: artifact.fileName,
      source: {
        confidence: "high",
        name: "BodySpec",
        type: "dexa",
        modality: "pdf",
        application: "BodySpec",
        source_artifact_refs: [artifact.fileName],
      },
      fieldProvenance: {
        summary: artifact.fileName,
        supplementalMetrics: artifact.fileName,
        regionalAssessment: artifact.fileName,
      },
      provenance: {
        extraction_engine: "pdfjs-dist",
        fixture: false,
        source_artifact_refs: [artifact.fileName],
      },
      confidence: { extraction: "high", interpretation: "high" },
      quality: { status: "rich", limitations: parsed.limitations },
      createdAt: now,
      updatedAt: now,
    });
    reviewCandidates.push(scan);
    try {
      assertValidDexaScan(scan, { production: true });
      scans.push(scan);
    } catch (error) {
      diagnostics.push({
        fileName: artifact.fileName,
        message: `BodySpec extraction needs human correction: ${String(error?.message ?? error)}`,
      });
    }
  }

  const evidencePackage = createDexaEvidencePackageFromScans(scans, { diagnostics });
  return {
    sourceId: evidence.id ?? "",
    sourceType: "pdf",
    detectedEvidenceType: reviewCandidates.length ? "dexa" : "unknown",
    detectedSourceApplication: reviewCandidates.length ? "BodySpec" : null,
    status: scans.length ? "interpreted" : reviewCandidates.length ? "partial" : "failed",
    confidence: scans.length ? "high" : reviewCandidates.length ? "moderate" : "low",
    scan: scans[0] ?? null,
    scans,
    reviewCandidates,
    evidenceObjects: evidencePackage.evidence_objects,
    evidencePackage,
    extractedFields: { scanCount: scans.length, reviewCandidateCount: reviewCandidates.length },
  };
}

export function parseBodySpecDexaText(text = "") {
  const normalized = String(text).replace(/\u00a0/g, " ");
  const measuredHeader = normalized.match(
    /Measured Date[\s\S]{0,180}?\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(20\d{2})\b/i
  );
  if (!measuredHeader) {
    return failed("BodySpec measured date was not found.");
  }
  const measuredAt = toIsoDate(measuredHeader[1], measuredHeader[2], measuredHeader[3]);
  const datePattern = dateRegex(measuredHeader[1], measuredHeader[2], measuredHeader[3]);
  const summarySection = section(normalized, "SUMMARY RESULTS", "REGIONAL ASSESSMENT");
  const summaryLines = summarySection.split("\n").map((line) => line.trim()).filter(Boolean);
  const summaryIndex = summaryLines.findIndex((line) => new RegExp(`^${datePattern}\\b`, "i").test(line));
  const summaryNumbers = summaryIndex >= 0
    ? [...summaryLines[summaryIndex].matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0])).slice(3)
    : [];
  const precedingBmc = summaryIndex > 0 && /^\d+(?:\.\d+)?$/.test(summaryLines[summaryIndex - 1])
    ? Number(summaryLines[summaryIndex - 1])
    : null;
  if (summaryIndex < 0 || summaryNumbers.length === 0) {
    return failed(`Current summary row for ${measuredAt} was not found.`);
  }
  const [bodyFat, totalMass, fatMass, leanMass] = summaryNumbers;
  const bmc = summaryNumbers[4] ?? precedingBmc;
  const supplementalSection = section(normalized, "SUPPLEMENTAL RESULTS", "MUSCLE BALANCE REPORT");
  const rmrValues = [...supplementalSection.matchAll(/\b(\d{1,2},\d{3}|\d{4})\s*cal\/day\b/gi)];
  const regions = parseRegionalAssessment(normalized);
  const supplemental = parseSupplemental(supplementalSection);
  const required = { bodyFat, totalMass, fatMass, leanMass, bmc };
  const missing = Object.entries(required)
    .filter(([, value]) => !Number.isFinite(value))
    .map(([key]) => key);

  return {
    status: missing.length ? "partial" : "complete",
    measuredAt,
    values: {
      ...(Number.isFinite(totalMass) ? { totalMass: mass(totalMass) } : {}),
      ...(Number.isFinite(bodyFat) ? { bodyFatPercentage: number(bodyFat) } : {}),
      ...(Number.isFinite(fatMass) ? { fatMass: mass(fatMass) } : {}),
      ...(Number.isFinite(leanMass) ? { leanMass: mass(leanMass) } : {}),
      ...(Number.isFinite(bmc) ? { boneMineralContent: mass(bmc) } : {}),
      ...(rmrValues.length
        ? { restingMetabolicRate: mass(rmrValues[0][1].replace(",", ""), "kcal/day") }
        : {}),
      regionalAssessment: regions,
      ...supplemental,
    },
    limitations: [
      ...(missing.length ? [`Missing required BodySpec summary fields: ${missing.join(", ")}.`] : []),
      ...(rmrValues.length ? [] : ["Resting metabolic rate was not extracted."]),
    ],
    diagnostics: [
      `Selected current BodySpec summary row for ${measuredAt}.`,
      "Historical comparison rows were excluded by matching the report measured-date header.",
      ...(missing.length ? [`Human correction is required for: ${missing.join(", ")}.`] : []),
      ...(rmrValues.length ? [] : ["Resting metabolic rate was not found and remains unknown."]),
    ],
  };
}

function parseRegionalAssessment(text) {
  const block = section(text, "REGIONAL ASSESSMENT", "SUPPLEMENTAL RESULTS");
  const result = {};
  for (const label of ["Arms", "Legs", "Trunk", "Android", "Gynoid", "Total"]) {
    const match = block.match(new RegExp(`\\b${label}\\s+(\\d+(?:\\.\\d+)?)%\\s+(\\d+(?:\\.\\d+)?)\\s+(\\d+(?:\\.\\d+)?)\\s+(\\d+(?:\\.\\d+)?)\\s+(\\d+(?:\\.\\d+)?)`, "i"));
    result[label.toLowerCase()] = match
      ? region(match[1], match[2], match[3], match[4], match[5])
      : null;
  }
  return result;
}

function parseSupplemental(block) {
  const values = block.match(/(\d{1,2},\d{3})\s*cal\/day\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)/i);
  const vatBlock = section(block, "VAT BONE REPORT", "MUSCLE BALANCE REPORT");
  const vatMass = vatBlock.match(/\bMass\s*\(lbs\)\s+(\d+(?:\.\d+)?)/i);
  const vatVolume =
    vatBlock.match(/\bVolume\s*\(in\s*3\s*\)\s*(\d+(?:\.\d+)?)/i) ??
    vatBlock.match(/\n3\s*\n(\d+(?:\.\d+)?)\s*\nTrunk\b/i);
  const totalBone = vatBlock.match(/\bTotal\s+(\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/i);
  return {
    ...(values
      ? {
          androidFatPercentage: number(values[2]),
          gynoidFatPercentage: number(values[3]),
          androidGynoidRatio: number(values[4]),
        }
      : {}),
    ...(vatMass || vatVolume
      ? {
          visceralAdiposeTissue: {
            mass: vatMass ? mass(vatMass[1]) : undefined,
            volume: vatVolume ? mass(vatVolume[1], "in3") : undefined,
          },
        }
      : {}),
    ...(totalBone
      ? {
          boneDensity: {
            totalBMD: number(totalBone[1]),
            totalBMDUnit: "g/cm2",
            tScore: number(totalBone[2]),
            zScore: number(totalBone[3]),
          },
        }
      : {}),
  };
}

function normalizePdfArtifacts(evidence = {}) {
  return (evidence.files?.length ? evidence.files : [evidence]).map((file, index) => ({
    buffer: file.buffer ?? null,
    capturedAt: file.capturedAt ?? evidence.capturedAt,
    fileName: file.fileName ?? file.name ?? `BodySpec DEXA report ${index + 1}.pdf`,
    id: file.id ?? `${evidence.id ?? "bodyspec_dexa"}_${index + 1}`,
    text: file.text ?? file.extractedText ?? "",
    userId: file.userId ?? evidence.userId ?? "founder",
  }));
}

export function createDexaEvidencePackageFromScans(scans, { diagnostics = [] } = {}) {
  const capturedAt = scans[0]?.createdAt ?? new Date().toISOString();
  const status = scans.length ? "rich" : "failed";
  return {
    package_id: scans.length ? `dexa_package_${scans.map((scan) => scan.measuredAt).join("_")}` : "dexa_package_failed",
    schema_version: "physiqueos-evidence-v1",
    source_modality: "pdf",
    detected_source_application: scans.length ? "BodySpec" : null,
    detected_source_confidence: scans.length ? "high" : "low",
    detected_evidence_type: scans.length ? "dexa_scan" : "unknown",
    detected_evidence_objects: scans.length ? [{ evidence_type: "dexa_scan", canonical_name: "DEXAScan", count: scans.length }] : [],
    detected_evidence_type_confidence: scans.length ? "high" : "low",
    captured_at: capturedAt,
    interpreter: { name: "PhysiqueOS BodySpec PDF Interpreter", version: "bodyspec-pdf-v2", provider: "internal", model: null },
    quality: {
      extraction_confidence: scans.length ? "high" : "low",
      interpreter_confidence: scans.length ? "high" : "low",
      status,
      limitations: scans.length ? [] : diagnostics.map((item) => item.message),
    },
    evidence_objects: scans.map((scan) => ({
      ...scan,
      evidence_type: "dexa_scan",
      observed_at: scan.measuredAt,
      captured_at: scan.createdAt,
      reconciliation: {
        duplicate_detection_identity: createDexaIdentity(scan),
        duplicate_of_existing_scan: false,
        historical_tables_ignored_for_evidence_creation: true,
      },
    })),
    provenance: {
      submission_id: `dexa_submission_${scans.map((scan) => scan.id).join("_")}`,
      source_artifacts: scans.map((scan) => ({
        id: scan.sourceFileId,
        kind: "pdf",
        file_name: scan.sourceFileId,
        mime_type: "application/pdf",
        uploaded_at: scan.createdAt,
      })),
    },
    diagnostics: {
      stages: [{ label: scans.length ? "BodySpec PDF extracted and validated" : "BodySpec PDF extraction failed", evidenceObjectCount: scans.length }],
      warnings: diagnostics,
    },
    reconciliation: { duplicate_detection: { duplicate_count: 0, duplicates: [], identity_fields: ["provider", "measuredAt", "totalMass", "bodyFatPercentage", "fatMass", "leanMass", "boneMineralContent"] } },
  };
}

export function createDexaEvidencePackageFromScan(scan) {
  return createDexaEvidencePackageFromScans([scan]);
}

function createDexaIdentity(scan) {
  return [scan.provider, scan.measuredAt, scan.totalMass?.value, scan.bodyFatPercentage, scan.fatMass?.value, scan.leanMass?.value, scan.boneMineralContent?.value].join("|");
}
function section(text, start, end) {
  const from = text.toUpperCase().indexOf(start.toUpperCase());
  if (from < 0) return "";
  const to = text.toUpperCase().indexOf(end.toUpperCase(), from + start.length);
  return text.slice(from, to < 0 ? undefined : to);
}
function dateRegex(month, day, year) {
  return `0?${Number(month)}\\/0?${Number(day)}\\/${year}`;
}
function toIsoDate(month, day, year) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function number(value) {
  return Number(String(value).replace(",", ""));
}
function mass(value, unit = "lb") {
  return { value: number(value), unit };
}
function region(bodyFat, totalMass, fatMass, leanMass, bmc) {
  return { bodyFatPercentage: number(bodyFat), totalMass: mass(totalMass), fatMass: mass(fatMass), leanMass: mass(leanMass), boneMineralContent: mass(bmc) };
}
function failed(message) {
  return { status: "failed", measuredAt: null, values: null, limitations: [message], diagnostics: [message] };
}

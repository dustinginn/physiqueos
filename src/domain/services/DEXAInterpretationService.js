import { createAnalysis } from "../models/analysis";

export function createDEXAInterpretation({ canonicalScan, priorScan = null, evaluationIds = [], interpreterVersion = "dexa-v1" } = {}) {
  if (!canonicalScan?.canonicalId) throw new Error("Confirmed canonical DEXA is required.");
  const scan = canonicalScan.payload ?? {};
  const prior = priorScan?.payload ?? priorScan ?? null;
  const fields = preserveKnownFields(scan);
  const deltas = prior ? Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, numericDelta(value, preserveKnownFields(prior)[key])]).filter(([, value]) => value !== null)) : {};
  const version = canonicalScan.updatedAt ?? canonicalScan.lastObservedAt ?? "v1";
  return createAnalysis({
    id: `analysis_dexa_${stable(version)}_${canonicalScan.canonicalId}`,
    createdAt: new Date().toISOString(),
    title: "DEXA Interpreted",
    summary: prior ? "Confirmed DEXA was compared with the prior canonical scan." : "Confirmed DEXA establishes the current canonical body-composition anchor.",
    evidenceIds: [canonicalScan.canonicalId, priorScan?.canonicalId].filter(Boolean),
    evidenceTypes: ["dexa"],
    findings: Object.entries(deltas).map(([key, value]) => ({ title: key, detail: `${value > 0 ? "+" : ""}${value}` })),
    metadata: { interpreterVersion, canonicalVersion: version, confirmedFields: fields, deltas, priorCanonicalScanId: priorScan?.canonicalId ?? null, evaluationIds, sourceFile: scan.source_file ?? scan.sourceFileId ?? scan.rawReportPath ?? null },
  });
}

function preserveKnownFields(scan) {
  const metadata = scan.metadata ?? scan;
  return Object.fromEntries(Object.entries({ scanDate: scan.observed_at ?? scan.measuredAt, totalMass: valueOf(metadata.totalMass), bodyFatPercentage: valueOf(metadata.bodyFatPercentage), fatMass: valueOf(metadata.fatMass), leanMass: valueOf(metadata.leanMass), boneMass: valueOf(metadata.boneMineralContent ?? metadata.boneMass), restingMetabolicRate: valueOf(metadata.restingMetabolicRate), vatMass: valueOf(metadata.vatMass ?? metadata.visceralAdiposeTissue?.mass), vatVolume: valueOf(metadata.vatVolume ?? metadata.visceralAdiposeTissue?.volume), regionalAssessment: metadata.regionalAssessment ?? null, androidFatPercentage: valueOf(metadata.androidFatPercentage), gynoidFatPercentage: valueOf(metadata.gynoidFatPercentage), androidGynoidRatio: valueOf(metadata.androidGynoidRatio) }).filter(([, value]) => value !== null && value !== undefined));
}
function valueOf(value) { return value && typeof value === "object" && "value" in value ? value.value : value; }
function numericDelta(value, prior) { return Number.isFinite(Number(value)) && Number.isFinite(Number(prior)) ? Number((Number(value) - Number(prior)).toFixed(2)) : null; }
function stable(value) { return String(value).replace(/[^a-z0-9]+/gi, "_"); }

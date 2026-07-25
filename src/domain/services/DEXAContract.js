const REQUIRED_METRICS = [
  ["totalMass", (scan) => scan?.totalMass?.value, { min: 1, max: 1000 }],
  ["bodyFatPercentage", (scan) => scan?.bodyFatPercentage, { min: 1, max: 70 }],
  ["fatMass", (scan) => scan?.fatMass?.value, { min: 0, max: 700 }],
  ["leanMass", (scan) => scan?.leanMass?.value, { min: 1, max: 700 }],
  ["boneMineralContent", (scan) => scan?.boneMineralContent?.value, { min: 0, max: 50 }],
];

export class DEXAContractError extends Error {
  constructor(issues) {
    super(`DEXA contract failed: ${issues.map((issue) => issue.message).join("; ")}`);
    this.name = "DEXAContractError";
    this.code = "DEXA_CONTRACT_FAILED";
    this.issues = issues;
    this.retryable = true;
  }
}

export function validateDexaScan(scan, { production = true } = {}) {
  const issues = [];
  const date = scan?.measuredAt ?? scan?.observed_at;
  if (!isDateKey(date)) issues.push(issue("measuredAt", "A valid scan date is required."));

  for (const [field, read, range] of REQUIRED_METRICS) {
    const value = Number(read(scan));
    if (!Number.isFinite(value) || value < range.min || value > range.max) {
      issues.push(issue(field, `${field} must be finite and between ${range.min} and ${range.max}.`));
    }
  }

  if (production) {
    const sourceRefs = scan?.provenance?.source_artifact_refs ?? scan?.source?.source_artifact_refs ?? [];
    if (!scan?.sourceFileId && sourceRefs.length === 0) {
      issues.push(issue("source", "A source artifact reference is required."));
    }
    if (!scan?.provenance?.extraction_engine) {
      issues.push(issue("provenance", "Extraction-engine provenance is required."));
    }
    if (scan?.provenance?.fixture === true) {
      issues.push(issue("provenance", "Fixture-derived DEXA evidence is forbidden in production."));
    }
  }

  if (issues.length === 0) {
    const total = Number(scan.totalMass.value);
    const fat = Number(scan.fatMass.value);
    const lean = Number(scan.leanMass.value);
    const bmc = Number(scan.boneMineralContent.value);
    const bodyFat = Number(scan.bodyFatPercentage);
    if (Math.abs(fat - total * bodyFat / 100) > 0.8) {
      issues.push(issue("massConsistency", "Fat mass is inconsistent with total mass and body-fat percentage."));
    }
    if (Math.abs(total - (fat + lean + bmc)) > 1.0) {
      issues.push(issue("massConsistency", "Fat, lean, and bone mass do not reconcile to total mass."));
    }
  }
  validateOptionalMetric(issues, "visceralAdiposeTissue.mass", scan?.visceralAdiposeTissue?.mass, { min: 0, units: ["lb"] });
  validateOptionalMetric(issues, "visceralAdiposeTissue.volume", scan?.visceralAdiposeTissue?.volume, { min: 0, units: ["in3", "cm3"] });
  validateOptionalNumber(issues, "androidFatPercentage", scan?.androidFatPercentage, { min: 0, max: 100 });
  validateOptionalNumber(issues, "gynoidFatPercentage", scan?.gynoidFatPercentage, { min: 0, max: 100 });
  validateOptionalNumber(issues, "androidGynoidRatio", scan?.androidGynoidRatio, { min: 0 });
  validateOptionalNumber(issues, "boneDensity.totalBMD", scan?.boneDensity?.totalBMD, { min: Number.EPSILON });
  validateOptionalNumber(issues, "boneDensity.tScore", scan?.boneDensity?.tScore);
  validateOptionalNumber(issues, "boneDensity.zScore", scan?.boneDensity?.zScore);

  return { valid: issues.length === 0, issues };
}

export function assertValidDexaScan(scan, options) {
  const result = validateDexaScan(scan, options);
  if (!result.valid) throw new DEXAContractError(result.issues);
  return scan;
}

export function isValidDexaScan(scan, options) {
  return validateDexaScan(scan, options).valid;
}

function issue(field, message) {
  return { field, message };
}
function validateOptionalMetric(issues, field, metric, { min = -Infinity, units = [] } = {}) {
  if (metric == null || metric.value == null) return;
  validateOptionalNumber(issues, field, metric.value, { min });
  if (units.length && !units.includes(metric.unit)) issues.push(issue(field, `${field} must use ${units.join(" or ")}.`));
}
function validateOptionalNumber(issues, field, value, { min = -Infinity, max = Infinity } = {}) {
  if (value == null) return;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
    issues.push(issue(field, `${field} must be finite and between ${min} and ${max}.`));
  }
}
function isDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

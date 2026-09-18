import fs from "node:fs";
import path from "node:path";
import { NARRATIVE_CONSUMER_AUDIT_ROWS } from "../src/fixtures/narrativeV3ConsumerAuditRows.js";

const files = [];
function inventory(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) inventory(file);
    else if (/\.(?:js|jsx|ts|tsx|swift|json)$/.test(file)) files.push(file.replaceAll("\\", "/"));
  }
}
inventory("src");
const normalSources = files.filter((file) => !/\.(?:test|spec|stories)\./.test(file) && !file.includes("/intelligence/v3/") && !file.includes("/fixtures/"));
const meaning = /confidence|recommendation|coach(?:ing)?|on track|ahead of schedule|what.*means|supports? (?:the|your) (?:goal|plan)|strategy|priority|interpretation|guardrail|progression/iu;
const leakage = /strategy_supported|not_assessed|confirm_persistence|feasibility|persistence|attribution|semanticFingerprint|evidence_submission_|providerId|storageKey|objectStore|blockingReasons|configured guardrail|no conclusion was manufactured/iu;
const candidates = normalSources.flatMap((file) => {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const hits = lines.flatMap((text, index) => meaning.test(text) || leakage.test(text) ? [{ line: index + 1, meaningCandidate: meaning.test(text), leakageCandidate: leakage.test(text), excerpt: text.trim().slice(0, 210) }] : []);
  return hits.length ? [{ file, hitCount: hits.length, hits }] : [];
});
const rows = NARRATIVE_CONSUMER_AUDIT_ROWS.map((row) => {
  const exists = fs.existsSync(row.file);
  const lines = exists ? fs.readFileSync(row.file, "utf8").split(/\r?\n/) : [];
  const index = lines.findIndex((line) => line.includes(row.anchor));
  const strategic = row.classification === "D";
  const confidence = strategic && /confidence|wheel|live Goal|Goal consumer|trajectory|publisher|Weekly|Midweek|Monthly|Daily|Event|Goal hub/iu.test(`${row.component} ${row.action}`);
  return { ...row, sourceVerified: exists && index >= 0, line: index + 1, exampleSource: index >= 0 ? lines[index].trim().slice(0, 260) : null,
    v3ShouldOwn: strategic ? "canonical strategic semantics" : row.classification === "E" ? "approved display-safe domain/strategic boundary as applicable" : "no strategic engine required",
    confidenceV3Feeds: confidence ? "yes" : strategic ? "when relevant, not automatically" : "no",
    narrativeV3Composes: strategic ? "yes, when natural-language meaning is required" : "no; typed factual/static/domain presentation",
    leakage: row.classification === "E" ? row.action.startsWith("Potential") ? "potential contract leakage; Native rendering unverified" : "confirmed source sink" : "none confirmed in this content family; not a proof of no future leak",
    risk: row.classification === "E" || strategic ? "high: divergent meaning or implementation leakage" : row.classification === "F" ? "high: separate product/architecture acceptance" : "low: preserve current boundary",
    dependencies: strategic ? "approved plumbing; Goal Contract mappings; canonical as-of assessment; publisher lineage; later client presentation parity" : row.classification === "E" ? "display-safe presentation adapter and text/a11y contract tests" : row.classification === "F" ? "dedicated Founder-approved rework" : "existing typed domain/read contracts",
  };
});
const totals = Object.fromEntries(["A", "B", "C", "D", "E", "F"].map((key) => [key, rows.filter((row) => row.classification === key).length]));
const group = process.argv.includes("--group") ? process.argv[process.argv.indexOf("--group") + 1] : null;
console.log(JSON.stringify({ schemaVersion: "narrative_v3_source_audit_v1", scope: "repository server contracts and Web/client presentation source; Native Swift implementation not present", sourceInventoryCount: files.length, productionSourceFilesScanned: normalSources.length,
  candidateFiles: candidates.length, scanCandidatesAreNotConfirmedFindings: true, classificationCountingUnit: "reviewed content families, not mutually exclusive whole pages", totals,
  verified: rows.every((row) => row.sourceVerified), confirmedLeakageSinks: rows.filter((row) => row.classification === "E" && row.leakage.startsWith("confirmed")).length,
  nativeSwiftSourceFiles: files.filter((file) => file.endsWith(".swift")), rows: process.argv.includes("--summary") || process.argv.includes("--inventory") ? undefined : group ? rows.filter((row) => row.surface === group) : rows, sourceCandidateInventory: process.argv.includes("--summary") || group ? undefined : candidates,
  exclusions: ["opaque IDs used as React keys, routes, hidden form fields or lineage metadata are not visible leakage", "restricted debug/lab output is not normal-user leakage", "normal labels completed/active and safe source names Connected/Suggested are not automatically raw enums"],
  productionMutations: 0, nativeWebChanges: 0 }, (key, value) => key === "hits" ? undefined : value, 2));
if (rows.some((row) => !row.sourceVerified)) process.exitCode = 1;

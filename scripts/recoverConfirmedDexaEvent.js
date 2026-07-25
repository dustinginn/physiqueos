import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { reprocessConfirmedDexaEventInPlace, CONFIRMED_DEXA_INCIDENT } from "../src/domain/services/ConfirmedDexaEventRecoveryService";

loadEnvConfig(process.cwd(), false, { info() {}, error() {} });

async function main() {
const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const expectedHashArg = process.argv.find((value) => value.startsWith("--expected-hash="));
const expectedHash = expectedHashArg?.split("=")[1] ?? null;
const source = path.resolve(process.cwd(), "private", "founder", "runtime-store.json");
const pdfPath = path.resolve(process.cwd(), CONFIRMED_DEXA_INCIDENT.sourcePath);
const bytes = fs.readFileSync(source);
const beforeHash = sha(bytes);
if (expectedHash && beforeHash !== expectedHash) throw new Error(`Runtime-store hash changed: expected ${expectedHash}, received ${beforeHash}.`);

const store = JSON.parse(bytes);
const before = fingerprint(store);
const result = await reprocessConfirmedDexaEventInPlace({
  pdfBuffer: fs.readFileSync(pdfPath),
  store,
});
const candidateBytes = Buffer.from(JSON.stringify(result.candidate));
const after = fingerprint(result.candidate);
const report = {
  operation: "reprocessConfirmedDexaEventInPlace",
  mode: apply ? "apply" : "dry-run",
  changed: result.changed,
  source: { path: source, hash: beforeHash, bytes: bytes.length, mtime: fs.statSync(source).mtime.toISOString() },
  candidate: { hash: sha(candidateBytes), bytes: candidateBytes.length },
  before,
  after,
  recovery: result.recovery,
};

if (!apply) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}
if (!expectedHash) throw new Error("--apply requires --expected-hash=<sha256>.");
if (!result.changed) throw new Error("Recovery was already completed; no production write was performed.");

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const directory = path.resolve(process.cwd(), "private", "founder", "incident-recovery", `dexa-20260718-${stamp}`);
fs.mkdirSync(directory, { recursive: false });
const backup = path.join(directory, `runtime-store.pre-dexa-recovery.${beforeHash.slice(0, 12)}.json`);
const candidatePath = path.join(directory, `runtime-store.dexa-recovery-candidate.${sha(candidateBytes).slice(0, 12)}.json`);
const reportPath = path.join(directory, "recovery-report.json");
const temp = `${source}.dexa-recovery-${process.pid}.tmp`;

try {
  fs.writeFileSync(backup, bytes, { flag: "wx" });
  if (sha(fs.readFileSync(backup)) !== beforeHash) throw new Error("Backup verification failed.");
  fs.writeFileSync(candidatePath, candidateBytes, { flag: "wx" });
  JSON.parse(fs.readFileSync(candidatePath, "utf8"));
  if (sha(fs.readFileSync(source)) !== beforeHash) throw new Error("Runtime store changed while recovery candidate was built.");
  fs.writeFileSync(temp, candidateBytes, { flag: "wx" });
  fs.renameSync(temp, source);
  const promoted = fs.readFileSync(source);
  if (sha(promoted) !== sha(candidateBytes)) throw new Error("Promoted runtime-store verification failed.");
  const complete = { ...report, status: "completed", backup, candidatePath, final: { hash: sha(promoted), bytes: promoted.length, mtime: fs.statSync(source).mtime.toISOString() } };
  fs.writeFileSync(reportPath, JSON.stringify(complete, null, 2), { flag: "wx" });
  console.log(JSON.stringify(complete, null, 2));
} catch (error) {
  if (fs.existsSync(temp)) fs.unlinkSync(temp);
  if (fs.existsSync(backup) && sha(fs.readFileSync(source)) !== beforeHash) fs.copyFileSync(backup, source);
  fs.writeFileSync(reportPath, JSON.stringify({ ...report, status: "failed-restored", backup, error: String(error?.stack ?? error) }, null, 2), { flag: "wx" });
  throw error;
}
}

function sha(value) {
  return crypto.createHash("sha256").update(value).digest("hex").toUpperCase();
}

function fingerprint(value) {
  const incident = {
    packages: value.evidencePackages.filter((item) => item.package_id === CONFIRMED_DEXA_INCIDENT.packageId),
    reviews: value.evidenceReviews.filter((item) => item.id === CONFIRMED_DEXA_INCIDENT.reviewId),
    canonicalDexa: value.canonicalEvidenceObjects.filter((item) => item.evidence_type === "dexa_scan"),
    dexaScans: value.dexaScans,
    analyses: value.analyses.filter((item) => item.evidenceTypes?.some((type) => ["dexa", "dexa_scan"].includes(type))),
    events: value.dailyBriefings.filter((item) => item.trigger?.evidenceType === "dexa"),
  };
  return {
    counts: Object.fromEntries(["evidencePackages", "evidenceReviews", "canonicalEvidenceObjects", "dexaScans", "analyses", "dailyBriefings", "goals"].map((key) => [key, value[key]?.length ?? 0])),
    incidentHash: sha(Buffer.from(JSON.stringify(incident))),
    unrelatedHash: sha(Buffer.from(JSON.stringify({
      weightEntries: value.weightEntries,
      progressPhotos: value.progressPhotos,
      protocols: value.protocols,
      nutritionRecords: value.nutritionRecords,
      dailyCheckIns: value.dailyCheckIns,
    }))),
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

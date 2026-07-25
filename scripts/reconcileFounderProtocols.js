import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  createProtocolReconciliationMigrationService,
  fingerprintProtocolReconciliationPlan,
} from "../src/domain/services/ProtocolReconciliationMigrationService.js";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const source = path.resolve(process.cwd(), "private", "founder", "runtime-store.json");
const service = createProtocolReconciliationMigrationService({ filePath: source });
const preview = service.preview();
const candidateOutput = valueFor("--candidate-output=");

if (!apply) {
  if (candidateOutput && preview.candidate) {
    fs.writeFileSync(path.resolve(candidateOutput), `${JSON.stringify(preview.candidate)}\n`, "utf8");
  }
  process.stdout.write(`${JSON.stringify({
    mode: "preview",
    status: preview.status,
    runtimeHash: sha(fs.readFileSync(source)),
    planFingerprint: fingerprintProtocolReconciliationPlan(preview.plan),
    criticalBaseline: preview.baseline ? {
      projectionVersion: preview.baseline.projectionVersion,
      criticalFingerprint: preview.baseline.goalEditCriticalFingerprint,
      phaseFingerprint: preview.baseline.phaseFingerprint,
      founderRevision: preview.baseline.founderRevision,
      activeGoalId: preview.baseline.activeGoalId,
    } : null,
    plan: preview.plan,
    report: preview.report,
    candidateOutput: candidateOutput ? path.resolve(candidateOutput) : null,
  }, null, 2)}\n`);
  process.exit(0);
}

const expectedHash = valueFor("--expected-hash=");
const expectedPlan = valueFor("--expected-plan=");
if (!expectedHash || !expectedPlan) {
  throw new Error("--apply requires --expected-hash and --expected-plan from a reviewed preview.");
}
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = path.resolve(process.cwd(), "private", "founder", "backups");
const backup = path.join(backupDir, `runtime-store.protocol-reconciliation.${stamp}.json`);
fs.mkdirSync(backupDir, { recursive: true });
fs.copyFileSync(source, backup, fs.constants.COPYFILE_EXCL);
if (sha(fs.readFileSync(backup)) !== expectedHash) throw new Error("Verified backup hash does not match the authorized runtime hash.");
const result = await service.execute({
  expectedRuntimeHash: expectedHash,
  expectedPlanFingerprint: expectedPlan,
});
process.stdout.write(`${JSON.stringify({
  mode: "apply",
  backup,
  backupHash: sha(fs.readFileSync(backup)),
  result,
}, null, 2)}\n`);

function valueFor(prefix) {
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}
function sha(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

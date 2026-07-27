import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { FounderRepositories } from "../src/data/repositories/founderRepositories.js";
import { resolveFounderRuntimeStorePath } from "../src/data/repositories/founderRuntimeStore.js";
import { createMidweekBriefingService } from "../src/domain/services/MidweekBriefingService.js";
import { createFounderMidweekBriefingPersistenceService } from "../src/domain/services/WeeklyBriefingPersistenceService.js";

const REQUIRED = [
  "target-artifact-id", "expected-hash", "expected-revision",
  "expected-target-digest", "reason", "backup-path",
];

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const missing = REQUIRED.filter((key) => !args[key]);
  if (missing.length) return fail("invalid_request", `Missing required arguments: ${missing.join(", ")}`);
  const user = await FounderRepositories.users.getCurrentUser();
  if (!user?.id) return fail("user_not_found", "Founder user was not found.");
  const persistence = createFounderMidweekBriefingPersistenceService();
  const service = createMidweekBriefingService({
    repositories: FounderRepositories,
    midweekPersistence: persistence,
  });
  const prepared = await service.prepareRegeneration({
    userId: user.id,
    reason: args.reason,
    targetArtifactId: args["target-artifact-id"],
  });
  const priorDigest = semanticDigest(prepared.existing);
  const candidateDigest = semanticDigest(prepared.artifact);
  const checks = {
    fileHash: prepared.baseline.fileHash === String(args["expected-hash"]).toUpperCase(),
    revision: prepared.baseline.revision === Number(args["expected-revision"]),
    targetDigest: priorDigest === String(args["expected-target-digest"]).toUpperCase(),
    targetIdentity: prepared.existing.id === args["target-artifact-id"],
    cadence: prepared.artifact.cadence === "midweek",
    evidenceWindow: prepared.artifact.evidenceWindow?.id ===
      "midweek:2026-07-19:2026-07-21:America/Los_Angeles",
    narrativeVersion: prepared.artifact.briefing?.version === "midweek_briefing_v1",
    semanticScope: semanticDigest(stripExpectedChanges(prepared.existing)) ===
      semanticDigest(stripExpectedChanges(prepared.artifact)),
  };
  if (Object.values(checks).some((value) => value !== true)) {
    return fail("precondition_failed", "Controlled Midweek regeneration preconditions did not match.", {
      checks, baseline: summarizeBaseline(prepared.baseline), priorDigest, candidateDigest,
    });
  }
  const preparation = summarizeArtifact(prepared.artifact);
  if (args.execute !== true) return output({
    mode: "dry_run", status: "prepared", checks,
    baseline: summarizeBaseline(prepared.baseline), priorDigest,
    candidateDigest, preparation,
  });

  const backup = createVerifiedBackup({
    sourcePath: resolveFounderRuntimeStorePath(),
    backupPath: path.resolve(args["backup-path"]),
    expectedHash: prepared.baseline.fileHash,
  });
  const result = await service.executePreparedRegeneration({ prepared });
  output({
    mode: "execute", status: result.status, committed: result.committed,
    checks, baseline: summarizeBaseline(prepared.baseline), priorDigest,
    candidateDigest, preparation, backup,
    commit: {
      revision: result.revision ?? null,
      commitId: result.commitId ?? null,
      updatedAt: result.updatedAt ?? null,
    },
    error: result.error ?? null,
  });
  if (result.status !== "regenerated") process.exitCode = 1;
}

function stripExpectedChanges(artifact) {
  const copy = structuredClone(artifact);
  delete copy.generatedAt;
  delete copy.updatedAt;
  delete copy.replacedBriefingHistory;
  if (copy.briefing) {
    delete copy.briefing.generatedAt;
    delete copy.briefing.goalConfidence;
  }
  return copy;
}

function summarizeArtifact(artifact) {
  const confidence = artifact?.briefing?.goalConfidence;
  return {
    artifactId: artifact?.id, cadence: artifact?.cadence,
    windowId: artifact?.evidenceWindow?.id,
    briefingDate: artifact?.evidenceWindow?.briefingDate,
    narrativeVersion: artifact?.briefing?.version,
    confidence,
  };
}

function createVerifiedBackup({ sourcePath, backupPath, expectedHash }) {
  if (fs.existsSync(backupPath)) throw new Error("Backup target already exists.");
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  const bytes = fs.readFileSync(sourcePath);
  if (digest(bytes) !== expectedHash) throw new Error("Runtime changed before backup.");
  fs.writeFileSync(backupPath, bytes);
  const backupHash = digest(fs.readFileSync(backupPath));
  if (backupHash !== expectedHash) throw new Error("Backup verification failed.");
  return { path: backupPath, hash: backupHash, size: bytes.length };
}

function summarizeBaseline(value) {
  return {
    fileHash: value.fileHash, semanticDigest: value.semanticDigest,
    revision: value.revision, lastCommitId: value.lastCommitId,
    updatedAt: value.updatedAt,
  };
}
function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--execute") { result.execute = true; continue; }
    if (!item.startsWith("--")) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) continue;
    result[item.slice(2)] = value;
    index += 1;
  }
  return result;
}
function semanticDigest(value) { return digest(stableSerialize(value)); }
function digest(value) { return crypto.createHash("sha256").update(value).digest("hex").toUpperCase(); }
function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function output(value) { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); return value; }
function fail(status, message, details = null) {
  output({ mode: "dry_run", status, committed: false, error: { code: status, message }, details });
  process.exitCode = 1;
}
main().catch((error) => {
  output({ status: "execution_failure", committed: Boolean(error?.committed),
    error: { code: error?.code ?? "unknown_error", message: String(error?.message ?? error) } });
  process.exitCode = 1;
});

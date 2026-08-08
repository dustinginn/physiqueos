import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { parseOperationalJsonBytes, readOperationalJsonFileSync } from "./operationalJson.mjs";

export const FOUNDER_RUNTIME_BACKUP_VERSION = "founder_runtime_backup_v1";

export function createFounderRuntimeBackup({
  sourcePath,
  destinationRoot,
  operator,
  gitCommit,
  buildIdentity,
  now = () => new Date(),
  testHooks = {},
} = {}) {
  const source = requiredFile(sourcePath, "sourcePath");
  const destination = required(destinationRoot, "destinationRoot");
  const actor = required(operator, "operator");
  const commit = required(gitCommit, "gitCommit");
  const build = required(buildIdentity, "buildIdentity");
  assertNoActiveMutation(source);

  const beforeStat = fs.statSync(source);
  const sourceBytes = fs.readFileSync(source);
  const sourceHash = sha256(sourceBytes);
  const parsed = parseOperationalJsonBytes(sourceBytes,
    { filePath: source, stage: "founder_backup_source" });
  const capturedAt = new Date(now()).toISOString();
  const timestamp = capturedAt.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const finalName = `FounderRuntimeBackup_${timestamp}_${sourceHash.slice(0, 12)}`;
  const destinationPath = path.resolve(destination);
  const finalDirectory = path.join(destinationPath, finalName);
  if (fs.existsSync(finalDirectory)) throw backupError("BACKUP_EXISTS", "Backup already exists.");
  fs.mkdirSync(destinationPath, { recursive: true });
  const stagingDirectory = path.join(destinationPath,
    `.founder-backup-incomplete-${process.pid}-${randomUUID()}`);
  fs.mkdirSync(stagingDirectory, { recursive: false });
  try {
    const backupPath = path.join(stagingDirectory, "runtime-store.json");
    fs.writeFileSync(backupPath, sourceBytes, { flag: "wx", mode: 0o600 });
    const backupHandle = fs.openSync(backupPath, "r+");
    try { fs.fsyncSync(backupHandle); } finally { fs.closeSync(backupHandle); }
    testHooks.afterCopy?.({ sourcePath: source, backupPath });

    const afterStat = fs.statSync(source);
    const sourceAfterBytes = fs.readFileSync(source);
    const sourceAfterHash = sha256(sourceAfterBytes);
    if (beforeStat.size !== afterStat.size || beforeStat.mtimeMs !== afterStat.mtimeMs ||
        sourceHash !== sourceAfterHash) {
      throw backupError("SOURCE_CHANGED", "Founder source changed during backup.");
    }
    const backupBytes = fs.readFileSync(backupPath);
    const backupHash = sha256(backupBytes);
    if (backupBytes.length !== sourceBytes.length || backupHash !== sourceHash) {
      throw backupError("HASH_MISMATCH", "Founder backup hash does not match its source.");
    }
    const lineage = captureLineage(parsed);
    const manifest = {
      schemaVersion: FOUNDER_RUNTIME_BACKUP_VERSION,
      immutable: true,
      capturedAt,
      operator: actor,
      source: {
        path: source,
        size: sourceBytes.length,
        modifiedAt: beforeStat.mtime.toISOString(),
        sha256: sourceHash,
      },
      backup: {
        fileName: "runtime-store.json",
        size: backupBytes.length,
        sha256: backupHash,
      },
      founderStore: {
        revision: Number(parsed.revision ?? 0),
        commitId: parsed.lastCommitId ?? null,
        activeGoalId: lineage.goalId,
        activeGoalFingerprint: lineage.goalFingerprint,
        currentPhaseId: lineage.phaseId,
        currentPhaseFingerprint: lineage.phaseFingerprint,
        latestConfidenceAssessmentId: lineage.confidenceAssessmentId,
        latestConfidenceFingerprint: lineage.confidenceFingerprint,
      },
      application: { gitCommit: commit, buildIdentity: build },
      restoration: {
        mode: "byte_for_byte_only",
        requiresRuntimeStopped: true,
        requiresNoLaterStoreRevision: true,
        expectedRestoredSha256: sourceHash,
      },
    };
    const manifestPath = path.join(stagingDirectory, "manifest.json");
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`,
      { flag: "wx", mode: 0o400 });
    verifyFounderRuntimeBackup({ backupDirectory: stagingDirectory });
    try { fs.chmodSync(backupPath, 0o400); fs.chmodSync(manifestPath, 0o400); } catch {}
    fs.renameSync(stagingDirectory, finalDirectory);
    return Object.freeze({ directory: finalDirectory,
      backupPath: path.join(finalDirectory, "runtime-store.json"),
      manifestPath: path.join(finalDirectory, "manifest.json"),
      manifest: deepFreeze(structuredClone(manifest)) });
  } catch (error) {
    try { fs.rmSync(stagingDirectory, { recursive: true, force: true }); } catch {}
    throw error;
  }
}

export function verifyFounderRuntimeBackup({ backupDirectory } = {}) {
  const directory = path.resolve(required(backupDirectory, "backupDirectory"));
  const manifestPath = path.join(directory, "manifest.json");
  const backupPath = path.join(directory, "runtime-store.json");
  const manifest = readOperationalJsonFileSync(manifestPath,
    { stage: "founder_backup_manifest_verification" });
  if (manifest.schemaVersion !== FOUNDER_RUNTIME_BACKUP_VERSION ||
      manifest.immutable !== true) {
    throw backupError("MANIFEST_INVALID", "Founder backup manifest is invalid.");
  }
  const bytes = fs.readFileSync(backupPath);
  if (bytes.length !== manifest.backup.size || sha256(bytes) !== manifest.backup.sha256 ||
      manifest.backup.sha256 !== manifest.source.sha256) {
    throw backupError("HASH_MISMATCH", "Founder backup verification failed.");
  }
  parseOperationalJsonBytes(bytes,
    { filePath: backupPath, stage: "founder_backup_payload_verification" });
  return Object.freeze({ valid: true, backupPath, manifestPath,
    sha256: manifest.backup.sha256, size: bytes.length, manifest: deepFreeze(manifest) });
}

function assertNoActiveMutation(sourcePath) {
  if (fs.existsSync(`${sourcePath}.mutation.lock`) ||
      fs.existsSync(`${sourcePath}.mutation.lock.recovery`)) {
    throw backupError("ACTIVE_LOCK", "Founder mutation ownership is active or uncertain.");
  }
  const directory = path.dirname(sourcePath);
  const prefix = `${path.basename(sourcePath)}.`;
  const temps = fs.readdirSync(directory).filter((name) =>
    name.startsWith(prefix) && name.endsWith(".tmp"));
  if (temps.length) throw backupError("ACTIVE_TEMP", "Founder commit temp file exists.");
}

function captureLineage(store) {
  const goal = (store.goals ?? []).find((item) => item.userId === "user_founder_001" &&
    item.primary === true && item.status === "active") ?? null;
  const phase = goal?.phases?.find((item) => item.id === goal.currentPhaseId) ??
    goal?.phases?.find((item) => ["active", "review_due", "review_pending_decision"]
      .includes(item.status)) ?? null;
  const snapshot = (store.goalConfidenceSnapshots ?? []).find((item) =>
    item.goalId === goal?.id) ?? null;
  const assessmentId = snapshot?.currentAssessmentId ?? snapshot?.assessmentId ?? null;
  const confidence = (store.goalConfidenceHistory ?? []).find((item) =>
    item.assessmentId === assessmentId) ?? snapshot;
  return {
    goalId: goal?.id ?? null,
    goalFingerprint: fingerprint(goal),
    phaseId: phase?.id ?? null,
    phaseFingerprint: fingerprint(phase),
    confidenceAssessmentId: assessmentId,
    confidenceFingerprint: fingerprint(confidence),
  };
}

function fingerprint(value) {
  if (value == null) return null;
  return `sha256_${sha256(Buffer.from(stableJson(value))).toLowerCase()}`;
}
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function sha256(value) { return createHash("sha256").update(value).digest("hex").toUpperCase(); }
function required(value, field) { if (typeof value !== "string" || !value.trim())
  throw new TypeError(`${field} is required.`); return value.trim(); }
function requiredFile(value, field) { const resolved = path.resolve(required(value, field));
  if (!fs.statSync(resolved).isFile()) throw new TypeError(`${field} must be a file.`); return resolved; }
function backupError(code, message) { const error = new Error(message); error.code =
  `FOUNDER_RUNTIME_BACKUP_${code}`; return error; }
function deepFreeze(value) { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze); return Object.freeze(value); }

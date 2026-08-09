import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

export function isRobocopySuccess(exitCode) {
  return Number.isInteger(exitCode) && exitCode >= 0 && exitCode < 8;
}

function runRobocopy({ sourceBackupPath, replicaBackupPath, timeoutMs }) {
  return spawnSync("robocopy", [
    sourceBackupPath,
    replicaBackupPath,
    "/E",
    "/Z",
    "/R:2",
    "/W:2",
    "/COPY:DAT",
    "/DCOPY:DAT",
    "/XJ",
    "/NP",
    "/NFL",
    "/NDL",
    "/NJH",
    "/NJS",
  ], {
    encoding: "utf8",
    timeout: timeoutMs,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
}

function verifyReplica({ sourceBackupPath, replicaBackupPath, timeoutMs }) {
  const verifierPath = fileURLToPath(new URL("./verifyRepositoryBackup.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [
    verifierPath,
    "--compare-source",
    sourceBackupPath,
    "--compare-replica",
    replicaBackupPath,
  ], {
    encoding: "utf8",
    timeout: timeoutMs,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
  if (result.error?.code === "ETIMEDOUT") {
    const error = new Error("External replica verification timed out");
    error.code = "ETIMEDOUT";
    throw error;
  }
  if (result.status !== 0) {
    throw new Error(String(result.stderr || result.error?.message || "Replica verification failed").trim());
  }
  return JSON.parse(result.stdout);
}

export function replicateRepositoryBackup({
  sourceBackupPath,
  externalBackupDirectory,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  runner = runRobocopy,
  verifier = verifyReplica,
}) {
  if (!sourceBackupPath || !externalBackupDirectory) {
    throw new Error("Source backup and external backup directory are required");
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("Replication timeout must be a positive number");
  }

  const source = path.resolve(sourceBackupPath);
  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
    throw new Error(`Verified local backup directory is missing: ${source}`);
  }
  const externalRoot = path.resolve(externalBackupDirectory);
  const replica = path.join(externalRoot, path.basename(source));
  const copyResult = runner({
    sourceBackupPath: source,
    replicaBackupPath: replica,
    timeoutMs,
  });

  if (copyResult?.error?.code === "ETIMEDOUT") {
    return failure(source, replica, null, "timeout", "External replication timed out");
  }
  const exitCode = copyResult?.status;
  if (!isRobocopySuccess(exitCode)) {
    const detail = String(
      copyResult?.stderr || copyResult?.stdout || copyResult?.error?.message || "",
    ).trim();
    return failure(
      source,
      replica,
      Number.isInteger(exitCode) ? exitCode : null,
      "robocopy_failed",
      detail || `Robocopy failed with exit code ${exitCode ?? "unavailable"}`,
    );
  }

  try {
    const verification = verifier({
      sourceBackupPath: source,
      replicaBackupPath: replica,
      timeoutMs,
    });
    return {
      schemaVersion: "physiqueos_external_backup_replication_v1",
      status: "verified",
      localBackupPath: source,
      externalBackupPath: replica,
      robocopyExitCode: exitCode,
      verification,
    };
  } catch (error) {
    const reason = error.code === "ETIMEDOUT" ? "verification_timeout" : "verification_failed";
    return failure(source, replica, exitCode, reason, error.message);
  }
}

function failure(localBackupPath, externalBackupPath, robocopyExitCode, reason, message) {
  return {
    schemaVersion: "physiqueos_external_backup_replication_v1",
    status: "failed",
    localBackupPath,
    externalBackupPath,
    robocopyExitCode,
    reason,
    message,
  };
}

function parseArguments(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) result[argv[index]] = argv[index + 1];
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const result = replicateRepositoryBackup({
      sourceBackupPath: options["--source"],
      externalBackupDirectory: options["--external-root"],
      timeoutMs: options["--timeout-ms"] === undefined
        ? DEFAULT_TIMEOUT_MS
        : Number(options["--timeout-ms"]),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.status === "verified" ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  }
}

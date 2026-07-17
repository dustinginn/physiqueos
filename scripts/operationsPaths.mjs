import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const founderRoot = path.join(projectRoot, "private", "founder");
export const operationsPaths = Object.freeze({
  serverLogs: path.join(founderRoot, "logs", "server"),
  recoveryLogs: path.join(founderRoot, "logs", "recovery"),
  migrationLogs: path.join(founderRoot, "logs", "migrations"),
  testLogs: path.join(founderRoot, "logs", "tests"),
  debugLogs: path.join(founderRoot, "logs", "debug"),
  temporary: path.join(founderRoot, "tmp"),
  backups: path.join(founderRoot, "backups"),
  incidentRecovery: path.join(founderRoot, "incident-recovery"),
});

export function ensureOperationsDirectories() {
  Object.values(operationsPaths).forEach((directory) => fs.mkdirSync(directory, { recursive: true }));
  return operationsPaths;
}

export function safeOperationsTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

export function createLogPair(name, category = "serverLogs", date = new Date()) {
  const directory = operationsPaths[category];
  if (!directory) throw new Error(`Unknown operations log category: ${category}`);
  fs.mkdirSync(directory, { recursive: true });
  const stem = `${sanitizeName(name)}-${safeOperationsTimestamp(date)}`;
  return { stdout: path.join(directory, `${stem}.out.log`), stderr: path.join(directory, `${stem}.err.log`) };
}

function sanitizeName(value) {
  const name = String(value ?? "operation").trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return name || "operation";
}

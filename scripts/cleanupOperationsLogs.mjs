import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ensureOperationsDirectories, operationsPaths } from "./operationsPaths.mjs";

const LOG_DIRECTORIES = ["serverLogs", "recoveryLogs", "migrationLogs", "testLogs", "debugLogs", "temporary"];

export function selectOperationLogsForCleanup({ directories = operationsPaths, now = Date.now(), olderThanDays = null, retain = 20 } = {}) {
  const selected = [];
  for (const category of LOG_DIRECTORIES) {
    const directory = directories[category];
    if (!fs.existsSync(directory)) continue;
    const files = fs.readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && isGeneratedLog(entry.name))
      .map((entry) => {
        const filePath = path.join(directory, entry.name);
        return { category, filePath, name: entry.name, mtimeMs: fs.statSync(filePath).mtimeMs };
      })
      .sort((left, right) => right.mtimeMs - left.mtimeMs || left.name.localeCompare(right.name));
    files.forEach((file, index) => {
      const exceedsRetention = index >= retain;
      const exceedsAge = olderThanDays !== null && now - file.mtimeMs >= olderThanDays * 86400000;
      if (exceedsRetention || exceedsAge) selected.push({ ...file, reason: exceedsAge ? `older than ${olderThanDays} days` : `outside newest ${retain}` });
    });
  }
  return selected;
}

export function runCleanup({ apply = false, olderThanDays = null, retain = 20 } = {}) {
  ensureOperationsDirectories();
  const selected = selectOperationLogsForCleanup({ olderThanDays, retain });
  console.log(`${apply ? "Applying" : "Dry run for"} operations log cleanup: ${selected.length} eligible file(s).`);
  selected.forEach((file) => {
    console.log(`${apply ? "DELETE" : "WOULD DELETE"} ${path.relative(process.cwd(), file.filePath)} (${file.reason})`);
    if (apply) fs.unlinkSync(file.filePath);
  });
  console.log("Runtime stores, backups, evidence, uploads, and incident-recovery snapshots are outside cleanup scope.");
  return selected;
}

function isGeneratedLog(name) { return /(?:\.log|\.out|\.err)$/i.test(name); }
function parseArgs(values) {
  const options = { apply: false, retain: 20, olderThanDays: null };
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === "--apply") options.apply = true;
    else if (values[index] === "--retain") options.retain = parseNonNegativeInteger(values[++index], "--retain");
    else if (values[index] === "--older-than-days") options.olderThanDays = parseNonNegativeInteger(values[++index], "--older-than-days");
    else throw new Error(`Unknown argument: ${values[index]}`);
  }
  return options;
}
function parseNonNegativeInteger(value, flag) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${flag} requires a non-negative integer.`);
  return parsed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runCleanup(parseArgs(process.argv.slice(2)));

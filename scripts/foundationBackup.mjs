import path from "node:path";
import { createPostgresBackupTool } from "../src/platform/backup/PostgresBackupTool.js";

const [command, fileArgument] = process.argv.slice(2);
const connectionString = String(process.env.PHYSIQUEOS_BACKUP_DATABASE_URL ?? "").trim();
if (!connectionString) throw new Error("PHYSIQUEOS_BACKUP_DATABASE_URL is required.");
if (!fileArgument) throw new Error("A bounded backup file path is required.");
const filePath = path.resolve(fileArgument);
const tool = createPostgresBackupTool();

if (command === "create") {
  const result = await tool.createBackup({ connectionString, outputPath: filePath });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} else if (command === "restore-isolated") {
  assertIsolatedRestoreTarget(connectionString);
  const result = await tool.restoreBackup({ connectionString, inputPath: filePath });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} else {
  throw new Error("Use foundationBackup.mjs create <file.dump> or restore-isolated <file.dump>.");
}

function assertIsolatedRestoreTarget(value) {
  const database = decodeURIComponent(new URL(value).pathname.replace(/^\//, ""));
  if (!/^physiqueos_(?:phase2_test|restore)(?:_|$)/.test(database)) throw new Error("Refusing to restore into a database that is not explicitly isolated.");
}

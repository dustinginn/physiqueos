import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

export function createPostgresBackupTool({ execute = executeCommand } = {}) {
  return Object.freeze({
    async createBackup({ connectionString, outputPath }) {
      assertBackupPath(outputPath);
      await execute("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", `--file=${outputPath}`], postgresEnvironment(connectionString));
      return inspectFile(outputPath);
    },
    async restoreBackup({ connectionString, inputPath }) {
      assertBackupPath(inputPath);
      const connection = postgresEnvironment(connectionString);
      await execute("pg_restore", ["--clean", "--if-exists", "--no-owner", "--no-privileges", `--dbname=${connection.PGDATABASE}`, inputPath], connection);
      return Object.freeze({ restored: true, inputPath: path.resolve(inputPath) });
    },
  });
}

async function inspectFile(filePath) {
  const bytes = await fs.readFile(filePath);
  return Object.freeze({ filename: path.basename(filePath), byteLength: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
}
function assertBackupPath(filePath) {
  const resolved = path.resolve(filePath);
  if (!/\.(dump|backup)$/i.test(resolved)) throw new Error("PostgreSQL backup files must use .dump or .backup.");
}
function postgresEnvironment(connectionString) {
  const parsed = new URL(connectionString);
  if (!/^postgres(?:ql)?:$/.test(parsed.protocol)) throw new Error("A PostgreSQL connection URL is required.");
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!database) throw new Error("The PostgreSQL connection URL must name a database.");
  return {
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || "5432",
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGDATABASE: database,
    ...(parsed.searchParams.get("sslmode") ? { PGSSLMODE: parsed.searchParams.get("sslmode") } : {}),
  };
}
function executeCommand(command, args, extraEnvironment) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...extraEnvironment } });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`PostgreSQL backup command failed with exit code ${code}: ${stderr.slice(0, 500)}`)));
  });
}

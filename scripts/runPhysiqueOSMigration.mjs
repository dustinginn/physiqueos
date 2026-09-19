import { runner as migrate } from "node-pg-migrate";
import { createPhysiqueOSMigrationOptions } from "./physiqueOSMigrationDiscovery.mjs";

const operation = String(process.argv[2] ?? "");
if (!new Set(["up", "down", "dry-run"]).has(operation)) {
  throw new Error("Usage: node scripts/runPhysiqueOSMigration.mjs <up|down|dry-run>");
}

const databaseUrl = String(process.env.PHYSIQUEOS_DATABASE_URL ?? "").trim();
if (!databaseUrl) throw new Error("PHYSIQUEOS_DATABASE_URL is required.");

await migrate({
  ...createPhysiqueOSMigrationOptions({ databaseUrl }),
  direction: operation === "down" ? "down" : "up",
  ...(operation === "down" ? { createSchema: false, createMigrationsSchema: false } : {}),
  ...(operation === "dry-run" ? { dryRun: true } : {}),
});

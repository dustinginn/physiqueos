export function readDatabaseConfig(env = process.env) {
  const enabled = env.PHYSIQUEOS_DATABASE_ENABLED === "1";
  const connectionString = String(env.PHYSIQUEOS_DATABASE_URL ?? "").trim();
  if (enabled && !connectionString) {
    throw new Error("PHYSIQUEOS_DATABASE_URL is required when PHYSIQUEOS_DATABASE_ENABLED=1.");
  }
  return Object.freeze({
    enabled,
    connectionString: enabled ? connectionString : null,
    applicationName: String(env.PHYSIQUEOS_DATABASE_APPLICATION_NAME ?? "physiqueos-foundation"),
    maximumPoolSize: normalizePoolSize(env.PHYSIQUEOS_DATABASE_POOL_MAX),
    statementTimeoutMs: normalizeTimeout(env.PHYSIQUEOS_DATABASE_STATEMENT_TIMEOUT_MS),
  });
}

function normalizePoolSize(value) {
  if (value == null || value === "") return 5;
  const result = Number(value);
  if (!Number.isInteger(result) || result < 1 || result > 20) throw new Error("Database pool maximum must be between 1 and 20.");
  return result;
}

function normalizeTimeout(value) {
  if (value == null || value === "") return 15_000;
  const result = Number(value);
  if (!Number.isInteger(result) || result < 1_000 || result > 120_000) throw new Error("Database statement timeout is invalid.");
  return result;
}

export function readDatabaseConfig(env = process.env) {
  const enabled = env.PHYSIQUEOS_DATABASE_ENABLED === "1";
  const connectionString = String(env.PHYSIQUEOS_DATABASE_URL ?? "").trim();
  if (enabled && !connectionString) {
    throw new Error("PHYSIQUEOS_DATABASE_URL is required when PHYSIQUEOS_DATABASE_ENABLED=1.");
  }
  return Object.freeze({
    enabled,
    connectionString: enabled ? connectionString : null,
    databaseName: enabled ? databaseNameFromConnectionString(connectionString) : null,
    caCertificate: normalizeCertificate(env.PHYSIQUEOS_DATABASE_CA_CERT),
    applicationName: String(env.PHYSIQUEOS_DATABASE_APPLICATION_NAME ?? "physiqueos-foundation"),
    maximumPoolSize: normalizePoolSize(env.PHYSIQUEOS_DATABASE_POOL_MAX),
    statementTimeoutMs: normalizeTimeout(env.PHYSIQUEOS_DATABASE_STATEMENT_TIMEOUT_MS),
    connectionTimeoutMs: normalizeConnectionTimeout(env.PHYSIQUEOS_DATABASE_CONNECTION_TIMEOUT_MS),
  });
}

function databaseNameFromConnectionString(value) {
  const name = decodeURIComponent(new URL(value).pathname.replace(/^\//, ""));
  if (!name) throw new Error("PHYSIQUEOS_DATABASE_URL must identify a database.");
  return name;
}

function normalizeCertificate(value) {
  const certificate = String(value ?? "").trim();
  if (!certificate) return null;
  if (!certificate.includes("-----BEGIN CERTIFICATE-----") || !certificate.includes("-----END CERTIFICATE-----")) {
    throw new Error("The PostgreSQL CA certificate is invalid.");
  }
  return certificate;
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

function normalizeConnectionTimeout(value) {
  if (value == null || value === "") return 5_000;
  const result = Number(value);
  if (!Number.isInteger(result) || result < 1_000 || result > 30_000) throw new Error("Database connection timeout is invalid.");
  return result;
}

import pg from "pg";

export function createPostgresPool(config) {
  if (!config?.enabled || !config.connectionString) {
    throw new Error("PostgreSQL is inactive. Explicitly enable it before creating a pool.");
  }
  const connectionString = config.caCertificate
    ? connectionStringWithoutTlsOverrides(config.connectionString)
    : config.connectionString;
  return new pg.Pool({
    connectionString,
    ssl: config.caCertificate ? { ca: config.caCertificate, rejectUnauthorized: true } : undefined,
    application_name: config.applicationName,
    max: config.maximumPoolSize,
    connectionTimeoutMillis: config.connectionTimeoutMs ?? 5_000,
    statement_timeout: config.statementTimeoutMs,
    allowExitOnIdle: true,
  });
}

function connectionStringWithoutTlsOverrides(value) {
  const url = new URL(value);
  for (const key of ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "sslnegotiation", "uselibpqcompat"]) {
    url.searchParams.delete(key);
  }
  return url.toString();
}

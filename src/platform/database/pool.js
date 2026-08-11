import pg from "pg";

export function createPostgresPool(config) {
  if (!config?.enabled || !config.connectionString) {
    throw new Error("PostgreSQL is inactive. Explicitly enable it before creating a pool.");
  }
  return new pg.Pool({
    connectionString: config.connectionString,
    application_name: config.applicationName,
    max: config.maximumPoolSize,
    statement_timeout: config.statementTimeoutMs,
    allowExitOnIdle: true,
  });
}

import pg from "pg";

export function createValidationPostgresPool({ connectionString, maximumPoolSize = 4, applicationName = "physiqueos-validation" }) {
  const caCertificate = String(process.env.PHYSIQUEOS_DATABASE_CA_CERT ?? "").trim();
  const safeConnectionString = caCertificate ? withoutTlsOverrides(connectionString) : connectionString;
  return new pg.Pool({
    connectionString: safeConnectionString,
    ssl: caCertificate ? { ca: caCertificate, rejectUnauthorized: true } : undefined,
    max: maximumPoolSize,
    application_name: applicationName,
    statement_timeout: 120_000,
    allowExitOnIdle: true,
  });
}

function withoutTlsOverrides(value) {
  const url = new URL(value);
  for (const key of ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "sslnegotiation", "uselibpqcompat"]) url.searchParams.delete(key);
  return url.toString();
}

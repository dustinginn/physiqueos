import { register } from "node:module";
import { readDatabaseConfig } from "../src/platform/database/config.js";
import { createPostgresPool } from "../src/platform/database/pool.js";

register("./sourceModuleResolutionHook.mjs", import.meta.url);
const { initializeProviderCompatibilityAuthority } = await import("../src/platform/cutover/ProviderCompatibilityAuthorityInitializer.js");

const databaseConfig = readDatabaseConfig();
const pool = createPostgresPool(databaseConfig);
try {
  const result = await initializeProviderCompatibilityAuthority({
    pool,
    environment: required("PHYSIQUEOS_RUNTIME_AUTHORITY_ENVIRONMENT"),
    expectedDatabaseName: required("PHYSIQUEOS_COMPATIBILITY_DATABASE_NAME"),
    providerSource: {
      commit: required("PHYSIQUEOS_GIT_SHA"),
      buildId: required("PHYSIQUEOS_BUILD_ID"),
    },
    target: {
      databaseClusterId: required("PHYSIQUEOS_DATABASE_CLUSTER_ID"),
      databaseName: required("PHYSIQUEOS_COMPATIBILITY_DATABASE_NAME"),
      spacesBucket: required("PHYSIQUEOS_SPACES_BUCKET"),
    },
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  await pool.end();
}
function required(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

import path from "node:path";
import { pathToFileURL } from "node:url";
import { createUuidV7 } from "../src/contracts/v1/identifiers.js";
import { createFounderAuthService } from "../src/platform/auth/FounderAuthService.js";
import { readDatabaseConfig } from "../src/platform/database/config.js";
import { createFoundationPostgresTransactionRunner } from "../src/platform/database/foundationPostgresComposition.js";
import { createPostgresPool } from "../src/platform/database/pool.js";
import {
  createSandboxDatabaseAuthorityGuard,
  readNativeSandboxAuthorityConfig,
} from "../src/platform/sandbox/NativeSandboxAuthority.js";

export async function bootstrapNativeSandboxOwner({ env = process.env, pool: suppliedPool } = {}) {
  const config = readNativeSandboxAuthorityConfig({ ...env, PHYSIQUEOS_NATIVE_SANDBOX_ENABLED: "1" });
  const recoveryCredential = String(env.PHYSIQUEOS_NATIVE_SANDBOX_BOOTSTRAP_RECOVERY_CREDENTIAL ?? "");
  if (!/^[A-Za-z0-9_-]{43}$/.test(recoveryCredential)) {
    throw new Error("NATIVE_SANDBOX_BOOTSTRAP_CREDENTIAL_INVALID");
  }
  const databaseConfig = readDatabaseConfig({
    ...env,
    PHYSIQUEOS_DATABASE_ENABLED: "1",
    PHYSIQUEOS_DATABASE_URL: config.databaseUrl,
    PHYSIQUEOS_DATABASE_APPLICATION_NAME: `physiqueos-native-sandbox-bootstrap-${config.authorityId}`,
    PHYSIQUEOS_DATABASE_POOL_MAX: "1",
  });
  const pool = suppliedPool ?? createPostgresPool(databaseConfig);
  const ownsPool = !suppliedPool;
  try {
    await createSandboxDatabaseAuthorityGuard({ pool, config }).assertDatabase();
    const count = Number((await pool.query("SELECT count(*)::integer AS count FROM physiqueos.users")).rows[0]?.count ?? -1);
    if (count > 1) throw new Error("NATIVE_SANDBOX_BOOTSTRAP_MULTIPLE_OWNERS");
    if (count === 1) {
      const existing = await pool.query("SELECT id FROM physiqueos.users LIMIT 1");
      if (existing.rows[0]?.id !== config.ownerUserId) throw new Error("NATIVE_SANDBOX_BOOTSTRAP_OWNER_MISMATCH");
      return Object.freeze({ status: "PASS", ownerUserId: config.ownerUserId, created: false, recoveryReady: true });
    }

    let firstIdentifier = true;
    const auth = createFounderAuthService({
      transactionRunner: createFoundationPostgresTransactionRunner({ pool }),
      credentialPepper: config.credentialPepper,
      createId: () => {
        if (firstIdentifier) {
          firstIdentifier = false;
          return config.ownerUserId;
        }
        return createUuidV7();
      },
      createSecret: () => recoveryCredential,
    });
    const enrolled = await auth.enrollFounder({
      displayName: "Native Integration Sandbox",
      timeZone: "America/Los_Angeles",
    });
    if (enrolled.userId !== config.ownerUserId || enrolled.recoveryCredential !== recoveryCredential) {
      throw new Error("NATIVE_SANDBOX_BOOTSTRAP_RESULT_MISMATCH");
    }
    return Object.freeze({ status: "PASS", ownerUserId: config.ownerUserId, created: true, recoveryReady: true });
  } finally {
    if (ownsPool) await pool.end();
  }
}

async function main() {
  const result = await bootstrapNativeSandboxOwner();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) await main();

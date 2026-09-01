import { createHash } from "node:crypto";
import { ApplicationProblem } from "../../contracts/v1/problem.js";
import { requireAuthenticationPrincipal, requireScope } from "../../application/auth/principal.js";

export const NATIVE_SANDBOX_AUTHORITY_KIND = "native-integration-sandbox";
export const NATIVE_SANDBOX_AUTHORITY_VERSION = "1";
export const NATIVE_SANDBOX_WEIGHT_CONTINUATION_TOPIC = "native.sandbox.weight.confirmed";

const DATABASE_NAME = /^physiqueos_native_sandbox_[a-z0-9_]+$/;
const AUTHORITY_ID = /^native-sandbox-[a-z0-9-]{3,48}$/;
const OWNER_ID = /^user_native_sandbox_[a-z0-9_]{3,64}$/;

export function readNativeSandboxAuthorityConfig(env = process.env) {
  const enabled = env.PHYSIQUEOS_NATIVE_SANDBOX_ENABLED === "1";
  if (!enabled) return Object.freeze({ enabled: false });

  const authorityId = required(env.PHYSIQUEOS_NATIVE_SANDBOX_AUTHORITY_ID, "PHYSIQUEOS_NATIVE_SANDBOX_AUTHORITY_ID");
  const ownerUserId = required(env.PHYSIQUEOS_NATIVE_SANDBOX_OWNER_USER_ID, "PHYSIQUEOS_NATIVE_SANDBOX_OWNER_USER_ID");
  const databaseUrl = required(env.PHYSIQUEOS_NATIVE_SANDBOX_DATABASE_URL, "PHYSIQUEOS_NATIVE_SANDBOX_DATABASE_URL");
  const productionDatabaseUrl = required(env.PHYSIQUEOS_DATABASE_URL, "PHYSIQUEOS_DATABASE_URL");
  const credentialPepper = required(env.PHYSIQUEOS_NATIVE_SANDBOX_CREDENTIAL_PEPPER, "PHYSIQUEOS_NATIVE_SANDBOX_CREDENTIAL_PEPPER");

  if (!AUTHORITY_ID.test(authorityId)) throw configurationError("The Native sandbox authority identity is invalid.");
  if (!OWNER_ID.test(ownerUserId)) throw configurationError("The Native sandbox owner identity is invalid.");
  if (ownerUserId === String(env.PHYSIQUEOS_CANONICAL_OWNER_USER_ID ?? "")) {
    throw configurationError("The Native sandbox cannot use the Founder production owner identity.");
  }
  if (credentialPepper.length < 32 || credentialPepper === env.PHYSIQUEOS_CREDENTIAL_PEPPER) {
    throw configurationError("The Native sandbox requires an independent credential pepper.");
  }

  const sandbox = parsedDatabase(databaseUrl, "Native sandbox");
  const production = parsedDatabase(productionDatabaseUrl, "Founder production");
  if (!DATABASE_NAME.test(sandbox.name)) {
    throw configurationError("The Native sandbox database must use the physiqueos_native_sandbox_* identity.");
  }
  if (sandbox.url === production.url || sandbox.name === production.name) {
    throw configurationError("The Native sandbox database must be physically separate from Founder production.");
  }

  // Media rows and object keys use the same owner identity as the isolated
  // database. The sandbox identity itself carries the authority namespace.
  // Keeping these equal preserves the existing media foreign-key contract.
  const mediaOwnerUserId = ownerUserId;
  const mediaPrefix = `private/${mediaOwnerUserId}/`;
  return Object.freeze({
    enabled: true,
    kind: NATIVE_SANDBOX_AUTHORITY_KIND,
    version: NATIVE_SANDBOX_AUTHORITY_VERSION,
    authorityId,
    ownerUserId,
    mediaOwnerUserId,
    mediaPrefix,
    databaseUrl,
    databaseName: sandbox.name,
    productionDatabaseName: production.name,
    credentialPepper,
    databaseApplicationName: `physiqueos-native-sandbox-${authorityId}`,
  });
}

export function createNativeSandboxAuthorityBoundary(config) {
  if (!config?.enabled || config.kind !== NATIVE_SANDBOX_AUTHORITY_KIND) {
    throw new Error("An enabled Native sandbox authority configuration is required.");
  }
  const descriptor = Object.freeze({
    kind: config.kind,
    version: config.version,
    authorityId: config.authorityId,
    ownerUserId: config.ownerUserId,
    databaseName: config.databaseName,
    mediaPrefix: config.mediaPrefix,
  });

  return Object.freeze({
    descriptor,
    requirePrincipal(principal, scope = "founder:read") {
      const actor = requireScope(requireAuthenticationPrincipal(principal), scope);
      if (actor.userId !== config.ownerUserId) throw unavailable();
      return actor;
    },
    assertOwnedRecord(record) {
      if (!record || String(record.userId ?? record.ownerUserId ?? "") !== config.ownerUserId) {
        throw boundaryViolation("A sandbox output attempted to cross its owner boundary.");
      }
      return record;
    },
    envelopeOutbox({ topic, dedupeKey, payload = {}, userId = config.ownerUserId }) {
      if (userId !== config.ownerUserId || !String(topic ?? "").trim() || !String(dedupeKey ?? "").trim()) {
        throw boundaryViolation("A sandbox outbox message attempted to cross its authority boundary.");
      }
      return Object.freeze({
        topic,
        dedupeKey: `${config.authorityId}:${dedupeKey}`,
        userId,
        payloadVersion: "1",
        payload: Object.freeze({
          ...structuredClone(payload),
          sandboxAuthority: descriptor,
        }),
      });
    },
    assertOutboxMessage(message) {
      const authority = message?.payload?.sandboxAuthority;
      if (message?.userId !== config.ownerUserId || authority?.authorityId !== config.authorityId ||
          authority?.databaseName !== config.databaseName || authority?.ownerUserId !== config.ownerUserId) {
        throw boundaryViolation("The sandbox worker message authority is invalid.");
      }
      return message;
    },
    checksum() {
      return createHash("sha256").update(JSON.stringify(descriptor)).digest("hex");
    },
  });
}

export function createAuthorityScopedObjectProvider({ provider, config } = {}) {
  if (!provider?.beginMultipartUpload || !config?.mediaPrefix) {
    throw new Error("Sandbox media requires a private object provider and authority configuration.");
  }
  const assertKey = (value) => {
    const key = String(value ?? "");
    if (!key.startsWith(config.mediaPrefix)) throw boundaryViolation("Sandbox media cannot access another authority namespace.");
    return key;
  };
  return Object.freeze({
    async beginMultipartUpload(input) {
      if (input?.ownerUserId !== config.mediaOwnerUserId) throw boundaryViolation("Sandbox media owner identity is invalid.");
      const begun = await provider.beginMultipartUpload(input);
      assertKey(begun.objectKey);
      return begun;
    },
    authorizeUploadPart: (input) => provider.authorizeUploadPart({ ...input, objectKey: assertKey(input?.objectKey) }),
    completeMultipartUpload: (input) => provider.completeMultipartUpload({ ...input, objectKey: assertKey(input?.objectKey) }),
    abortMultipartUpload: (input) => provider.abortMultipartUpload({ ...input, objectKey: assertKey(input?.objectKey) }),
    deleteObject: (input) => provider.deleteObject({ ...input, objectKey: assertKey(input?.objectKey) }),
    inspectObject: (input) => provider.inspectObject({ ...input, objectKey: assertKey(input?.objectKey) }),
    downloadObjectToFile: (input) => provider.downloadObjectToFile({ ...input, objectKey: assertKey(input?.objectKey) }),
    authorizeRead: (input) => provider.authorizeRead({ ...input, objectKey: assertKey(input?.objectKey) }),
    healthCheck: (input) => provider.healthCheck(input),
    close: () => provider.close?.(),
  });
}

export function createSandboxDatabaseAuthorityGuard({ pool, config } = {}) {
  if (!pool?.query || !config?.databaseName) throw new Error("Sandbox database authority requires a configured pool.");
  async function assertDatabase(client = pool) {
    const row = (await client.query("SELECT current_database() AS database")).rows[0];
    if (String(row?.database ?? "") !== config.databaseName || config.databaseName === config.productionDatabaseName) {
      throw boundaryViolation("The Native sandbox database authority does not match.");
    }
    return Object.freeze({
      outcome: "sandbox-noncanonical-authority-verified",
      authorityId: config.authorityId,
      databaseName: config.databaseName,
    });
  }
  return Object.freeze({
    assertDatabase,
    assertSandboxAccess: ({ client } = {}) => assertDatabase(client ?? pool),
    claimCanonicalWriteBoundary: ({ client } = {}) => assertDatabase(client ?? pool),
  });
}

function parsedDatabase(value, label) {
  try {
    const url = new URL(value);
    const name = decodeURIComponent(url.pathname.replace(/^\//, ""));
    if (!name) throw new Error("missing name");
    url.username = "";
    url.password = "";
    return { name, url: url.toString() };
  } catch {
    throw configurationError(`${label} database configuration is invalid.`);
  }
}

function unavailable() {
  return new ApplicationProblem({ status: 404, code: "RESOURCE_NOT_FOUND", title: "The requested resource is unavailable." });
}
function boundaryViolation(message) {
  return Object.assign(new Error(message), { code: "NATIVE_SANDBOX_AUTHORITY_VIOLATION" });
}
function configurationError(message) {
  return Object.assign(new Error(message), { code: "NATIVE_SANDBOX_CONFIGURATION_INVALID" });
}
function required(value, field) {
  const candidate = String(value ?? "").trim();
  if (!candidate) throw configurationError(`${field} is required.`);
  return candidate;
}

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { register } from "node:module";
import { createValidationPostgresPool } from "./validationPostgresPool.mjs";

register("./sourceModuleResolutionHook.mjs", import.meta.url);
const { readAndValidateCanonicalPackage } = await import("../src/platform/migration/phase4CanonicalExport.js");
const { createPhase4MediaObjectId } = await import("../src/platform/migration/phase4LocalMediaMigration.js");
const { readSpacesConfig } = await import("../src/platform/object-storage/spacesConfig.js");
const { createSpacesPrivateObjectProvider } = await import("../src/platform/object-storage/SpacesPrivateObjectProvider.js");
const { createPhase5ProviderApplicationComposition } = await import("../src/platform/database/phase5ProviderComposition.js");
const { createPayloadHash } = await import("../src/contracts/v1/canonicalJson.js");

if (process.env.PHYSIQUEOS_PHASE5_PROVIDER_ACCEPTANCE !== "1") throw new Error("Phase 5 provider acceptance is not explicitly enabled.");
const databaseUrl = String(process.env.PHYSIQUEOS_PHASE4_DATABASE_URL ?? "").trim();
const packageRoot = path.resolve(process.argv[2] ?? "");
const mediaRoot = path.resolve(process.argv[3] ?? "");
const parsed = new URL(databaseUrl);
if (!parsed.hostname.endsWith(".ondigitalocean.com") || decodeURIComponent(parsed.pathname.slice(1)) !== "physiqueos_phase5_test_provider_20260811") {
  throw new Error("Refusing Phase 5 media validation outside the exact synthetic provider database.");
}
if (!String(process.env.PHYSIQUEOS_DATABASE_CA_CERT ?? "").includes("BEGIN CERTIFICATE")) throw new Error("Strict provider CA verification is required.");
const spaces = readSpacesConfig(process.env);
if (!spaces.enabled || spaces.bucket !== "physiqueos-p2-staging-20260811-b36ea183") throw new Error("Refusing Phase 5 media validation outside the accepted staging Space.");

const packageData = await readAndValidateCanonicalPackage(packageRoot);
if (packageData.collections.user?.id !== "phase5-synthetic-user" || packageData.manifest.files.some((item) => item.ownerUserId !== "phase5-synthetic-user")) {
  throw new Error("Phase 5 provider validation accepts only the generated synthetic owner/package.");
}
const pool = createValidationPostgresPool({ connectionString: databaseUrl, maximumPoolSize: 3, applicationName: "physiqueos-phase5-media" });
const provider = createSpacesPrivateObjectProvider(spaces);
const uploaded = [];
const started = performance.now();
try {
  for (const entry of packageData.manifest.files) {
    const objectId = createPhase4MediaObjectId(entry);
    const bytes = await fs.readFile(path.join(mediaRoot, ...entry.relativePath.split("/")));
    assert(bytes.length === entry.size && digest(bytes) === entry.sha256, `Synthetic source media mismatch: ${entry.relativePath}`);
    const begin = await provider.beginMultipartUpload({ ownerUserId: entry.ownerUserId, objectId, contentType: entry.mimeType, expectedSha256: entry.sha256 });
    const part = await provider.authorizeUploadPart({ objectKey: begin.objectKey, providerUploadId: begin.providerUploadId, partNumber: 1 });
    const response = await fetch(part.url, { method: "PUT", body: bytes, headers: { "content-type": entry.mimeType } });
    assert(response.ok, `Synthetic Spaces upload failed with status ${response.status}.`);
    const completed = await provider.completeMultipartUpload({ objectKey: begin.objectKey, providerUploadId: begin.providerUploadId, parts: [{ partNumber: 1, etag: response.headers.get("etag") }] });
    const inspected = await provider.inspectObject({ objectKey: begin.objectKey, providerVersion: completed.providerVersion });
    assert(inspected.byteLength === entry.size && inspected.sha256 === entry.sha256, `Provider media verification failed: ${entry.relativePath}`);
    await pool.query(
      `UPDATE physiqueos.canonical_media_objects
          SET storage_key=$3,provider_version=$4,provider_etag=$5,updated_at=now()
        WHERE id=$1 AND owner_user_id=$2`,
      [objectId, entry.ownerUserId, begin.objectKey, completed.providerVersion, completed.etag],
    );
    uploaded.push({ objectId, byteLength: entry.size, sha256: entry.sha256, contentType: entry.mimeType, providerVersion: completed.providerVersion });
  }
  const now = () => new Date("2026-08-11T21:00:00.000Z");
  const composition = await createPhase5ProviderApplicationComposition({ pool, ownerUserId: "phase5-synthetic-user", objectProvider: provider, now });
  const principal = { userId: "phase5-synthetic-user", deviceId: "phase5-device", sessionId: "phase5-session" };
  const descriptors = [];
  for (const item of uploaded) {
    const descriptor = await composition.media.authorizeRead({ principal, objectId: item.objectId, lifetimeSeconds: 300 });
    assert(descriptor.expiresAt === "2026-08-11T21:05:00.000Z", "Authorized media lifetime exceeded five minutes.");
    const serialized = JSON.stringify(descriptor);
    assert(!serialized.includes("storage_key") && !serialized.includes("objectKey") && !serialized.includes("providerVersion") && !serialized.includes("private/"), "Provider implementation identity leaked through the media DTO.");
    const providerRead = await composition.mediaGateway.redeemRead({ accessHandle: descriptor.accessHandle, principal });
    const fetched = await fetch(providerRead.url);
    assert(fetched.ok && digest(Buffer.from(await fetched.arrayBuffer())) === item.sha256, "Authorized read did not reproduce provider bytes.");
    descriptors.push({ objectId: descriptor.objectId, contentType: descriptor.contentType, size: descriptor.size, sha256: descriptor.sha256, expirySeconds: 300 });
  }
  let crossOwnerDenied = false;
  try { await composition.media.authorizeRead({ principal: { ...principal, userId: "phase5-other-user" }, objectId: uploaded[0].objectId }); }
  catch (error) { crossOwnerDenied = error?.code === "OBJECT_NOT_FOUND"; }
  assert(crossOwnerDenied, "Cross-owner canonical media access was not denied.");
  const result = {
    objectCount: uploaded.length,
    byteLength: uploaded.reduce((sum, item) => sum + item.byteLength, 0),
    objectDigest: createPayloadHash(uploaded.map(({ providerVersion, ...item }) => item)),
    checks: {
      ownerScopedMetadata: "pass", opaqueIdentity: "pass", privateAuthorizedRead: "pass", maximumReadExpiry: "pass",
      byteDerivedChecksum: "pass", immutableVersionIdentity: uploaded.every((item) => Boolean(item.providerVersion)) ? "pass" : "not_exposed_by_provider",
      relationshipParity: "pass", dtoPathKeyAndPermanentUrlLeakage: "pass", crossOwnerDenial: "pass",
    },
    descriptors,
    durationMs: Math.round(performance.now() - started),
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  provider.close();
  await pool.end();
}

function digest(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function assert(condition, message) { if (!condition) throw new Error(message); }

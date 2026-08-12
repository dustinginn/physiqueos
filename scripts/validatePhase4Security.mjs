import fs from "node:fs/promises";
import path from "node:path";
import { register } from "node:module";
import pg from "pg";

register("./sourceModuleResolutionHook.mjs", import.meta.url);
const { canonicalJson, createPayloadHash } = await import("../src/contracts/v1/canonicalJson.js");
const { readAndValidateCanonicalPackage } = await import("../src/platform/migration/phase4CanonicalExport.js");
const { importCanonicalPackage } = await import("../src/platform/migration/phase4CanonicalImport.js");
const { createAuthorizedMediaService } = await import("../src/application/media/AuthorizedMediaService.js");
const { createPhase4MediaCatalog } = await import("../src/platform/migration/phase4LocalMediaMigration.js");
const { createLocalPrivateMediaAdapter } = await import("../src/platform/object-storage/LocalPrivateMediaAdapter.js");
const { PHASE4_DOMAIN_TABLES } = await import("../src/platform/migration/phase4DomainCollections.js");

const databaseUrl = String(process.env.PHYSIQUEOS_PHASE4_DATABASE_URL ?? "").trim();
const packageRoot = path.resolve(process.argv[2] ?? "");
const objectRoot = path.resolve(process.argv[3] ?? "");
const packageData = await readAndValidateCanonicalPackage(packageRoot);
const ownerUserId = packageData.collections.user.id;
const pool = new pg.Pool({ connectionString: databaseUrl, max: 2, allowExitOnIdle: true });
try {
  for (const table of new Set(Object.values(PHASE4_DOMAIN_TABLES))) {
    const result = await pool.query(`SELECT count(*)::integer AS total, count(*) FILTER (WHERE owner_user_id=$1)::integer AS owned FROM physiqueos.${table}`, [ownerUserId]);
    if (result.rows[0].total !== result.rows[0].owned) throw new Error(`Owner scope mismatch in ${table}.`);
  }
  await expectDatabaseCode("23503", () => pool.query(
    `INSERT INTO physiqueos.canonical_goal_records (owner_user_id,collection_name,record_id,source_ordinal,payload)
     VALUES ('missing-owner','goals','cross-owner',0,'{}'::jsonb)`
  ));

  const mediaRow = (await pool.query("SELECT id FROM physiqueos.canonical_media_objects ORDER BY id LIMIT 1")).rows[0];
  if (mediaRow) {
    const service = createAuthorizedMediaService({
      catalog: createPhase4MediaCatalog({ query: (text, values) => pool.query(text, values) }),
      delivery: createLocalPrivateMediaAdapter({ privateRoot: objectRoot, issueAccessHandle: ({ objectId }) => `phase4-opaque-handle-${createPayloadHash(objectId).slice(0, 16)}` }),
      clock: () => new Date("2026-08-12T04:00:00.000Z"),
    });
    const authorized = await service.authorizeRead({ principal: { userId: ownerUserId, deviceId: "device", sessionId: "session" }, objectId: mediaRow.id });
    if (/private[\\/]|[A-Z]:\\|storage_key|objectRoot/i.test(JSON.stringify(authorized))) throw new Error("Authorized media descriptor leaked an internal path or key.");
    await expectCode("OBJECT_NOT_FOUND", () => service.authorizeRead({ principal: { userId: "other-owner", deviceId: "device", sessionId: "session" }, objectId: mediaRow.id }));
  }

  const manifestText = await fs.readFile(path.join(packageRoot, "manifest.json"), "utf8");
  if (/(secret|password|credential|connection.?string|access.?key|private.?key)/i.test(manifestText)) throw new Error("Migration manifest contains a secret-bearing key.");
  const invalidRoot = path.join(path.dirname(packageRoot), "invalid-owner-package");
  await fs.rm(invalidRoot, { recursive: true, force: true }); await fs.mkdir(invalidRoot);
  const invalidCollections = structuredClone(packageData.collections);
  const candidateCollection = Object.keys(invalidCollections).find((name) => Array.isArray(invalidCollections[name]) && invalidCollections[name].length > 0 && invalidCollections[name][0]?.userId);
  if (!candidateCollection) throw new Error("Realistic package has no explicit owned record for negative validation.");
  invalidCollections[candidateCollection][0].userId = "invalid-owner";
  const invalidManifest = structuredClone(packageData.manifest);
  invalidManifest.criticalValues.canonicalStateDigest = createPayloadHash(invalidCollections);
  const entry = invalidManifest.collections.find((item) => item.sourceCollection === candidateCollection);
  entry.semanticDigest = createPayloadHash(invalidCollections[candidateCollection]);
  delete invalidManifest.semanticDigest;
  invalidManifest.semanticDigest = createPayloadHash(invalidManifest);
  await fs.writeFile(path.join(invalidRoot, "canonical-runtime.json"), canonicalJson(invalidCollections));
  await fs.writeFile(path.join(invalidRoot, "manifest.json"), canonicalJson(invalidManifest));
  await expectMessage("Invalid owner", () => importCanonicalPackage({ pool, packageRoot: invalidRoot, resetTarget: false }));
  await fs.rm(invalidRoot, { recursive: true, force: true });

  process.stdout.write(`${JSON.stringify({ allDomainRowsOwnerScoped: "pass", invalidOwnerForeignKey: "pass", invalidLegacyOwnerImport: "pass", crossOwnerMedia: "pass", pathAndObjectKeyNonDisclosure: "pass", secretManifestScan: "pass" })}\n`);
} finally { await pool.end(); }

async function expectDatabaseCode(code, work) { try { await work(); } catch (error) { if (error.code === code) return; throw error; } throw new Error(`Expected PostgreSQL ${code}.`); }
async function expectCode(code, work) { try { await work(); } catch (error) { if (error.code === code) return; throw error; } throw new Error(`Expected ${code}.`); }
async function expectMessage(message, work) { try { await work(); } catch (error) { if (String(error.message).includes(message)) return; throw error; } throw new Error(`Expected ${message}.`); }

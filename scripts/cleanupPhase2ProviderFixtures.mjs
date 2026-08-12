import { DeleteObjectsCommand, ListObjectVersionsCommand, S3Client } from "@aws-sdk/client-s3";
import { readDatabaseConfig } from "../src/platform/database/config.js";
import { createPostgresPool } from "../src/platform/database/pool.js";
import { readSpacesConfig } from "../src/platform/object-storage/spacesConfig.js";

if (process.env.PHYSIQUEOS_PHASE2_PROVIDER_ACCEPTANCE !== "1") throw new Error("Provider fixture cleanup requires PHYSIQUEOS_PHASE2_PROVIDER_ACCEPTANCE=1.");
const databaseConfig = readDatabaseConfig();
const spacesConfig = readSpacesConfig();
const databaseUrl = new URL(databaseConfig.connectionString);
if (databaseUrl.hostname.endsWith(".ondigitalocean.com") === false || decodeURIComponent(databaseUrl.pathname.slice(1)) !== "physiqueos_phase2_test_provider_20260811") throw new Error("Refusing to clean fixtures outside the temporary provider acceptance database.");
if (spacesConfig.region !== "sfo3" || !spacesConfig.bucket.startsWith("physiqueos-p2-staging-")) throw new Error("Refusing to clean fixtures outside the approved staging bucket.");

const pool = createPostgresPool(databaseConfig);
const client = new S3Client({ region: spacesConfig.region, endpoint: spacesConfig.endpoint, forcePathStyle: false, credentials: { accessKeyId: spacesConfig.accessKeyId, secretAccessKey: spacesConfig.secretAccessKey } });
try {
  const keepRows = await pool.query("SELECT object_key FROM physiqueos.stored_objects WHERE state IN ('verified', 'tombstoned') ORDER BY object_key");
  const keep = new Set(keepRows.rows.map((row) => row.object_key));
  if (keep.size !== 2 || [...keep].some((key) => !key.startsWith("private/"))) throw new Error("The intentional provider fixture set is not the expected two private objects.");
  const versions = await listVersions();
  const obsolete = versions.filter((item) => !keep.has(item.Key));
  if (obsolete.some((item) => !item.Key.startsWith("private/"))) throw new Error("The staging bucket contains an unexpected non-private object; cleanup stopped.");
  for (let offset = 0; offset < obsolete.length; offset += 1000) {
    const batch = obsolete.slice(offset, offset + 1000);
    if (batch.length > 0) await client.send(new DeleteObjectsCommand({ Bucket: spacesConfig.bucket, Delete: { Objects: batch.map(({ Key, VersionId }) => ({ Key, VersionId })), Quiet: true } }));
  }
  const remaining = await listVersions();
  if (remaining.some((item) => !keep.has(item.Key))) throw new Error("Obsolete provider fixture versions remain after cleanup.");
  process.stdout.write(`[phase2-provider-cleanup] PASS removed=${obsolete.length} retainedKeys=${keep.size} retainedVersions=${remaining.length}\n`);
} finally {
  client.destroy();
  await pool.end();
}

async function listVersions() {
  const items = [];
  let KeyMarker;
  let VersionIdMarker;
  do {
    const page = await client.send(new ListObjectVersionsCommand({ Bucket: spacesConfig.bucket, KeyMarker, VersionIdMarker }));
    for (const item of [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])]) items.push({ Key: item.Key, VersionId: item.VersionId });
    KeyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
    VersionIdMarker = page.IsTruncated ? page.NextVersionIdMarker : undefined;
  } while (KeyMarker);
  return items;
}

import { createAuthorizedMediaService } from "../../application/media/AuthorizedMediaService.js";
import { createPhase4PostgresApplicationComposition } from "./phase4PostgresComposition.js";
import { createOpaqueSpacesMediaGateway } from "../object-storage/OpaqueSpacesMediaGateway.js";
import { createProviderCanonicalUploadService } from "../../application/media/ProviderCanonicalUploadService.js";

export async function createPhase5ProviderApplicationComposition({
  pool,
  ownerUserId,
  objectProvider,
  mediaAccessSecret = process.env.PHYSIQUEOS_CREDENTIAL_PEPPER,
  now = () => new Date(),
  writeFence = null,
  authorityStore = null,
  migrationOperationId = null,
  compatibilityMode = true,
  requireCompatibilityAuthority = false,
  readDiagnostics = null,
  providerReadScope = null,
} = {}) {
  if (!objectProvider?.authorizeRead) throw new Error("Phase 5 provider composition requires private Spaces access.");
  const base = await createPhase4PostgresApplicationComposition({
    pool, ownerUserId, now, writeFence, authorityStore, migrationOperationId, compatibilityMode, requireCompatibilityAuthority, readDiagnostics, providerReadScope,
  });
  const catalog = createPhase5ProviderMediaCatalog({ query: (text, values) => pool.query(text, values) });
  const mediaGateway = createOpaqueSpacesMediaGateway({ provider: objectProvider, catalog, secret: mediaAccessSecret, clock: now });
  const media = createAuthorizedMediaService({
    catalog,
    delivery: mediaGateway,
    clock: now,
  });
  const uploads = createProviderCanonicalUploadService({
    pool, objectProvider, authorityStore, migrationOperationId, compatibilityMode, requireCompatibilityAuthority, now,
  });
  return Object.freeze({
    ...base,
    kind: "phase5-provider-synthetic",
    media,
    mediaCatalog: catalog,
    mediaGateway,
    uploads,
  });
}

export function createPhase5ProviderMediaCatalog({ query } = {}) {
  if (typeof query !== "function") throw new Error("Phase 5 provider media catalog requires a query function.");
  return Object.freeze({
    async getObject({ objectId, ownerUserId }) {
      const result = await query(
        `SELECT id,owner_user_id,content_type,byte_length,sha256,storage_key,provider_version,state
           FROM physiqueos.canonical_media_objects
          WHERE id=$1 AND owner_user_id=$2 AND state='verified'`,
        [objectId, ownerUserId],
      );
      const row = result.rows[0];
      return row ? Object.freeze({
        id: row.id,
        ownerUserId: row.owner_user_id,
        contentType: row.content_type,
        size: Number(row.byte_length),
        sha256: row.sha256,
        objectKey: row.storage_key,
        providerVersion: row.provider_version ?? null,
      }) : null;
    },
    async resolveLegacyReference({ reference, ownerUserId }) {
      const normalizedReference = normalizeLegacyMediaPath(reference);
      if (!normalizedReference) return null;
      const result = await query(
        `SELECT id,provenance
           FROM physiqueos.canonical_media_objects
          WHERE owner_user_id=$1 AND state='verified'
          ORDER BY id`,
        [ownerUserId],
      );
      const exact = [];
      const basename = normalizedReference.split("/").at(-1);
      const basenameMatches = [];
      for (const row of result.rows) {
        const sourcePath = normalizeLegacyMediaPath(row.provenance?.sourceRelativePath);
        if (!sourcePath) continue;
        if (sourcePath === normalizedReference) exact.push(row.id);
        if (sourcePath.split("/").at(-1) === basename) basenameMatches.push(row.id);
      }
      if (exact.length === 1) return exact[0];
      return exact.length === 0 && basenameMatches.length === 1 ? basenameMatches[0] : null;
    },
  });
}

function normalizeLegacyMediaPath(value) {
  const candidate = String(value ?? "").trim();
  if (!candidate || candidate.startsWith("media://")) return null;
  return candidate
    .replaceAll("\\", "/")
    .replace(/^\/+/, "")
    .replace(/^private\/founder\//i, "")
    .toLowerCase();
}

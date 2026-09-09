import { createProviderMediaReferenceResolver, normalizeLegacyMediaPath } from "../media/ProviderMediaReferenceResolver.js";
import { selectValidDexaScans } from "../../domain/services/DEXAReadModelAdapter.js";

export function createDEXAMediaLookup(scans = []) {
  const canonicalScans = selectValidDexaScans(scans);
  const references = canonicalScans
    .flatMap((scan) => [scan.sourceFileId, scan.rawReportPath])
    .filter(Boolean);
  const normalizedPaths = [...new Set(references.map(normalizeLegacyMediaPath).filter(Boolean))];

  return Object.freeze({
    references: Object.freeze([...new Set(references.map((value) => String(value).toLowerCase()))]),
    normalizedPaths: Object.freeze(normalizedPaths),
    sourceIds: Object.freeze([...new Set(canonicalScans
      .flatMap((scan) => [scan.id, scan.canonicalId])
      .filter(Boolean)
      .map(String))]),
  });
}

export function resolveProviderDEXAScanMedia({ scans = [], mediaObjects = null } = {}) {
  const canonicalScans = selectValidDexaScans(scans);
  if (!Array.isArray(mediaObjects)) return canonicalScans;

  const resolver = createProviderMediaReferenceResolver(mediaObjects);
  return canonicalScans.map((scan) => {
    const sourceReference = scan.sourceFileId ?? scan.rawReportPath ?? null;
    const providerReference = resolver.resolveReference({
      reference: sourceReference,
      sourceIds: [scan.id, scan.canonicalId],
    });
    return Object.freeze({
      ...scan,
      sourceFileId: providerReference,
      rawReportPath: providerReference,
    });
  });
}

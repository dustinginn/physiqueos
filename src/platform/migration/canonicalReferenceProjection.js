import path from "node:path";

export function buildCanonicalMediaReferenceIndex(collections, { semanticMediaOnly = false } = {}) {
  const index = new Map();
  for (const [collection, source] of Object.entries(collections)) {
    const records = source == null ? [] : Array.isArray(source) ? source : [source];
    records.forEach((record, position) => {
      const recordId = `${collection}:${resolveCanonicalRecordId(record, position)}`;
      walkCanonicalStrings(record, (value, field) => {
        if (semanticMediaOnly && !canonicalMediaCandidate(value, field)) return;
        const normalized = value.replaceAll("\\", "/").toLowerCase();
        const base = path.posix.basename(normalized);
        if (!/\.[a-z0-9]{2,6}(?:$|\?)/i.test(base)) return;
        for (const key of [normalized, base]) {
          const values = index.get(key) ?? [];
          values.push(recordId);
          index.set(key, values);
        }
      });
    });
  }
  return index;
}

export function canonicalMediaCandidate(value, key) {
  if (typeof value !== "string" || /^https?:|^data:/i.test(value)) return null;
  const normalized = value.replaceAll("\\", "/").replace(/^\/+/, "").toLowerCase().split("?")[0];
  const basename = path.posix.basename(normalized);
  if (!/\.(?:jpe?g|png|webp|pdf|m4a|mp4)$/i.test(basename)) return null;
  const pathLike = normalized.includes("/") || /(?:file|path|artifact|reference|upload|photo|image|scan|media)/i.test(key);
  const mustExist = normalized.startsWith("private/founder/") ||
    /^(?:artifactPath|filePath|photoPath|imagePath|mediaPath|localPath|reference)$/i.test(key);
  return pathLike ? { normalized, basename, mustExist } : null;
}

export function collectCanonicalRelationships(collections, ownerUserId) {
  const knownIds = new Map();
  for (const [collection, source] of Object.entries(collections)) {
    const records = source == null ? [] : Array.isArray(source) ? source : [source];
    for (let position = 0; position < records.length; position += 1) {
      const id = resolveCanonicalRecordId(records[position], position);
      knownIds.set(id, { collection, id });
    }
  }
  const relationships = [];
  for (const [collection, source] of Object.entries(collections)) {
    const records = source == null ? [] : Array.isArray(source) ? source : [source];
    records.forEach((record, position) => {
      const fromId = resolveCanonicalRecordId(record, position);
      relationships.push({ from: `${collection}:${fromId}`, to: `user:${ownerUserId}`, type: "owned_by" });
      walkCanonicalStrings(record, (value, key) => {
        if (!/(?:^|_)(?:id|ids)$|Id$|Ids$/.test(key)) return;
        const target = knownIds.get(value);
        if (target && !(target.collection === collection && target.id === fromId)) {
          relationships.push({ from: `${collection}:${fromId}`, to: `${target.collection}:${target.id}`, type: `references:${key}` });
        }
      });
    });
  }
  return uniqueSortedRelationships(relationships);
}

export function walkCanonicalStrings(value, visitor, key = "") {
  if (typeof value === "string") return visitor(value, key);
  if (Array.isArray(value)) return value.forEach((entry) => walkCanonicalStrings(entry, visitor, key));
  if (value && typeof value === "object") {
    for (const [childKey, child] of Object.entries(value)) walkCanonicalStrings(child, visitor, childKey);
  }
}

export function resolveCanonicalRecordId(record, position) {
  return String(record?.id ?? record?.package_id ?? record?.review_id ?? `@index:${position}`);
}

export function canonicalMimeTypeFor(file) {
  const extension = path.extname(file).toLowerCase();
  return ({ ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".pdf": "application/pdf", ".json": "application/json", ".txt": "text/plain", ".csv": "text/csv", ".m4a": "audio/mp4", ".mp4": "video/mp4" })[extension] ?? "application/octet-stream";
}

function uniqueSortedRelationships(values) {
  const keyed = new Map(values.map((value) => [`${value.from}|${value.to}|${value.type}`, value]));
  return [...keyed.values()].sort((left, right) =>
    `${left.from}|${left.to}|${left.type}`.localeCompare(`${right.from}|${right.to}|${right.type}`)
  );
}

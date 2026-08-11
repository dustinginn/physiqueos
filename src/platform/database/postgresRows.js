export function firstRow(result) {
  return result?.rows?.[0] ?? null;
}

export function requiredRow(result, message = "The requested database record was not found.") {
  const row = firstRow(result);
  if (!row) throw new Error(message);
  return row;
}

export function mapVersionedRow(row) {
  if (!row) return null;
  return Object.freeze({ ...row, version: row.version == null ? null : String(row.version) });
}

export function mapTimestamp(value) {
  return value == null ? null : new Date(value).toISOString();
}

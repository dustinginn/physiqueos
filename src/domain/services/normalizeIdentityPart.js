export function normalizeIdentityPart(value) {
  if (value === null || value === undefined || value === "") return "";

  return String(value).trim().toLowerCase();
}

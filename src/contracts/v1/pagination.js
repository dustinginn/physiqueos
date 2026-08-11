import { ApplicationProblem } from "./problem";

const CURSOR_VERSION = 1;

export function encodeCursor({ sort, id }) {
  if (sort == null || !id) throw new Error("Cursor sort and id are required.");
  return Buffer.from(JSON.stringify({ v: CURSOR_VERSION, sort, id }), "utf8").toString("base64url");
}

export function decodeCursor(cursor) {
  try {
    const parsed = JSON.parse(Buffer.from(String(cursor), "base64url").toString("utf8"));
    if (parsed?.v !== CURSOR_VERSION || parsed.sort == null || !parsed.id) throw new Error("invalid");
    return Object.freeze({ sort: parsed.sort, id: String(parsed.id) });
  } catch {
    throw new ApplicationProblem({ status: 400, code: "INVALID_CURSOR", title: "The pagination cursor is invalid." });
  }
}

export function normalizePageLimit(value, { defaultLimit = 25, maximum = 100 } = {}) {
  if (value == null || value === "") return defaultLimit;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > maximum) {
    throw new ApplicationProblem({ status: 400, code: "INVALID_PAGE_LIMIT", title: `Page limit must be between 1 and ${maximum}.` });
  }
  return limit;
}

export function createCursorPage({ items, nextCursor = null, resourceVersion }) {
  return Object.freeze({ items: Object.freeze([...(items ?? [])]), nextCursor, resourceVersion: String(resourceVersion) });
}

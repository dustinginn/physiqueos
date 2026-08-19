// Corrected live application read-model parity architecture, extracted from
// `scripts/productionMigrationEnvironmentAdapters.mjs` (which re-exports these names for backward
// compatibility with its existing callers/tests) so `src/`-owned production code - including the
// combined-cutover parity adapter - can reuse it directly without importing a `scripts/*.mjs` entry
// point, which registers a global Node module-resolution hook as a side effect of being loaded and
// is never appropriate to import from application runtime code.
//
// HISTORY (do not re-derive or weaken any of this). The original comparison independently
// evaluated legacy and provider reads against unshared wall clocks and mismatched
// resourceVersion formulas, which made even genuinely identical canonical data disagree. The fix
// applied here:
//   - excludes exactly three read-model ENVELOPE fields (generatedAt, freshThrough, etag) because
//     `createApplicationReadModel` (./readModel.js) stamps them from the read-invocation wall clock
//     and none of the three carry independent canonical content - excluding them cannot mask a
//     real migration difference;
//   - requires both sides to be evaluated against ONE shared frozen `now` and the SAME
//     `readResourceVersion` formula;
//   - leaves semantic data, model, resourceVersion, array ordering, null-vs-missing, and type
//     differences fully strict - nothing else is excluded, and nothing more should ever be added to
//     `VOLATILE_READ_MODEL_ENVELOPE_FIELDS` merely to make a test pass.
// See scripts/productionMigrationEnvironmentAdapters.test.js for the full regression suite proving
// every one of these properties; it now exercises this exact implementation.

import { createPayloadHash } from "../../contracts/v1/canonicalJson.js";

const VOLATILE_READ_MODEL_ENVELOPE_FIELDS = new Set(["generatedAt", "freshThrough", "etag"]);

export function semanticReadModelProjection(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  const projected = {};
  for (const [key, entry] of Object.entries(value)) {
    if (VOLATILE_READ_MODEL_ENVELOPE_FIELDS.has(key)) continue;
    projected[key] = entry;
  }
  return projected;
}

// Canonical-key-ordering hash from src/contracts/v1/canonicalJson.js, reused rather than
// duplicated: it sorts object keys (so insertion order alone cannot cause a false
// mismatch) while leaving array order, null-vs-missing, and value types untouched, since
// those remain semantically significant.
export function readModelsSemanticallyEqual(left, right) {
  return createPayloadHash(semanticReadModelProjection(left)) === createPayloadHash(semanticReadModelProjection(right));
}

// Bounded, non-dumping semantic-difference diagnostics for a parity failure. Must stay strictly to
// field paths and compact type/shape metadata, never raw values, never full payloads, and never
// anything sensitive (credentials, URLs, media content, private row bodies).
const MAX_DIAGNOSTIC_PATHS = 20;
const MAX_DIAGNOSTIC_DEPTH = 12;

function diagnosticTypeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

// Path/type-only by design (no primitive values are ever emitted): there is no established
// migration-logging policy confirming any field class is safe to log verbatim, so this
// defaults to the strictest option rather than guessing.
export function computeBoundedSemanticDifference(left, right, { maxPaths = MAX_DIAGNOSTIC_PATHS, maxDepth = MAX_DIAGNOSTIC_DEPTH } = {}) {
  const differingPaths = [];
  let truncated = false;
  function record(entry) {
    if (differingPaths.length >= maxPaths) { truncated = true; return false; }
    differingPaths.push(Object.freeze(entry));
    return true;
  }
  function visit(a, b, path, depth) {
    if (truncated) return;
    if (depth > maxDepth) { record({ path, kind: "max-depth-exceeded" }); truncated = true; return; }
    if (a === undefined && b !== undefined) { record({ path, kind: "missing-left", rightType: diagnosticTypeOf(b) }); return; }
    if (b === undefined && a !== undefined) { record({ path, kind: "missing-right", leftType: diagnosticTypeOf(a) }); return; }
    const leftType = diagnosticTypeOf(a);
    const rightType = diagnosticTypeOf(b);
    if (leftType !== rightType) { record({ path, kind: "type-mismatch", leftType, rightType }); return; }
    if (leftType === "array") {
      if (a.length !== b.length) { record({ path, kind: "array-length-mismatch", leftLength: a.length, rightLength: b.length }); return; }
      for (let index = 0; index < a.length; index += 1) {
        let elementsEqual;
        try { elementsEqual = createPayloadHash(a[index]) === createPayloadHash(b[index]); }
        catch { elementsEqual = false; }
        if (!elementsEqual) { visit(a[index], b[index], `${path}[${index}]`, depth + 1); return; }
      }
      return;
    }
    if (leftType === "object") {
      const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
      for (const key of keys) {
        visit(a[key], b[key], path ? `${path}.${key}` : key, depth + 1);
        if (truncated) return;
      }
      return;
    }
    if (!Object.is(a, b)) record({ path, kind: "value-mismatch", leftType, rightType });
  }
  visit(left, right, "$", 0);
  return Object.freeze({ differingPaths: Object.freeze(differingPaths), truncated });
}

function safeComputeParityDiagnostic(method, left, right) {
  try {
    const { differingPaths, truncated } = computeBoundedSemanticDifference(
      semanticReadModelProjection(left), semanticReadModelProjection(right),
    );
    return Object.freeze({ method, leftType: diagnosticTypeOf(left), rightType: diagnosticTypeOf(right), differingPaths, truncated });
  } catch {
    // Diagnostic generation must never be able to suppress the underlying parity failure.
    return Object.freeze({ method, unavailable: true });
  }
}

export async function compareRepresentativeReads({ legacy, postgres, principal, runtime }) {
  const pendingReview = runtime.evidenceReviews.find((item) => item.status === "pending") ?? runtime.evidenceReviews[0];
  const priority = runtime.executionItems[0];
  const checks = {};
  for (const [method, input] of [
    ["home", {}], ["log", { timeZone: runtime.user.timeZone ?? runtime.user.timezone }],
    ["evidenceReview", { reviewId: pendingReview?.id ?? pendingReview?.review_id }], ["goals", {}],
    ["operatingPlan", {}], ["priorities", { priorityId: priority?.id }], ["progress", {}],
    ["confidence", {}], ["briefings", {}], ["training", {}], ["profile", {}],
  ]) {
    const [left, right] = await Promise.all([legacy[method](principal, input), postgres[method](principal, input)]);
    if (!readModelsSemanticallyEqual(left, right)) {
      const error = new Error(`Application read parity failed for ${method}.`);
      error.parityDiagnostic = safeComputeParityDiagnostic(method, left, right);
      throw error;
    }
    checks[method] = "pass";
  }
  return Object.freeze(checks);
}

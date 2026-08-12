import { performance } from "node:perf_hooks";
import { register } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { createValidationPostgresPool } from "./validationPostgresPool.mjs";

register("./sourceModuleResolutionHook.mjs", import.meta.url);
const { importCanonicalPackage, validateCanonicalImport } = await import("../src/platform/migration/phase4CanonicalImport.js");
const { canonicalJson, createPayloadHash } = await import("../src/contracts/v1/canonicalJson.js");

const databaseUrl = String(process.env.PHYSIQUEOS_PHASE4_DATABASE_URL ?? "").trim();
const packageRoot = process.argv[2];
if (!databaseUrl || !packageRoot) throw new Error("PHYSIQUEOS_PHASE4_DATABASE_URL and a package directory are required.");
const parsed = new URL(databaseUrl);
if (!/^(?:physiqueos_phase4_(?:test|rehearsal|restore)|physiqueos_phase5_(?:test|restore)_provider)(?:_|$)/.test(decodeURIComponent(parsed.pathname.slice(1)))) {
  throw new Error("Refusing canonical import outside a guarded Phase 4 rehearsal or Phase 5 provider-test database.");
}
const pool = createValidationPostgresPool({ connectionString: databaseUrl, maximumPoolSize: 2, applicationName: "physiqueos-canonical-import" });
try {
  const importStarted = performance.now();
  const imported = await importCanonicalPackage({ pool, packageRoot, resetTarget: process.argv.includes("--reset") });
  const importDurationMs = Math.round(performance.now() - importStarted);
  const validationStarted = performance.now();
  const validation = await validateCanonicalImport({ pool, packageRoot });
  const validationDurationMs = Math.round(performance.now() - validationStarted);
  const reportRoot = path.join(path.dirname(path.resolve(packageRoot)), "reports");
  await fs.mkdir(reportRoot, { recursive: true });
  const importManifest = withDigest({ manifestVersion: "phase4-import-v1", ...imported, importDurationMs });
  const validationManifest = withDigest({ manifestVersion: "phase4-validation-v1", ...validation, validationDurationMs });
  await fs.writeFile(path.join(reportRoot, "import-manifest.json"), `${canonicalJson(importManifest)}\n`);
  await fs.writeFile(path.join(reportRoot, "validation-manifest.json"), `${canonicalJson(validationManifest)}\n`);
  process.stdout.write(`${JSON.stringify({ imported, validation, importDurationMs, validationDurationMs, reportRoot })}\n`);
} finally {
  await pool.end();
}

function withDigest(value) { return { ...value, semanticDigest: createPayloadHash(value) }; }

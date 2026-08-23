import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FOUNDATION_REQUIRED_SOURCE_COLLECTIONS } from "../src/platform/migration/foundationSourceCollections.js";

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptsRoot, "..");
const root = path.join(repositoryRoot, ".tmp", `phase7b-wp2b-source-audit-${crypto.randomUUID()}`);
let assertions = 0;
try {
  await Promise.all(["evidence", "photos", "dexa"].map((name) => fs.mkdir(path.join(root, "private", "founder", name), { recursive: true })));
  const runtime = { version: 1, revision: 7, updatedAt: "2026-08-16T00:00:00.000Z" };
  for (const name of FOUNDATION_REQUIRED_SOURCE_COLLECTIONS) runtime[name] = [];
  await writeRuntime(runtime);
  await fs.writeFile(path.join(root, "private", "founder", "migration-control.json"), "{}", "utf8");
  let result = invoke();
  assert.equal(result.pass, true); assertions += 1;
  assert.equal(result.requiredCollectionPresentCount, 39); assertions += 1;
  assert.equal(result.missingCollectionCount, 0); assertions += 1;
  assert.equal(result.unknownCollectionCount, 0); assertions += 1;
  assert.equal(result.missingMediaReferenceCount, 0); assertions += 1;

  delete runtime[FOUNDATION_REQUIRED_SOURCE_COLLECTIONS[0]];
  await writeRuntime(runtime);
  result = invoke();
  assert.equal(result.pass, false); assertions += 1;
  assert.equal(result.missingCollectionCount, 1); assertions += 1;

  runtime[FOUNDATION_REQUIRED_SOURCE_COLLECTIONS[0]] = [];
  runtime.unexpectedCollection = [];
  await writeRuntime(runtime);
  result = invoke();
  assert.equal(result.pass, false); assertions += 1;
  assert.equal(result.unknownCollectionCount, 1); assertions += 1;

  delete runtime.unexpectedCollection;
  runtime[FOUNDATION_REQUIRED_SOURCE_COLLECTIONS[0]] = [{ id: "synthetic-1", filePath: "private/founder/photos/missing.jpg" }];
  await writeRuntime(runtime);
  result = invoke();
  assert.equal(result.pass, false); assertions += 1;
  assert.equal(result.missingMediaReferenceCount, 1); assertions += 1;

  await fs.writeFile(path.join(root, "private", "founder", "photos", "missing.jpg"), "synthetic-media", "utf8");
  result = invoke();
  assert.equal(result.pass, true); assertions += 1;
  assert.equal(result.missingMediaReferenceCount, 0); assertions += 1;
  assert.equal(result.mediaRelationshipCount, 1); assertions += 1;
  process.stdout.write(`${JSON.stringify({ classification: "PHASE7B_WP2B_CAPTURE_SOURCE_AUDIT_TESTS_PASS", pass: true, assertions })}\n`);
} finally {
  await fs.rm(root, { recursive: true, force: true });
}

async function writeRuntime(value) {
  await fs.writeFile(path.join(root, "private", "founder", "runtime-store.json"), JSON.stringify(value), "utf8");
}
function invoke() {
  return JSON.parse(execFileSync(process.execPath, ["--no-warnings", path.join(scriptsRoot, "phase7bAuditWorkPackage2CaptureSource.mjs"), root], { encoding: "utf8" }));
}

import fs from "node:fs/promises";
import path from "node:path";
import { register } from "node:module";

register("./sourceModuleResolutionHook.mjs", import.meta.url);
const { exportCanonicalPackage } = await import("../src/platform/migration/phase4CanonicalExport.js");
const {
  createFilesystemBuildIdentityProvider,
  deriveTrustedMigrationSourceIdentity,
} = await import("../src/platform/migration/MigrationSourceIdentity.js");
const { createFounderRuntimeStore } = await import("../src/data/repositories/founderRuntimeStore.js");

const snapshotRoot = path.resolve(process.argv[2] ?? "");
const firstPackage = path.resolve(process.argv[3] ?? "");
const secondPackage = path.resolve(process.argv[4] ?? "");
const ignored = path.join(process.cwd(), ".tmp") + path.sep;
if (![snapshotRoot, firstPackage, secondPackage].every((value) => value.startsWith(ignored))) throw new Error("Determinism proof must remain under .tmp.");
await fs.rm(secondPackage, { recursive: true, force: true });
const sourceIdentity = await deriveTrustedMigrationSourceIdentity({
  runtimePath: path.join(snapshotRoot, "runtime-store.json"),
  packageVersion: "phase4-canonical-package-v1",
  sourceSchemaVersion: "000003",
  buildIdentityProvider: createFilesystemBuildIdentityProvider({ repositoryRoot: process.cwd() }),
});
const second = await exportCanonicalPackage({
  runtimePath: path.join(snapshotRoot, "runtime-store.json"), mediaRoot: path.join(snapshotRoot, "media"), outputRoot: secondPackage,
  sourceIdentity, normalizeRuntime: (persisted) => createFounderRuntimeStore(persisted),
});
const firstManifest = await fs.readFile(path.join(firstPackage, "manifest.json"), "utf8");
const secondManifest = await fs.readFile(path.join(secondPackage, "manifest.json"), "utf8");
const firstRuntime = await fs.readFile(path.join(firstPackage, "canonical-runtime.json"), "utf8");
const secondRuntime = await fs.readFile(path.join(secondPackage, "canonical-runtime.json"), "utf8");
if (firstManifest !== secondManifest || firstRuntime !== secondRuntime) throw new Error("Canonical export package bytes drifted for the same snapshot.");
process.stdout.write(`${JSON.stringify({ deterministic: "pass", manifestDigest: second.manifest.semanticDigest, manifestBytes: Buffer.byteLength(secondManifest), runtimeBytes: Buffer.byteLength(secondRuntime) })}\n`);

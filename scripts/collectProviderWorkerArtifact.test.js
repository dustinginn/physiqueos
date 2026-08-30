import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { collectProviderWorkerArtifact } from "./collectProviderWorkerArtifact.mjs";
import { collectProviderWorkerDependencies } from "./collectProviderWorkerDependencies.mjs";
import { scanProviderArtifact } from "./scanProviderArtifact.mjs";
import { resolve as resolveProviderModule } from "./sourceModuleResolutionHook.mjs";

const temporaryRoots = [];
afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    fs.rm(root, { recursive: true, force: true })));
});

describe("provider worker artifact collector", () => {
  it("copies only the reachable provider-safe worker graph", async () => {
    const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), "provider-worker-artifact-"));
    temporaryRoots.push(outputRoot);
    const result = await collectProviderWorkerArtifact({ outputRoot });
    expect(result.fileCount).toBeGreaterThan(100);
    await expect(scanProviderArtifact({ roots: [outputRoot] })).resolves.toMatchObject({
      status: "PASS",
      fileCount: result.fileCount,
    });
    await expect(fs.stat(path.join(outputRoot,
      "src/data/repositories/providerRuntimeStoreForbidden.js"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(outputRoot,
      "src/data/repositories/founderRuntimeStore.js"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.stat(path.join(outputRoot, "src/data/founderSeed")))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("redirects legacy runtime and control imports in provider mode", async () => {
    const previous = process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME;
    process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME = "1";
    try {
      const context = { parentURL: new URL("../src/application/composition/example.js",
        import.meta.url).href };
      const nextResolve = async (specifier) => ({ url: specifier });
      await expect(resolveProviderModule(
        "../../data/repositories/founderRuntimeStore.js", context, nextResolve
      )).resolves.toMatchObject({ url: expect.stringContaining("providerRuntimeStoreForbidden.js") });
      await expect(resolveProviderModule(
        "../../platform/cutover/DurableMigrationControlStore.js", context, nextResolve
      )).resolves.toMatchObject({ url: expect.stringContaining("providerMigrationControlForbidden.js") });
    } finally {
      if (previous == null) delete process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME;
      else process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME = previous;
    }
  });

  it("copies only the installed dependency closure and omits package documentation", async () => {
    const installRoot = await fs.mkdtemp(path.join(os.tmpdir(), "provider-worker-deps-"));
    temporaryRoots.push(installRoot);
    const applicationRoot = path.join(installRoot, "worker");
    await write(path.join(installRoot, "package.json"), JSON.stringify({
      name: "fixture", version: "1.0.0", type: "module",
    }));
    await write(path.join(applicationRoot, "worker.mjs"), 'import "root-package";');
    await write(path.join(installRoot, "node_modules/root-package/package.json"), JSON.stringify({
      name: "root-package", version: "1.0.0", dependencies: { "child-package": "1.0.0" },
    }));
    await write(path.join(installRoot, "node_modules/root-package/index.js"),
      'import "child-package";');
    await write(path.join(installRoot, "node_modules/root-package/README.md"),
      "postgresql://user:password@example.invalid/db");
    await write(path.join(installRoot, "node_modules/child-package/package.json"), JSON.stringify({
      name: "child-package", version: "1.0.0",
    }));
    await write(path.join(installRoot, "node_modules/child-package/index.js"), "export default true;");
    await collectProviderWorkerDependencies({ installRoot, applicationRoot });
    await expect(scanProviderArtifact({ roots: [applicationRoot] })).resolves.toMatchObject({
      status: "PASS",
    });
    await expect(fs.stat(path.join(applicationRoot, "node_modules/root-package/README.md")))
      .rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.stat(path.join(applicationRoot, "node_modules/child-package/index.js")))
      .resolves.toBeTruthy();
  });

  it("boots the actual provider artifact after registering the module hook", async () => {
    const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), "provider-worker-boot-"));
    temporaryRoots.push(outputRoot);
    await collectProviderWorkerArtifact({ outputRoot });
    await collectProviderWorkerDependencies({ applicationRoot: outputRoot });
    const preFixFixture = path.join(outputRoot, "pre-fix-static-order.mjs");
    await write(preFixFixture, [
      'import { register } from "node:module";',
      'import "./src/platform/migration/migrationManifest.js";',
      'register("./scripts/sourceModuleResolutionHook.mjs", import.meta.url);',
    ].join("\n"));
    const preFix = spawnSync(process.execPath, [preFixFixture], {
      cwd: outputRoot,
      encoding: "utf8",
      env: { ...process.env, PHYSIQUEOS_PROVIDER_FULL_RUNTIME: "1" },
    });
    expect(preFix.status).not.toBe(0);
    expect(preFix.stderr).toContain("ERR_MODULE_NOT_FOUND");
    expect(preFix.stderr).toContain("canonicalJson");

    const boot = spawnSync(process.execPath, ["scripts/runFoundationWorker.mjs"], {
      cwd: outputRoot,
      encoding: "utf8",
      timeout: 30_000,
      env: providerBootProbeEnvironment(),
    });
    expect(boot.status, boot.stderr).toBe(0);
    expect(boot.stderr).not.toContain("ERR_MODULE_NOT_FOUND");
    expect(JSON.parse(boot.stdout.trim())).toMatchObject({
      status: "PROVIDER_WORKER_APPLICATION_LOOP_READY",
      simplifiedMigrationHandlerRegistered: true,
      migrationCoordinatorProcessModel: "in-process-existing-worker",
    });
    const continuationImportFixture = path.join(outputRoot, "evidence-continuation-import.mjs");
    await write(continuationImportFixture, [
      'import { register } from "node:module";',
      'register("./scripts/sourceModuleResolutionHook.mjs", import.meta.url);',
      'const actions = await import("./src/app/evidence/review/[reviewId]/actions.js");',
      'if (typeof actions.continueEvidenceReviewInBackground !== "function") process.exit(2);',
    ].join("\n"));
    const continuationImport = spawnSync(process.execPath, [continuationImportFixture], {
      cwd: outputRoot,
      encoding: "utf8",
      timeout: 30_000,
      env: providerBootProbeEnvironment(),
    });
    expect(continuationImport.status, continuationImport.stderr).toBe(0);
    expect(continuationImport.stderr).not.toContain("ERR_MODULE_NOT_FOUND");
    const workerSource = await fs.readFile(path.join(outputRoot, "scripts/runFoundationWorker.mjs"), "utf8");
    expect(workerSource.indexOf('register("./sourceModuleResolutionHook.mjs"'))
      .toBeLessThan(workerSource.indexOf("await loadSimplifiedMigrationModules()"));
    expect(workerSource).not.toMatch(/process\.execPath|spawn\([^)]*(?:node|npm)|execFile\([^)]*(?:node|npm)/i);
  }, 60_000);
});

function providerBootProbeEnvironment() {
  const digest = "a".repeat(64);
  const commit = "b".repeat(40);
  return {
    ...process.env,
    PHYSIQUEOS_PROVIDER_WORKER_BOOT_PROBE: "1",
    PHYSIQUEOS_PROVIDER_FULL_RUNTIME: "1",
    PHYSIQUEOS_SIMPLIFIED_MIGRATION_ENABLED: "1",
    PHYSIQUEOS_DATABASE_ENABLED: "1",
    PHYSIQUEOS_DATABASE_URL: "postgresql://probe@127.0.0.1:1/probe",
    PHYSIQUEOS_RUNTIME_AUTHORITY_ENVIRONMENT: "provider-worker-boot-probe",
    PHYSIQUEOS_CANONICAL_OWNER_USER_ID: "provider-worker-boot-synthetic-user",
    PHYSIQUEOS_EXPECTED_PRODUCTION_SOURCE_COMMIT: commit,
    PHYSIQUEOS_EXPECTED_PRODUCTION_BUILD_ID: "provider-worker-frozen-build",
    PHYSIQUEOS_EXPECTED_FOUNDER_REVISION: "142",
    PHYSIQUEOS_EXPECTED_FOUNDER_SHA256: digest,
    PHYSIQUEOS_EXPECTED_MEDIA_COUNT: "402",
    PHYSIQUEOS_EXPECTED_MEDIA_BYTES: "288919315",
    PHYSIQUEOS_EXPECTED_MEDIA_INVENTORY_SHA256: digest,
    PHYSIQUEOS_EXPECTED_FINAL_BACKUP_SHA256SUMS_SHA256: digest,
    PHYSIQUEOS_GIT_SHA: commit,
    PHYSIQUEOS_BUILD_ID: "provider-worker-boot-build",
    PHYSIQUEOS_WORKER_ID: "provider-worker-boot-worker",
  };
}

async function write(filePath, contents) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents);
}

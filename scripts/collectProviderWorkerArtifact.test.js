import fs from "node:fs/promises";
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
});

async function write(filePath, contents) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents);
}

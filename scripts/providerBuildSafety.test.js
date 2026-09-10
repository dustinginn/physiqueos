import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runIsolatedProviderBuild } from "./runIsolatedProviderBuild.mjs";
import { runWindowsProtectedProviderBuild } from
  "./runWindowsProtectedProviderBuild.mjs";
import {
  assertProviderBuildLocation,
  captureWindowsBuildIdentity,
  PROVIDER_BUILD_ERROR,
} from "./providerBuildSafety.mjs";
import { validateProviderArtifactManifest } from
  "./providerArtifactManifest.mjs";

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("portable provider artifact gate", () => {
  it("builds an exact detached commit without consulting local runtime state", async () => {
    const fixture = createFixture();
    const developerBefore = fs.readFileSync(fixture.developerMarker, "utf8");
    const result = await runPortableFixture(fixture);

    expect(result.sourceIdentity).toMatchObject({
      status: "PASS",
      sourceCommit: fixture.commit,
      detached: true,
      clean: true,
    });
    expect(result.artifactManifest.validationStatus).toBe("PASS");
    expect(result.privacyScan).toMatchObject({ status: "PASS", violations: [] });
    expect(fs.readFileSync(fixture.developerMarker, "utf8")).toBe(developerBefore);
    expect(fs.existsSync(path.join(fixture.developer, ".provider-next"))).toBe(false);
    expect(fs.existsSync(path.join(fixture.developer, ".provider-artifacts"))).toBe(false);
  });

  it("rejects a nonexistent or mismatched source commit", async () => {
    const fixture = createFixture();
    await expect(runPortableFixture(fixture, { sourceCommit: "f".repeat(40) }))
      .rejects.toMatchObject({ code: "PROVIDER_BUILD_SOURCE_IDENTITY_INVALID" });
  });

  it("rejects dirty tracked and untracked build inputs", async () => {
    const tracked = createFixture();
    fs.appendFileSync(path.join(tracked.isolated, "package.json"), "\n");
    await expect(runPortableFixture(tracked)).rejects.toMatchObject({
      code: "PROVIDER_BUILD_SOURCE_IDENTITY_INVALID",
    });

    const untracked = createFixture();
    fs.writeFileSync(path.join(untracked.isolated, "unexpected-source.js"), "export {};");
    await expect(runPortableFixture(untracked)).rejects.toMatchObject({
      code: "PROVIDER_BUILD_SOURCE_IDENTITY_INVALID",
    });
  });

  it("rejects ignored private or environment inputs", async () => {
    const fixture = createFixture({ ignoredEnvironment: true });
    fs.writeFileSync(path.join(fixture.isolated, ".env.local"), "PRIVATE=value");
    await expect(runPortableFixture(fixture)).rejects.toMatchObject({
      code: "PROVIDER_BUILD_PRIVATE_INPUT_REJECTED",
    });

    const privateFixture = createFixture({ ignoredEnvironment: true });
    fs.mkdirSync(path.join(privateFixture.isolated, "private"));
    fs.writeFileSync(path.join(privateFixture.isolated, "private", "secret.json"), "{}");
    await expect(runPortableFixture(privateFixture)).rejects.toMatchObject({
      code: "PROVIDER_BUILD_PRIVATE_INPUT_REJECTED",
    });
  });

  it("rejects a branch checkout rather than an exact detached checkout", async () => {
    const fixture = createFixture();
    git(fixture.isolated, ["switch", "-"]);
    await expect(runPortableFixture(fixture)).rejects.toMatchObject({
      code: "PROVIDER_BUILD_SOURCE_IDENTITY_INVALID",
    });
  });

  it("detects artifact corruption through the bound manifest", async () => {
    const fixture = createFixture();
    const result = await runPortableFixture(fixture);
    expect(() => validateProviderArtifactManifest({
      artifactRoot: result.artifactRoot,
      expectedIdentity: {
        schemaVersion: "physiqueos_provider_build_identity_v1",
        sourceCommit: "e".repeat(40),
        sourceTree: result.sourceTree,
        providerBuildId: result.providerBuildId,
        nextBuildId: result.nextBuildId,
      },
    })).toThrow(expect.objectContaining({
      code: "PROVIDER_ARTIFACT_SOURCE_IDENTITY_MISMATCH",
    }));
    fs.appendFileSync(path.join(result.artifactRoot, "web", "server.js"), "corrupt");
    expect(() => validateProviderArtifactManifest({
      artifactRoot: result.artifactRoot,
      expectedIdentity: {
        schemaVersion: "physiqueos_provider_build_identity_v1",
        sourceCommit: result.sourceCommit,
        sourceTree: result.sourceTree,
        providerBuildId: result.providerBuildId,
        nextBuildId: result.nextBuildId,
      },
    })).toThrow(expect.objectContaining({ code: "PROVIDER_ARTIFACT_CONTENT_MISMATCH" }));
  });

  it("produces stable source identity evidence for the same exact commit", async () => {
    const fixture = createFixture();
    const first = await runPortableFixture(fixture);
    fs.rmSync(path.join(fixture.isolated, ".provider-next"),
      { recursive: true, force: true });
    fs.rmSync(path.join(fixture.isolated, ".provider-artifacts"),
      { recursive: true, force: true });
    const second = await runPortableFixture(fixture);
    expect({ commit: second.sourceCommit, tree: second.sourceTree })
      .toEqual({ commit: first.sourceCommit, tree: first.sourceTree });
    expect(second.web.sha256).toBe(first.web.sha256);
    expect(second.worker.sha256).toBe(first.worker.sha256);
  });

  it("requires explicit portable isolation variables for manual provider mode", () => {
    const result = spawnSync(process.execPath,
      ["--input-type=module", "--eval", "import('./next.config.mjs')"], {
        cwd: process.cwd(),
        encoding: "utf8",
        windowsHide: true,
        env: { ...process.env, PHYSIQUEOS_PROVIDER_FULL_RUNTIME: "1",
          PHYSIQUEOS_PROVIDER_ISOLATED_BUILD_ROOT: "",
          PHYSIQUEOS_BUILD_DIST_DIR: "" },
      });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`)
      .toContain(PROVIDER_BUILD_ERROR.ISOLATION_REQUIRED);
  });

  it("contains no Windows runtime, Task Scheduler, port, or deployment dependency", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "scripts/runIsolatedProviderBuild.mjs"), "utf8");
    for (const token of [
      "powershell", "ScheduledTask", "statusPhysiqueOS", "deployPhysiqueOS",
      "port 3000", "canonicalRoot", "captureWindowsBuildIdentity",
    ]) expect(source).not.toContain(token);
  });
});

describe("portable location and Windows compatibility boundaries", () => {
  it("accepts output only inside the declared isolated root", () => {
    const fixture = createFixture();
    expect(assertProviderBuildLocation({
      sourceRoot: fixture.isolated,
      isolatedRoot: fixture.isolated,
      distDir: ".provider-next",
      sourceCommit: fixture.commit,
      providerBuildId: "portable-test",
    }).destination).toBe(path.join(fixture.isolated, ".provider-next"));
    expect(() => assertProviderBuildLocation({
      sourceRoot: fixture.isolated,
      isolatedRoot: fixture.isolated,
      distDir: "../escaped",
      sourceCommit: fixture.commit,
      providerBuildId: "portable-test",
    })).toThrow(expect.objectContaining({
      code: PROVIDER_BUILD_ERROR.DESTINATION_FORBIDDEN,
    }));
  });

  it("retains optional Windows before/after identity protection separately", async () => {
    const fixture = createFixture({ windowsRuntime: true });
    const before = captureWindowsBuildIdentity(fixture.developer);
    const runtime = runtimeIdentity(fixture.developer);
    const result = await runWindowsProtectedProviderBuild({
      canonicalRoot: fixture.developer,
      isolatedRoot: fixture.isolated,
      sourceCommit: fixture.commit,
      providerBuildId: "windows-compat-test",
      distDir: ".provider-next",
      artifactDir: ".provider-artifacts",
      runtimeReader: async () => runtime,
      buildRunner: async ({ destination }) => createSyntheticNextBuild(destination),
    });
    expect(result.windowsIdentity.before).toEqual(result.windowsIdentity.after);
    expect(captureWindowsBuildIdentity(fixture.developer)).toEqual(before);
    expect(result.sourceIdentity.status).toBe("PASS");
  });
});

function runPortableFixture(fixture, overrides = {}) {
  return runIsolatedProviderBuild({
    isolatedRoot: fixture.isolated,
    sourceCommit: fixture.commit,
    providerBuildId: "portable-test",
    distDir: ".provider-next",
    artifactDir: ".provider-artifacts",
    buildRunner: async ({ destination }) => createSyntheticNextBuild(destination),
    ...overrides,
  });
}

function createFixture({ ignoredEnvironment = false, windowsRuntime = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "physiqueos-portable-provider-"));
  roots.push(root);
  const developer = path.join(root, "developer-root");
  const isolated = path.join(root, "isolated");
  fs.mkdirSync(developer, { recursive: true });
  const developerMarker = path.join(developer, "unrelated-work.txt");
  fs.writeFileSync(developerMarker, "must remain unchanged");
  if (windowsRuntime) createWindowsRuntimeFixture(developer);

  fs.mkdirSync(path.join(isolated, "public"), { recursive: true });
  fs.mkdirSync(path.join(isolated, "scripts"));
  fs.writeFileSync(path.join(isolated, "package.json"), JSON.stringify({
    name: "physique-os-app", type: "module",
  }));
  if (ignoredEnvironment) fs.writeFileSync(path.join(isolated, ".gitignore"),
    ".env.local\nprivate/*\n");
  for (const name of [
    "runFoundationWorker.mjs", "runSimplifiedProviderMigration.mjs",
    "migrateNativeSandboxDatabase.mjs", "bootstrapNativeSandboxOwner.mjs",
    "sourceModuleResolutionHook.mjs", "scanProviderArtifact.mjs",
  ]) fs.writeFileSync(path.join(isolated, "scripts", name), "export {};\n");
  fs.writeFileSync(path.join(isolated, "public", "asset.txt"), "safe");
  git(isolated, ["init"]);
  git(isolated, ["add", "."]);
  git(isolated, ["-c", "user.name=Provider Safety Test",
    "-c", "user.email=test@example.invalid", "commit", "-m", "fixture"]);
  const commit = git(isolated, ["rev-parse", "HEAD"]);
  git(isolated, ["checkout", "--detach", commit]);
  return { root, developer, developerMarker, isolated, commit };
}

function createWindowsRuntimeFixture(root) {
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(root, ".next"));
  fs.writeFileSync(path.join(root, "package.json"),
    JSON.stringify({ name: "physique-os-app" }));
  fs.writeFileSync(path.join(root, "scripts", "statusPhysiqueOS.ps1"), "# fixture");
  fs.writeFileSync(path.join(root, ".next", "BUILD_ID"), "windows-build");
  fs.writeFileSync(path.join(root, ".next", "SOURCE_COMMIT"), "a".repeat(40));
}

function createSyntheticNextBuild(destination) {
  fs.mkdirSync(path.join(destination, "standalone"), { recursive: true });
  fs.mkdirSync(path.join(destination, "static"), { recursive: true });
  fs.writeFileSync(path.join(destination, "BUILD_ID"), "provider-next-test");
  fs.writeFileSync(path.join(destination, "standalone", "server.js"), "safe");
  fs.writeFileSync(path.join(destination, "static", "asset.js"), "safe");
  fs.writeFileSync(path.join(destination, "routes-manifest.json"),
    JSON.stringify({ staticRoutes: [{ page: "/" }] }));
}

function runtimeIdentity(canonicalRoot) {
  return Object.freeze({
    pid: 33716,
    startedAt: "2026-08-14T16:24:52.6545970-07:00",
    taskLastRunTime: "2026-08-14T16:24:50.0000000-07:00",
    taskWorkingDirectory: canonicalRoot,
    ownership: "canonical",
    overallState: "healthy",
  });
}

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runIsolatedProviderBuild } from "./runIsolatedProviderBuild.mjs";
import {
  assertProviderBuildLocation,
  captureWindowsBuildIdentity,
  discoverRecoveryDirectories,
  PROVIDER_BUILD_ERROR,
} from "./providerBuildSafety.mjs";

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("provider build canonical-root guard", () => {
  it("rejects the canonical Windows production root before a build can start", () => {
    const fixture = createFixture();
    expect(() => assertProviderBuildLocation({
      sourceRoot: fixture.canonical,
      canonicalRoot: fixture.canonical,
      isolatedRoot: fixture.canonical,
      distDir: ".provider-next",
      sourceCommit: fixture.commit,
      providerBuildId: "compat-test",
    })).toThrow(expect.objectContaining({ code: PROVIDER_BUILD_ERROR.CANONICAL_ROOT_FORBIDDEN }));
  });

  it("makes the historical manual provider command fail while loading Next configuration", () => {
    const result = spawnSync(process.execPath, ["--input-type=module", "--eval", "import('./next.config.mjs')"], {
      cwd: process.cwd(),
      encoding: "utf8",
      windowsHide: true,
      env: { ...process.env, PHYSIQUEOS_PROVIDER_FULL_RUNTIME: "1" },
    });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain(PROVIDER_BUILD_ERROR.CANONICAL_ROOT_FORBIDDEN);
  });

  it("rejects a symlink or junction alias that resolves to the canonical root", () => {
    const fixture = createFixture();
    const alias = path.join(fixture.root, "canonical-alias");
    try { fs.symlinkSync(fixture.canonical, alias, process.platform === "win32" ? "junction" : "dir"); }
    catch (error) {
      if (["EPERM", "EACCES"].includes(error?.code)) return;
      throw error;
    }
    expect(() => assertProviderBuildLocation({
      sourceRoot: alias,
      canonicalRoot: fixture.canonical,
      isolatedRoot: alias,
      distDir: ".provider-next",
      sourceCommit: fixture.commit,
      providerBuildId: "compat-test",
    })).toThrow(expect.objectContaining({ code: PROVIDER_BUILD_ERROR.CANONICAL_ROOT_FORBIDDEN }));
  });

  it("accepts a distinct isolated checkout and isolated distDir", () => {
    const fixture = createFixture();
    const result = assertProviderBuildLocation({
      sourceRoot: fixture.isolated,
      canonicalRoot: fixture.canonical,
      isolatedRoot: fixture.isolated,
      distDir: ".provider-next",
      sourceCommit: fixture.commit,
      providerBuildId: "compat-test",
    });
    expect(result.destination).toBe(path.join(fixture.isolated, ".provider-next"));
  });

  it.each([
    ["canonical .next", ".next", "DESTINATION_FORBIDDEN"],
    ["rollback recovery", ".next.rollback-22712", "RECOVERY_PATH_FORBIDDEN"],
    ["fallback recovery", ".next.fallback-stage-13560", "RECOVERY_PATH_FORBIDDEN"],
    ["failed-overwrite evidence", ".next.failed-overwrite-13560", "RECOVERY_PATH_FORBIDDEN"],
  ])("rejects a destination resolving into %s", (_label, name, codeName) => {
    const fixture = createFixture();
    const alias = path.join(fixture.isolated, "provider-output");
    fs.symlinkSync(path.join(fixture.canonical, name), alias, process.platform === "win32" ? "junction" : "dir");
    expect(() => assertProviderBuildLocation({
      sourceRoot: fixture.isolated,
      canonicalRoot: fixture.canonical,
      isolatedRoot: fixture.isolated,
      distDir: "provider-output",
      sourceCommit: fixture.commit,
      providerBuildId: "compat-test",
    })).toThrow(expect.objectContaining({ code: PROVIDER_BUILD_ERROR[codeName] }));
  });

  it("dynamically discovers every current rollback, staging, fallback, and failed directory", () => {
    const fixture = createFixture();
    fs.mkdirSync(path.join(fixture.canonical, ".next.release-999"));
    fs.mkdirSync(path.join(fixture.canonical, ".next.recovery-extra"));
    expect(discoverRecoveryDirectories(fixture.canonical).map((entry) => path.basename(entry))).toEqual(expect.arrayContaining([
      ".next.rollback-22712", ".next.fallback-stage-13560", ".next.failed-overwrite-13560",
      ".next.release-999", ".next.recovery-extra",
    ]));
  });

  it("snapshots retained recovery links as immutable metadata without following them", () => {
    const fixture = createFixture();
    const recovery = path.join(fixture.canonical, ".next.failed-overwrite-13560");
    const target = path.join(fixture.root, "dependency-target");
    fs.mkdirSync(target);
    fs.symlinkSync(target, path.join(recovery, "dependency-link"), process.platform === "win32" ? "junction" : "dir");
    const identity = captureWindowsBuildIdentity(fixture.canonical);
    expect(identity.recovery[".next.failed-overwrite-13560"].linkCount).toBe(1);
  });
});

describe("isolated provider preflight lifecycle contract", () => {
  it("builds only in the isolated root and preserves Windows build, recovery, PID, and start time", async () => {
    const fixture = createFixture({ gitIsolated: true });
    const before = captureWindowsBuildIdentity(fixture.canonical);
    const runtime = runtimeIdentity(fixture.canonical);
    const result = await runIsolatedProviderBuild({
      canonicalRoot: fixture.canonical,
      isolatedRoot: fixture.isolated,
      sourceCommit: fixture.commit,
      providerBuildId: "compat-test",
      distDir: ".provider-next",
      artifactDir: ".provider-artifacts",
      runtimeReader: async () => runtime,
      buildRunner: async ({ destination }) => createSyntheticNextBuild(destination),
      artifactScanner: async () => ({ status: "PASS", fileCount: 4, totalBytes: 4, violations: [] }),
    });
    expect(result.nextBuildId).toBe("provider-next-test");
    expect(result.windowsIdentity.before).toEqual(result.windowsIdentity.after);
    expect(captureWindowsBuildIdentity(fixture.canonical)).toEqual(before);
    expect(fs.existsSync(path.join(fixture.isolated, ".provider-next", "BUILD_ID"))).toBe(true);
    expect(fs.existsSync(path.join(fixture.canonical, ".provider-next"))).toBe(false);
    expect(fs.existsSync(path.join(result.artifactRoot, "web", "screenshots"))).toBe(false);
  });

  it("fails high-severity when a build runner mutates protected Windows state and never repairs it", async () => {
    const fixture = createFixture({ gitIsolated: true });
    const runtime = runtimeIdentity(fixture.canonical);
    await expect(runIsolatedProviderBuild({
      canonicalRoot: fixture.canonical,
      isolatedRoot: fixture.isolated,
      sourceCommit: fixture.commit,
      providerBuildId: "compat-test",
      distDir: ".provider-next",
      artifactDir: ".provider-artifacts",
      runtimeReader: async () => runtime,
      buildRunner: async ({ destination }) => {
        createSyntheticNextBuild(destination);
        fs.writeFileSync(path.join(fixture.canonical, ".next", "mutation"), "forbidden");
      },
      artifactScanner: async () => ({ status: "PASS", fileCount: 4, totalBytes: 4, violations: [] }),
    })).rejects.toMatchObject({ code: PROVIDER_BUILD_ERROR.WINDOWS_IDENTITY_CHANGED });
    expect(fs.readFileSync(path.join(fixture.canonical, ".next", "mutation"), "utf8")).toBe("forbidden");
  });

  it("keeps provider build/deployment modules unable to reach Windows lifecycle actions", () => {
    const files = ["scripts/runIsolatedProviderBuild.mjs", "infra/digitalocean/renderAppSpec.mjs"];
    const forbidden = [
      "stopPhysiqueOS.ps1", "startPhysiqueOS.ps1", "deployPhysiqueOS.ps1",
      "Move-Item", "Stop-ScheduledTask", "Start-ScheduledTask", "Unregister-ScheduledTask",
      ".next.rollback-", ".next.fallback-",
    ];
    for (const file of files) {
      const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
      for (const token of forbidden) expect(source, `${file} exposed ${token}`).not.toContain(token);
    }
    const guardSource = fs.readFileSync(path.join(process.cwd(), "scripts/providerBuildSafety.mjs"), "utf8");
    expect(guardSource).not.toMatch(/spawn(?:Sync)?\s*\(/);
    expect(guardSource).not.toContain("deployPhysiqueOS.ps1");
  });

  it("refuses a shared dependency junction before launching the real Next build", async () => {
    const fixture = createFixture({ gitIsolated: true });
    const shared = path.join(fixture.root, "shared-node-modules");
    fs.mkdirSync(shared);
    fs.symlinkSync(shared, path.join(fixture.isolated, "node_modules"), process.platform === "win32" ? "junction" : "dir");
    const runtime = runtimeIdentity(fixture.canonical);
    await expect(runIsolatedProviderBuild({
      canonicalRoot: fixture.canonical,
      isolatedRoot: fixture.isolated,
      sourceCommit: fixture.commit,
      providerBuildId: "compat-test",
      distDir: ".provider-next",
      artifactDir: ".provider-artifacts",
      runtimeReader: async () => runtime,
    })).rejects.toMatchObject({ code: "PROVIDER_BUILD_TOOLCHAIN_REPARSE_FORBIDDEN" });
    expect(fs.existsSync(path.join(fixture.isolated, ".provider-next"))).toBe(false);
  });
});

function createFixture({ gitIsolated = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "physiqueos-provider-safety-"));
  roots.push(root);
  const canonical = path.join(root, "canonical");
  const isolated = path.join(root, "isolated");
  fs.mkdirSync(path.join(canonical, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(canonical, ".next"));
  fs.writeFileSync(path.join(canonical, "package.json"), JSON.stringify({ name: "physique-os-app" }));
  fs.writeFileSync(path.join(canonical, "scripts", "statusPhysiqueOS.ps1"), "# fixture");
  fs.writeFileSync(path.join(canonical, ".next", "BUILD_ID"), "windows-build");
  fs.writeFileSync(path.join(canonical, ".next", "SOURCE_COMMIT"), "a".repeat(40));
  for (const name of [".next.rollback-22712", ".next.fallback-stage-13560", ".next.failed-overwrite-13560"]) {
    fs.mkdirSync(path.join(canonical, name));
    fs.writeFileSync(path.join(canonical, name, "identity"), name);
  }
  fs.mkdirSync(path.join(isolated, "public"), { recursive: true });
  fs.writeFileSync(path.join(isolated, "package.json"), JSON.stringify({ name: "physique-os-app" }));
  fs.mkdirSync(path.join(isolated, "scripts"));
  for (const name of ["runFoundationWorker.mjs", "sourceModuleResolutionHook.mjs", "scanProviderArtifact.mjs"]) {
    fs.writeFileSync(path.join(isolated, "scripts", name), "export {};\n");
  }
  fs.writeFileSync(path.join(isolated, "public", "asset.txt"), "safe");
  let commit = "b".repeat(40);
  if (gitIsolated) {
    git(isolated, ["init"]);
    git(isolated, ["add", "."]);
    git(isolated, ["-c", "user.name=Provider Safety Test", "-c", "user.email=test@example.invalid", "commit", "-m", "fixture"]);
    commit = git(isolated, ["rev-parse", "HEAD"]);
  }
  return { root, canonical, isolated, commit };
}

function createSyntheticNextBuild(destination) {
  fs.mkdirSync(path.join(destination, "standalone"), { recursive: true });
  fs.mkdirSync(path.join(destination, "static"), { recursive: true });
  fs.writeFileSync(path.join(destination, "BUILD_ID"), "provider-next-test");
  fs.writeFileSync(path.join(destination, "standalone", "server.js"), "safe");
  fs.mkdirSync(path.join(destination, "standalone", "screenshots"));
  fs.writeFileSync(path.join(destination, "standalone", "screenshots", "private.png"), "forbidden");
  fs.writeFileSync(path.join(destination, "static", "asset.js"), "safe");
  fs.writeFileSync(path.join(destination, "routes-manifest.json"), JSON.stringify({ staticRoutes: [{ page: "/" }] }));
}

function runtimeIdentity(canonical) {
  return Object.freeze({
    pid: 33716,
    startedAt: "2026-08-14T16:24:52.6545970-07:00",
    taskLastRunTime: "2026-08-14T16:24:50.0000000-07:00",
    taskWorkingDirectory: canonical,
    ownership: "canonical",
    overallState: "healthy",
  });
}

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

// Production `verifyWindowsSource` preflight adapter for `CombinedAppPlatformCutoverOrchestrator`.
//
// Proves, in one adapter, everything about the CURRENT Windows-side source that later stages (the
// write fence, the final snapshot, the export) depend on being exactly as expected:
//   - Windows application build/commit identity matches (`createFilesystemBuildIdentityProvider`,
//     reused unchanged from `MigrationSourceIdentity.js` - the exact identity primitive the older
//     single-machine production migration path already uses).
//   - the execution checkout itself is clean (no uncommitted changes) - a dirty checkout could mean
//     the running application does not actually match the committed BUILD_ID/SOURCE_COMMIT it claims.
//   - Founder runtime identity (revision, byte length, SHA-256) matches.
//   - the Founder runtime's collection inventory is internally consistent
//     (`assertFoundationSourceInventory`, reused unchanged from `foundationSourceCollections.js`).
//
// This adapter only READS; it never mutates the runtime file, migration control, or combined runtime
// authority.
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createFilesystemBuildIdentityProvider } from "../../migration/MigrationSourceIdentity.js";
import { assertFoundationSourceInventory, inspectFoundationSourceInventory } from "../../migration/foundationSourceCollections.js";

const execFileAsync = promisify(execFile);

export function createGitCheckoutStatusProvider({ repositoryRoot = process.cwd() } = {}) {
  const root = path.resolve(repositoryRoot);
  return async () => {
    const { stdout } = await execFileAsync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8", windowsHide: true });
    const entries = stdout.split("\n").map((line) => line.trim()).filter(Boolean);
    return Object.freeze({ clean: entries.length === 0, entries: Object.freeze(entries) });
  };
}

export function createVerifyWindowsSourcePreflight({
  runtimePath,
  buildIdentityProvider = createFilesystemBuildIdentityProvider(),
  checkoutStatusProvider = createGitCheckoutStatusProvider(),
} = {}) {
  if (!String(runtimePath ?? "").trim()) throw new Error("verifyWindowsSource requires the Founder runtime path.");
  const resolvedRuntimePath = path.resolve(runtimePath);

  return async ({ input } = {}) => {
    const [build, checkout, source] = await Promise.all([
      buildIdentityProvider(),
      checkoutStatusProvider(),
      inspectFounderRuntimeSource(resolvedRuntimePath),
    ]);

    exact(build.applicationSourceCommit, input?.expectedSourceCommit, "Windows application source commit");
    exact(build.applicationBuildId, input?.expectedBuildId, "Windows application BUILD_ID");
    exact(build.repositoryCommit, input?.expectedSourceCommit, "repository HEAD");
    if (!checkout.clean) {
      throw sourceError("COMBINED_CUTOVER_CHECKOUT_NOT_CLEAN", `The execution checkout has ${checkout.entries.length} uncommitted change(s); a fenced cutover requires an identity-matched, clean checkout.`);
    }
    exact(String(source.runtime.revision ?? ""), String(input?.expectedRuntimeRevision ?? ""), "Founder runtime revision");
    exact(String(source.sha256).toLowerCase(), String(input?.expectedRuntimeSha256 ?? "").toLowerCase(), "Founder runtime hash");

    const inventory = assertFoundationSourceInventory(source.runtime);

    return freeze({
      ready: true,
      mutated: false,
      identity: { commit: build.applicationSourceCommit, buildId: build.applicationBuildId },
      repositoryCommit: build.repositoryCommit,
      checkoutClean: true,
      runtime: {
        revision: source.runtime.revision, version: source.runtime.version,
        sha256: source.sha256, size: source.size, updatedAt: source.runtime.updatedAt,
      },
      inventory: {
        contractVersion: inventory.contractVersion,
        expectedCollectionCount: inventory.required.expectedCount,
        presentCollectionCount: inventory.required.presentCount,
        unknownCollections: inventory.unknown,
      },
    });
  };
}

async function inspectFounderRuntimeSource(runtimePath) {
  const bytes = await fs.readFile(runtimePath);
  const runtime = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, ""));
  return { runtime, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

function exact(actual, expected, field) {
  if (String(actual ?? "") !== String(expected ?? "")) {
    throw sourceError("COMBINED_CUTOVER_SOURCE_IDENTITY_MISMATCH", `Current ${field} does not match the exact expected value.`);
  }
}

function sourceError(code, message) {
  return Object.assign(new Error(message), { code });
}

function freeze(value) { return Object.freeze(value); }

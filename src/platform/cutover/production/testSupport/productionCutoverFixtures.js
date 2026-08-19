// Shared synthetic fixtures for the Phase 6B preflight/fence/snapshot/export test suites.
// Test-support only; never imported by production code. Never reads live Founder/production data -
// every runtime file, media file, and identity here is synthetic and written to an isolated temp
// directory by the caller.
import fs from "node:fs/promises";
import path from "node:path";
import { FOUNDATION_SOURCE_COLLECTIONS } from "../../../migration/foundationSourceCollections.js";
import { createFixedBuildIdentityProvider } from "../../../migration/MigrationSourceIdentity.js";

const SINGLETON_COLLECTIONS = new Set(["user", "nutritionContext", "operatingPlan"]);

export function syntheticFounderRuntime({ revision = 1, updatedAt = "2026-08-11T00:00:00.000Z" } = {}) {
  const collections = Object.fromEntries(FOUNDATION_SOURCE_COLLECTIONS.map((name) => [name, SINGLETON_COLLECTIONS.has(name) ? null : []]));
  return {
    version: "founder-seed-v2", revision, lastCommitId: "synthetic", importedAt: updatedAt, updatedAt,
    ...collections,
    user: { id: "synthetic-user", displayName: "Synthetic", timeZone: "America/Los_Angeles", avatarUrl: "photo.jpg", version: 1 },
    goals: [{ id: "synthetic-goal", userId: "synthetic-user", status: "active", version: 1 }],
  };
}

export async function writeSyntheticFounderSource({ root, revision = 1 }) {
  const sourceRoot = path.join(root, "source");
  const mediaRoot = path.join(sourceRoot, "media");
  await fs.mkdir(mediaRoot, { recursive: true });
  const runtimePath = path.join(sourceRoot, "runtime.json");
  await fs.writeFile(runtimePath, JSON.stringify(syntheticFounderRuntime({ revision })));
  await fs.writeFile(path.join(mediaRoot, "photo.jpg"), "synthetic-photo-bytes");
  return Object.freeze({ runtimePath, mediaRoot });
}

export const SYNTHETIC_SOURCE_COMMIT = "1".repeat(40);
export const SYNTHETIC_BUILD_ID = "synthetic-windows-build";

export function syntheticBuildIdentityProvider(overrides = {}) {
  return createFixedBuildIdentityProvider({
    repositoryCommit: SYNTHETIC_SOURCE_COMMIT,
    applicationBuildId: SYNTHETIC_BUILD_ID,
    applicationSourceCommit: SYNTHETIC_SOURCE_COMMIT,
    migrationScriptCommit: SYNTHETIC_SOURCE_COMMIT,
    ...overrides,
  });
}

export function cleanCheckoutStatusProvider() {
  return async () => Object.freeze({ clean: true, entries: Object.freeze([]) });
}

export function dirtyCheckoutStatusProvider(entries = ["M src/example.js"]) {
  return async () => Object.freeze({ clean: false, entries: Object.freeze(entries) });
}

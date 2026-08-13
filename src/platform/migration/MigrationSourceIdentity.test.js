import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertMigrationSourceIdentityMatches,
  createFixedBuildIdentityProvider,
  deriveTrustedMigrationSourceIdentity,
} from "./MigrationSourceIdentity.js";

describe("exact migration source identity", () => {
  it("derives distinct runtime/repository/build/script identities from trusted sources", async () => {
    const fixture = await runtimeFixture();
    try {
      const identity = await derive(fixture.file);
      expect(identity).toMatchObject({
        runtime: { revision: "122", sha256: fixture.sha256 },
        repository: { commit: "a".repeat(40) },
        application: { buildId: "build-one", sourceCommit: "b".repeat(40) },
        migration: { scriptCommit: "c".repeat(40), operationId: "operation-one" },
        package: { version: "phase4-canonical-package-v1" },
      });
    } finally { await fs.rm(fixture.root, { recursive: true, force: true }); }
  });

  it.each([
    ["wrong repository", (value) => { value.repository.commit = "d".repeat(40); }],
    ["wrong build", (value) => { value.application.buildId = "build-two"; }],
    ["wrong Founder revision", (value) => { value.runtime.revision = "121"; }],
    ["wrong Founder hash", (value) => { value.runtime.sha256 = "e".repeat(64); }],
    ["wrong package", (value) => { value.package.version = "stale-package"; }],
    ["wrong operation", (value) => { value.migration.operationId = "stale-operation"; }],
  ])("rejects %s identity", async (_label, mutate) => {
    const fixture = await runtimeFixture();
    try {
      const expected = await derive(fixture.file);
      const actual = structuredClone(expected);
      mutate(actual);
      expect(() => assertMigrationSourceIdentityMatches(actual, expected, { requireMigrationOperationId: true }))
        .toThrow(/source identity mismatch/i);
    } finally { await fs.rm(fixture.root, { recursive: true, force: true }); }
  });

  it("changes runtime identity when the copied source changes", async () => {
    const fixture = await runtimeFixture();
    try {
      const first = await derive(fixture.file);
      await fs.writeFile(fixture.file, JSON.stringify({ version: "founder-seed-v2", revision: 123, updatedAt: "2026-08-13T16:00:00.000Z" }));
      const second = await derive(fixture.file);
      expect(second.runtime.revision).toBe("123");
      expect(second.runtime.sha256).not.toBe(first.runtime.sha256);
    } finally { await fs.rm(fixture.root, { recursive: true, force: true }); }
  });

  it("changes only the typed build/repository fields when the trusted build source changes", async () => {
    const fixture = await runtimeFixture();
    try {
      const first = await derive(fixture.file);
      const second = await deriveTrustedMigrationSourceIdentity({
        runtimePath: fixture.file,
        packageVersion: "phase4-canonical-package-v1",
        sourceSchemaVersion: "000003",
        migrationOperationId: "operation-one",
        buildIdentityProvider: createFixedBuildIdentityProvider({
          repositoryCommit: "d".repeat(40), applicationBuildId: "build-two",
          applicationSourceCommit: "e".repeat(40), migrationScriptCommit: "f".repeat(40),
        }),
      });
      expect(second.runtime).toEqual(first.runtime);
      expect(second.repository.commit).not.toBe(first.repository.commit);
      expect(second.application).not.toEqual(first.application);
      expect(second.migration.scriptCommit).not.toBe(first.migration.scriptCommit);
    } finally { await fs.rm(fixture.root, { recursive: true, force: true }); }
  });
});

function derive(runtimePath) {
  return deriveTrustedMigrationSourceIdentity({
    runtimePath,
    packageVersion: "phase4-canonical-package-v1",
    sourceSchemaVersion: "000003",
    migrationOperationId: "operation-one",
    buildIdentityProvider: createFixedBuildIdentityProvider({
      repositoryCommit: "a".repeat(40), applicationBuildId: "build-one",
      applicationSourceCommit: "b".repeat(40), migrationScriptCommit: "c".repeat(40),
    }),
  });
}

async function runtimeFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "migration-source-identity-"));
  const file = path.join(root, "runtime.json");
  const bytes = Buffer.from(JSON.stringify({ version: "founder-seed-v2", revision: 122, updatedAt: "2026-08-13T15:11:57.160Z" }));
  await fs.writeFile(file, bytes);
  const { createHash } = await import("node:crypto");
  return { root, file, sha256: createHash("sha256").update(bytes).digest("hex") };
}

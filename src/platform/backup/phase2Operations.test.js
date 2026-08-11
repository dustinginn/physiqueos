import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { createBackupManifest, verifyBackupManifest } from "./backupManifest";
import { createPostgresBackupTool } from "./PostgresBackupTool";
import { evaluateOperationalReadiness } from "../observability/operationalReadiness";

describe("Phase 2 operational recovery", () => {
  it("keeps the staging app spec bounded, manual, and secret-free", () => {
    const spec = fs.readFileSync("infra/digitalocean/app.template.yaml", "utf8");
    expect(spec.match(/instance_size_slug: apps-s-1vcpu-0\.5gb/g)).toHaveLength(2);
    expect(spec.match(/repo_clone_url: \$\{GIT_REPOSITORY_URL\}/g)).toHaveLength(2);
    expect(spec).not.toContain("deploy_on_push:");
    expect(spec.match(/^services:/gm)).toHaveLength(1);
    expect(spec.match(/^workers:/gm)).toHaveLength(1);
    expect(spec).not.toMatch(/do[pat]_v1_|postgresql:\/\/[^$]|BEGIN PRIVATE KEY/);
  });

  it("creates deterministic tamper-evident backup manifests", () => {
    const input = { backupId: "backup", buildId: "build", schemaVersion: "000002", createdAt: "2026-08-11T00:00:00Z", database: { filename: "db.dump", byteLength: 3, sha256: "a".repeat(64) }, objects: [{ objectId: "object", byteLength: 2, sha256: "b".repeat(64), providerVersion: "v1" }] };
    const manifest = createBackupManifest(input);
    expect(verifyBackupManifest(manifest)).toBe(true);
    expect(() => verifyBackupManifest({ ...manifest, buildId: "tampered" })).toThrow("digest");
  });

  it("keeps database credentials out of backup command arguments", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const tool = createPostgresBackupTool({ execute });
    await tool.restoreBackup({ connectionString: "postgresql://secret@host/db", inputPath: "synthetic.dump" });
    expect(execute.mock.calls[0][1].join(" ")).not.toContain("secret");
  });

  it("fails readiness closed without required configuration", async () => {
    const result = await evaluateOperationalReadiness({ buildIdentity: { buildId: "build", apiVersion: "v1" }, environment: { databaseEnabled: false, objectStorageRequired: true, objectStorageEnabled: false }, database: { query: vi.fn().mockRejectedValue(new Error("unavailable")) } });
    expect(result.status).toBe("not_ready");
    expect(result.checks).toContainEqual({ name: "configuration", ready: false, code: "CONFIGURATION_MISSING" });
    expect(JSON.stringify(result)).not.toContain("unavailable");
  });

  it("requires compatible migrations and a fresh worker heartbeat", async () => {
    const database = { query: vi.fn().mockImplementation(async (sql) => sql.startsWith("SELECT 1") ? { rows: [{ reachable: 1 }] } : { rows: [{ name: "000002_phase2_platform_operations" }] }) };
    const result = await evaluateOperationalReadiness({
      buildIdentity: { buildId: "build", apiVersion: "v1" }, environment: { databaseEnabled: true, objectStorageRequired: false, objectStorageEnabled: false }, database,
      workerRequired: true, workerStore: { latestHeartbeat: async () => ({ status: "healthy", observed_at: "2026-08-11T00:00:00Z" }) }, clock: () => new Date("2026-08-11T00:01:00Z"),
    });
    expect(result.status).toBe("ready");
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  assertManagedPostgresBackupFreshness,
  createDigitalOceanManagedPostgresBackupFreshnessVerifier,
} from "./DigitalOceanManagedPostgresBackupFreshness.js";

describe("DigitalOcean managed PostgreSQL backup freshness", () => {
  it("passes only an online exact cluster with a backup no older than 24 hours", async () => {
    const verifier = fixture({ backupAt: "2026-08-13T07:00:00.000Z" });
    await expect(verifier.verify()).resolves.toMatchObject({
      ready: true, status: "PASS", clusterId: "cluster-one", backupAgeHours: 5,
      freshnessThresholdHours: 24, mutated: false,
    });
  });

  it("blocks a stale backup", async () => {
    const result = await fixture({ backupAt: "2026-08-12T11:59:59.999Z" }).verify();
    expect(result).toMatchObject({ ready: false, status: "BLOCKED", reason: "backup-stale" });
    expect(() => assertManagedPostgresBackupFreshness(result)).toThrow(/backup freshness is blocked/i);
  });

  it("blocks unavailable backup metadata without inferring freshness from readiness", async () => {
    await expect(fixture({ backups: [] }).verify()).resolves.toMatchObject({
      ready: false, status: "BLOCKED", reason: "backup-metadata-unavailable",
    });
  });

  it("blocks the wrong cluster identity", async () => {
    await expect(fixture({ returnedClusterId: "cluster-two" }).verify()).resolves.toMatchObject({
      ready: false, status: "BLOCKED", reason: "cluster-identity-mismatch",
    });
  });

  it("does not include the provider token in results or request URLs", async () => {
    const fetchImpl = vi.fn(async (url) => response(url.endsWith("/backups") ? { backups: [{ created_at: "2026-08-13T07:00:00.000Z" }] } : { database: { id: "cluster-one", status: "online" } }));
    const result = await fixture({ fetchImpl, token: "secret-provider-token" }).verify();
    expect(JSON.stringify(result)).not.toContain("secret-provider-token");
    expect(fetchImpl.mock.calls.map(([url]) => url).join(" ")).not.toContain("secret-provider-token");
  });
});

function fixture({
  backupAt = "2026-08-13T07:00:00.000Z",
  backups = null,
  returnedClusterId = "cluster-one",
  fetchImpl = null,
  token = "token",
} = {}) {
  const provider = fetchImpl ?? vi.fn(async (url) => response(url.endsWith("/backups")
    ? { backups: backups ?? [{ created_at: backupAt, size_gigabytes: 0.07 }] }
    : { database: { id: returnedClusterId, status: "online" } }));
  return createDigitalOceanManagedPostgresBackupFreshnessVerifier({
    clusterId: "cluster-one",
    accessToken: token,
    fetchImpl: provider,
    now: () => new Date("2026-08-13T12:00:00.000Z"),
  });
}

function response(value) { return { ok: true, status: 200, json: async () => value }; }

import { describe, expect, it } from "vitest";
import { getMigrationOperationalStatus } from "./MigrationOperationalStatus.js";

describe("protected migration operational status", () => {
  it("returns bounded non-secret control, readiness, and audit information", async () => {
    const state = {
      fenceState: "active", fenceId: "fence", canonicalStoreEpoch: "migration-fence", compositionMode: "legacy-json",
      migrationOperationId: "operation", expectedMigrationId: "migration", writesEnabled: false, readsEnabled: true,
      backupPreflightState: "verified", migrationTargetReadiness: "ready", lastTransition: "activate-fence",
      updatedAt: "2026-08-12T20:00:00.000Z", lastOperator: "founder", sourceIdentity: { commit: "commit", buildId: "build" },
    };
    const result = await getMigrationOperationalStatus({ controlStore: { read: () => ({ state, audit: [{ sequence: 1 }] }) } });
    expect(result).toMatchObject({ fenceState: "active", writesEnabled: false, readsEnabled: true, auditCount: 1 });
    expect(JSON.stringify(result)).not.toMatch(/password|credential|token|secret/i);
  });
});

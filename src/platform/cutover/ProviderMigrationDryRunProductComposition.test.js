import { describe, expect, it } from "vitest";
import {
  authorizeProviderMigrationDryRun,
  providerMigrationDryRunHttpStatus,
  safeProviderMigrationDryRunCode,
} from "./ProviderMigrationDryRunProductComposition.js";

describe("product provider migration dry-run wiring", () => {
  const env = { PHYSIQUEOS_OPERATIONS_TOKEN: "x".repeat(32) };

  it("accepts only the existing operations bearer secret", () => {
    expect(authorizeProviderMigrationDryRun(`Bearer ${"x".repeat(32)}`, env)).toBe(true);
    expect(authorizeProviderMigrationDryRun(`Bearer ${"y".repeat(32)}`, env)).toBe(false);
    expect(authorizeProviderMigrationDryRun(null, env)).toBe(false);
  });

  it("fails closed when operations authentication is not configured", () => {
    expect(() => authorizeProviderMigrationDryRun("Bearer anything", {})).toThrowError(expect.objectContaining({ code: "OPERATIONS_AUTH_NOT_CONFIGURED" }));
  });

  it("maps safe contract failures without exposing error text", () => {
    expect(providerMigrationDryRunHttpStatus({ code: "REMOTE_DRY_RUN_BACKUP_IDENTITY_MISMATCH" })).toBe(409);
    expect(providerMigrationDryRunHttpStatus({ code: "REMOTE_DRY_RUN_PAYLOAD_INVALID" })).toBe(400);
    expect(safeProviderMigrationDryRunCode({ code: "not safe" })).toBe("INTERNAL_ERROR");
  });
});

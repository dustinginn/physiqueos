import { describe, expect, it } from "vitest";
import {
  createDurableMigrationControlStore,
  readMigrationControlStatus,
  resolveMigrationControlPath,
} from "./providerMigrationControlForbidden.js";

describe("provider full-runtime legacy migration-control guard", () => {
  it.each([
    ["store creation", createDurableMigrationControlStore],
    ["path resolution", resolveMigrationControlPath],
    ["status read", readMigrationControlStatus],
  ])("continues to reject legacy %s", (_label, operation) => {
    expect(operation).toThrow(expect.objectContaining({
      code: "PROVIDER_LEGACY_MIGRATION_CONTROL_FORBIDDEN",
    }));
  });
});

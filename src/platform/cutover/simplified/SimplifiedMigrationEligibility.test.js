import { describe, expect, it } from "vitest";
import {
  SIMPLIFIED_REQUIRED_SCHEMA_MIGRATIONS,
  assertSimplifiedDisposableTarget,
  assertSimplifiedFrozenSource,
  assertSimplifiedRestartableControl,
  assertSimplifiedSchema,
  assertSimplifiedProviderExecutionBoundary,
} from "./SimplifiedMigrationEligibility.js";

describe("single-user cold-backup migration eligibility", () => {
  it("accepts the exact completed aborted legacy state and rejects ambiguous aborts", () => {
    expect(assertSimplifiedRestartableControl(aborted(), { operationId: "simplified-20260827" })).toBe(true);
    for (const override of [
      { currentStep: "fence-active" },
      { lastTransition: "fence" },
      { releasedAt: "2026-08-18T20:49:00.000Z" },
      { firstPostgresWriteAt: "2026-08-18T20:49:00.000Z" },
      { migrationOperationId: "simplified-20260827" },
    ]) expect(() => assertSimplifiedRestartableControl(aborted(override), { operationId: "simplified-20260827" })).toThrow();
  });

  it("preserves pristine inactive eligibility without accepting retained operation state", () => {
    expect(assertSimplifiedRestartableControl(inactive(), { operationId: "simplified-20260827" })).toBe(true);
    expect(() => assertSimplifiedRestartableControl(inactive({ migrationOperationId: "old" }), { operationId: "simplified-20260827" })).toThrow();
  });

  it("accepts exactly schema 000001 through 000010, rejects missing and incompatible migrations, and does not require 000011", () => {
    expect(assertSimplifiedSchema([...SIMPLIFIED_REQUIRED_SCHEMA_MIGRATIONS])).toBe(true);
    expect(() => assertSimplifiedSchema(SIMPLIFIED_REQUIRED_SCHEMA_MIGRATIONS.slice(0, -1))).toThrow();
    expect(() => assertSimplifiedSchema([...SIMPLIFIED_REQUIRED_SCHEMA_MIGRATIONS, "000011_combined_cutover_coordinator"])).toThrow();
  });

  it("exempts only a distinguishable, non-authoritative, pre-write target with zero Founder data", () => {
    expect(assertSimplifiedDisposableTarget(target())).toMatchObject({ ready: true, managedTargetBackupRequired: false });
    for (const override of [
      { founderScopedRowCount: 1 },
      { firstWriteMarkers: ["2026-08-27T00:00:00.000Z"] },
      { authorityStates: ["provider-authoritative"] },
      { nonSyntheticUserCount: 1 },
      { primaryKeyCollisionCount: 1 },
      { outbox: { failed: 1, dead: 0, expiredLeases: 0 } },
    ]) expect(() => assertSimplifiedDisposableTarget(target(override))).toThrow();
  });

  it("binds all accepted frozen identities", () => {
    const exact = source();
    expect(assertSimplifiedFrozenSource(exact)).toBe(true);
    for (const field of ["actualRuntimeSha256", "actualControlSha256", "actualBackupInventorySha256", "actualSourceCommit"]) {
      expect(() => assertSimplifiedFrozenSource({ ...exact, [field]: field.endsWith("Commit") ? "9".repeat(40) : "9".repeat(64) })).toThrow();
    }
  });

  it("rejects local environment impersonation and accepts only the enabled full App Platform runtime", () => {
    expect(() => assertSimplifiedProviderExecutionBoundary({ PHYSIQUEOS_PROVIDER_EXECUTION_BOUNDARY: "digitalocean-app-platform" })).toThrow();
    expect(assertSimplifiedProviderExecutionBoundary({ PHYSIQUEOS_PROVIDER_EXECUTION_BOUNDARY: "digitalocean-app-platform", PHYSIQUEOS_PROVIDER_FULL_RUNTIME: "1", PHYSIQUEOS_SIMPLIFIED_MIGRATION_ENABLED: "1" })).toBe(true);
  });
});

function base() { return { schemaVersion: "production-migration-control-v1", environment: "production", canonicalStoreEpoch: "legacy-json", compositionMode: "legacy-json", canonicalStoreTarget: "legacy-json", writesEnabled: true, readsEnabled: true, firstPostgresWriteAt: null }; }
function aborted(overrides = {}) { return { ...base(), fenceState: "aborted", fenceId: "fence-old", migrationOperationId: "old-operation", expectedMigrationId: "old-package", currentStep: "aborted-to-legacy", lastTransition: "abort-to-legacy", abortedAt: "2026-08-18T20:48:28.376Z", releasedAt: "2026-08-18T20:48:28.376Z", ...overrides }; }
function inactive(overrides = {}) { return { ...base(), fenceState: "inactive", fenceId: null, migrationOperationId: null, expectedMigrationId: null, ...overrides }; }
function target(overrides = {}) { return { authorityStates: ["provider-compatibility-nonauthoritative"], firstWriteMarkers: [null], founderScopedRowCount: 0, founderSpaceObjectCount: 0, syntheticUserCount: 1, nonSyntheticUserCount: 0, syntheticDataDistinguishable: true, primaryKeyCollisionCount: 0, outbox: { failed: 0, dead: 0, expiredLeases: 0 }, ...overrides }; }
function source(overrides = {}) { return { control: aborted(), operationId: "simplified-20260827", expectedRuntimeRevision: 142, actualRuntimeRevision: 142, expectedRuntimeSha256: "a".repeat(64), actualRuntimeSha256: "a".repeat(64), expectedControlSha256: "b".repeat(64), actualControlSha256: "b".repeat(64), expectedBackupInventorySha256: "c".repeat(64), actualBackupInventorySha256: "c".repeat(64), expectedSourceCommit: "d".repeat(40), actualSourceCommit: "d".repeat(40), ...overrides }; }

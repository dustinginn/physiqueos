import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const pool = Object.freeze({
    connect: vi.fn(),
    end: vi.fn(async () => undefined),
    query: vi.fn(),
  });
  const controller = Object.freeze({ submit: vi.fn(), status: vi.fn() });
  return {
    controller,
    createController: vi.fn(() => controller),
    createPool: vi.fn(() => pool),
    createStore: vi.fn(() => Object.freeze({ enqueue: vi.fn(), find: vi.fn() })),
    pool,
  };
});

vi.mock("../../database/config.js", () => ({
  readDatabaseConfig: vi.fn(() => Object.freeze({ enabled: true })),
}));
vi.mock("../../database/pool.js", () => ({
  createPostgresPool: mocks.createPool,
}));
vi.mock("../../observability/buildIdentity.js", () => ({
  readBuildIdentity: vi.fn(() => Object.freeze({
    buildId: "provider-build",
    gitSha: "b".repeat(40),
  })),
}));
vi.mock("./SimplifiedProviderMigrationOperation.js", () => ({
  createPostgresSimplifiedProviderMigrationOperationStore: mocks.createStore,
  createSimplifiedProviderMigrationController: mocks.createController,
}));

import {
  closeSimplifiedProviderMigrationProductComposition,
  getSimplifiedProviderMigrationProductController,
} from "./SimplifiedProviderMigrationProductComposition.js";
import { getProviderMigrationDryRunProductController } from "../ProviderMigrationDryRunProductComposition.js";

const BASE_ENV = Object.freeze({
  PHYSIQUEOS_CANONICAL_OWNER_USER_ID: "user_founder_001",
  PHYSIQUEOS_EXPECTED_FINAL_BACKUP_SHA256SUMS_SHA256: "a".repeat(64),
  PHYSIQUEOS_EXPECTED_FOUNDER_REVISION: "142",
  PHYSIQUEOS_EXPECTED_FOUNDER_SHA256: "b".repeat(64),
  PHYSIQUEOS_EXPECTED_MEDIA_BYTES: "288919315",
  PHYSIQUEOS_EXPECTED_MEDIA_COUNT: "402",
  PHYSIQUEOS_EXPECTED_MEDIA_INVENTORY_SHA256: "c".repeat(64),
  PHYSIQUEOS_EXPECTED_PRODUCTION_BUILD_ID: "frozen-build",
  PHYSIQUEOS_EXPECTED_PRODUCTION_SOURCE_COMMIT: "d".repeat(40),
  PHYSIQUEOS_PROVIDER_EXECUTION_BOUNDARY: "digitalocean-app-platform",
  PHYSIQUEOS_PROVIDER_FULL_RUNTIME: "1",
  PHYSIQUEOS_PROVIDER_MIGRATION_DRY_RUN_ENABLED: "0",
  PHYSIQUEOS_SIMPLIFIED_MIGRATION_ENABLED: "1",
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  await closeSimplifiedProviderMigrationProductComposition();
});

describe("simplified provider migration product composition", () => {
  it("constructs the simplified production controller while the legacy dry-run gate remains disabled", () => {
    expect(getSimplifiedProviderMigrationProductController({ ...BASE_ENV }))
      .toBe(mocks.controller);
    expect(mocks.createController).toHaveBeenCalledTimes(1);
    expect(mocks.pool.query).not.toHaveBeenCalled();
    expect(mocks.pool.connect).not.toHaveBeenCalled();
  });

  it("returns no controller when the simplified migration feature is disabled", () => {
    expect(getSimplifiedProviderMigrationProductController({
      ...BASE_ENV,
      PHYSIQUEOS_SIMPLIFIED_MIGRATION_ENABLED: "0",
    })).toBeNull();
    expect(mocks.createPool).not.toHaveBeenCalled();
  });

  it.each([
    ["provider full runtime is disabled", { PHYSIQUEOS_PROVIDER_FULL_RUNTIME: "0" }],
    ["the provider execution boundary is wrong", { PHYSIQUEOS_PROVIDER_EXECUTION_BOUNDARY: "local-process" }],
  ])("rejects when %s", (_label, overrides) => {
    expect(() => getSimplifiedProviderMigrationProductController({ ...BASE_ENV, ...overrides }))
      .toThrowError(expect.objectContaining({ code: "SIMPLIFIED_PROVIDER_EXECUTION_BOUNDARY_REQUIRED" }));
    expect(mocks.createPool).not.toHaveBeenCalled();
  });

  it("keeps the legacy controller and worker topic behind the legacy dry-run flag", () => {
    expect(getProviderMigrationDryRunProductController({
      PHYSIQUEOS_PROVIDER_MIGRATION_DRY_RUN_ENABLED: "0",
    })).toBeNull();

    const worker = fs.readFileSync("scripts/runFoundationWorker.mjs", "utf8");
    expect(worker).toContain('process.env.PHYSIQUEOS_PROVIDER_MIGRATION_DRY_RUN_ENABLED === "1"');
    expect(worker).toContain("[PROVIDER_MIGRATION_DRY_RUN_TOPIC]");
    expect(worker).toContain("[simplifiedMigration.SIMPLIFIED_PROVIDER_OPERATION_TOPIC]");
  });
});

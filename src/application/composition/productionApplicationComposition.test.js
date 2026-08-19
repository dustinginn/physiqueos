import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// pg.Pool and the Spaces S3Client are both lazy - they never perform network I/O at construction
// time (see src/platform/database/pool.js and src/platform/object-storage/SpacesPrivateObjectProvider.js).
// That is what makes it possible to unit-test the compatibility owner guard's wiring with zero real
// network activity: a rejected owner must never even reach the code path that would call pool.query().
// The mocked pool's query() throws if invoked at all, so any test that expects a rejection also proves
// the guard ran BEFORE persistence/network I/O.
const poolQuery = vi.fn(() => {
  throw new Error("pool.query() must not be called when the compatibility owner guard rejects the identity.");
});
const poolConnect = vi.fn(() => {
  throw new Error("pool.connect() must not be called when the compatibility owner guard rejects the identity.");
});
const closePool = vi.fn();
vi.mock("../../platform/database/pool.js", () => ({
  createPostgresPool: vi.fn(() => ({ query: poolQuery, connect: poolConnect, end: closePool })),
}));
vi.mock("../../platform/object-storage/SpacesPrivateObjectProvider.js", () => ({
  createSpacesPrivateObjectProvider: vi.fn(() => ({ close: vi.fn() })),
}));

function compatibilityEnv(overrides = {}) {
  return {
    PHYSIQUEOS_PROVIDER_FULL_RUNTIME: "1",
    PHYSIQUEOS_PROVIDER_COMPATIBILITY_MODE: "1",
    PHYSIQUEOS_CANONICAL_OWNER_USER_ID: "phase5-synthetic-user",
    PHYSIQUEOS_DATABASE_ENABLED: "1",
    PHYSIQUEOS_DATABASE_URL: "postgres://user:pass@127.0.0.1:1/unreachable-test-database",
    PHYSIQUEOS_OBJECT_STORAGE_ENABLED: "1",
    PHYSIQUEOS_SPACES_REGION: "nyc3",
    PHYSIQUEOS_SPACES_ENDPOINT: "https://nyc3.digitaloceanspaces.invalid",
    PHYSIQUEOS_SPACES_BUCKET: "test-bucket",
    PHYSIQUEOS_SPACES_ACCESS_KEY_ID: "test-access-key",
    PHYSIQUEOS_SPACES_SECRET_ACCESS_KEY: "test-secret",
    PHYSIQUEOS_RUNTIME_AUTHORITY_ENVIRONMENT: "compatibility-test",
    PHYSIQUEOS_COMPATIBILITY_DATABASE_NAME: "physiqueos_phase5_test_provider_test",
    PHYSIQUEOS_CREDENTIAL_PEPPER: "test-pepper",
    ...overrides,
  };
}

describe("getProductionApplicationComposition — compatibility owner guard wiring", () => {
  beforeEach(() => {
    vi.resetModules();
    poolQuery.mockClear();
    poolConnect.mockClear();
    closePool.mockClear();
  });
  afterEach(() => {
    vi.resetModules();
  });

  it("rejects a Founder-owner compatibility environment before any pool query or persistence-capable composition is built", async () => {
    const { getProductionApplicationComposition } = await import("./productionApplicationComposition.js");
    const env = compatibilityEnv({ PHYSIQUEOS_CANONICAL_OWNER_USER_ID: "user_founder_001" });
    await expect(getProductionApplicationComposition(env)).rejects.toMatchObject({ code: "PROVIDER_COMPATIBILITY_OWNER_FORBIDDEN" });
    expect(poolQuery).not.toHaveBeenCalled();
    expect(poolConnect).not.toHaveBeenCalled();
  });

  it("rejects any user_founder_* compatibility owner, not only the exact literal", async () => {
    const { getProductionApplicationComposition } = await import("./productionApplicationComposition.js");
    const env = compatibilityEnv({ PHYSIQUEOS_CANONICAL_OWNER_USER_ID: "user_founder_002" });
    await expect(getProductionApplicationComposition(env)).rejects.toMatchObject({ code: "PROVIDER_COMPATIBILITY_OWNER_FORBIDDEN" });
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it("rejects a mismatched expected compatibility owner before any pool query", async () => {
    const { getProductionApplicationComposition } = await import("./productionApplicationComposition.js");
    const env = compatibilityEnv({
      PHYSIQUEOS_CANONICAL_OWNER_USER_ID: "some-other-synthetic-owner",
      PHYSIQUEOS_COMPATIBILITY_EXPECTED_OWNER_USER_ID: "phase5-synthetic-user",
    });
    await expect(getProductionApplicationComposition(env)).rejects.toMatchObject({ code: "PROVIDER_COMPATIBILITY_OWNER_MISMATCH" });
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it("proceeds past the owner guard (reaches the database-identity check) for the expected synthetic owner", async () => {
    const { getProductionApplicationComposition } = await import("./productionApplicationComposition.js");
    const env = compatibilityEnv({
      PHYSIQUEOS_CANONICAL_OWNER_USER_ID: "phase5-synthetic-user",
      PHYSIQUEOS_COMPATIBILITY_EXPECTED_OWNER_USER_ID: "phase5-synthetic-user",
    });
    // The mocked pool.query() throws unconditionally - reaching it (instead of an owner-guard
    // rejection) proves the guard accepted this owner and let composition proceed.
    await expect(getProductionApplicationComposition(env)).rejects.toThrow(
      "pool.query() must not be called when the compatibility owner guard rejects the identity."
    );
    expect(poolQuery).toHaveBeenCalledTimes(1);
  });

  it("does not apply the compatibility owner guard for a non-compatibility-mode full-runtime environment", async () => {
    const { getProductionApplicationComposition } = await import("./productionApplicationComposition.js");
    const env = compatibilityEnv({
      PHYSIQUEOS_PROVIDER_COMPATIBILITY_MODE: "0",
      PHYSIQUEOS_CANONICAL_OWNER_USER_ID: "user_founder_001",
    });
    // Not compatibility mode: the owner guard must not run at all, and this path never reaches
    // providerRuntime.pool.query() (no database-identity check outside compatibility mode) - it
    // proceeds straight into building the real composition, which requires a live pool connection
    // this test intentionally does not provide further mocking for, so we only assert it did NOT
    // fail with the compatibility owner-guard's error code.
    await expect(getProductionApplicationComposition(env)).rejects.not.toMatchObject({ code: "PROVIDER_COMPATIBILITY_OWNER_FORBIDDEN" });
    expect(poolQuery).not.toHaveBeenCalled();
  });
});

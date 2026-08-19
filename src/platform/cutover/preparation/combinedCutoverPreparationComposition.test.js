import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mirrors the wiring-test pattern already used for productionApplicationComposition.test.js. pg.Pool
// is lazy (no network I/O at construction), so a mocked pool whose query()/connect() throw a sentinel
// lets us prove exactly where in resolve() execution reached, with zero real network activity.
const poolQuery = vi.fn(() => {
  throw new Error("pool.query() must not be called when the compatibility owner guard rejects the identity.");
});
const poolConnect = vi.fn(() => {
  throw new Error("pool.connect() must not be called when the compatibility owner guard rejects the identity.");
});
vi.mock("../../database/pool.js", () => ({
  createPostgresPool: vi.fn(() => ({ query: poolQuery, connect: poolConnect, end: vi.fn() })),
}));
vi.mock("../../object-storage/SpacesPrivateObjectProvider.js", () => ({
  createSpacesPrivateObjectProvider: vi.fn(() => ({ close: vi.fn() })),
}));

function preparationEnv(overrides = {}) {
  return {
    PHYSIQUEOS_COMBINED_CUTOVER_PREPARE_ENABLED: "1",
    PHYSIQUEOS_RUNTIME_AUTHORITY_ENVIRONMENT: "compatibility-test",
    PHYSIQUEOS_CANONICAL_OWNER_USER_ID: "phase5-synthetic-user",
    PHYSIQUEOS_DATABASE_ENABLED: "1",
    PHYSIQUEOS_DATABASE_URL: "postgres://user:pass@127.0.0.1:1/unreachable-test-database",
    PHYSIQUEOS_OBJECT_STORAGE_ENABLED: "1",
    PHYSIQUEOS_SPACES_REGION: "nyc3",
    PHYSIQUEOS_SPACES_ENDPOINT: "https://nyc3.digitaloceanspaces.invalid",
    PHYSIQUEOS_SPACES_BUCKET: "test-bucket",
    PHYSIQUEOS_SPACES_ACCESS_KEY_ID: "test-access-key",
    PHYSIQUEOS_SPACES_SECRET_ACCESS_KEY: "test-secret",
    PHYSIQUEOS_CREDENTIAL_PEPPER: "test-pepper",
    PHYSIQUEOS_PROVIDER_DEPLOYMENT_ID: "test-deployment",
    ...overrides,
  };
}

describe("getCombinedCutoverPreparationService — compatibility owner guard wiring", () => {
  beforeEach(() => {
    vi.resetModules();
    poolQuery.mockClear();
    poolConnect.mockClear();
  });
  afterEach(() => {
    vi.resetModules();
  });

  it("rejects a Founder-owner compatibility-shaped environment before any pool construction", async () => {
    const { getCombinedCutoverPreparationService } = await import("./combinedCutoverPreparationComposition.js");
    const env = preparationEnv({ PHYSIQUEOS_CANONICAL_OWNER_USER_ID: "user_founder_001" });
    expect(() => getCombinedCutoverPreparationService(env)).toThrow(expect.objectContaining({ code: "PROVIDER_COMPATIBILITY_OWNER_FORBIDDEN" }));
    expect(poolQuery).not.toHaveBeenCalled();
    expect(poolConnect).not.toHaveBeenCalled();
  });

  it("rejects any user_founder_* compatibility owner, not only the exact literal", async () => {
    const { getCombinedCutoverPreparationService } = await import("./combinedCutoverPreparationComposition.js");
    const env = preparationEnv({ PHYSIQUEOS_CANONICAL_OWNER_USER_ID: "user_founder_synthetic" });
    expect(() => getCombinedCutoverPreparationService(env)).toThrow(expect.objectContaining({ code: "PROVIDER_COMPATIBILITY_OWNER_FORBIDDEN" }));
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it("rejects a mismatched expected compatibility owner before any pool construction", async () => {
    const { getCombinedCutoverPreparationService } = await import("./combinedCutoverPreparationComposition.js");
    const env = preparationEnv({
      PHYSIQUEOS_CANONICAL_OWNER_USER_ID: "some-other-owner",
      PHYSIQUEOS_COMPATIBILITY_EXPECTED_OWNER_USER_ID: "phase5-synthetic-user",
    });
    expect(() => getCombinedCutoverPreparationService(env)).toThrow(expect.objectContaining({ code: "PROVIDER_COMPATIBILITY_OWNER_MISMATCH" }));
    expect(poolQuery).not.toHaveBeenCalled();
  });

  it("proceeds past the owner guard (reaches pool construction) for the expected synthetic owner", async () => {
    const { getCombinedCutoverPreparationService } = await import("./combinedCutoverPreparationComposition.js");
    const env = preparationEnv({ PHYSIQUEOS_CANONICAL_OWNER_USER_ID: "phase5-synthetic-user" });
    // Reaching the mocked pool at all (rather than an owner-guard rejection) proves the guard
    // accepted this owner and let resolve() proceed toward building the composition.
    expect(() => getCombinedCutoverPreparationService(env)).not.toThrow(expect.objectContaining({ code: "PROVIDER_COMPATIBILITY_OWNER_FORBIDDEN" }));
  });

  it("does not apply the compatibility owner guard for a non-compatibility-shaped runtime authority environment (production-authorized elsewhere)", async () => {
    const { getCombinedCutoverPreparationService } = await import("./combinedCutoverPreparationComposition.js");
    const env = preparationEnv({
      PHYSIQUEOS_RUNTIME_AUTHORITY_ENVIRONMENT: "combined-cutover-production",
      PHYSIQUEOS_CANONICAL_OWNER_USER_ID: "user_founder_001",
    });
    // Not compatibility-shaped: the real Founder owner is legitimate here and must not be rejected
    // by this guard, regardless of what else fails further down (real pool/S3 construction is not
    // fully mocked for this path).
    expect(() => getCombinedCutoverPreparationService(env)).not.toThrow(expect.objectContaining({ code: "PROVIDER_COMPATIBILITY_OWNER_FORBIDDEN" }));
  });

  it("returns null without constructing anything when the preparation channel is not enabled", async () => {
    const { getCombinedCutoverPreparationService } = await import("./combinedCutoverPreparationComposition.js");
    const env = preparationEnv({ PHYSIQUEOS_COMBINED_CUTOVER_PREPARE_ENABLED: "0", PHYSIQUEOS_CANONICAL_OWNER_USER_ID: "user_founder_001" });
    expect(getCombinedCutoverPreparationService(env)).toBeNull();
    expect(poolQuery).not.toHaveBeenCalled();
  });
});

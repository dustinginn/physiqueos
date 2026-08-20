import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createCompatibilityRuntimeAuthorityState } from "../cutover/CombinedRuntimeAuthorityState.js";
import { getProviderProductReadiness } from "./ProviderProductReadiness.js";

const VALID_SECRET = "x".repeat(32);
const DATABASE = "physiqueos_phase5_test_provider_readiness";
const ENVIRONMENT = "compatibility-test-readiness";
const BUILD = Object.freeze({ buildId: "readiness-test-build", apiVersion: "v1" });

function env(overrides = {}) {
  return {
    PHYSIQUEOS_PROVIDER_FULL_RUNTIME: "1",
    PHYSIQUEOS_PROVIDER_COMPATIBILITY_MODE: "1",
    PHYSIQUEOS_ACCESS_GATE_SECRET: VALID_SECRET,
    PHYSIQUEOS_RUNTIME_AUTHORITY_ENVIRONMENT: ENVIRONMENT,
    PHYSIQUEOS_COMPATIBILITY_DATABASE_NAME: DATABASE,
    ...overrides,
  };
}

function compatibilityState(overrides = {}) {
  return {
    ...createCompatibilityRuntimeAuthorityState({
      environment: ENVIRONMENT,
      providerSource: { commit: "a".repeat(40), buildId: "synthetic-build" },
      target: { databaseName: DATABASE, databaseClusterId: "synthetic-cluster", spacesBucket: "synthetic-bucket" },
    }),
    ...overrides,
  };
}

function composition(overrides = {}) {
  return {
    compatibilityMode: true,
    expectedDatabaseName: DATABASE,
    databaseProbe: { healthCheck: vi.fn().mockResolvedValue({ reachable: true, databaseName: DATABASE, ownerPresent: true }) },
    authorityStore: { read: vi.fn().mockResolvedValue({ state: compatibilityState() }) },
    objectProvider: { healthCheck: vi.fn().mockResolvedValue({ reachable: true }) },
    ...overrides,
  };
}

function harness(overrides = {}) {
  const providerComposition = overrides.composition ?? composition();
  const getComposition = overrides.getComposition ?? vi.fn().mockResolvedValue(providerComposition);
  const logger = { warn: vi.fn() };
  return {
    providerComposition,
    getComposition,
    logger,
    run: (options = {}) => getProviderProductReadiness({
      env: env(),
      buildIdentity: BUILD,
      getComposition,
      logger,
      ...options,
    }),
  };
}

function failedCheck(readiness) {
  return readiness.checks.find((check) => !check.ready);
}

describe("provider product readiness", () => {
  it("returns the OpenAPI readiness shape when the lightweight provider contract passes", async () => {
    const { run, providerComposition, getComposition, logger } = harness();

    const result = await run();

    expect(result).toEqual({
      status: "ready",
      buildId: BUILD.buildId,
      apiVersion: "v1",
      checks: [
        { name: "access_gate", ready: true, code: "ACCESS_GATE_READY" },
        { name: "provider_configuration", ready: true, code: "PROVIDER_CONFIGURATION_READY" },
        { name: "database", ready: true, code: "PROVIDER_DATABASE_REACHABLE" },
        { name: "database_identity", ready: true, code: "PROVIDER_DATABASE_IDENTITY_MATCHED" },
        { name: "product_owner", ready: true, code: "PROVIDER_OWNER_IDENTITY_READY" },
        { name: "runtime_authority", ready: true, code: "COMPATIBILITY_AUTHORITY_NONAUTHORITATIVE" },
        { name: "object_storage", ready: true, code: "PROVIDER_OBJECT_STORAGE_REACHABLE" },
        { name: "deadline", ready: true, code: "PROVIDER_READINESS_COMPLETED_IN_BUDGET" },
      ],
    });
    expect(getComposition).toHaveBeenCalledTimes(1);
    expect(providerComposition.databaseProbe.healthCheck).toHaveBeenCalledWith({ queryTimeoutMs: 3000 });
    expect(providerComposition.authorityStore.read).toHaveBeenCalledWith({ queryTimeoutMs: 3000 });
    expect(providerComposition.objectProvider.healthCheck).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 3000 }));
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("fails before composition or dependencies when the access gate is unavailable", async () => {
    const getComposition = vi.fn();
    const result = await getProviderProductReadiness({
      env: env({ PHYSIQUEOS_ACCESS_GATE_SECRET: "" }),
      buildIdentity: BUILD,
      getComposition,
      logger: { warn: vi.fn() },
    });

    expect(result.status).toBe("not_ready");
    expect(failedCheck(result)).toEqual({ name: "access_gate", ready: false, code: "ACCESS_GATE_NOT_CONFIGURED" });
    expect(getComposition).not.toHaveBeenCalled();
  });

  it("returns a bounded database failure without attempting authority or Spaces", async () => {
    const databaseProbe = { healthCheck: vi.fn().mockRejectedValue(Object.assign(new Error("private detail"), { code: "ECONNREFUSED" })) };
    const providerComposition = composition({ databaseProbe });
    const { run, logger } = harness({ composition: providerComposition });

    const result = await run();

    expect(failedCheck(result)).toEqual({ name: "database", ready: false, code: "ECONNREFUSED" });
    expect(providerComposition.authorityStore.read).not.toHaveBeenCalled();
    expect(providerComposition.objectProvider.healthCheck).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith("provider.readiness.failed", expect.objectContaining({ stage: "database", code: "ECONNREFUSED" }));
    expect(JSON.stringify(result)).not.toContain("private detail");
  });

  it("fails on the wrong database identity before authority or Spaces", async () => {
    const providerComposition = composition({
      databaseProbe: { healthCheck: vi.fn().mockResolvedValue({ reachable: true, databaseName: "wrong_database", ownerPresent: true }) },
    });
    const { run } = harness({ composition: providerComposition });

    const result = await run();

    expect(failedCheck(result)).toEqual({ name: "database_identity", ready: false, code: "PROVIDER_DATABASE_IDENTITY_MISMATCH" });
    expect(providerComposition.authorityStore.read).not.toHaveBeenCalled();
    expect(providerComposition.objectProvider.healthCheck).not.toHaveBeenCalled();
  });

  it("requires the targeted canonical owner proof without hydrating canonical runtime", async () => {
    const providerComposition = composition({
      databaseProbe: { healthCheck: vi.fn().mockResolvedValue({ reachable: true, databaseName: DATABASE, ownerPresent: false }) },
    });
    const { run } = harness({ composition: providerComposition });

    const result = await run();

    expect(failedCheck(result)).toEqual({ name: "product_owner", ready: false, code: "PROVIDER_OWNER_IDENTITY_UNAVAILABLE" });
    expect(providerComposition.authorityStore.read).not.toHaveBeenCalled();
  });

  it("fails safely when the authority read rejects", async () => {
    const providerComposition = composition({ authorityStore: { read: vi.fn().mockRejectedValue(new Error("secret SQL")) } });
    const { run } = harness({ composition: providerComposition });

    const result = await run();

    expect(failedCheck(result)).toEqual({ name: "runtime_authority", ready: false, code: "PROVIDER_RUNTIME_AUTHORITY_UNAVAILABLE" });
    expect(providerComposition.objectProvider.healthCheck).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("secret SQL");
  });

  it("rejects an authoritative or otherwise invalid compatibility posture", async () => {
    const invalid = compatibilityState({ authority: "provider-authoritative", publicRuntimeAuthority: "provider" });
    const providerComposition = composition({ authorityStore: { read: vi.fn().mockResolvedValue({ state: invalid }) } });
    const { run } = harness({ composition: providerComposition });

    const result = await run();

    expect(failedCheck(result)).toEqual({ name: "runtime_authority", ready: false, code: "RUNTIME_AUTHORITY_COMPATIBILITY_REJECTED" });
    expect(invalid.firstProviderCanonicalWriteAt).toBeNull();
    expect(providerComposition.objectProvider.healthCheck).not.toHaveBeenCalled();
  });

  it("fails safely when Spaces health rejects or times out", async () => {
    for (const code of ["PROVIDER_OBJECT_STORAGE_UNAVAILABLE", "OBJECT_STORAGE_HEALTH_TIMEOUT"]) {
      const providerComposition = composition({
        objectProvider: { healthCheck: vi.fn().mockRejectedValue(Object.assign(new Error("private endpoint"), { code })) },
      });
      const { run } = harness({ composition: providerComposition });

      const result = await run();

      expect(failedCheck(result)).toEqual({ name: "object_storage", ready: false, code });
      expect(JSON.stringify(result)).not.toContain("private endpoint");
    }
  });

  it("returns a structured not-ready result inside the cumulative deadline", async () => {
    const never = new Promise(() => undefined);
    const providerComposition = composition({ databaseProbe: { healthCheck: vi.fn(() => never) } });
    const { run, logger } = harness({ composition: providerComposition });
    const started = performance.now();

    const result = await run({ deadlineMs: 100 });

    expect(performance.now() - started).toBeLessThan(500);
    expect(result.status).toBe("not_ready");
    expect(failedCheck(result)).toEqual({ name: "deadline", ready: false, code: "PROVIDER_READINESS_DEADLINE_EXCEEDED" });
    expect(logger.warn).toHaveBeenCalledWith("provider.readiness.failed", expect.objectContaining({ stage: "database", code: "PROVIDER_READINESS_DEADLINE_EXCEEDED" }));
  });

  it("uses only read-oriented readiness ports and never exposes a canonical mutation surface", async () => {
    const providerComposition = composition();
    const before = structuredClone((await providerComposition.authorityStore.read()).state);
    providerComposition.authorityStore.read.mockClear();
    const { run } = harness({ composition: providerComposition });

    await expect(run()).resolves.toMatchObject({ status: "ready" });

    expect(Object.keys(providerComposition.databaseProbe)).toEqual(["healthCheck"]);
    expect(Object.keys(providerComposition.authorityStore)).toEqual(["read"]);
    expect(Object.keys(providerComposition.objectProvider)).toEqual(["healthCheck"]);
    expect((await providerComposition.authorityStore.read()).state).toEqual(before);
    expect(before).toMatchObject({
      authority: "provider-compatibility-nonauthoritative",
      publicRuntimeAuthority: "windows",
      productionWritesAllowed: false,
      combinedExecutionAllowed: false,
      firstProviderCanonicalWriteAt: null,
    });

    const readinessSource = fs.readFileSync(new URL("./ProviderProductReadiness.js", import.meta.url), "utf8");
    const probeSource = fs.readFileSync(new URL("../database/ProviderReadinessProbe.js", import.meta.url), "utf8");
    expect(readinessSource).not.toContain("getProductionApplicationComposition(");
    expect(readinessSource).not.toContain("loadCanonicalRuntime");
    expect(readinessSource).not.toMatch(/\.(?:transition|claimCanonicalWriteBoundary|initialize)\s*\(/);
    expect(readinessSource).not.toContain("firstProviderCanonicalWriteAt");
    expect(probeSource).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|MERGE|CALL)\b/);
  });
});

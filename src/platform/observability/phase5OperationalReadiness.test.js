import { describe, expect, it, vi } from "vitest";
import { evaluateOperationalReadiness } from "./operationalReadiness.js";

describe("Phase 5 operational readiness", () => {
  it("accepts the explicitly expected additive schema without changing the Phase 2 default", async () => {
    const database = { query: vi.fn()
      .mockResolvedValueOnce({ rows: [{ reachable: 1 }] })
      .mockResolvedValueOnce({ rows: [{ name: "000004_phase5_provider_readiness" }] }) };
    const result = await evaluateOperationalReadiness({
      buildIdentity: { buildId: "phase5", apiVersion: "v1" },
      environment: { databaseEnabled: true, objectStorageEnabled: true, objectStorageRequired: true },
      database,
      objectProvider: { healthCheck: vi.fn(async () => ({ reachable: true })) },
      expectedSchemaMigration: "000004_phase5_provider_readiness",
    });
    expect(result.status).toBe("ready");
    expect(result.checks.find((check) => check.name === "schema")).toMatchObject({ ready: true, code: "SCHEMA_COMPATIBLE" });
  });
});

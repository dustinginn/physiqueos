import { describe, expect, it, vi } from "vitest";
import { createPostgresProviderReadinessProbe } from "./ProviderReadinessProbe.js";

describe("Postgres provider readiness probe", () => {
  it("uses one bounded read-only query for database and canonical-owner identity", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ database: "compatibility_db", owner_present: true }] });
    const probe = createPostgresProviderReadinessProbe({ pool: { query }, ownerUserId: "synthetic-owner" });

    await expect(probe.healthCheck({ queryTimeoutMs: 1200 })).resolves.toEqual({
      reachable: true,
      databaseName: "compatibility_db",
      ownerPresent: true,
    });

    expect(query).toHaveBeenCalledTimes(1);
    const call = query.mock.calls[0][0];
    expect(call.query_timeout).toBe(1200);
    expect(call.values).toEqual(["synthetic-owner"]);
    expect(call.text).toMatch(/^SELECT current_database\(\)/);
    expect(call.text).toContain("canonical_user_records");
    expect(call.text).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|MERGE|CALL)\b/i);
  });

  it("rejects an invalid query deadline before touching PostgreSQL", async () => {
    const query = vi.fn();
    const probe = createPostgresProviderReadinessProbe({ pool: { query }, ownerUserId: "synthetic-owner" });

    await expect(probe.healthCheck({ queryTimeoutMs: 0 })).rejects.toThrow("timeout is invalid");
    expect(query).not.toHaveBeenCalled();
  });
});

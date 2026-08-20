import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getProviderProductReadiness } = vi.hoisted(() => ({
  getProviderProductReadiness: vi.fn(),
}));

vi.mock("../../../../../platform/health/ProviderProductReadiness", () => ({ getProviderProductReadiness }));

import { GET } from "./route.js";

let originalEnv;
beforeEach(() => {
  originalEnv = { ...process.env };
  process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME = "1";
  getProviderProductReadiness.mockReset();
});
afterEach(() => { process.env = originalEnv; });

describe("provider readiness route", () => {
  it("returns application JSON 503 for a bounded readiness deadline", async () => {
    getProviderProductReadiness.mockResolvedValue({
      status: "not_ready",
      buildId: "synthetic-build",
      apiVersion: "v1",
      checks: [{ name: "deadline", ready: false, code: "PROVIDER_READINESS_DEADLINE_EXCEEDED" }],
    });

    const response = await GET(new Request("http://localhost/api/v1/health/ready", { headers: { "x-request-id": "readiness-request" } }));

    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("x-request-id")).toBe("readiness-request");
    expect(await response.json()).toMatchObject({
      status: "not_ready",
      checks: [{ name: "deadline", ready: false, code: "PROVIDER_READINESS_DEADLINE_EXCEEDED" }],
    });
  });

  it("returns 200 only when every provider readiness check passes", async () => {
    getProviderProductReadiness.mockResolvedValue({
      status: "ready",
      buildId: "synthetic-build",
      apiVersion: "v1",
      checks: [{ name: "deadline", ready: true, code: "PROVIDER_READINESS_COMPLETED_IN_BUDGET" }],
    });

    const response = await GET(new Request("http://localhost/api/v1/health/ready"));
    expect(response.status).toBe(200);
  });
});

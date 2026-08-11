import { describe, expect, it } from "vitest";
import { GET as getLive } from "./health/live/route";
import { GET as getReady } from "./health/ready/route";
import { GET as getPlatform } from "./platform/route";

describe("inactive /api/v1 foundation", () => {
  it("exposes only non-sensitive process liveness", async () => {
    const response = await getLive(new Request("http://localhost/api/v1/health/live", { headers: { "x-request-id": "synthetic-request" } }));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("synthetic-request");
    expect(await response.json()).toMatchObject({ status: "ok", apiVersion: "v1" });
  });

  it("reports shared-platform dependencies as intentionally not ready", async () => {
    const response = await getReady(new Request("http://localhost/api/v1/health/ready"));
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body.status).toBe("not_ready");
    expect(body.checks.every((check) => check.ready === false)).toBe(true);
  });

  it("denies the protected platform endpoint instead of creating a placeholder principal", async () => {
    const response = await getPlatform(new Request("http://localhost/api/v1/platform", { headers: { authorization: "Bearer not-activated" } }));
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    expect(body).toMatchObject({ problemVersion: "1", code: "FOUNDATION_AUTH_INACTIVE" });
    expect(JSON.stringify(body)).not.toContain("Founder");
  });
});

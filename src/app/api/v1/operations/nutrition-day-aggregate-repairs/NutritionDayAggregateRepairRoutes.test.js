import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "./route";

const originalToken = process.env.PHYSIQUEOS_OPERATIONS_TOKEN;
const originalCompatibility = process.env.PHYSIQUEOS_PROVIDER_COMPATIBILITY_MODE;
const token = "nutrition-aggregate-repair-test-token-123456789";

describe("NutritionDay aggregate repair operations route", () => {
  beforeEach(() => {
    process.env.PHYSIQUEOS_OPERATIONS_TOKEN = token;
    delete process.env.PHYSIQUEOS_PROVIDER_COMPATIBILITY_MODE;
  });

  afterEach(() => {
    restore("PHYSIQUEOS_OPERATIONS_TOKEN", originalToken);
    restore("PHYSIQUEOS_PROVIDER_COMPATIBILITY_MODE", originalCompatibility);
  });

  it("requires operations authentication", async () => {
    const response = await POST(request({ mode: "inspect", date: "2026-09-05" }));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      code: "AUTHENTICATION_REQUIRED",
    });
  });

  it("refuses the Native compatibility runtime before any provider access", async () => {
    process.env.PHYSIQUEOS_PROVIDER_COMPATIBILITY_MODE = "1";
    const response = await POST(request(
      { mode: "execute", date: "2026-09-05" },
      `Bearer ${token}`
    ));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      code: "NUTRITION_AGGREGATE_REPAIR_PRODUCTION_ONLY",
    });
  });
});

function request(body, authorization = null) {
  const headers = { "content-type": "application/json" };
  if (authorization) headers.authorization = authorization;
  return new Request("http://localhost/api/v1/operations/nutrition-day-aggregate-repairs", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function restore(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

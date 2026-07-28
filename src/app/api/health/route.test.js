import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("/api/health", () => {
  it("returns a non-sensitive ok payload", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.buildId ?? null).not.toBe("");
    expect(body.gitHead ?? null).not.toBe("");
    expect(body.runtimeMode).toBeDefined();
    expect(JSON.stringify(body)).not.toMatch(/password|secret|token|Founder/i);
  });
});

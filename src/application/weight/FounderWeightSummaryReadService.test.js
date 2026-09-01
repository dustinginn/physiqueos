import { describe, expect, it, vi } from "vitest";
import { createAuthenticationPrincipal } from "../auth/principal.js";
import { createFounderWeightSummaryReadService } from "./FounderWeightSummaryReadService.js";

const principal = createAuthenticationPrincipal({
  userId: "user",
  deviceId: "device",
  sessionId: "session",
  scopes: ["founder:read"],
});

describe("FounderWeightSummaryReadService", () => {
  it("returns one minimal canonical Weight DTO", async () => {
    const readLatestWeight = vi.fn(async () => ({
      id: "weight-1",
      measuredAt: "2026-08-31",
      weight: { value: 168.4, unit: "lb" },
      notes: "must not cross the transport",
    }));
    const result = await createFounderWeightSummaryReadService({ readLatestWeight }).getCurrentWeight({ principal });
    expect(readLatestWeight).toHaveBeenCalledWith("user");
    expect(result).toEqual({
      schemaVersion: "1",
      currentWeight: { id: "weight-1", value: 168.4, unit: "lb", measurementDate: "2026-08-31" },
    });
    expect(JSON.stringify(result)).not.toContain("notes");
  });

  it("preserves a Pacific calendar date without midnight conversion", async () => {
    const oldTimeZone = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      const service = createFounderWeightSummaryReadService({ readLatestWeight: async () => ({ id: "weight-2", measuredAt: "2026-01-01T00:00:00.000Z", weight: { value: 75, unit: "kg" } }) });
      await expect(service.getCurrentWeight({ principal })).resolves.toMatchObject({ currentWeight: { measurementDate: "2026-01-01" } });
    } finally {
      if (oldTimeZone == null) delete process.env.TZ;
      else process.env.TZ = oldTimeZone;
    }
  });

  it("denies a session without founder:read", async () => {
    const wrongScope = createAuthenticationPrincipal({ userId: "user", deviceId: "device", sessionId: "session", scopes: ["founder:write"] });
    const service = createFounderWeightSummaryReadService({ readLatestWeight: vi.fn() });
    await expect(service.getCurrentWeight({ principal: wrongScope })).rejects.toMatchObject({ status: 403, code: "AUTHORIZATION_DENIED" });
  });

  it("returns an explicit empty summary when no Weight exists", async () => {
    const service = createFounderWeightSummaryReadService({ readLatestWeight: async () => null });
    await expect(service.getCurrentWeight({ principal })).resolves.toEqual({ schemaVersion: "1", currentWeight: null });
  });
});

import { describe, expect, it, vi } from "vitest";
import { createAuthenticationPrincipal } from "../auth/principal.js";
import { createPhase3ReadModelService, Phase3ReadModel } from "./Phase3ReadModelService.js";

const principal = createAuthenticationPrincipal({ userId: "user-one", deviceId: "device-one", sessionId: "session-one" });

describe("Phase 3 bounded read models", () => {
  it("requires a principal and creates stable, client-safe envelopes for every surface", async () => {
    const loaders = Object.fromEntries(Object.values(Phase3ReadModel).map((model) => [model, vi.fn(async ({ principal: actor }) => ({ id: model, owner: actor.userId, href: "/profile", filePath: "C:/secret", repository: {} }))]));
    const service = createPhase3ReadModelService({ loaders, now: () => new Date("2026-08-11T12:00:00Z"), readResourceVersion: () => "7" });
    await expect(service.home()).rejects.toMatchObject({ status: 401, code: "AUTHENTICATION_REQUIRED" });
    for (const method of ["home", "log", "evidenceReview", "goals", "operatingPlan", "priorities", "progress", "confidence", "briefings", "training", "profile"]) {
      const result = await service[method](principal);
      expect(result).toMatchObject({ contractVersion: "1", resourceVersion: "7", generatedAt: "2026-08-11T12:00:00.000Z" });
      expect(result.data.destination).toEqual({ id: "profile", parameters: {} });
      expect(JSON.stringify(result)).not.toMatch(/filePath|repository|C:\/secret/);
      expect(result.etag).toMatch(/^"[A-Za-z0-9_-]+"$/);
      expect(Object.isFrozen(result)).toBe(true);
    }
  });

  it("fails parity validation instead of silently dropping an unmapped web link", async () => {
    const service = createPhase3ReadModelService({ loaders: { [Phase3ReadModel.HOME]: async () => ({ href: "/not-registered" }) } });
    await expect(service.home(principal)).rejects.toThrow("unmapped web destination");
  });

  it("creates persistence-independent ETags for equivalent JSON object key order", async () => {
    const left = createPhase3ReadModelService({ loaders: { [Phase3ReadModel.HOME]: async () => ({ id: "one", nested: { alpha: 1, beta: 2 } }) }, now: () => new Date("2026-08-11T12:00:00Z") });
    const right = createPhase3ReadModelService({ loaders: { [Phase3ReadModel.HOME]: async () => ({ nested: { beta: 2, alpha: 1 }, id: "one" }) }, now: () => new Date("2026-08-11T12:00:00Z") });
    expect((await left.home(principal)).etag).toBe((await right.home(principal)).etag);
  });
});

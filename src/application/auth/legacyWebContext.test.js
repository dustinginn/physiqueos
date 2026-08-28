import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createPostgresFounderReadScope } from "../../platform/database/PostgresFounderRepositoryFacade.js";
import { runInactiveLegacyWebReadScope } from "./legacyWebContext.js";

const routeSources = Object.freeze([
  ["home.page", new URL("../../screens/HomeScreen.jsx", import.meta.url)],
  ["log.page", new URL("../../app/log/page.js", import.meta.url)],
  ["goals.page", new URL("../../screens/GoalsHubScreen.jsx", import.meta.url)],
  ["operating-plan.page", new URL("../../app/profile/operating-plan/page.js", import.meta.url)],
]);

describe("inactive legacy web request read scope", () => {
  it("shares one provider runtime across composition, principal, and nested page reads", async () => {
    const harness = createReadScopeHarness();

    const result = await harness.run("home.page");

    expect(result).toEqual({ marker: "runtime-1", userId: "user_founder_001" });
    expect(harness.runtimeLoads()).toBe(1);
    expect(harness.events).toEqual([
      expect.objectContaining({ readModel: "home.page", runtimeLoadCount: 1 }),
    ]);
  });

  it("loads a fresh runtime for separate and concurrent requests", async () => {
    const harness = createReadScopeHarness();

    await harness.run("home.page");
    await harness.run("home.page");
    await Promise.all([harness.run("log.page"), harness.run("goals.page")]);

    expect(harness.runtimeLoads()).toBe(4);
    expect(harness.events).toHaveLength(4);
    expect(harness.events.every((event) => event.runtimeLoadCount === 1)).toBe(true);
  });

  it("releases a failed scope before the next request", async () => {
    const harness = createReadScopeHarness();

    await expect(harness.run("home.page", { fail: true })).rejects.toThrow("page failed");
    const next = await harness.run("home.page");

    expect(next.marker).toBe("runtime-2");
    expect(harness.runtimeLoads()).toBe(2);
    expect(harness.events).toHaveLength(2);
  });

  it("preserves canonical principal requirements", async () => {
    const runInReadScope = (callback) => callback();
    await expect(runInactiveLegacyWebReadScope({
      readModel: "home.page",
      runInReadScope,
      resolveComposition: async () => ({ repositories: { users: { getCurrentUser: async () => null } } }),
      callback: vi.fn(),
    })).rejects.toThrow("requires the canonical current user");
  });

  it("wires only the four authorized pages through the shared request boundary", () => {
    for (const [readModel, url] of routeSources) {
      const source = fs.readFileSync(url, "utf8");
      expect(source).toContain("runInactiveLegacyWebReadScope");
      expect(source).toContain(`readModel: "${readModel}"`);
    }
  });
});

function createReadScopeHarness() {
  let runtimeLoads = 0;
  const events = [];
  const readScope = createPostgresFounderReadScope({
    async loadRuntime() {
      runtimeLoads += 1;
      return Object.freeze({
        marker: `runtime-${runtimeLoads}`,
        user: Object.freeze({ id: "user_founder_001", timeZone: "America/Los_Angeles" }),
      });
    },
    onComplete: (event) => events.push(event),
  });
  const repositories = Object.freeze({
    users: Object.freeze({
      getCurrentUser: async () => (await readScope.readRuntime()).user,
    }),
    runInReadScope: (callback, metadata) => readScope.run(callback, metadata),
  });

  return Object.freeze({
    events,
    runtimeLoads: () => runtimeLoads,
    run(readModel, { fail = false } = {}) {
      return runInactiveLegacyWebReadScope({
        readModel,
        runInReadScope: (callback, metadata) => readScope.run(callback, metadata),
        resolveComposition: async () => {
          await readScope.readRuntime();
          return Object.freeze({ repositories });
        },
        callback: async ({ context }) => repositories.runInReadScope(async () => {
          const runtime = await readScope.readRuntime();
          if (fail) throw new Error("page failed");
          return Object.freeze({ marker: runtime.marker, userId: context.principal.userId });
        }, { readModel: `${readModel}.nested` }),
      });
    },
  });
}

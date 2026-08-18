import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const VALID_SECRET = "x".repeat(32);

let originalEnv;
beforeEach(() => {
  originalEnv = { ...process.env };
  vi.resetModules();
});
afterEach(() => {
  process.env = originalEnv;
  vi.doUnmock("../../application/composition/productionApplicationComposition.js");
});

describe("getProviderProductReadiness — access gate readiness", () => {
  it("reports not-ready with ACCESS_GATE_NOT_CONFIGURED and never touches the composition/DB/Spaces when the gate secret is missing", async () => {
    process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME = "1";
    delete process.env.PHYSIQUEOS_ACCESS_GATE_SECRET;
    const getComposition = vi.fn();
    vi.doMock("../../application/composition/productionApplicationComposition.js", () => ({ getProductionApplicationComposition: getComposition }));
    const { getProviderProductReadiness } = await import("./ProviderProductReadiness.js");

    const readiness = await getProviderProductReadiness();

    expect(readiness.status).toBe("not-ready");
    expect(readiness.code).toBe("ACCESS_GATE_NOT_CONFIGURED");
    expect(readiness.accessGateReady).toBe(false);
    expect(getComposition).not.toHaveBeenCalled();
  });

  it("proceeds to the normal dependency checks once the gate secret is configured", async () => {
    process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME = "1";
    process.env.PHYSIQUEOS_ACCESS_GATE_SECRET = VALID_SECRET;
    const getComposition = vi.fn().mockResolvedValue({
      ownerUserId: "owner-1",
      repositories: { users: { getCurrentUser: vi.fn().mockResolvedValue({ id: "owner-1" }) } },
      objectProvider: { healthCheck: vi.fn().mockResolvedValue({ reachable: true }) },
      authorityStore: { read: vi.fn().mockResolvedValue({ state: { authority: "provider-prepared", readsEnabled: true } }) },
    });
    vi.doMock("../../application/composition/productionApplicationComposition.js", () => ({ getProductionApplicationComposition: getComposition }));
    const { getProviderProductReadiness } = await import("./ProviderProductReadiness.js");

    const readiness = await getProviderProductReadiness();

    expect(getComposition).toHaveBeenCalledTimes(1);
    expect(readiness.accessGateReady).toBe(true);
    expect(readiness.status).toBe("ready");
  });

  it("reports accessGateReady=true (not applicable) as part of a ready result once fully configured", async () => {
    process.env.PHYSIQUEOS_PROVIDER_FULL_RUNTIME = "1";
    process.env.PHYSIQUEOS_ACCESS_GATE_SECRET = VALID_SECRET;
    const getComposition = vi.fn().mockResolvedValue({
      ownerUserId: "owner-1",
      repositories: { users: { getCurrentUser: vi.fn().mockResolvedValue({ id: "owner-1" }) } },
      objectProvider: { healthCheck: vi.fn().mockResolvedValue({ reachable: true }) },
      authorityStore: { read: vi.fn().mockResolvedValue({ state: { authority: "provider-authoritative", readsEnabled: true } }) },
    });
    vi.doMock("../../application/composition/productionApplicationComposition.js", () => ({ getProductionApplicationComposition: getComposition }));
    const { getProviderProductReadiness } = await import("./ProviderProductReadiness.js");

    const readiness = await getProviderProductReadiness();
    expect(readiness).toMatchObject({ status: "ready", accessGateReady: true });
  });
});

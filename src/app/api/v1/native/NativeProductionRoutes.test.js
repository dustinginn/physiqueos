import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  command: vi.fn(), manifest: vi.fn(), profile: vi.fn(), read: vi.fn(), media: vi.fn(),
}));

vi.mock("../../../../platform/auth/nativeProductionContractRuntime.js", () => ({
  getProductionNativeContractRuntime: vi.fn(async () => mocks),
}));

import { POST as command } from "./commands/route.js";
import { GET as contracts } from "./contracts/route.js";
import { GET as profile } from "./profile/route.js";
import { GET as read } from "./read/[resource]/route.js";

describe("Native production API routes", () => {
  beforeEach(() => Object.values(mocks).forEach((mock) => mock.mockReset()));

  it("routes authenticated profile and contract discovery through one authority boundary", async () => {
    mocks.profile.mockResolvedValue({ resource: "profile" });
    mocks.manifest.mockResolvedValue({ contractVersion: "1" });
    expect((await profile(request("/profile"))).status).toBe(200);
    expect((await contracts(request("/contracts"))).status).toBe(200);
  });

  it("passes only bounded query inputs to the allowlisted resource dispatcher", async () => {
    mocks.read.mockResolvedValue({ resource: "nutrition", data: {} });
    const response = await read(request("/read/nutrition?context=all&limit=25"), { params: Promise.resolve({ resource: "nutrition" }) });
    expect(response.status).toBe(200);
    expect(mocks.read).toHaveBeenCalledWith(expect.objectContaining({ resource: "nutrition", input: { context: "all", limit: "25" } }));
  });

  it("maps Idempotency-Key and If-Match into canonical command metadata", async () => {
    mocks.command.mockResolvedValue({ outcome: "committed" });
    const response = await command(request("/commands", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "native-command-20260909", "if-match": '"7"' },
      body: JSON.stringify({ commandType: "priority.complete.v1", payload: { priorityId: "priority-1", occurrenceDate: "2026-09-09" } }),
    }));
    expect(response.status).toBe(200);
    expect(mocks.command).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ idempotencyKey: "native-command-20260909", expectedVersion: "7" }) }));
  });
});

function request(path, init = {}) {
  return new Request(`https://physiqueos.example/api/v1/native${path}`, { ...init, headers: { authorization: `Bearer ${"x".repeat(43)}`, ...(init.headers ?? {}) } });
}

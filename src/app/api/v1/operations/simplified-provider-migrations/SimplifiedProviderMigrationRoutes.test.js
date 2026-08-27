import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock("../../../../../platform/cutover/simplified/SimplifiedProviderMigrationProductComposition.js", async (importOriginal) => ({
  ...await importOriginal(),
  getSimplifiedProviderMigrationProductController: () => ({ submit: mocks.submit }),
}));

import { POST } from "./route.js";

const TOKEN = "o".repeat(64);
const ENDPOINT = "https://provider.invalid/api/v1/operations/simplified-provider-migrations";
const ORIGINAL_OPERATIONS_TOKEN = process.env.PHYSIQUEOS_OPERATIONS_TOKEN;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PHYSIQUEOS_OPERATIONS_TOKEN = TOKEN;
  mocks.submit.mockResolvedValue({ status: 202, body: { commandId: "simplified-preimport-command-0001", state: "queued" } });
});
afterEach(() => {
  if (ORIGINAL_OPERATIONS_TOKEN === undefined) delete process.env.PHYSIQUEOS_OPERATIONS_TOKEN;
  else process.env.PHYSIQUEOS_OPERATIONS_TOKEN = ORIGINAL_OPERATIONS_TOKEN;
});

describe("simplified provider migration route authentication", () => {
  it.each([
    ["missing", null],
    ["wrong", `Bearer ${"x".repeat(64)}`],
    ["malformed", TOKEN],
  ])("rejects a %s operations bearer before enqueue", async (_label, authorization) => {
    const response = await POST(request(authorization));
    expect(response.status).toBe(401);
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("does not let a Founder browser session substitute for the operations bearer", async () => {
    const response = await POST(request(null, { cookie: "physiqueos_founder_gate=browser-session" }));
    expect(response.status).toBe(401);
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("lets the exact operations bearer reach the command controller", async () => {
    const response = await POST(request(`Bearer ${TOKEN}`));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ commandId: "simplified-preimport-command-0001", state: "queued" });
    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });
});

function request(authorization, extraHeaders = {}) {
  return new Request(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authorization ? { authorization } : {}),
      ...extraHeaders,
    },
    body: JSON.stringify({ contractVersion: "simplified-provider-migration-operation-v1" }),
  });
}

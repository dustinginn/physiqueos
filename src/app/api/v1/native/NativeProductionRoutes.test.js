import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  acceptEvidenceIntake: vi.fn(), command: vi.fn(), evidenceIntakeStatus: vi.fn(),
  manifest: vi.fn(), profile: vi.fn(), read: vi.fn(), media: vi.fn(),
}));

vi.mock("../../../../platform/auth/nativeProductionContractRuntime.js", () => ({
  getProductionNativeContractRuntime: vi.fn(async () => mocks),
}));

import { POST as command } from "./commands/route.js";
import { GET as contracts } from "./contracts/route.js";
import { GET as profile } from "./profile/route.js";
import { GET as read } from "./read/[resource]/route.js";
import { POST as evidenceIntake } from "./evidence/intakes/route.js";
import { GET as evidenceIntakeStatus } from "./evidence/intakes/[intakeId]/route.js";

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

  it("routes asynchronous Native screenshot intake and status without interpreting in-request", async () => {
    mocks.acceptEvidenceIntake.mockResolvedValue({ status: "processing", intakeId: "intake-1" });
    const body = new FormData();
    const submissionIdentity = "01999999-9999-7999-8999-999999999999";
    body.set("submissionIdentity", submissionIdentity);
    body.set("effectiveDate", "2026-09-11");
    body.set("expectedEvidenceType", "activity_day");
    body.append("evidenceFiles", new File([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]),
    ], "activity.png", { type: "image/png" }));
    const accepted = await evidenceIntake(request("/evidence/intakes", {
      method: "POST", headers: { "idempotency-key": submissionIdentity }, body,
    }));
    expect(accepted.status).toBe(202);
    expect(mocks.acceptEvidenceIntake).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.objectContaining({ expectedEvidenceType: "activity_day" }),
    }));
    mocks.evidenceIntakeStatus.mockResolvedValue({ status: "ready", intakeId: "intake-1", reviewId: "review-1" });
    expect((await evidenceIntakeStatus(request("/evidence/intakes/intake-1"), {
      params: Promise.resolve({ intakeId: "intake-1" }),
    })).status).toBe(200);
  });
});

function request(path, init = {}) {
  return new Request(`https://physiqueos.example/api/v1/native${path}`, { ...init, headers: { authorization: `Bearer ${"x".repeat(43)}`, ...(init.headers ?? {}) } });
}

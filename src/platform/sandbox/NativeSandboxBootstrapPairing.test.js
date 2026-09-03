import { describe, expect, it, vi } from "vitest";
import { ApplicationProblem } from "../../contracts/v1/problem.js";
import { createNativeSandboxAuthRuntime } from "../auth/nativeSandboxAuthRuntime.js";

function runtime(overrides = {}) {
  const founderAuthService = {
    issuePairingCredentialWithRecovery: vi.fn(async () => ({
      pairingCredential: "p".repeat(43), expiresAt: "2026-09-01T12:10:00.000Z",
    })),
    registerDeviceWithPairing: vi.fn(),
    authenticateAccessToken: vi.fn(),
    rotateRefreshCredential: vi.fn(),
    revokeSession: vi.fn(),
    ...overrides.founderAuthService,
  };
  const logger = overrides.logger ?? { info: vi.fn() };
  const composition = {
    founderAuthService,
    weightSummaryReadService: { getCurrentWeight: vi.fn() },
    weightCandidateService: {
      submit: vi.fn(), getReview: vi.fn(), confirm: vi.fn(), discard: vi.fn(),
    },
    weightManualService: { submit: vi.fn() },
    authority: { descriptor: {
      authorityId: "native-sandbox-founder-acceptance",
      ownerUserId: "user_native_sandbox_founder_acceptance",
    } },
  };
  return { founderAuthService, logger, subject: createNativeSandboxAuthRuntime({ composition, logger }) };
}

describe("Native sandbox bootstrap pairing boundary", () => {
  it("binds recovery-authorized issuance to the server-owned sandbox owner and never logs credentials", async () => {
    const current = runtime();
    const result = await current.subject.issueBootstrapPairing({
      recoveryCredential: "z".repeat(43), requestId: "request-bootstrap",
    });
    expect(result).toMatchObject({ pairingCredential: "p".repeat(43), expiresAt: expect.any(String) });
    expect(current.founderAuthService.issuePairingCredentialWithRecovery).toHaveBeenCalledWith({
      recoveryCredential: "z".repeat(43),
      expectedUserId: "user_native_sandbox_founder_acceptance",
    });
    expect(JSON.stringify(current.logger.info.mock.calls)).not.toContain("z".repeat(43));
    expect(JSON.stringify(current.logger.info.mock.calls)).not.toContain("p".repeat(43));
  });

  it("preserves invalid recovery failures and emits no success event", async () => {
    const logger = { info: vi.fn() };
    const current = runtime({ logger, founderAuthService: {
      issuePairingCredentialWithRecovery: vi.fn(async () => {
        throw new ApplicationProblem({ status: 401, code: "RECOVERY_CREDENTIAL_INVALID", title: "Unavailable" });
      }),
    } });
    await expect(current.subject.issueBootstrapPairing({ recoveryCredential: "x".repeat(43) }))
      .rejects.toMatchObject({ status: 401, code: "RECOVERY_CREDENTIAL_INVALID" });
    expect(logger.info).not.toHaveBeenCalled();
  });
});

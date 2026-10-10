import { describe, expect, it } from "vitest";
import { buildRecoveryPublicationPayload } from "./buildRecoveryPublicationPayload.mjs";

const SHA = "85a9802587de0ef23ff2021e803258dea825254d";
const CREATE = { cadences: "weekly,monthly", effectiveFrom: "2026-10-18", recoveryEffective: "2026-10-02" };

describe("buildRecoveryPublicationPayload", () => {
  it("bundles a read-only authority preview with its marker and pinned SHA", async () => {
    const { code, marker } = await buildRecoveryPublicationPayload({ operation: "authority", sha: SHA, action: "preview",
      ...CREATE, authorizationReference: "founder-chat-2026-10-17-recovery-v1-activation" });
    expect(marker).toMatch(/^PHYSIQUEOS_RECOVERY_AUTHORITY_PREVIEW_SUCCESS_[0-9a-f]{8}$/);
    expect(code.startsWith(`// PHYSIQUEOS_AUDIT_SUCCESS_MARKER: ${marker}\n`)).toBe(true);
    expect(code).toContain(SHA);
    expect(code).toContain("REPEATABLE READ READ ONLY");
    expect(code).toContain("transaction_read_only");
    expect(code).not.toMatch(/PHYSIQUEOS_DATABASE_URL\s*=/);
  });

  it("bundles a read-only checkpoint/preview payload", async () => {
    const { marker } = await buildRecoveryPublicationPayload({ operation: "preview", sha: SHA, kind: "checkpoint",
      cadence: "weekly", start: "2026-10-18", end: "2026-10-24" });
    expect(marker).toMatch(/^PHYSIQUEOS_RECOVERY_PREVIEW_CHECKPOINT_SUCCESS_/);
  });

  it("refuses to build write payloads without an authorization reference and a preview seal", async () => {
    await expect(buildRecoveryPublicationPayload({ operation: "authority", sha: SHA, action: "apply", ...CREATE }))
      .rejects.toThrow(/authorization-ref/);
    await expect(buildRecoveryPublicationPayload({ operation: "authority", sha: SHA, action: "apply", ...CREATE,
      authorizationReference: "founder-chat-x" })).rejects.toThrow(/expected-seal/);
    await expect(buildRecoveryPublicationPayload({ operation: "authority", sha: SHA, action: "disable",
      authorizationReference: "founder-chat-x", expectedSeal: "seal_bad" })).rejects.toThrow(/expected-seal/);
    await expect(buildRecoveryPublicationPayload({ operation: "authority", sha: SHA, action: "postverify" }))
      .rejects.toThrow(/expected-record-digest/);
  });

  it("refuses malformed SHAs, cadences, dates and kinds", async () => {
    await expect(buildRecoveryPublicationPayload({ operation: "authority", sha: "85a98025", action: "preview", ...CREATE, authorizationReference: "r-ref" }))
      .rejects.toThrow(/--sha/);
    await expect(buildRecoveryPublicationPayload({ operation: "authority", sha: SHA, action: "preview", ...CREATE, cadences: "weekly,midweek", authorizationReference: "r-ref" }))
      .rejects.toThrow(/--cadences/);
    await expect(buildRecoveryPublicationPayload({ operation: "preview", sha: SHA, kind: "checkpoint", cadence: "midweek", start: "2026-10-18", end: "2026-10-24" }))
      .rejects.toThrow(/--cadence/);
    await expect(buildRecoveryPublicationPayload({ operation: "rewrite", sha: SHA })).rejects.toThrow(/--operation/);
  });
});

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assertServerContainsFix,
  buildDexaContinuationRecoveryPayload,
  REQUIRED_SERVER_FIX_MARKERS,
} from "./buildDexaContinuationRecoveryPayload.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SHA = "a".repeat(40);
// The working tree contains the fix; a blob reader over it stands in for git.
const workingTree = (_sha, file) => fs.readFileSync(path.join(root, file), "utf8");
const withoutFix = (_sha, file) => workingTree(_sha, file).replaceAll("createDexaConfirmationBoundedSteps", "x").replaceAll("writeStableSerialization", "x")
  .replaceAll("synchronousStepBudget", "x").replaceAll("executePostgresFounderRecordMutation", "x").replaceAll("mutateCanonicalRecords", "x");
const seal = Object.freeze({
  outcome: "insert_continuation",
  sealDigest: "f".repeat(64),
  sealed: { insert: { id: "22222222-2222-4222-8222-222222222222" }, reviewId: "evidence_review_synthetic" },
});

describe("DEXA continuation recovery payload builder", () => {
  it("accepts only a Server commit that contains the bounded DEXA fix", () => {
    expect(() => assertServerContainsFix(SHA, { readBlob: workingTree })).not.toThrow();
    expect(() => assertServerContainsFix(SHA, { readBlob: withoutFix })).toThrow(/does not contain the bounded DEXA fix/);
    expect(REQUIRED_SERVER_FIX_MARKERS.length).toBeGreaterThanOrEqual(5);
  });

  it("refuses the current production and Build 93 Server commits, which predate the fix", () => {
    for (const commit of ["84cc64e4e7205b2540bf78ea43afd1cbfb068d06", "e03f6768627f49175c476208eca79c99ae3d5ee9"]) {
      expect(() => assertServerContainsFix(commit)).toThrow();
    }
  });

  it.each([
    [{ sha: "short" }, /40-hex/],
    [{ sha: SHA, mode: "execute" }, /preview, apply or postflight/],
    [{ sha: SHA, mode: "apply", seal }, /authorization-ref/],
    [{ sha: SHA, mode: "apply", authorizationReference: "ref" }, /requires --seal/],
    [{ sha: SHA, mode: "postflight" }, /requires --seal/],
    [{ sha: SHA, mode: "apply", authorizationReference: "ref", seal: { ...seal, outcome: "refused" } }, /not an insert_continuation/],
  ])("rejects invalid input %#", async (input, message) => {
    await expect(buildDexaContinuationRecoveryPayload({ readBlob: workingTree, ...input })).rejects.toThrow(message);
  });

  it("bundles a preview payload pinned to the SHA, with no seal", async () => {
    const { code, marker } = await buildDexaContinuationRecoveryPayload({ sha: SHA, mode: "preview", readBlob: workingTree });
    expect(marker).toMatch(/^PHYSIQUEOS_DEXA_CONTINUATION_PREVIEW_SUCCESS_[0-9a-f]{8}$/);
    expect(code).toContain(JSON.stringify(SHA));
    expect(code).toContain("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(code).not.toContain(seal.sealDigest);
  });

  it("bakes the seal and the Founder authorization reference into an apply payload", async () => {
    const { code } = await buildDexaContinuationRecoveryPayload({
      sha: SHA, mode: "apply", seal, authorizationReference: "founder-approval-2026-10-09", readBlob: workingTree,
    });
    expect(code).toContain(seal.sealDigest);
    expect(code).toContain("founder-approval-2026-10-09");
    expect(code).toContain("INSERT INTO physiqueos.outbox_messages");
  });
});

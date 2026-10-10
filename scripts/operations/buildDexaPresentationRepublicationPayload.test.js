import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assertServerMatchesBundle,
  buildDexaPresentationRepublicationPayload,
} from "./buildDexaPresentationRepublicationPayload.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SHA = "a".repeat(40);
// The working tree stands in for git.
const workingTree = (_sha, file) => fs.readFileSync(path.join(root, file), "utf8");
const seal = Object.freeze({
  outcome: "republish",
  sealDigest: "f".repeat(64),
  sealed: { recordId: "dexa_event_synthetic", recordVersion: 1 },
  otherBriefings: { count: 3, digest: "e".repeat(32) },
});

describe("DEXA presentation republication payload builder", () => {
  it("accepts the deployed plain-language Server 5e91aa5d and refuses 539f7006, which predates it", () => {
    expect(() => assertServerMatchesBundle("5e91aa5d11d34e9b717d456a1620cc8303373947")).not.toThrow();
    expect(() => assertServerMatchesBundle("539f7006010989a1c58797b582ac003798cfdd64")).toThrow();
  });

  it("refuses a Server whose composer, write path or authority store differs from the bundle", () => {
    expect(() => assertServerMatchesBundle(SHA, { readBlob: workingTree })).not.toThrow();
    const edited = (file, change) => (_sha, name) => (name === file ? change(workingTree(_sha, name)) : workingTree(_sha, name));
    expect(() => assertServerMatchesBundle(SHA, { readBlob: edited("src/domain/services/DEXAEventPlainLanguage.js", (text) => `${text}\n// drift`) }))
      .toThrow(/differs from the bundled src\/domain\/services\/DEXAEventPlainLanguage.js/);
    expect(() => assertServerMatchesBundle(SHA, { readBlob: edited("src/platform/database/PostgresFounderRepositoryFacade.js", (text) => text.replace("version=$12", "version>=$12")) }))
      .toThrow(/differs from the bundled src\/platform\/database\/PostgresFounderRepositoryFacade.js/);
    expect(() => assertServerMatchesBundle(SHA, { readBlob: edited("src/platform/cutover/PostgresCombinedRuntimeAuthorityStore.js", (text) => `${text} `) }))
      .toThrow(/PostgresCombinedRuntimeAuthorityStore/);
    expect(() => assertServerMatchesBundle(SHA, { readBlob: edited("src/domain/services/BriefingGoalConfidencePresentationService.js", (text) => text.replaceAll("composeDexaEventPlainLanguage", "x")) }))
      .toThrow(/does not publish DEXA Events in plain language/);
  });

  it.each([
    [{ sha: "short" }, /40-hex/],
    [{ sha: SHA, mode: "execute" }, /preview, apply or postflight/],
    [{ sha: SHA, mode: "apply", seal }, /authorization-ref/],
    [{ sha: SHA, mode: "apply", authorizationReference: "ref" }, /requires --seal/],
    [{ sha: SHA, mode: "postflight" }, /requires --seal/],
    [{ sha: SHA, mode: "apply", authorizationReference: "ref", seal: { ...seal, outcome: "refused" } }, /not a republish preview/],
  ])("rejects invalid input %#", async (input, message) => {
    await expect(buildDexaPresentationRepublicationPayload({ readBlob: workingTree, ...input })).rejects.toThrow(message);
  });

  it("bundles a preview payload pinned to the SHA, read-only, with no seal", async () => {
    const { code, marker } = await buildDexaPresentationRepublicationPayload({ sha: SHA, mode: "preview", readBlob: workingTree });
    expect(marker).toMatch(/^PHYSIQUEOS_DEXA_REPUBLICATION_PREVIEW_SUCCESS_[0-9a-f]{8}$/);
    expect(code).toContain(JSON.stringify(SHA));
    expect(code).toContain("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(code).toContain("SHOW transaction_read_only");
    expect(code).not.toContain(seal.sealDigest);
    // The read-only bundle carries no write path at all.
    expect(code).not.toMatch(/\b(INSERT INTO|UPDATE physiqueos|DELETE FROM|pg_advisory_xact_lock|COMMIT)\b/);
    expect(code).not.toContain("executePostgresFounderRecordMutation");
  });

  it("bakes the seal and the Founder authorization reference into an apply payload", async () => {
    const { code } = await buildDexaPresentationRepublicationPayload({
      sha: SHA, mode: "apply", seal, authorizationReference: "founder-approval-2026-10-10", readBlob: workingTree,
    });
    expect(code).toContain(seal.sealDigest);
    expect(code).toContain("founder-approval-2026-10-10");
    expect(code).toContain("AND version=$12");
    expect(code).toContain("pg_advisory_xact_lock");
    expect(code).toContain("claimCanonicalWriteBoundary");
    expect(code).not.toContain("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  });
});

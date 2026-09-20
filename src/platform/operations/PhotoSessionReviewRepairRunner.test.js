import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createInMemoryCanonicalRecordStore } from "../database/Phase4CanonicalRecordStore.js";
import { runPhotoSessionReviewRepair } from "./PhotoSessionReviewRepairRunner.js";
import { BUILD45_PROGRESS_PHOTOS_REVIEW_REPAIR_AUTHORIZATION as AUTHORIZATION } from "./build45ProgressPhotosReviewRepairAuthorization.js";
import { createRealBuild45ExecutionItems, createRealBuild45Goals, createRealBuild45PendingReview } from "../../domain/services/RealBuild45PhotoReviewFixture.js";
import { assertEvidenceCanonicalCommitReady } from "../../domain/services/EvidenceCanonicalCommitReadinessService.js";
import { buildPhotoSessionReviewRepairPayload } from "../../../scripts/operations/buildPhotoSessionReviewRepairPayload.mjs";

const NOW = () => new Date("2026-09-20T15:00:00.000Z");
const otherReview = () => ({ ...createRealBuild45PendingReview(), id: "evidence_review_UNRELATED", status: "pending", version: 3 });
function seeded() {
  return createInMemoryCanonicalRecordStore({
    evidenceReviews: [{ ...createRealBuild45PendingReview() }, otherReview()],
    goals: createRealBuild45Goals(),
    executionItems: createRealBuild45ExecutionItems(),
  });
}

describe("bounded photo review repair runner", () => {
  it("dry-run proves the repair and readiness and writes nothing", async () => {
    const store = seeded();
    const before = store.snapshot();
    const result = await runPhotoSessionReviewRepair({ records: store, authorization: AUTHORIZATION, apply: false, now: NOW });
    expect(result).toMatchObject({ outcome: "dry_run", reviewId: AUTHORIZATION.reviewId, versionBefore: 1, readinessAfterRepair: "passes", statusAfterRepair: "pending" });
    expect(result.changedPaths).toContain("interpretedEvidence.evidence_objects[0].photos[2].contractionState");
    expect(store.getMutationCount()).toBe(0);
    expect(store.snapshot()).toEqual(before);
  });

  it("apply writes only the targeted review under its own version, leaves it pending and confirmable, and advances the runtime revision", async () => {
    const store = seeded();
    const others = store.snapshot();
    const result = await runPhotoSessionReviewRepair({ records: store, authorization: AUTHORIZATION, apply: true, now: NOW });
    expect(result).toMatchObject({ outcome: "applied", versionBefore: 1, versionAfter: 2 });
    expect(store.getMutationCount()).toBe(1);
    const repaired = await store.get({ collection: "evidenceReviews", recordId: AUTHORIZATION.reviewId });
    expect(repaired).toMatchObject({ status: "pending", version: 2, confirmation: null });
    expect(assertEvidenceCanonicalCommitReady(repaired.interpretedEvidence, { itemDecisions: repaired.itemDecisions })).toBe(true);
    const after = store.snapshot();
    expect(after.evidenceReviews.find((item) => item.id === "evidence_review_UNRELATED")).toEqual(others.evidenceReviews.find((item) => item.id === "evidence_review_UNRELATED"));
    expect(after.goals).toEqual(others.goals);
    expect(after.executionItems).toEqual(others.executionItems);
    expect((await store.getRuntimeMetadata({})).revision).toBe(2);
  });

  it("is idempotent: a second apply reports already_applied and writes nothing", async () => {
    const store = seeded();
    await runPhotoSessionReviewRepair({ records: store, authorization: AUTHORIZATION, apply: true, now: NOW });
    const again = await runPhotoSessionReviewRepair({ records: store, authorization: AUTHORIZATION, apply: true, now: NOW });
    expect(again).toMatchObject({ outcome: "already_applied", version: 2 });
    expect(store.getMutationCount()).toBe(1);
  });

  it("refuses to overwrite a review that changed after it was inspected", async () => {
    const store = seeded();
    const stale = { ...store, get: async (input) => ({ ...(await store.get(input)), version: 1 }) };
    await store.put({ collection: "evidenceReviews", recordId: AUTHORIZATION.reviewId, payload: { ...(await store.get({ collection: "evidenceReviews", recordId: AUTHORIZATION.reviewId })), note: "changed" }, expectedVersion: 1 });
    await expect(runPhotoSessionReviewRepair({ records: stale, authorization: AUTHORIZATION, apply: true, now: NOW })).rejects.toMatchObject({ code: "EXPECTED_VERSION_CONFLICT" });
    expect((await store.get({ collection: "evidenceReviews", recordId: AUTHORIZATION.reviewId })).version).toBe(2);
  });

  it("does nothing for a review it was not authorized for", async () => {
    const store = seeded();
    await expect(runPhotoSessionReviewRepair({ records: store, authorization: { ...AUTHORIZATION, reviewId: "evidence_review_UNRELATED" }, apply: true, now: NOW })).rejects.toMatchObject({ code: "REPAIR_VERSION_MISMATCH" });
    const empty = createInMemoryCanonicalRecordStore({ evidenceReviews: [], goals: [], executionItems: [] });
    await expect(runPhotoSessionReviewRepair({ records: empty, authorization: AUTHORIZATION, apply: true, now: NOW })).rejects.toMatchObject({ code: "REPAIR_REVIEW_MISMATCH" });
    expect(store.getMutationCount()).toBe(0);
    expect(empty.getMutationCount()).toBe(0);
  });
});

describe("repair payload builder", () => {
  const SHA = "451801c35f2440548a27bbfd9b6dced3b6d5af78";
  it("bundles a single self-contained file bound to the authorized production commit", async () => {
    const { code, marker } = await buildPhotoSessionReviewRepairPayload({ sha: SHA, mode: "dry-run" });
    expect(marker).toMatch(/^PHYSIQUEOS_PHOTO_REVIEW_REPAIR_DRYRUN_SUCCESS_[0-9a-f]{8}$/);
    expect(code).toContain(SHA);
    expect(code).toContain("evidence_review_B5A63452E7B0469CA63438A08137716C");
    expect(code).toContain("READ ONLY");
    expect([...code.matchAll(/^import .* from "([^"]+)"/gm)].map((match) => match[1])).toEqual(["node:module"]);
    const file = path.join(os.tmpdir(), `repair-payload-${process.pid}.mjs`);
    fs.writeFileSync(file, code);
    try { await import("node:child_process").then(({ execFileSync }) => execFileSync(process.execPath, ["--check", file])); } finally { fs.rmSync(file, { force: true }); }
  });

  it("refuses apply without an explicit authorization reference and refuses an unbound commit", async () => {
    await expect(buildPhotoSessionReviewRepairPayload({ sha: SHA, mode: "apply" })).rejects.toThrow(/authorization-ref/);
    await expect(buildPhotoSessionReviewRepairPayload({ sha: "abc", mode: "dry-run" })).rejects.toThrow(/40-hex/);
    const { code } = await buildPhotoSessionReviewRepairPayload({ sha: SHA, mode: "apply", authorizationReference: "founder-authorized-2026-09-20" });
    expect(code).toContain("founder-authorized-2026-09-20");
  });
});

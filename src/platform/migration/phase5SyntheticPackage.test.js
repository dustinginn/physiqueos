import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FOUNDATION_SOURCE_COLLECTIONS } from "./foundationSourceCollections.js";
import { readAndValidateCanonicalPackage } from "./phase4CanonicalExport.js";
import { createPhase5SyntheticRuntime, writePhase5SyntheticPackage } from "./phase5SyntheticPackage.js";

const roots = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))));

describe("Phase 5 representative synthetic package", () => {
  it("covers all 39 persisted canonical collections with relationships, versions, and Native Baseline evidence", () => {
    const runtime = createPhase5SyntheticRuntime();
    expect(FOUNDATION_SOURCE_COLLECTIONS).toHaveLength(39);
    for (const collection of FOUNDATION_SOURCE_COLLECTIONS) {
      expect(runtime[collection]).not.toBeNull();
      if (Array.isArray(runtime[collection])) expect(runtime[collection].length).toBeGreaterThan(0);
    }
    expect(runtime.goals.some((item) => item.status === "completed")).toBe(true);
    expect(runtime.canonicalEvidenceObjects.map((item) => item.payload.evidence_type)).toEqual(expect.arrayContaining(["nutrition", "activity", "training", "photo", "dexa"]));
    expect(runtime.executionItems[0]).toMatchObject({ occurrenceDate: "2026-08-11", completionAuthority: "manual" });
  });

  it("exports a deterministic, secret-free package with only synthetic media", async () => {
    const firstRoot = await fs.mkdtemp(path.join(os.tmpdir(), "physiqueos-phase5-a-")); roots.push(firstRoot);
    const secondRoot = await fs.mkdtemp(path.join(os.tmpdir(), "physiqueos-phase5-b-")); roots.push(secondRoot);
    const first = await writePhase5SyntheticPackage({ outputRoot: firstRoot, repositoryRevision: "622ba8d" });
    const second = await writePhase5SyntheticPackage({ outputRoot: secondRoot, repositoryRevision: "622ba8d" });
    expect(first.manifest.semanticDigest).toBe(second.manifest.semanticDigest);
    expect(first.manifest.criticalValues.canonicalStateDigest).toBe(second.manifest.criticalValues.canonicalStateDigest);
    expect(first.manifest.collections).toHaveLength(39);
    expect(first.manifest.files).toHaveLength(3);
    expect(first.manifest.files.every((item) => item.ownerUserId === "phase5-synthetic-user")).toBe(true);
    const validated = await readAndValidateCanonicalPackage(first.packageRoot);
    const serialized = JSON.stringify(validated);
    expect(serialized).not.toMatch(/password|credential|access.?key|private.?key|connection.?string/i);
  });
});

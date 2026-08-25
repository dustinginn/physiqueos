import { describe, expect, it } from "vitest";
import { createPayloadHash } from "../../contracts/v1/canonicalJson.js";
import { FOUNDATION_SOURCE_COLLECTIONS } from "./foundationSourceCollections.js";
import { canonicalMediaCandidate } from "./canonicalReferenceProjection.js";
import {
  comparePhase7BWorkPackage2ReferenceIndexes,
  createPhase7BWorkPackage2ReferenceIndex,
  validatePhase7BWorkPackage2ReferenceIndex,
} from "./phase7bWorkPackage2ReferenceIndex.js";

const HASH = "a".repeat(64);
function runtime(overrides = {}) {
  return {
    version: "1", revision: 142, updatedAt: "2026-08-23T07:00:02.738Z",
    ...Object.fromEntries(FOUNDATION_SOURCE_COLLECTIONS.map((name) => [name, []])),
    user: { id: "founder", createdAt: "2024-01-01T00:00:00Z", name: "Founder" },
    ...overrides,
  };
}
function create(overrides = {}) {
  return createPhase7BWorkPackage2ReferenceIndex({
    runtime: runtime(), runtimeSha256: HASH, observedAt: "2026-08-23T17:55:22.651Z",
    applicationCommit: "3".repeat(40), schemaIdentity: { version: "000010", migrationCount: 10, sha256: "b".repeat(64) },
    controlStateSha256: "c".repeat(64), mediaFiles: [], ...overrides,
  });
}

describe("Phase 7B WP2 reference index", () => {
  it("distinguishes file-shaped canonical IDs and historical labels from required local media", () => {
    expect(canonicalMediaCandidate("training|authoritative|IMG_1919.png", "id")).toBeNull();
    expect(canonicalMediaCandidate("nutrition2026-07-25_breakfast_0_IMG_1641.jpeg", "evidenceIds")).toBeNull();
    expect(canonicalMediaCandidate("IMG_1919.png", "sourceFileId")).toEqual({
      normalized: "img_1919.png", basename: "img_1919.png", mustExist: false,
    });
    expect(canonicalMediaCandidate("private/founder/photos/required-photo.jpg", "mediaPath")).toEqual({
      normalized: "private/founder/photos/required-photo.jpg", basename: "required-photo.jpg", mustExist: true,
    });
    expect(canonicalMediaCandidate("https://example.test/private.jpg", "mediaPath")).toBeNull();
  });

  it("indexes all 39 collections including singleton, zero, one, and many records", () => {
    const index = create({ runtime: runtime({ goals: [{ id: "g1" }, { id: "g2" }], reminders: [{ id: "r1" }] }) });
    expect(index.collectionCount).toBe(39);
    expect(index.collections.find((entry) => entry.name === "user").count).toBe(1);
    expect(index.collections.find((entry) => entry.name === "goals").count).toBe(2);
    expect(index.collections.find((entry) => entry.name === "dexaScans").count).toBe(0);
  });

  it("fails closed for missing and unknown collections", () => {
    const missing = runtime(); delete missing.goals;
    expect(() => create({ runtime: missing })).toThrow(/MISSING_COLLECTION/);
    expect(() => create({ runtime: runtime({ surprise: [] }) })).toThrow(/UNKNOWN_COLLECTION/);
  });

  it("projects stable identities, timestamps, safe hints, relationships, and media metadata", () => {
    const index = create({
      runtime: runtime({ goals: [{ id: "g1", createdAt: "2026-08-16T12:00:00Z", title: "Goal" }], reminders: [{ id: "r1", goalId: "g1" }] }),
      mediaFiles: [{ relativePath: "media/photo.jpg", size: 3, sha256: "d".repeat(64), lastWriteTimeUtc: "2026-08-16T12:00:00Z", mimeType: "image/jpeg", relationshipIds: ["goals:g1"] }],
    });
    const goal = index.collections.find((entry) => entry.name === "goals").records[0];
    expect(goal).toMatchObject({ logicalId: "goals:g1", stableIdentity: true, reconstructionHints: { title: "Goal" } });
    expect(goal.timestamps.createdAt).toBe("2026-08-16T12:00:00Z");
    expect(index.relationships.some((entry) => entry.type === "references:goalId")).toBe(true);
    expect(index.media[0]).toMatchObject({ mimeType: "image/jpeg", size: 3, relationshipIds: ["goals:g1"] });
  });

  it("rejects missing media, duplicate paths, and invalid media hashes", () => {
    expect(() => create({ missingReferencedMedia: ["x.jpg"] })).toThrow(/MISSING_REFERENCED_MEDIA/);
    const media = { relativePath: "media/x.jpg", size: 1, sha256: "d".repeat(64), relationshipIds: [] };
    expect(() => create({ mediaFiles: [media, { ...media, relativePath: "MEDIA/X.JPG" }] })).toThrow(/DUPLICATE_MEDIA_PATH/);
    expect(() => create({ mediaFiles: [{ ...media, sha256: "bad" }] })).toThrow(/HASH_INVALID/);
  });

  it("records cutoff policy without filtering post-cutoff records or inventing provenance", () => {
    const index = create({ runtime: runtime({ dailyBriefings: [{ id: "after", createdAt: "2026-08-23T07:00:00Z" }] }) });
    expect(index.collections.find((entry) => entry.name === "dailyBriefings").count).toBe(1);
    expect(index.founderCutoffPolicy).toMatchObject({ founderMeaningfulDataThrough: "2026-08-16", founderDowntimeBegan: "2026-08-17", destructiveFilteringPerformed: false, provenanceInferred: false });
  });

  it("is deterministic and validates its semantic digest", () => {
    const first = create(); const second = create();
    expect(first.referenceIndexSha256).toBe(second.referenceIndexSha256);
    expect(validatePhase7BWorkPackage2ReferenceIndex(first)).toBe(first);
    expect(() => validatePhase7BWorkPackage2ReferenceIndex({ ...first, recordCount: 999 })).toThrow(/DIGEST_MISMATCH/);
  });

  it("does not project secret fields or plaintext record content", () => {
    const index = create({ runtime: runtime({ goals: [{ id: "g1", password: "not-for-a-report", notes: "private narrative" }] }) });
    const serialized = JSON.stringify(index);
    expect(serialized).not.toContain("not-for-a-report");
    expect(serialized).not.toContain("private narrative");
    expect(serialized).not.toContain('"password"');
  });

  it("compares missing, additional, changed records, media, and relationships with a safe count-only summary", () => {
    const expected = create({
      runtime: runtime({ goals: [{ id: "same", title: "A" }, { id: "missing" }], reminders: [{ id: "r1", goalId: "same" }] }),
      mediaFiles: [{ relativePath: "media/same.jpg", size: 1, sha256: "d".repeat(64), relationshipIds: [] }, { relativePath: "media/missing.jpg", size: 1, sha256: "e".repeat(64), relationshipIds: [] }],
    });
    const actual = create({
      runtime: runtime({ goals: [{ id: "same", title: "B" }, { id: "added" }] }),
      mediaFiles: [{ relativePath: "media/same.jpg", size: 1, sha256: "f".repeat(64), relationshipIds: [] }, { relativePath: "media/added.jpg", size: 1, sha256: "1".repeat(64), relationshipIds: [] }],
    });
    const result = comparePhase7BWorkPackage2ReferenceIndexes(expected, actual);
    expect(result.pass).toBe(false);
    expect(result.records).toMatchObject({ missing: ["goals:missing", "reminders:r1"], additional: ["goals:added"], changed: ["goals:same"] });
    expect(result.media).toMatchObject({ missing: ["media/missing.jpg"], additional: ["media/added.jpg"], changed: ["media/same.jpg"] });
    expect(result.safeSummary.missingRelationshipCount).toBeGreaterThan(0);
    expect(JSON.stringify(result.safeSummary)).not.toContain("goals:");
  });

  it("detects semantically equal references despite object insertion order", () => {
    const first = create();
    const reordered = JSON.parse(JSON.stringify(first));
    expect(createPayloadHash(reordered)).toBe(createPayloadHash(first));
  });
});

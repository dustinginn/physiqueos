import { describe, expect, it } from "vitest";
import {
  STAGED_ARTIFACT_ABSOLUTE_MAXIMUM_BYTES,
  STAGED_DERIVATIVE_MAXIMUM_BYTES,
  STAGED_EVIDENCE_MANIFEST_VERSION,
  STAGED_MAXIMUM_ORIGINALS,
  STAGED_ORIGINAL_MAXIMUM_BYTES,
  STAGED_RAW_ORIGINAL_MAXIMUM_BYTES,
  createStagedEvidenceArtifactManifest,
  findStagedManifestEntry,
  stagedArtifactId,
  stagedArtifactMaximumBytes,
  stagedArtifactProgress,
  stagedManifestIsSatisfied,
  stagedOriginalMaximumBytes,
} from "./StagedEvidenceArtifactManifest.js";

const ID = "01999999-9999-7999-8999-999999999999";
const SHA = (n) => n.toString(16).padStart(64, "0");

function original(ordinal, overrides = {}) {
  return { artifactId: stagedArtifactId(ID, ordinal), ordinal, role: "original", fileName: `photo-${ordinal}.jpg`, mimeType: "image/jpeg", byteLength: 1_000 + ordinal, sha256: SHA(ordinal), ...overrides };
}
function heic(ordinal, overrides = {}) {
  return original(ordinal, { fileName: `photo-${ordinal}.heic`, mimeType: "image/heic", ...overrides });
}
function derivative(ordinal, ofOrdinal, overrides = {}) {
  return { artifactId: stagedArtifactId(ID, ordinal), ordinal, role: "analysis_derivative", derivativeOf: stagedArtifactId(ID, ofOrdinal), fileName: `photo-${ofOrdinal}-analysis.jpg`, mimeType: "image/jpeg", byteLength: 500 + ordinal, sha256: SHA(100 + ordinal), ...overrides };
}
const build = (artifacts) => createStagedEvidenceArtifactManifest({ submissionIdentity: ID, artifacts });
const rejects = (artifacts, code) => expect(() => build(artifacts)).toThrowError(expect.objectContaining({ code, status: 400 }));

describe("staged evidence artifact manifest", () => {
  it("accepts a mixed set of JPEG originals and HEIC originals with their derivatives", () => {
    const manifest = build([original(1), heic(2), derivative(3, 2), original(4, { mimeType: "image/png", fileName: "p.png" })]);
    expect(manifest.version).toBe(STAGED_EVIDENCE_MANIFEST_VERSION);
    expect(manifest.selectedFileCount).toBe(4);
    expect(manifest.originalCount).toBe(3);
    expect(manifest.files.map((file) => [file.ordinal, file.role, file.derivativeOf])).toEqual([
      [1, "original", null], [2, "original", null], [3, "analysis_derivative", stagedArtifactId(ID, 2)], [4, "original", null],
    ]);
    expect(Object.isFrozen(manifest.files[0])).toBe(true);
  });

  it("derives artifact identity from the submission identity and rejects client-minted keys", () => {
    expect(stagedArtifactId(ID, 3)).toBe("artifact_01999999999979998999999999999999_3");
    rejects([original(1, { artifactId: "artifact_custom_1" })], "STAGED_ARTIFACT_IDENTITY_INVALID");
    rejects([original(1, { artifactId: stagedArtifactId("02999999-9999-7999-8999-999999999999", 1) })], "STAGED_ARTIFACT_IDENTITY_INVALID");
    rejects([{ ...original(1), ordinal: 2 }], "STAGED_ARTIFACT_INVALID");
    rejects([original(1), { ...original(3), artifactId: stagedArtifactId(ID, 3) }], "STAGED_ARTIFACT_INVALID");
  });

  it("requires a derivative for every HEIC/HEIF original and forbids one elsewhere", () => {
    rejects([heic(1)], "STAGED_DERIVATIVE_REQUIRED");
    rejects([original(1, { mimeType: "image/heif", fileName: "p.heif" })], "STAGED_DERIVATIVE_REQUIRED");
    rejects([original(1), derivative(2, 1)], "STAGED_DERIVATIVE_UNEXPECTED");
    rejects([heic(1), derivative(2, 1), derivative(3, 1)], "STAGED_DERIVATIVE_DUPLICATE");
    rejects([heic(1), derivative(2, 9)], "STAGED_DERIVATIVE_TARGET_INVALID");
    rejects([heic(1), derivative(2, 1, { derivativeOf: null })], "STAGED_DERIVATIVE_TARGET_INVALID");
    rejects([heic(1), derivative(2, 1, { mimeType: "image/png" })], "STAGED_ARTIFACT_MEDIA_UNSUPPORTED");
    rejects([derivative(1, 1)], "STAGED_ARTIFACTS_REQUIRED");
  });

  it("bounds every artifact by role and rejects unsupported or malformed declarations", () => {
    expect(STAGED_ORIGINAL_MAXIMUM_BYTES).toBe(32 * 1024 * 1024);
    expect(STAGED_DERIVATIVE_MAXIMUM_BYTES).toBe(8 * 1024 * 1024);
    expect(build([original(1, { byteLength: STAGED_ORIGINAL_MAXIMUM_BYTES })]).files[0].size).toBe(STAGED_ORIGINAL_MAXIMUM_BYTES);
    rejects([original(1, { byteLength: STAGED_ORIGINAL_MAXIMUM_BYTES + 1 })], "STAGED_ARTIFACT_TOO_LARGE");
    rejects([heic(1), derivative(2, 1, { byteLength: STAGED_DERIVATIVE_MAXIMUM_BYTES + 1 })], "STAGED_ARTIFACT_TOO_LARGE");
    rejects([original(1, { byteLength: 0 })], "STAGED_ARTIFACT_INVALID");
    rejects([original(1, { mimeType: "image/gif" })], "STAGED_ARTIFACT_MEDIA_UNSUPPORTED");
    rejects([original(1, { mimeType: "application/pdf" })], "STAGED_ARTIFACT_MEDIA_UNSUPPORTED");
    rejects([original(1, { sha256: "abc" })], "STAGED_ARTIFACT_INVALID");
    rejects([original(1, { fileName: "" })], "STAGED_ARTIFACT_INVALID");
    rejects([original(1, { role: "thumbnail" })], "STAGED_ARTIFACT_INVALID");
    rejects([original(1, { derivativeOf: stagedArtifactId(ID, 1) })], "STAGED_ARTIFACT_INVALID");
    rejects([], "STAGED_ARTIFACTS_REQUIRED");
    rejects(undefined, "STAGED_ARTIFACTS_REQUIRED");
    rejects([original(1), original(2, { sha256: SHA(1) })], "STAGED_ARTIFACT_DUPLICATE_CONTENT");
    rejects(Array.from({ length: STAGED_MAXIMUM_ORIGINALS + 1 }, (_, index) => original(index + 1)), "STAGED_ARTIFACTS_TOO_MANY");
    expect(build(Array.from({ length: STAGED_MAXIMUM_ORIGINALS }, (_, index) => original(index + 1))).originalCount).toBe(STAGED_MAXIMUM_ORIGINALS);
  });

  it("normalizes file names to their basename and types to lower case", () => {
    const manifest = build([original(1, { fileName: "C:\\\\Photos\\\\IMG_0001.JPG", mimeType: "IMAGE/JPEG" })]);
    expect(manifest.files[0]).toMatchObject({ name: "IMG_0001.JPG", type: "image/jpeg" });
    expect(stagedArtifactMaximumBytes(manifest.files[0])).toBe(STAGED_ORIGINAL_MAXIMUM_BYTES);
    expect(stagedArtifactMaximumBytes({ role: "analysis_derivative" })).toBe(STAGED_DERIVATIVE_MAXIMUM_BYTES);
    expect(findStagedManifestEntry(manifest, stagedArtifactId(ID, 1))?.ordinal).toBe(1);
    expect(findStagedManifestEntry(manifest, stagedArtifactId(ID, 2))).toBeNull();
    expect(findStagedManifestEntry({ version: "evidence-upload-manifest-v1", files: [] }, "x")).toBeNull();
  });

  it("is satisfied only by a complete, exactly matching stored set", () => {
    const manifest = build([heic(1), derivative(2, 1)]);
    const stored = (file, overrides = {}) => ({ id: file.artifactId, ordinal: file.ordinal, fileName: file.name, byteLength: file.size, mimeType: file.type, sha256: file.sha256, ...overrides });
    const [first, second] = manifest.files;
    expect(stagedManifestIsSatisfied(manifest, [])).toBe(false);
    expect(stagedManifestIsSatisfied(manifest, [stored(first)])).toBe(false);
    expect(stagedManifestIsSatisfied(manifest, [stored(first), stored(second)])).toBe(true);
    expect(stagedManifestIsSatisfied(manifest, [stored(first), stored(second, { sha256: SHA(999) })])).toBe(false);
    expect(stagedManifestIsSatisfied(manifest, [stored(first), stored(second, { byteLength: 1 })])).toBe(false);
    expect(stagedManifestIsSatisfied(manifest, [stored(first), stored(second, { mimeType: "image/png" })])).toBe(false);
    expect(stagedManifestIsSatisfied(manifest, [stored(first), stored(second, { fileName: "other.jpg" })])).toBe(false);
    expect(stagedManifestIsSatisfied({ version: "evidence-upload-manifest-v1", files: [] }, [])).toBe(false);
    expect(stagedArtifactProgress(manifest, [stored(first)])).toEqual([
      { artifactId: first.artifactId, ordinal: 1, role: "original", derivativeOf: null, state: "stored" },
      { artifactId: second.artifactId, ordinal: 2, role: "analysis_derivative", derivativeOf: first.artifactId, state: "expected" },
    ]);
  });

  it("treats an Apple ProRAW DNG original like any non-consumable container: raw ceiling, one derivative required and linked", () => {
    const dng = (ordinal, overrides = {}) => original(ordinal, { fileName: `photo-${ordinal}.dng`, mimeType: "image/x-adobe-dng", ...overrides });
    const manifest = build([dng(1), heic(2), original(3), derivative(4, 1), derivative(5, 2)]);
    expect(manifest.originalCount).toBe(3);
    expect(manifest.files[3].derivativeOf).toBe(stagedArtifactId(ID, 1));
    expect(stagedArtifactMaximumBytes(manifest.files[0])).toBe(STAGED_RAW_ORIGINAL_MAXIMUM_BYTES);
    expect(stagedArtifactMaximumBytes(manifest.files[1])).toBe(STAGED_ORIGINAL_MAXIMUM_BYTES);
    expect(stagedArtifactMaximumBytes(manifest.files[2])).toBe(STAGED_ORIGINAL_MAXIMUM_BYTES);
    expect(stagedArtifactMaximumBytes(manifest.files[3])).toBe(STAGED_DERIVATIVE_MAXIMUM_BYTES);
    expect(stagedOriginalMaximumBytes("image/x-adobe-dng")).toBe(48 * 1024 * 1024);
    expect(stagedOriginalMaximumBytes("image/heic")).toBe(32 * 1024 * 1024);
    expect(STAGED_ARTIFACT_ABSOLUTE_MAXIMUM_BYTES).toBe(STAGED_RAW_ORIGINAL_MAXIMUM_BYTES);
    // At the raw ceiling is accepted; one byte over is not; a compressed original never inherits the raw ceiling.
    build([dng(1, { byteLength: STAGED_RAW_ORIGINAL_MAXIMUM_BYTES }), derivative(2, 1)]);
    rejects([dng(1, { byteLength: STAGED_RAW_ORIGINAL_MAXIMUM_BYTES + 1 }), derivative(2, 1)], "STAGED_ARTIFACT_TOO_LARGE");
    rejects([heic(1, { byteLength: STAGED_ORIGINAL_MAXIMUM_BYTES + 1 }), derivative(2, 1)], "STAGED_ARTIFACT_TOO_LARGE");
    rejects([original(1, { byteLength: STAGED_RAW_ORIGINAL_MAXIMUM_BYTES })], "STAGED_ARTIFACT_TOO_LARGE");
    // Derivative rules follow consumability, not format: required for DNG, forbidden for JPEG, at most one.
    rejects([dng(1)], "STAGED_DERIVATIVE_REQUIRED");
    rejects([original(1), derivative(2, 1)], "STAGED_DERIVATIVE_UNEXPECTED");
    rejects([dng(1), derivative(2, 1), derivative(3, 1)], "STAGED_DERIVATIVE_DUPLICATE");
    // The derivative itself must be JPEG; plain TIFF is not an accepted original.
    rejects([dng(1), derivative(2, 1, { mimeType: "image/x-adobe-dng" })], "STAGED_ARTIFACT_MEDIA_UNSUPPORTED");
    rejects([original(1, { mimeType: "image/tiff" })], "STAGED_ARTIFACT_MEDIA_UNSUPPORTED");
  });

  // Build 45 physical failure: Foundation's `UUID().uuidString` is uppercase,
  // Native declares lowercase ids, and the Server compared them against a
  // case-preserving derivation. The identity has one canonical form.
  it("canonicalizes the identity to lowercase hex for any UUID case, and accepts no other spelling", () => {
    const FOUNDATION_ID = "B5A63452-E7B0-469C-A634-38A08137716C";
    const lower = "artifact_b5a63452e7b0469ca63438a08137716c_";
    // Pinned literals, never derived through stagedArtifactId.
    expect(stagedArtifactId(FOUNDATION_ID, 1)).toBe(`${lower}1`);
    expect(stagedArtifactId(FOUNDATION_ID, 6)).toBe(`${lower}6`);
    expect(stagedArtifactId(FOUNDATION_ID, 10)).toBe(`${lower}10`);
    expect(stagedArtifactId(FOUNDATION_ID.toLowerCase(), 1)).toBe(`${lower}1`);
    expect(stagedArtifactId("b5a63452-e7b0-469c-a634-38a08137716c", 7)).toBe(`${lower}7`);
    expect(stagedArtifactId(ID, 3)).toBe("artifact_01999999999979998999999999999999_3");

    // The exact Build 45 shape: five DNG originals, five JPEG derivatives, lowercase ids under the uppercase identity.
    const dngOriginal = (n) => ({ artifactId: `${lower}${n}`, ordinal: n, role: "original", derivativeOf: null, fileName: `progress-photo-${n}.dng`, mimeType: "image/x-adobe-dng", byteLength: 40_000_000 + n, sha256: SHA(n) });
    const jpegDerivative = (n, of) => ({ artifactId: `${lower}${n}`, ordinal: n, role: "analysis_derivative", derivativeOf: `${lower}${of}`, fileName: `progress-photo-${of}-analysis.jpg`, mimeType: "image/jpeg", byteLength: 600_000 + n, sha256: SHA(100 + n) });
    const set = [1, 2, 3, 4, 5].map(dngOriginal).concat([6, 7, 8, 9, 10].map((n) => jpegDerivative(n, n - 5)));
    const manifest = createStagedEvidenceArtifactManifest({ submissionIdentity: FOUNDATION_ID, artifacts: set });
    expect(manifest.originalCount).toBe(5);
    expect(manifest.files.map((file) => file.artifactId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `${lower}${n}`));
    expect(manifest.files.slice(5).map((file) => file.derivativeOf)).toEqual([1, 2, 3, 4, 5].map((n) => `${lower}${n}`));
    // The PUT path lowercases what it routes; the manifest resolves exactly that spelling and no other.
    expect(findStagedManifestEntry(manifest, `${lower}1`)?.ordinal).toBe(1);
    expect(findStagedManifestEntry(manifest, `${lower}10`)?.role).toBe("analysis_derivative");
    expect(findStagedManifestEntry(manifest, "artifact_B5A63452E7B0469CA63438A08137716C_1")).toBeNull();

    // The pre-fix Server derivation (case preserved) is not a second accepted representation.
    const upper = (entry) => ({ ...entry, artifactId: entry.artifactId.replace("b5a63452e7b0469ca63438a08137716c", "B5A63452E7B0469CA63438A08137716C") });
    const rejectsFor = (artifacts, code) => expect(() => createStagedEvidenceArtifactManifest({ submissionIdentity: FOUNDATION_ID, artifacts })).toThrowError(expect.objectContaining({ code, status: 400 }));
    rejectsFor([upper(set[0]), ...set.slice(1)], "STAGED_ARTIFACT_IDENTITY_INVALID");
    rejectsFor(set.map(upper), "STAGED_ARTIFACT_IDENTITY_INVALID");
    rejectsFor([...set.slice(0, 5), { ...set[5], derivativeOf: "artifact_B5A63452E7B0469CA63438A08137716C_1" }, ...set.slice(6)], "STAGED_DERIVATIVE_TARGET_INVALID");
    // Malformed and foreign identities still fail closed.
    rejectsFor([{ ...set[0], artifactId: "artifact_custom_1" }, ...set.slice(1)], "STAGED_ARTIFACT_IDENTITY_INVALID");
    rejectsFor([{ ...set[0], artifactId: `${lower}2` }, ...set.slice(1)], "STAGED_ARTIFACT_IDENTITY_INVALID");
    rejectsFor([{ ...set[0], artifactId: "artifact_01999999999979998999999999999999_1" }, ...set.slice(1)], "STAGED_ARTIFACT_IDENTITY_INVALID");
  });
});

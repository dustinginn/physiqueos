import { describe, expect, it } from "vitest";
import {
  STAGED_DERIVATIVE_MAXIMUM_BYTES,
  STAGED_EVIDENCE_MANIFEST_VERSION,
  STAGED_MAXIMUM_ORIGINALS,
  STAGED_ORIGINAL_MAXIMUM_BYTES,
  createStagedEvidenceArtifactManifest,
  findStagedManifestEntry,
  stagedArtifactId,
  stagedArtifactMaximumBytes,
  stagedArtifactProgress,
  stagedManifestIsSatisfied,
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
});

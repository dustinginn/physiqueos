import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSimplifiedProviderMigrationTransport } from "./SimplifiedProviderMigrationTransport.js";

const workspaces = [];
afterEach(() => {
  for (const root of workspaces.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("simplified provider private transport", () => {
  it("materializes a bounded archive and deletes the exact observed Space version", async () => {
    const fixture = archiveFixture();
    const deleteObject = vi.fn(async () => undefined);
    const objectProvider = {
      async downloadObjectToFile({ destination, expectedByteLength, expectedSha256 }) {
        expect(expectedByteLength).toBe(fixture.bytes);
        expect(expectedSha256).toBe(fixture.sha256);
        fs.copyFileSync(fixture.archive, destination);
        return { byteLength: fixture.bytes, sha256: fixture.sha256, providerVersion: "version-exact-1" };
      },
      deleteObject,
    };
    const transport = createSimplifiedProviderMigrationTransport({ objectProvider });
    const observePhase = vi.fn(async () => undefined);
    const materialized = await transport.materialize({
      objectKey: "migration-staging/simplified-rev142-20260827/accepted-package.tar",
      byteLength: fixture.bytes,
      sha256: fixture.sha256,
    }, { observePhase });
    expect(fs.existsSync(path.join(materialized.packageRoot, "manifest.json"))).toBe(true);
    expect(fs.existsSync(path.join(materialized.mediaRoot, "photos", "photo.jpg"))).toBe(true);
    await expect(materialized.cleanup()).resolves.toEqual({ deletedExactVersion: true, localRemoved: true });
    expect(deleteObject).toHaveBeenCalledWith({
      objectKey: "migration-staging/simplified-rev142-20260827/accepted-package.tar",
      providerVersion: "version-exact-1",
    });
    expect(fs.existsSync(materialized.packageRoot)).toBe(false);
    expect(observePhase.mock.calls.map(([phase]) => phase)).toEqual([
      "TRANSPORT_STREAM_HASH_STARTED",
      "TRANSPORT_STREAM_HASH_COMPLETE",
      "ARCHIVE_LIST_STARTED",
      "ARCHIVE_LIST_COMPLETE",
      "ARCHIVE_LAYOUT_VALIDATION_STARTED",
      "ARCHIVE_LAYOUT_VALIDATION_COMPLETE",
      "ARCHIVE_EXTRACT_STARTED",
      "ARCHIVE_EXTRACT_COMPLETE",
    ]);
    expect(observePhase.mock.calls.at(-1)[1]).toMatchObject({ extractedFiles: 3, extractedBytes: expect.any(Number) });
  });

  it("does not accept an unsafe key or an unbounded transport size", async () => {
    const transport = createSimplifiedProviderMigrationTransport({ objectProvider: { downloadObjectToFile() {}, deleteObject() {} } });
    await expect(transport.materialize({ objectKey: "../accepted.tar", byteLength: 1, sha256: "a".repeat(64) }))
      .rejects.toMatchObject({ code: "SIMPLIFIED_TRANSPORT_KEY_INVALID" });
    await expect(transport.materialize({ objectKey: "migration-staging/simplified-rev142-20260827/accepted-package.tar", byteLength: 2 ** 40, sha256: "a".repeat(64) }))
      .rejects.toThrow(/byteLength is invalid/);
  });
});

function archiveFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "simplified-transport-test-"));
  workspaces.push(root);
  const input = path.join(root, "input");
  const packageRoot = path.join(input, "simplified-migration-rev142-23c2a9fa");
  fs.mkdirSync(path.join(input, "media", "photos"), { recursive: true });
  fs.mkdirSync(packageRoot, { recursive: true });
  fs.writeFileSync(path.join(packageRoot, "manifest.json"), "{}\n");
  fs.writeFileSync(path.join(packageRoot, "canonical-runtime.json"), "{}\n");
  fs.writeFileSync(path.join(input, "media", "photos", "photo.jpg"), "bounded-media");
  const archive = path.join(root, "package.tar");
  execFileSync("tar", ["-cf", archive, "-C", input, "simplified-migration-rev142-23c2a9fa", "media"]);
  const body = fs.readFileSync(archive);
  return { archive, bytes: body.length, sha256: createHash("sha256").update(body).digest("hex") };
}

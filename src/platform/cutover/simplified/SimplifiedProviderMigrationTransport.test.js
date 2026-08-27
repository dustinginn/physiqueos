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
    expect(fs.existsSync(path.join(path.dirname(materialized.packageRoot), "media"))).toBe(false);
    const seen = [];
    const [mediaEntry] = fixture.media;
    await expect(materialized.mediaSource.visit([mediaEntry], async (entry, bytes) => seen.push({ entry, bytes: bytes.toString("utf8") }))).resolves.toMatchObject({
      objectCount: 1,
      byteLength: mediaEntry.size,
      processing: "single-pass-tar-stream",
    });
    expect(seen).toEqual([{ entry: expect.objectContaining({ relativePath: "photos/photo.jpg" }), bytes: "bounded-media" }]);
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
    expect(observePhase.mock.calls.at(-1)[1]).toMatchObject({ extractedFiles: 2, extractedBytes: expect.any(Number) });
  });

  it("streams a realistic many-member archive sequentially without creating a media extraction tree", async () => {
    const fixture = archiveFixture(96);
    const transport = createSimplifiedProviderMigrationTransport({ objectProvider: providerFor(fixture) });
    const materialized = await transport.materialize(transportInput(fixture));
    const transportRoot = path.dirname(path.dirname(materialized.packageRoot));
    expect(listFiles(transportRoot)).toHaveLength(3);
    expect(fs.existsSync(path.join(path.dirname(materialized.packageRoot), "media"))).toBe(false);
    let active = 0;
    let maximumActive = 0;
    let visited = 0;
    const progress = [];
    const result = await materialized.mediaSource.visit(fixture.media, async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await Promise.resolve();
      visited += 1;
      active -= 1;
    }, { onProgress: async (details) => progress.push(details) });
    expect(result).toMatchObject({
      verified: true,
      objectCount: 96,
      byteLength: fixture.media.reduce((sum, entry) => sum + entry.size, 0),
      processing: "single-pass-tar-stream",
    });
    expect(visited).toBe(96);
    expect(maximumActive).toBe(1);
    expect(progress.at(-1)).toMatchObject({ mediaCount: 96, mediaBytes: result.byteLength });
    await materialized.cleanup();
  });

  it("fails a wrong member identity and a mid-stream consumer failure without leaving extracted media", async () => {
    const fixture = archiveFixture(8);
    const first = await createSimplifiedProviderMigrationTransport({ objectProvider: providerFor(fixture) })
      .materialize(transportInput(fixture));
    const wrong = fixture.media.map((entry, index) => index === 0 ? { ...entry, sha256: "f".repeat(64) } : entry);
    await expect(first.mediaSource.visit(wrong, async () => undefined))
      .rejects.toMatchObject({ code: "SIMPLIFIED_PROVIDER_MEDIA_IDENTITY_MISMATCH" });
    await first.cleanup();

    const second = await createSimplifiedProviderMigrationTransport({ objectProvider: providerFor(fixture, "version-two") })
      .materialize(transportInput(fixture));
    let visited = 0;
    await expect(second.mediaSource.visit(fixture.media, async () => {
      visited += 1;
      if (visited === 3) throw new Error("bounded consumer failure");
    })).rejects.toThrow("bounded consumer failure");
    expect(visited).toBe(3);
    expect(fs.existsSync(path.join(path.dirname(second.packageRoot), "media"))).toBe(false);
    await second.cleanup();
    expect(fs.existsSync(second.packageRoot)).toBe(false);
  });

  it.each([
    ["duplicate", [regularArchiveEntry("media/photos/photo.jpg", "one"), regularArchiveEntry("media/photos/photo.jpg", "two")]],
    ["path traversal", [regularArchiveEntry("media/../escape.jpg", "escape")]],
    ["unexpected root", [regularArchiveEntry("unexpected/file.txt", "unexpected")]],
    ["symbolic link", [{ name: "media/photos/link.jpg", type: "2", linkName: "photo.jpg", body: Buffer.alloc(0) }]],
  ])("rejects a %s archive member before metadata extraction", async (_classification, extraEntries) => {
    const fixture = handcraftedArchiveFixture(extraEntries);
    const transport = createSimplifiedProviderMigrationTransport({ objectProvider: providerFor(fixture) });
    await expect(transport.materialize(transportInput(fixture)))
      .rejects.toMatchObject({ code: "SIMPLIFIED_TRANSPORT_ARCHIVE_INVALID" });
  });

  it("does not accept an unsafe key or an unbounded transport size", async () => {
    const transport = createSimplifiedProviderMigrationTransport({ objectProvider: { downloadObjectToFile() {}, deleteObject() {} } });
    await expect(transport.materialize({ objectKey: "../accepted.tar", byteLength: 1, sha256: "a".repeat(64) }))
      .rejects.toMatchObject({ code: "SIMPLIFIED_TRANSPORT_KEY_INVALID" });
    await expect(transport.materialize({ objectKey: "migration-staging/simplified-rev142-20260827/accepted-package.tar", byteLength: 2 ** 40, sha256: "a".repeat(64) }))
      .rejects.toThrow(/byteLength is invalid/);
    const fixture = archiveFixture();
    const verified = createSimplifiedProviderMigrationTransport({ objectProvider: providerFor(fixture) });
    await expect(verified.materialize({ ...transportInput(fixture), sha256: "f".repeat(64) }))
      .rejects.toMatchObject({ code: "SIMPLIFIED_TRANSPORT_HASH_MISMATCH" });
  });
});

function archiveFixture(mediaCount = 1) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "simplified-transport-test-"));
  workspaces.push(root);
  const input = path.join(root, "input");
  const packageRoot = path.join(input, "simplified-migration-rev142-23c2a9fa");
  fs.mkdirSync(path.join(input, "media", "photos"), { recursive: true });
  fs.mkdirSync(packageRoot, { recursive: true });
  fs.writeFileSync(path.join(packageRoot, "manifest.json"), "{}\n");
  fs.writeFileSync(path.join(packageRoot, "canonical-runtime.json"), "{}\n");
  const media = [];
  for (let index = 0; index < mediaCount; index += 1) {
    const relativePath = index === 0 ? "photos/photo.jpg" : `photos/photo-${String(index).padStart(3, "0")}.jpg`;
    const body = Buffer.from(index === 0 ? "bounded-media" : `bounded-media-${index}-${"x".repeat(1024 + index)}`);
    fs.writeFileSync(path.join(input, "media", ...relativePath.split("/")), body);
    media.push({ relativePath, size: body.length, sha256: createHash("sha256").update(body).digest("hex") });
  }
  const archive = path.join(root, "package.tar");
  execFileSync("tar", ["-cf", archive, "-C", input, "simplified-migration-rev142-23c2a9fa", "media"]);
  const body = fs.readFileSync(archive);
  return { archive, bytes: body.length, sha256: createHash("sha256").update(body).digest("hex"), media };
}

function providerFor(fixture, providerVersion = "version-exact-1") {
  return {
    async downloadObjectToFile({ destination, expectedByteLength, expectedSha256 }) {
      if (expectedByteLength !== fixture.bytes || expectedSha256 !== fixture.sha256) {
        throw Object.assign(new Error("transport identity mismatch"), { code: "SIMPLIFIED_TRANSPORT_HASH_MISMATCH" });
      }
      fs.copyFileSync(fixture.archive, destination);
      return { byteLength: fixture.bytes, sha256: fixture.sha256, providerVersion };
    },
    deleteObject: vi.fn(async () => undefined),
  };
}

function transportInput(fixture) {
  return {
    objectKey: "migration-staging/simplified-rev142-20260827/accepted-package.tar",
    byteLength: fixture.bytes,
    sha256: fixture.sha256,
  };
}

function listFiles(root) {
  const files = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else files.push(absolute);
    }
  }
  visit(root);
  return files;
}

function handcraftedArchiveFixture(extraEntries) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "simplified-malicious-tar-"));
  workspaces.push(root);
  const packageDirectory = "simplified-migration-rev142-23c2a9fa";
  const entries = [
    { name: `${packageDirectory}/`, type: "5", body: Buffer.alloc(0) },
    regularArchiveEntry(`${packageDirectory}/manifest.json`, "{}\n"),
    regularArchiveEntry(`${packageDirectory}/canonical-runtime.json`, "{}\n"),
    { name: "media/", type: "5", body: Buffer.alloc(0) },
    { name: "media/photos/", type: "5", body: Buffer.alloc(0) },
    regularArchiveEntry("media/photos/base.jpg", "base"),
    ...extraEntries,
  ];
  const archive = path.join(root, "package.tar");
  fs.writeFileSync(archive, encodeTar(entries));
  const body = fs.readFileSync(archive);
  return { archive, bytes: body.length, sha256: createHash("sha256").update(body).digest("hex") };
}

function regularArchiveEntry(name, body) {
  return { name, type: "0", body: Buffer.from(body) };
}

function encodeTar(entries) {
  const blocks = [];
  for (const entry of entries) {
    const body = Buffer.from(entry.body ?? Buffer.alloc(0));
    const header = Buffer.alloc(512);
    writeText(header, 0, 100, entry.name);
    writeOctal(header, 100, 8, entry.type === "5" ? 0o755 : 0o644);
    writeOctal(header, 108, 8, 0);
    writeOctal(header, 116, 8, 0);
    writeOctal(header, 124, 12, body.length);
    writeOctal(header, 136, 12, 0);
    header.fill(0x20, 148, 156);
    writeText(header, 156, 1, entry.type ?? "0");
    writeText(header, 157, 100, entry.linkName ?? "");
    writeText(header, 257, 6, "ustar");
    writeText(header, 263, 2, "00");
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    const checksumText = checksum.toString(8).padStart(6, "0");
    header.write(checksumText, 148, 6, "ascii");
    header[154] = 0;
    header[155] = 0x20;
    blocks.push(header, body);
    const padding = (512 - (body.length % 512)) % 512;
    if (padding) blocks.push(Buffer.alloc(padding));
  }
  blocks.push(Buffer.alloc(1024));
  return Buffer.concat(blocks);
}

function writeText(buffer, offset, length, value) {
  buffer.write(String(value), offset, Math.min(length, Buffer.byteLength(String(value))), "utf8");
}

function writeOctal(buffer, offset, length, value) {
  const text = Number(value).toString(8).padStart(length - 1, "0");
  buffer.write(text, offset, length - 1, "ascii");
  buffer[offset + length - 1] = 0;
}

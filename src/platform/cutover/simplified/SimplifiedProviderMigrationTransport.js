import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const TRANSPORT_KEY = /^migration-staging\/simplified-[A-Za-z0-9._-]{8,120}\/[A-Za-z0-9._-]{8,120}\.tar$/;
const PACKAGE_DIRECTORY = /^simplified-migration-rev[0-9]+-[a-f0-9]{8}$/;
const MAXIMUM_TRANSPORT_BYTES = 1024 * 1024 * 1024;

export function createSimplifiedProviderMigrationTransport({
  objectProvider,
  spawnProcess = spawn,
} = {}) {
  if (!objectProvider?.downloadObjectToFile || !objectProvider?.deleteObject) {
    throw new Error("Simplified migration transport requires private versioned object access.");
  }
  return Object.freeze({
    async materialize(input = {}, { observePhase = async () => undefined } = {}) {
      const objectKey = requireTransportKey(input.objectKey);
      const expectedByteLength = requireInteger(input.byteLength, "byteLength", 1, MAXIMUM_TRANSPORT_BYTES);
      const expectedSha256 = requireDigest(input.sha256, "sha256");
      const root = await fs.mkdtemp(path.join(tmpdir(), "physiqueos-simplified-provider-"));
      const archive = path.join(root, "accepted-package.tar");
      const extracted = path.join(root, "extracted");
      let providerVersion = null;
      let cleaned = false;
      try {
        await observePhase("TRANSPORT_STREAM_HASH_STARTED", {
          expectedByteLength,
          ...await temporaryStorage(root),
        });
        const downloaded = await objectProvider.downloadObjectToFile({
          objectKey,
          destination: archive,
          expectedByteLength,
          expectedSha256,
        });
        providerVersion = downloaded.providerVersion;
        await observePhase("TRANSPORT_STREAM_HASH_COMPLETE", {
          byteLength: downloaded.byteLength,
          archiveBytes: (await fs.stat(archive)).size,
          ...await temporaryStorage(root),
        });
        await observePhase("ARCHIVE_LIST_STARTED");
        const entries = await tarEntries({ archive, spawnProcess });
        await observePhase("ARCHIVE_LIST_COMPLETE", {
          entryCount: entries.length,
          listingBytes: Buffer.byteLength(entries.map(({ rawName }) => rawName).join("\n")),
        });
        await observePhase("ARCHIVE_LAYOUT_VALIDATION_STARTED");
        const { packageDirectory, mediaMembers } = validateArchiveEntries(entries);
        await observePhase("ARCHIVE_LAYOUT_VALIDATION_COMPLETE", { entryCount: entries.length });
        await fs.mkdir(extracted);
        await observePhase("ARCHIVE_EXTRACT_STARTED", await temporaryStorage(root));
        await runTar(spawnProcess, [
          "-xf", archive, "-C", extracted, "--",
          `${packageDirectory}/manifest.json`,
          `${packageDirectory}/canonical-runtime.json`,
        ]);
        const extractedInventory = await assertNoLinksOrSpecialFiles(extracted);
        await observePhase("ARCHIVE_EXTRACT_COMPLETE", {
          ...extractedInventory,
          ...await temporaryStorage(root),
        });
        const packageRoot = path.join(extracted, packageDirectory);
        await Promise.all([
          requireFile(path.join(packageRoot, "manifest.json")),
          requireFile(path.join(packageRoot, "canonical-runtime.json")),
        ]);
        const mediaSource = createArchiveMediaSource({ archive, mediaMembers, spawnProcess });
        return Object.freeze({
          packageRoot,
          mediaSource,
          transport: Object.freeze({ byteLength: downloaded.byteLength, sha256: downloaded.sha256, versioned: true }),
          cleanup: async () => {
            if (cleaned) return Object.freeze({ deletedExactVersion: true, localRemoved: true });
            cleaned = true;
            let deletionError = null;
            try {
              await objectProvider.deleteObject({ objectKey, providerVersion });
            } catch (error) {
              deletionError = error;
            }
            await fs.rm(root, { recursive: true, force: true });
            if (deletionError) throw coded("SIMPLIFIED_TRANSPORT_DELETE_FAILED", "The exact temporary transport version could not be deleted.");
            return Object.freeze({ deletedExactVersion: true, localRemoved: true });
          },
        });
      } catch (error) {
        providerVersion ??= error?.providerVersion ?? null;
        if (providerVersion) {
          await objectProvider.deleteObject({ objectKey, providerVersion }).catch(() => undefined);
        }
        await fs.rm(root, { recursive: true, force: true }).catch(() => undefined);
        throw error;
      }
    },
  });
}

async function tarEntries({ archive, spawnProcess }) {
  const plainOutput = await runTar(spawnProcess, ["-tf", archive], { captureStdout: true });
  const verboseOutput = await runTar(spawnProcess, ["-tvf", archive], { captureStdout: true });
  const plain = plainOutput.split(/\r?\n/).filter(Boolean);
  const verbose = verboseOutput.split(/\r?\n/).filter(Boolean);
  if (plain.length !== verbose.length) {
    throw coded("SIMPLIFIED_TRANSPORT_ARCHIVE_INVALID", "The archive inventory is ambiguous.");
  }
  return plain.map((rawName, index) => Object.freeze({
    rawName,
    name: rawName.replace(/\/$/, ""),
    directory: rawName.endsWith("/"),
    type: verbose[index]?.[0] ?? "?",
  }));
}

function validateArchiveEntries(entries) {
  if (entries.length < 4) throw coded("SIMPLIFIED_TRANSPORT_ARCHIVE_INVALID", "The migration transport archive is incomplete.");
  const seen = new Set();
  for (const entry of entries) {
    const normalized = entry.name.replaceAll("\\", "/");
    if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)
      || normalized.split("/").includes("..")) {
      throw coded("SIMPLIFIED_TRANSPORT_ARCHIVE_INVALID", "The migration transport archive contains an unsafe path.");
    }
    if (seen.has(normalized)) {
      throw coded("SIMPLIFIED_TRANSPORT_ARCHIVE_INVALID", "The migration transport archive contains a duplicate path.");
    }
    seen.add(normalized);
    if ((entry.directory && entry.type !== "d") || (!entry.directory && entry.type !== "-")) {
      throw coded("SIMPLIFIED_TRANSPORT_ARCHIVE_INVALID", "The migration transport archive contains a link or special entry.");
    }
  }
  const roots = [...new Set(entries.map((entry) => entry.name.split("/")[0]))].sort();
  const packageDirectories = roots.filter((entry) => PACKAGE_DIRECTORY.test(entry));
  if (roots.length !== 2 || roots[0] !== "media" || packageDirectories.length !== 1) {
    throw coded("SIMPLIFIED_TRANSPORT_ARCHIVE_INVALID", "The migration transport archive has an unexpected root layout.");
  }
  const packageDirectory = packageDirectories[0];
  const packageEntries = entries.filter((entry) => entry.name.startsWith(`${packageDirectory}/`) && !entry.directory);
  const allowed = new Set([
    `${packageDirectory}/canonical-runtime.json`,
    `${packageDirectory}/manifest.json`,
  ]);
  if (packageEntries.length !== allowed.size || packageEntries.some((entry) => !allowed.has(entry.name))) {
    throw coded("SIMPLIFIED_TRANSPORT_ARCHIVE_INVALID", "The canonical package directory contains unexpected files.");
  }
  const mediaMembers = entries.filter((entry) => entry.name.startsWith("media/") && !entry.directory);
  if (!mediaMembers.length || entries.some((entry) => !entry.directory
    && !allowed.has(entry.name) && !entry.name.startsWith("media/"))) {
    throw coded("SIMPLIFIED_TRANSPORT_ARCHIVE_INVALID", "The media package contains unexpected files.");
  }
  return Object.freeze({ packageDirectory, mediaMembers: Object.freeze(mediaMembers.map((entry) => entry.name)) });
}

function createArchiveMediaSource({ archive, mediaMembers, spawnProcess }) {
  const archiveOrder = Object.freeze([...mediaMembers]);
  return Object.freeze({
    processing: "single-pass-tar-stream",
    async visit(entries, visitor, { onProgress = async () => undefined } = {}) {
      if (!Array.isArray(entries) || typeof visitor !== "function") {
        throw new Error("Archive media processing requires manifest entries and a visitor.");
      }
      const expected = new Map();
      for (const entry of entries) {
        const relativePath = String(entry?.relativePath ?? "");
        const member = `media/${relativePath}`;
        if (!relativePath || expected.has(member)) {
          throw coded("SIMPLIFIED_PROVIDER_MEDIA_INVENTORY_MISMATCH", "The canonical media inventory is ambiguous.");
        }
        expected.set(member, entry);
      }
      if (archiveOrder.length !== expected.size || archiveOrder.some((member) => !expected.has(member))) {
        throw coded("SIMPLIFIED_PROVIDER_MEDIA_INVENTORY_MISMATCH", "Transported media inventory differs from the canonical package.");
      }
      const ordered = archiveOrder.map((member) => Object.freeze({ member, entry: expected.get(member) }));
      return visitTarMedia({ archive, ordered, spawnProcess, visitor, onProgress });
    },
  });
}

async function visitTarMedia({ archive, ordered, spawnProcess, visitor, onProgress }) {
  const child = spawnProcess("tar", ["-xOf", archive, "--", ...ordered.map(({ member }) => member)], {
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr?.on("data", (chunk) => { if (stderr.length < 8192) stderr += chunk; });
  const closed = new Promise((resolve, reject) => {
    child.once("error", (cause) => reject(coded("SIMPLIFIED_TRANSPORT_MEDIA_STREAM_FAILED", "The bounded media reader could not start.", cause)));
    child.once("close", (code) => resolve(code));
  });
  let index = 0;
  let parts = [];
  let currentBytes = 0;
  let processedBytes = 0;
  let maximumFileBytes = 0;
  let nextProgressBytes = 32 * 1024 * 1024;
  async function completeCurrent() {
    const { entry } = ordered[index];
    const bytes = Buffer.concat(parts, currentBytes);
    parts = [];
    currentBytes = 0;
    if (bytes.length !== Number(entry.size)
      || createHash("sha256").update(bytes).digest("hex") !== String(entry.sha256)) {
      throw coded("SIMPLIFIED_PROVIDER_MEDIA_IDENTITY_MISMATCH", "Transported media differs from the canonical package.");
    }
    await visitor(entry, bytes);
    index += 1;
    processedBytes += bytes.length;
    maximumFileBytes = Math.max(maximumFileBytes, bytes.length);
    if (index === ordered.length || index % 32 === 0 || processedBytes >= nextProgressBytes) {
      while (nextProgressBytes <= processedBytes) nextProgressBytes += 32 * 1024 * 1024;
      await onProgress(Object.freeze({
        mediaCount: index,
        mediaBytes: processedBytes,
        ...await temporaryStorage(path.dirname(archive)),
      }));
    }
  }
  try {
    while (index < ordered.length && Number(ordered[index].entry.size) === 0) await completeCurrent();
    for await (const chunk of child.stdout) {
      let offset = 0;
      while (offset < chunk.length) {
        if (index >= ordered.length) {
          throw coded("SIMPLIFIED_PROVIDER_MEDIA_INVENTORY_MISMATCH", "The media stream contains unexpected trailing bytes.");
        }
        const remaining = Number(ordered[index].entry.size) - currentBytes;
        const take = Math.min(remaining, chunk.length - offset);
        parts.push(chunk.subarray(offset, offset + take));
        currentBytes += take;
        offset += take;
        if (currentBytes === Number(ordered[index].entry.size)) {
          await completeCurrent();
          while (index < ordered.length && Number(ordered[index].entry.size) === 0) await completeCurrent();
        }
      }
    }
    const code = await closed;
    if (code !== 0) {
      throw coded("SIMPLIFIED_TRANSPORT_MEDIA_STREAM_FAILED", `The bounded media reader failed with exit code ${code}: ${stderr.slice(0, 512)}`);
    }
    if (index !== ordered.length || currentBytes !== 0) {
      throw coded("SIMPLIFIED_PROVIDER_MEDIA_INVENTORY_MISMATCH", "The media stream ended before the canonical inventory was complete.");
    }
    return Object.freeze({
      verified: true,
      objectCount: index,
      byteLength: processedBytes,
      maximumFileBytes,
      processing: "single-pass-tar-stream",
    });
  } catch (error) {
    if (child.exitCode == null && child.signalCode == null) child.kill("SIGTERM");
    await closed.catch(() => undefined);
    throw error;
  }
}

function runTar(spawnProcess, args, { captureStdout = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess("tar", args, {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", captureStdout ? "pipe" : "ignore", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { if (stdout.length < 1024 * 1024) stdout += chunk; });
    child.stderr?.on("data", (chunk) => { if (stderr.length < 8192) stderr += chunk; });
    child.once("error", (cause) => reject(coded("SIMPLIFIED_TRANSPORT_EXTRACT_FAILED", "The bounded tar helper could not start.", cause)));
    child.once("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(coded("SIMPLIFIED_TRANSPORT_EXTRACT_FAILED", `The bounded tar helper failed with exit code ${code}.`));
    });
  });
}

async function assertNoLinksOrSpecialFiles(root) {
  let extractedBytes = 0;
  let extractedFiles = 0;
  async function walk(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      const stat = await fs.lstat(target);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
        throw coded("SIMPLIFIED_TRANSPORT_ARCHIVE_INVALID", "The migration transport archive contains a link or special file.");
      }
      if (stat.isDirectory()) await walk(target);
      else {
        extractedBytes += stat.size;
        extractedFiles += 1;
      }
    }
  }
  await walk(root);
  return Object.freeze({ extractedBytes, extractedFiles });
}

async function temporaryStorage(root) {
  const stats = await fs.statfs(root);
  return Object.freeze({
    temporaryFreeBytes: Number(stats.bavail) * Number(stats.bsize),
    temporaryTotalBytes: Number(stats.blocks) * Number(stats.bsize),
  });
}

async function requireFile(target) {
  if (!(await fs.stat(target)).isFile()) throw coded("SIMPLIFIED_TRANSPORT_ARCHIVE_INVALID", "The canonical package is incomplete.");
}
function requireTransportKey(value) {
  const key = String(value ?? "");
  if (!TRANSPORT_KEY.test(key) || key.includes("..")) throw coded("SIMPLIFIED_TRANSPORT_KEY_INVALID", "The temporary transport key is invalid.");
  return key;
}
function requireDigest(value, field) {
  const digest = String(value ?? "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error(`${field} must be a SHA-256 digest.`);
  return digest;
}
function requireInteger(value, field, minimum, maximum) {
  const candidate = Number(value);
  if (!Number.isSafeInteger(candidate) || candidate < minimum || candidate > maximum) throw new Error(`${field} is invalid.`);
  return candidate;
}
function coded(code, message, cause = null) { return Object.assign(new Error(message, cause ? { cause } : undefined), { code }); }

import { spawn } from "node:child_process";
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
          listingBytes: Buffer.byteLength(entries.join("\n")),
        });
        await observePhase("ARCHIVE_LAYOUT_VALIDATION_STARTED");
        const packageDirectory = validateArchiveEntries(entries);
        await observePhase("ARCHIVE_LAYOUT_VALIDATION_COMPLETE", { entryCount: entries.length });
        await fs.mkdir(extracted);
        await observePhase("ARCHIVE_EXTRACT_STARTED", await temporaryStorage(root));
        await runTar(spawnProcess, ["-xf", archive, "-C", extracted]);
        const extractedInventory = await assertNoLinksOrSpecialFiles(extracted);
        await observePhase("ARCHIVE_EXTRACT_COMPLETE", {
          ...extractedInventory,
          ...await temporaryStorage(root),
        });
        const packageRoot = path.join(extracted, packageDirectory);
        const mediaRoot = path.join(extracted, "media");
        await Promise.all([
          requireFile(path.join(packageRoot, "manifest.json")),
          requireFile(path.join(packageRoot, "canonical-runtime.json")),
          requireDirectory(mediaRoot),
        ]);
        return Object.freeze({
          packageRoot,
          mediaRoot,
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
  const output = await runTar(spawnProcess, ["-tf", archive], { captureStdout: true });
  return output.split(/\r?\n/).filter(Boolean).map((entry) => entry.replace(/\/$/, ""));
}

function validateArchiveEntries(entries) {
  if (entries.length < 4) throw coded("SIMPLIFIED_TRANSPORT_ARCHIVE_INVALID", "The migration transport archive is incomplete.");
  for (const entry of entries) {
    const normalized = entry.replaceAll("\\", "/");
    if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)
      || normalized.split("/").includes("..")) {
      throw coded("SIMPLIFIED_TRANSPORT_ARCHIVE_INVALID", "The migration transport archive contains an unsafe path.");
    }
  }
  const roots = [...new Set(entries.map((entry) => entry.split("/")[0]))].sort();
  const packageDirectories = roots.filter((entry) => PACKAGE_DIRECTORY.test(entry));
  if (roots.length !== 2 || roots[0] !== "media" || packageDirectories.length !== 1) {
    throw coded("SIMPLIFIED_TRANSPORT_ARCHIVE_INVALID", "The migration transport archive has an unexpected root layout.");
  }
  const packageDirectory = packageDirectories[0];
  const packageEntries = entries.filter((entry) => entry.startsWith(`${packageDirectory}/`));
  const allowed = new Set([
    `${packageDirectory}/canonical-runtime.json`,
    `${packageDirectory}/manifest.json`,
  ]);
  if (packageEntries.some((entry) => !allowed.has(entry))) {
    throw coded("SIMPLIFIED_TRANSPORT_ARCHIVE_INVALID", "The canonical package directory contains unexpected files.");
  }
  return packageDirectory;
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
async function requireDirectory(target) {
  if (!(await fs.stat(target)).isDirectory()) throw coded("SIMPLIFIED_TRANSPORT_ARCHIVE_INVALID", "The media package is incomplete.");
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

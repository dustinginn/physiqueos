import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Fail-closed acceptance gate for the provider product build's access-gate
// middleware. A live Phase 7A compatibility deployment shipped an image
// whose middleware-manifest.json had no root entry at all - the Founder
// access gate never activated, and unauthenticated requests reached
// route-level fallbacks instead of being rejected. This verifier proves the
// build actually produced working middleware before the artifact is
// accepted; it performs no mutation, no network access, and reads no
// secrets.
export const PROVIDER_MIDDLEWARE_ARTIFACT_ERROR = Object.freeze({
  MANIFEST_MISSING: "PROVIDER_MIDDLEWARE_MANIFEST_MISSING",
  MANIFEST_PARSE_FAILED: "PROVIDER_MIDDLEWARE_MANIFEST_PARSE_FAILED",
  ROOT_ENTRY_MISSING: "PROVIDER_MIDDLEWARE_ROOT_ENTRY_MISSING",
  MATCHERS_EMPTY: "PROVIDER_MIDDLEWARE_MATCHERS_EMPTY",
  ENTRYPOINT_MISSING: "PROVIDER_MIDDLEWARE_ENTRYPOINT_MISSING",
  ARTIFACT_MISSING: "PROVIDER_MIDDLEWARE_ARTIFACT_MISSING",
  KNOWN_PATH_MISSING: "PROVIDER_MIDDLEWARE_KNOWN_PATH_MISSING",
});

// The exact compiled middleware artifact path this Next.js 16 `--webpack`
// build contract deterministically produces, confirmed against both a
// Turbopack and a `--webpack` build of this exact source at commit
// 305c219d3dea1fb3de7a3a34e0a708e85bc73ed0. Asserted in addition to - never
// instead of - following the manifest's own entrypoint reference below, so
// a future Next.js version changing this path is still caught via the
// manifest-driven check rather than silently passing.
const KNOWN_MIDDLEWARE_ARTIFACT_RELATIVE_PATH = path.join("server", "src", "middleware.js");

export function verifyProviderMiddlewareArtifact({ nextDir } = {}) {
  const resolvedNextDir = path.resolve(nextDir ?? process.env.PHYSIQUEOS_BUILD_DIST_DIR ?? ".next");
  const manifestPath = path.join(resolvedNextDir, "server", "middleware-manifest.json");

  if (!fs.existsSync(manifestPath)) {
    fail(
      PROVIDER_MIDDLEWARE_ARTIFACT_ERROR.MANIFEST_MISSING,
      `Middleware manifest is missing: ${manifestPath}. The provider build produced no middleware-manifest.json - the Founder access gate cannot exist without it.`,
    );
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    fail(
      PROVIDER_MIDDLEWARE_ARTIFACT_ERROR.MANIFEST_PARSE_FAILED,
      `Middleware manifest is not valid JSON: ${manifestPath} (${error.message}).`,
    );
  }

  const rootEntry = manifest?.middleware?.["/"];
  if (!rootEntry || typeof rootEntry !== "object" || Array.isArray(rootEntry) || Object.keys(rootEntry).length === 0) {
    fail(
      PROVIDER_MIDDLEWARE_ARTIFACT_ERROR.ROOT_ENTRY_MISSING,
      `Middleware manifest has no root ("/") middleware entry: ${manifestPath}. This is the exact empty shape ({"middleware":{},"functions":{},"sortedMiddleware":[]}) observed on the live deployed image whose access gate never activated - refusing to accept this build.`,
    );
  }

  const matchers = rootEntry.matchers;
  if (!Array.isArray(matchers) || matchers.length === 0) {
    fail(
      PROVIDER_MIDDLEWARE_ARTIFACT_ERROR.MATCHERS_EMPTY,
      `Middleware manifest's root entry has no matcher configuration: ${manifestPath}. Middleware with no matchers would not gate any route.`,
    );
  }

  const entrypoint = rootEntry.entrypoint;
  if (typeof entrypoint !== "string" || entrypoint.length === 0) {
    fail(
      PROVIDER_MIDDLEWARE_ARTIFACT_ERROR.ENTRYPOINT_MISSING,
      `Middleware manifest's root entry has no entrypoint reference: ${manifestPath}.`,
    );
  }

  const referencedArtifactPath = path.join(resolvedNextDir, entrypoint);
  if (!fs.existsSync(referencedArtifactPath)) {
    fail(
      PROVIDER_MIDDLEWARE_ARTIFACT_ERROR.ARTIFACT_MISSING,
      `Middleware manifest references a compiled artifact that does not exist on disk: ${referencedArtifactPath} (entrypoint "${entrypoint}" from ${manifestPath}). The manifest and the actual build output disagree.`,
    );
  }

  const knownPath = path.join(resolvedNextDir, KNOWN_MIDDLEWARE_ARTIFACT_RELATIVE_PATH);
  if (!fs.existsSync(knownPath)) {
    fail(
      PROVIDER_MIDDLEWARE_ARTIFACT_ERROR.KNOWN_PATH_MISSING,
      `The known Next.js 16 "--webpack" compiled middleware artifact path is missing: ${knownPath}. This deterministic contract path is expected in addition to whatever the manifest references.`,
    );
  }

  return Object.freeze({
    status: "PASS",
    manifestPath,
    entrypoint,
    referencedArtifactPath,
    knownPath,
    matcherCount: matchers.length,
  });
}

function fail(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  throw error;
}

async function main() {
  const nextDirArg = process.argv[2];
  try {
    const result = verifyProviderMiddlewareArtifact({ nextDir: nextDirArg });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) await main();

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const WINDOWS_ABSOLUTE_PATH = /^[A-Za-z]:[\\/]/;
const URL_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;

export function normalizeProductionMigrationModuleSpecifier(
  specifier,
  { baseDirectory = process.cwd(), allowedRoot = null } = {},
) {
  const value = required(specifier);
  if (value.startsWith("file:")) {
    const url = new URL(value);
    assertAllowedFilesystemPath(fileURLToPath(url), allowedRoot);
    return url.href;
  }
  if (URL_SCHEME.test(value) && !WINDOWS_ABSOLUTE_PATH.test(value)) {
    throw loaderError(
      "PRODUCTION_MIGRATION_MODULE_SCHEME_UNSUPPORTED",
      `Production migration modules do not support the ${new URL(value).protocol} URL scheme.`,
    );
  }
  if (isFilesystemPath(value)) {
    const resolved = path.isAbsolute(value) || WINDOWS_ABSOLUTE_PATH.test(value)
      ? path.resolve(value)
      : path.resolve(baseDirectory, value);
    assertAllowedFilesystemPath(resolved, allowedRoot);
    return pathToFileURL(resolved).href;
  }
  return value;
}

export async function importProductionMigrationModule(specifier, options) {
  return import(normalizeProductionMigrationModuleSpecifier(specifier, options));
}

function isFilesystemPath(value) {
  return path.isAbsolute(value)
    || WINDOWS_ABSOLUTE_PATH.test(value)
    || value.startsWith("./")
    || value.startsWith("../")
    || value.startsWith(".\\")
    || value.startsWith("..\\");
}

function assertAllowedFilesystemPath(candidate, allowedRoot) {
  if (allowedRoot == null) return;
  const root = path.resolve(allowedRoot);
  const resolved = path.resolve(candidate);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw loaderError(
      "PRODUCTION_MIGRATION_MODULE_PATH_OUTSIDE_ROOT",
      "Production migration module path escaped its allowed root.",
    );
  }
}

function required(value) {
  const candidate = String(value ?? "").trim();
  if (!candidate) {
    throw loaderError(
      "PRODUCTION_MIGRATION_MODULE_SPECIFIER_REQUIRED",
      "Production migration module specifier is required.",
    );
  }
  return candidate;
}

function loaderError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";

const MARKER_DIRECTIVE = /^\s*\/\/\s*PHYSIQUEOS_AUDIT_SUCCESS_MARKER:\s*([A-Za-z0-9_.:-]{16,160})\s*$/gm;
const MAX_BUFFER_BYTES = 32 * 1024 * 1024;

export function parseWrapperArguments(args) {
  const [context, appId, componentName, sourcePath, ...options] = args;
  if (!context || !appId || !componentName || !sourcePath) throw coded("WRAPPER_ARGUMENTS_INVALID");
  let explicitConfigPath = null;
  for (let index = 0; index < options.length; index += 1) {
    if (options[index] !== "--doctl-config" || explicitConfigPath || !options[index + 1]) {
      throw coded("WRAPPER_OPTION_INVALID");
    }
    explicitConfigPath = options[index + 1];
    index += 1;
  }
  return { context, appId, componentName, sourcePath: path.resolve(sourcePath), explicitConfigPath };
}

export function readRequiredSuccessMarker(source) {
  const matches = [...String(source).matchAll(MARKER_DIRECTIVE)];
  if (matches.length !== 1) throw coded("AUDIT_SUCCESS_MARKER_DIRECTIVE_INVALID");
  return matches[0][1];
}

export function hasExactSuccessMarker(output, marker) {
  const lines = String(output).split(/\r?\n/).map((line) => line.replace(/\r$/, ""));
  return lines.filter((line) => line === marker).length === 1;
}

export function runGzipFileWrapper({
  args,
  spawnSyncImpl = spawnSync,
  readFileSync = fs.readFileSync,
  stdout = process.stdout,
  stderr = process.stderr,
  runnerPath = path.resolve(import.meta.dirname, "runAppConsoleContextGzipSourceOnOpen.mjs"),
} = {}) {
  const parsed = parseWrapperArguments(args);
  let source;
  try {
    source = readFileSync(parsed.sourcePath, "utf8");
  } catch {
    throw coded("AUDIT_SOURCE_UNAVAILABLE");
  }
  const successMarker = readRequiredSuccessMarker(source);
  const encoded = gzipSync(Buffer.from(source)).toString("base64");
  const runnerArgs = [runnerPath, parsed.context, parsed.appId, parsed.componentName, encoded];
  if (parsed.explicitConfigPath) runnerArgs.push("--doctl-config", parsed.explicitConfigPath);

  const result = spawnSyncImpl(process.execPath, runnerArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: MAX_BUFFER_BYTES,
    timeout: 330_000,
    windowsHide: true,
  });
  const runnerStdout = result.stdout ?? "";
  const runnerStderr = result.stderr ?? "";
  stdout.write(runnerStdout);
  stderr.write(runnerStderr);

  if (result.error?.code === "ETIMEDOUT") throw coded("RUNNER_TIMEOUT");
  if (result.error?.code === "ENOBUFS") throw coded("RUNNER_OUTPUT_TRUNCATED");
  if (result.error) throw coded("RUNNER_EXECUTION_FAILED");
  if (result.signal) throw coded("RUNNER_SIGNALLED");
  if (result.status !== 0) throw coded(`RUNNER_EXIT_${result.status ?? "UNKNOWN"}`);
  if (runnerStderr.trim()) throw coded("RUNNER_STDERR_UNEXPECTED");
  if (!hasExactSuccessMarker(runnerStdout, successMarker)) throw coded("AUDIT_SUCCESS_MARKER_MISSING");
  return { successMarker };
}

function coded(code) {
  return Object.assign(new Error(code), { code });
}

function isMainModule() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isMainModule()) {
  try {
    runGzipFileWrapper({ args: process.argv.slice(2) });
  } catch (error) {
    process.stderr.write(`PHYSIQUEOS_READONLY_WRAPPER_FAILED:${error?.code ?? "UNKNOWN"}\n`);
    process.exitCode = 1;
  }
}

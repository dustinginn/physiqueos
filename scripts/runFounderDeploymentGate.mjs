import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readOperationalJsonFileSync } from "./lib/operationalJson.mjs";

const MANDATORY_TEST_FILE_COUNT = 83;
const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), "..");
const manifestPath = path.join(root, "deployment/founder-cutover-manifest.json");
const vitestPath = path.join(root, "node_modules/vitest/vitest.mjs");

export function collectMandatoryTestPaths(manifest) {
  const paths = [
    ...(manifest?.categories?.acceptedDeploymentScope ?? []),
    ...(manifest?.blockerResolutionPaths ?? []),
  ];
  return [...new Set(paths.filter((item) => item.endsWith(".test.js")))].sort();
}

export function runFounderDeploymentGate() {
  const manifest = readOperationalJsonFileSync(manifestPath, {
    stage: "founder_deployment_gate_manifest",
  });
  const testPaths = collectMandatoryTestPaths(manifest);
  if (testPaths.length !== MANDATORY_TEST_FILE_COUNT) {
    throw new Error(
      `Founder deployment gate expected ${MANDATORY_TEST_FILE_COUNT} test files; found ${testPaths.length}.`
    );
  }

  const environment = { ...process.env };
  delete environment.NODE_OPTIONS;
  let passedTests = 0;
  const startedAt = Date.now();

  for (const [index, testPath] of testPaths.entries()) {
    const fileStartedAt = Date.now();
    const execution = spawnSync(process.execPath, [
      vitestPath,
      "run",
      "--config",
      "vitest.unit.config.js",
      "--maxWorkers=1",
      "--no-file-parallelism",
      "--reporter=json",
      "--silent=true",
      testPath,
    ], {
      cwd: root,
      encoding: "utf8",
      env: environment,
      maxBuffer: 64 * 1024 * 1024,
    });

    let report = null;
    try {
      report = JSON.parse(execution.stdout.trim());
    } catch {
      // The captured output is included in the failure below.
    }
    const clean = execution.status === 0 && report?.success === true &&
      report.numFailedTests === 0 && report.numPendingTests === 0 &&
      report.numTodoTests === 0 && report.numPassedTests === report.numTotalTests;
    if (!clean) {
      const details = [
        `Founder deployment gate failed at ${testPath}.`,
        `exit=${execution.status ?? "null"} signal=${execution.signal ?? "none"}`,
        execution.stdout.trim(),
        execution.stderr.trim(),
      ].filter(Boolean).join("\n");
      throw new Error(details);
    }

    passedTests += report.numPassedTests;
    const elapsedMs = Date.now() - fileStartedAt;
    console.log(
      `[${index + 1}/${testPaths.length}] PASS ${testPath} ` +
      `(${report.numPassedTests} tests, ${elapsedMs} ms)`
    );
  }

  const summary = Object.freeze({
    testFiles: testPaths.length,
    passedTests,
    failedTests: 0,
    pendingTests: 0,
    todoTests: 0,
    elapsedMs: Date.now() - startedAt,
    defaultHeap: true,
    subprocessIsolation: "one_fresh_process_per_test_file",
  });
  console.log(`FOUNDER_DEPLOYMENT_GATE=${JSON.stringify(summary)}`);
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    runFounderDeploymentGate();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

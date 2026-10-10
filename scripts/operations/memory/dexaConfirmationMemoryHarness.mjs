// Memory harness for the DEXA post-confirmation pipeline (opt-in; not part of
// any test suite). Every scenario runs in a fresh Node process under a hard V8
// heap limit with a synthetic production-shaped Founder runtime of at least
// 85 MB, so a step that exhausts the heap fails the way production did.
//
//   node scripts/operations/memory/dexaConfirmationMemoryHarness.mjs \
//     --out-dir <scratch dir> [--heap 512] [--ballast 150] [--sweep] [--scenario <name>]...
//
// For each scenario it reports pass/out-of-memory at --heap MB with --ballast
// MB of retained baseline (standing in for the web/worker process), and with
// --sweep the smallest heap limit (16 MB resolution, no ballast) at which the
// scenario completes: a deterministic measure of the step's own peak.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const DEXA_MEMORY_SCENARIOS = Object.freeze([
  "entry_scope",
  "legacy_compatibility_writes", "bounded_compatibility_writes",
  "legacy_scheduled_completion", "bounded_scheduled_completion",
  "legacy_analysis", "bounded_analysis",
  "legacy_goal_evaluation", "bounded_goal_evaluation",
  "legacy_briefing", "bounded_briefing",
  "bounded_end_to_end",
  "bounded_confirmation_cadence_concurrency",
]);

const args = process.argv.slice(2);
const option = (name, fallback) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : fallback; };
const outDir = option("out-dir");
if (!outDir) throw new Error("--out-dir is required (a scratch directory outside the repository).");
const heap = Number(option("heap", "512"));
const ballast = Number(option("ballast", "150"));
const sweep = args.includes("--sweep");
const selected = args.flatMap((value, index) => (args[index - 1] === "--scenario" ? [value] : []));
const scenarios = selected.length ? selected : DEXA_MEMORY_SCENARIOS;

fs.mkdirSync(outDir, { recursive: true });
const bundlePath = path.join(outDir, "dexaConfirmationMemoryScenario.bundle.mjs");
await build({
  entryPoints: [path.join(root, "scripts/operations/memory/dexaConfirmationMemoryScenario.mjs")],
  bundle: true, format: "esm", platform: "node", target: "node22", outfile: bundlePath, legalComments: "none", logLevel: "error",
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  plugins: [{
    name: "stub-production-composition",
    setup(builder) {
      // Bounded steps import the production composition lazily as their default
      // loader; the harness injects its own, so the module is never executed.
      builder.onResolve({ filter: /productionApplicationComposition(\.js)?$/ }, () => ({ path: "stub", namespace: "stub" }));
      builder.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export {};", loader: "js" }));
    },
  }],
});

function runOnce(scenario, heapMb, ballastMb) {
  const result = spawnSync(process.execPath, [`--max-old-space-size=${heapMb}`, "--expose-gc", bundlePath, scenario, String(ballastMb)], {
    encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 600_000,
  });
  const line = (result.stdout ?? "").split("\n").find((item) => item.startsWith("HARNESS_RESULT "));
  const parsed = line ? JSON.parse(line.slice("HARNESS_RESULT ".length)) : null;
  const outOfMemory = /heap out of memory|Reached heap limit|allocation failed/i.test(result.stderr ?? "");
  return {
    ok: result.status === 0 && parsed?.ok === true,
    outOfMemory,
    status: result.status,
    signal: result.signal,
    detail: parsed,
    stderr: parsed ? undefined : String(result.stderr ?? "").split("\n").filter(Boolean).slice(-3).join(" | ").slice(0, 400),
  };
}

function minimumHeap(scenario) {
  let low = 64;
  let high = 1024;
  if (!runOnce(scenario, high, 0).ok) return null;
  while (high - low > 16) {
    const middle = Math.round((low + high) / 2 / 16) * 16;
    if (runOnce(scenario, middle, 0).ok) high = middle;
    else low = middle;
  }
  return high;
}

const report = [];
for (const scenario of scenarios) {
  const atLimit = runOnce(scenario, heap, ballast);
  const entry = { scenario, heapLimitMb: heap, ballastMb: ballast, ...atLimit };
  if (sweep) entry.minimumHeapMbWithoutBallast = minimumHeap(scenario);
  report.push(entry);
  process.stdout.write(`${JSON.stringify(entry)}\n`);
}
fs.writeFileSync(path.join(outDir, "dexa-memory-report.json"), JSON.stringify(report, null, 1));

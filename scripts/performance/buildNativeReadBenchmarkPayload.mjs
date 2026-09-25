// Bundles the zero-write Native read benchmark (nativeReadBenchmark.entry.mjs) and the exact read code it
// exercises into the single file the accepted read-only console runner transports. Usage:
//   node scripts/performance/buildNativeReadBenchmarkPayload.mjs --group core|progress|training|briefings \
//     --sha <40-hex deployed sha> --out <file> [--warm 3] [--profile label,label]
//     [--fixed-now <ISO instant> --code-label baseline|candidate]   (parity mode: pinned clock + response hashes)
// Groups keep each bundle small enough for the console transport (~2.4 KB/s of base64, 300 s cap).
// Run the bundle with runAppConsoleContextGzipFile.mjs against the `web` component. The payload refuses to
// run unless the container's PHYSIQUEOS_GIT_SHA equals --sha, so a bundle built from a candidate tree can
// only benchmark that candidate once it is the running code.
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const sha = argument("--sha");
const out = argument("--out");
const warm = Number(argument("--warm", "3"));
const group = argument("--group");
const fixedNow = argument("--fixed-now");
if (fixedNow && Number.isNaN(Date.parse(fixedNow))) throw new Error("--fixed-now must be an ISO instant.");
const codeLabel = argument("--code-label", "unlabelled");
const profileLabels = String(argument("--profile", "")).split(",").map((item) => item.trim()).filter(Boolean);
const GROUPS = ["core", "progress", "training", "briefings"];
if (!GROUPS.includes(group)) throw new Error(`--group must be one of ${GROUPS.join(", ")}.`);
if (!/^[0-9a-f]{40}$/.test(String(sha ?? ""))) throw new Error("--sha must be the 40-hex commit running in the container.");
if (!out) throw new Error("--out is required.");
if (!Number.isInteger(warm) || warm < 1 || warm > 10) throw new Error("--warm must be an integer from 1 through 10.");
const marker = `PHYSIQUEOS_NATIVE_READ_BENCH_OK_${randomBytes(6).toString("hex")}`;
const result = await build({
  entryPoints: [path.join(root, "scripts/performance/nativeReadBenchmark.entry.mjs")],
  bundle: true, write: false, sourcemap: "external", outfile: out, format: "esm", platform: "node", target: "node22", legalComments: "none", minify: true,
  // Some bundled modules import "pg" statically; resolve it from the container's own server bundle.
  plugins: [{
    name: "container-pg",
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /^native-read-benchmark-group$/ }, () => ({
        path: path.join(root, "scripts/performance/nativeReadBenchmarkGroups", `${group}.mjs`),
      }));
      pluginBuild.onResolve({ filter: /^pg$/ }, () => ({ path: "pg", namespace: "container-pg" }));
      pluginBuild.onLoad({ filter: /.*/, namespace: "container-pg" }, () => ({
        contents: 'import { createRequire } from "node:module"; export default createRequire("/app/server.js")("pg");',
        loader: "js",
      }));
      // Object storage is never touched by a read benchmark (media is disabled); keep the SDK out of the
      // payload so it fits the console transport. Any accidental use throws instead of doing I/O.
      pluginBuild.onResolve({ filter: /^(@aws-sdk|@smithy)\// }, (args) => ({ path: args.path, namespace: "unused-sdk" }));
      pluginBuild.onLoad({ filter: /.*/, namespace: "unused-sdk" }, () => ({
        contents: "module.exports = new Proxy({}, { get: (_, key) => key === '__esModule' ? false : function unusedSdk() { throw new Error('OBJECT_STORAGE_DISABLED'); } });",
        loader: "js",
      }));
    },
  }],
  define: {
    __EXPECTED_GIT_SHA__: JSON.stringify(sha),
    __MARKER__: JSON.stringify(marker),
    __WARM_REPETITIONS__: JSON.stringify(warm),
    __PROFILE_LABELS__: JSON.stringify(profileLabels),
    __FIXED_NOW__: JSON.stringify(fixedNow ?? null),
    __CODE_LABEL__: JSON.stringify(String(codeLabel).slice(0, 40)),
  },
});
// The sourcemap stays local (never transported); profile positions are 0-based lines of the bundle, which is
// shifted down one line by the marker directive below.
const bundle = result.outputFiles.find((file) => !file.path.endsWith(".map"));
const sourceMap = result.outputFiles.find((file) => file.path.endsWith(".map"));
fs.writeFileSync(out, `// PHYSIQUEOS_AUDIT_SUCCESS_MARKER: ${marker}\n${bundle.text}`);
if (sourceMap) fs.writeFileSync(`${out}.map`, sourceMap.text);
process.stdout.write(`${JSON.stringify({ out, marker, bytes: fs.statSync(out).size })}\n`);

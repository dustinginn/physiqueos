import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
};
const sha = argument("--sha");
const out = argument("--out");
if (!/^[0-9a-f]{40}$/.test(String(sha ?? ""))) throw new Error("--sha must be the 40-hex commit running in the container.");
if (!out) throw new Error("--out is required.");
const marker = `PHYSIQUEOS_NATIVE_READ_BENCH_OK_${randomBytes(6).toString("hex")}`;
const result = await build({
  entryPoints: [path.join(root, "scripts/performance/healthKitIngestLoadBenchmark.entry.mjs")],
  bundle: true,
  write: false,
  outfile: out,
  format: "esm",
  platform: "node",
  target: "node22",
  legalComments: "none",
  minify: true,
  external: ["pg"],
  define: {
    __EXPECTED_GIT_SHA__: JSON.stringify(sha),
    __MARKER__: JSON.stringify(marker),
  },
});
fs.writeFileSync(out, `// PHYSIQUEOS_AUDIT_SUCCESS_MARKER: ${marker}\n${result.outputFiles[0].text}`);
process.stdout.write(`${JSON.stringify({ out, marker, bytes: fs.statSync(out).size })}\n`);

// Bundles the guarded historical Super Set correction into the single source
// file transported by the approved App Platform console runner.
//
// Usage:
//   node scripts/operations/buildHistoricalTrainingSupersetCorrectionPayload.mjs \
//     --sha <40-hex deployed SHA> --mode preview --out <file>
//   node scripts/operations/buildHistoricalTrainingSupersetCorrectionPayload.mjs \
//     --sha <40-hex deployed SHA> --mode apply --authorization-ref <text> \
//     --expected <sealed-preview.json> --out <file>
//
// Building a payload executes nothing. Apply remains separately authorized.
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export async function buildHistoricalTrainingSupersetCorrectionPayload({
  sha,
  mode = "preview",
  authorizationReference = "",
  expected = "",
  marker,
} = {}) {
  if (!/^[0-9a-f]{40}$/.test(String(sha ?? ""))) throw new Error("--sha must be the 40-hex production commit.");
  if (!["preview", "apply"].includes(mode)) throw new Error("--mode must be preview or apply.");
  if (mode === "apply" && (!String(authorizationReference).trim() || !String(expected).trim())) {
    throw new Error("apply mode requires --authorization-ref and --expected.");
  }
  const successMarker = marker ??
    `PHYSIQUEOS_HISTORICAL_SUPERSET_${mode === "apply" ? "APPLY" : "PREVIEW"}_SUCCESS_${randomBytes(4).toString("hex")}`;
  const result = await build({
    entryPoints: [path.join(root, "scripts/operations/historicalTrainingSupersetCorrection.entry.mjs")],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    target: "node22",
    legalComments: "none",
    minify: true,
    external: ["pg"],
    define: {
      __EXPECTED_GIT_SHA__: JSON.stringify(sha),
      __MODE__: JSON.stringify(mode),
      __AUTHORIZATION_REFERENCE__: JSON.stringify(String(authorizationReference)),
      __EXPECTED_JSON__: JSON.stringify(String(expected)),
      __MARKER__: JSON.stringify(successMarker),
    },
  });
  return { code: `// PHYSIQUEOS_AUDIT_SUCCESS_MARKER: ${successMarker}\n${result.outputFiles[0].text}`, marker: successMarker };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) =>
    (value.startsWith("--") ? [...pairs, [value.slice(2), all[index + 1]]] : pairs), []));
  const expected = args.expected ? fs.readFileSync(args.expected, "utf8").trim() : "";
  const { code, marker } = await buildHistoricalTrainingSupersetCorrectionPayload({
    sha: args.sha,
    mode: args.mode,
    authorizationReference: args["authorization-ref"],
    expected,
  });
  if (!args.out) throw new Error("--out is required.");
  fs.writeFileSync(args.out, code, { mode: 0o600 });
  console.log(`wrote ${args.out} (${code.length} bytes)\nmarker ${marker}`);
}


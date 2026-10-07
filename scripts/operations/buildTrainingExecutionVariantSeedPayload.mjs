// Bundles the historical Static Hold execution-variant seed (and the exact domain code it depends
// on) into the single file the accepted console runner transports. Usage:
//   node scripts/operations/buildTrainingExecutionVariantSeedPayload.mjs --sha <40-hex deployed SHA> \
//     --mode dry-run|apply [--authorization-ref <text>] [--expected <json file of the dry run's facts>] --out <file>
// Building a payload executes nothing. Running it in production is a separate, explicitly
// Founder-authorized act through the accepted read-only/apply console runner.
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export async function buildTrainingExecutionVariantSeedPayload({
  sha, mode = "dry-run", authorizationReference = "", expected = "", marker,
} = {}) {
  if (!/^[0-9a-f]{40}$/.test(String(sha ?? ""))) throw new Error("--sha must be the 40-hex production commit the payload is authorized for.");
  if (!["dry-run", "apply"].includes(mode)) throw new Error("--mode must be dry-run or apply.");
  if (mode === "apply" && (!String(authorizationReference).trim() || !String(expected).trim())) {
    throw new Error("apply mode requires --authorization-ref and --expected.");
  }
  const successMarker = marker ??
    `PHYSIQUEOS_TRAINING_VARIANT_SEED_${mode === "apply" ? "APPLY" : "DRYRUN"}_SUCCESS_${randomBytes(4).toString("hex")}`;
  const result = await build({
    entryPoints: [path.join(root, "scripts/operations/trainingExecutionVariantLegacySeed.entry.mjs")],
    bundle: true, write: false, format: "esm", platform: "node", target: "node22", legalComments: "none", minify: true,
    external: ["pg"],
    define: {
      __EXPECTED_GIT_SHA__: JSON.stringify(sha), __MODE__: JSON.stringify(mode),
      __AUTHORIZATION_REFERENCE__: JSON.stringify(String(authorizationReference)), __EXPECTED_JSON__: JSON.stringify(String(expected)),
      __MARKER__: JSON.stringify(successMarker),
    },
  });
  return { code: `// PHYSIQUEOS_AUDIT_SUCCESS_MARKER: ${successMarker}\n${result.outputFiles[0].text}`, marker: successMarker };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) =>
    (value.startsWith("--") ? [...pairs, [value.slice(2), all[index + 1]]] : pairs), []));
  const expected = args.expected ? fs.readFileSync(args.expected, "utf8").trim() : "";
  const { code, marker } = await buildTrainingExecutionVariantSeedPayload({
    sha: args.sha, mode: args.mode, authorizationReference: args["authorization-ref"], expected,
  });
  if (!args.out) throw new Error("--out is required.");
  fs.writeFileSync(args.out, code, { mode: 0o600 });
  console.log(`wrote ${args.out} (${code.length} bytes)\nmarker ${marker}`);
}

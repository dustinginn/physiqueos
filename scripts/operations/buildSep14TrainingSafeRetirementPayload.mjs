import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export async function buildSep14TrainingSafeRetirementPayload({ sha, mode = "dry-run", authorizationReference = "", marker } = {}) {
  if (!/^[0-9a-f]{40}$/.test(String(sha ?? ""))) throw new Error("--sha must be the exact 40-hex production commit.");
  if (!["dry-run", "apply"].includes(mode)) throw new Error("--mode must be dry-run or apply.");
  if (mode === "apply" && !String(authorizationReference).trim()) throw new Error("apply mode requires --authorization-ref.");
  const successMarker = marker ?? `PHYSIQUEOS_SEP14_RETIREMENT_${mode === "apply" ? "APPLY" : "DRYRUN"}_SUCCESS_${randomBytes(4).toString("hex")}`;
  const result = await build({
    entryPoints: [path.join(root, "scripts/operations/sep14TrainingSafeRetirement.entry.mjs")],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    target: "node22",
    legalComments: "none",
    define: {
      __EXPECTED_GIT_SHA__: JSON.stringify(sha),
      __MODE__: JSON.stringify(mode),
      __AUTHORIZATION_REFERENCE__: JSON.stringify(String(authorizationReference)),
      __MARKER__: JSON.stringify(successMarker),
    },
  });
  return { code: result.outputFiles[0].text, marker: successMarker };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => value.startsWith("--") ? [...pairs, [value.slice(2), all[index + 1]]] : pairs, []));
  const { code, marker } = await buildSep14TrainingSafeRetirementPayload({
    sha: args.sha,
    mode: args.mode,
    authorizationReference: args["authorization-ref"],
  });
  if (!args.out) throw new Error("--out is required.");
  fs.writeFileSync(args.out, `// PHYSIQUEOS_AUDIT_SUCCESS_MARKER: ${marker}\n${code}`, { mode: 0o600 });
  console.log(`wrote ${args.out}\nmarker ${marker}`);
}

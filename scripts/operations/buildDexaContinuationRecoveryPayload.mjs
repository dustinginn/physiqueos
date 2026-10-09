// Bundles the October 9 DEXA continuation recovery entry (and the exact domain
// code it depends on) into the single file the accepted console runner
// transports. Usage:
//
//   node scripts/operations/buildDexaContinuationRecoveryPayload.mjs --sha <deployed 40-hex> \
//     --mode preview|apply|postflight [--seal <local preview JSON>] [--authorization-ref <text>] --out <file>
//
// --sha must be the production Server commit the payload will run against, and
// that commit must contain the bounded DEXA confirmation steps: recovery
// resumes the review on whatever Server is deployed, and on a Server without
// them the resumed step would exhaust memory again. --seal is the
// PHYSIQUEOS_DEXA_CONTINUATION_RECOVERY_JSON object a fresh preview printed; it
// holds real identifiers and must stay in local operator scratch.
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Content markers of the fix the deployed Server must contain (robust to the
// fix being cherry-picked onto another base).
export const REQUIRED_SERVER_FIX_MARKERS = Object.freeze([
  ["src/application/evidence/DexaConfirmationBoundedSteps.js", "export function createDexaConfirmationBoundedSteps"],
  ["src/app/evidence/review/[reviewId]/actions.js", "createDexaConfirmationBoundedSteps({ userId: user.id"],
  ["src/app/evidence/review/[reviewId]/actions.js", "const synchronousStepBudget"],
  ["src/platform/database/PostgresFounderRepositoryFacade.js", "export async function executePostgresFounderRecordMutation"],
  ["src/application/runtime/ApplicationCanonicalRuntime.js", "mutateCanonicalRecords"],
  ["src/domain/services/FounderRuntimeSemanticDigest.js", "function writeStableSerialization"],
]);

export function assertServerContainsFix(sha, { readBlob = defaultReadBlob } = {}) {
  for (const [file, marker] of REQUIRED_SERVER_FIX_MARKERS) {
    let text;
    try { text = readBlob(sha, file); } catch { throw new Error(`--sha ${sha} is not a commit in this repository with ${file}.`); }
    if (!text.includes(marker)) throw new Error(`--sha ${sha} does not contain the bounded DEXA fix (${file}).`);
  }
}

function defaultReadBlob(sha, file) {
  return execFileSync("git", ["-C", root, "show", `${sha}:${file}`], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}

export async function buildDexaContinuationRecoveryPayload({ sha, mode = "preview", seal = null, authorizationReference = "", marker, readBlob } = {}) {
  if (!/^[0-9a-f]{40}$/.test(String(sha ?? ""))) throw new Error("--sha must be the 40-hex production commit the payload is authorized for.");
  if (!["preview", "apply", "postflight"].includes(mode)) throw new Error("--mode must be preview, apply or postflight.");
  if (mode === "apply" && !String(authorizationReference).trim()) throw new Error("apply mode requires --authorization-ref (the Founder's separate approval).");
  if (mode !== "preview" && !seal?.sealDigest) throw new Error(`${mode} mode requires --seal from a fresh preview.`);
  if (mode === "apply" && seal?.outcome !== "insert_continuation") throw new Error("The seal is not an insert_continuation preview.");
  assertServerContainsFix(sha, readBlob ? { readBlob } : undefined);
  const successMarker = marker ?? `PHYSIQUEOS_DEXA_CONTINUATION_${mode.toUpperCase()}_SUCCESS_${randomBytes(4).toString("hex")}`;
  const result = await build({
    entryPoints: [path.join(root, "scripts/operations/dexaContinuationRecovery.entry.mjs")],
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
      __SEAL__: seal ? JSON.stringify({ sealDigest: seal.sealDigest, sealed: seal.sealed }) : "null",
      __MARKER__: JSON.stringify(successMarker),
    },
  });
  return { code: result.outputFiles[0].text, marker: successMarker };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => (value.startsWith("--") ? [...pairs, [value.slice(2), all[index + 1]]] : pairs), []));
  if (!args.out) throw new Error("--out is required.");
  const seal = args.seal ? JSON.parse(fs.readFileSync(args.seal, "utf8")) : null;
  const { code, marker } = await buildDexaContinuationRecoveryPayload({
    sha: args.sha, mode: args.mode ?? "preview", seal, authorizationReference: args["authorization-ref"] ?? "",
  });
  fs.writeFileSync(args.out, `// PHYSIQUEOS_AUDIT_SUCCESS_MARKER: ${marker}\n${code}`, { mode: 0o600 });
  console.log(`wrote ${args.out}\nmarker ${marker}`);
}

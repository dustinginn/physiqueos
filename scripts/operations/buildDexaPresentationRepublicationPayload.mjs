// Bundles the October 9 DEXA Event presentation republication entry (and the
// exact domain code it depends on) into the single file the accepted console
// runner transports. Usage:
//
//   node scripts/operations/buildDexaPresentationRepublicationPayload.mjs --sha <deployed 40-hex> \
//     --mode preview|apply|postflight [--seal <local preview JSON>] [--authorization-ref <text>] --out <file>
//
// --sha must be the production Server commit the payload will run against. The
// payload words the briefing with the plain-language composer it bundles, so
// that composer must be byte-identical to the deployed one, and the deployed
// presentation path must use it (new DEXA Events then read the same way). The
// bundled write path must likewise be the deployed one. --seal is the
// PHYSIQUEOS_DEXA_PRESENTATION_REPUBLICATION_JSON object a fresh preview printed;
// it holds real identifiers and scan values and must stay in local operator scratch.
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Bundled files that must equal the deployed commit's. The read-only payload
// bundles the composer; the apply payload also bundles the system write path.
export const REQUIRED_IDENTICAL_FILES = Object.freeze([
  "src/domain/services/DEXAEventPlainLanguage.js",
  "src/contracts/v1/canonicalJson.js",
  "src/platform/database/PostgresFounderRepositoryFacade.js",
  "src/platform/cutover/PostgresCombinedRuntimeAuthorityStore.js",
  "src/platform/cutover/CombinedRuntimeAuthorityState.js",
  "src/platform/cutover/compatibilityEnvironmentShape.js",
]);
// The deployed presentation path publishes new DEXA Events in plain language.
export const REQUIRED_SERVER_MARKERS = Object.freeze([
  ["src/domain/services/BriefingGoalConfidencePresentationService.js", "composeDexaEventPlainLanguage({ event, narrativePlan, roles })"],
  ["src/domain/services/DEXAEventPlainLanguage.js", "export function composeDexaEventPlainLanguage"],
]);
export const ENTRIES = Object.freeze({
  preview: "scripts/operations/dexaPresentationRepublication.readonly.entry.mjs",
  postflight: "scripts/operations/dexaPresentationRepublication.readonly.entry.mjs",
  apply: "scripts/operations/dexaPresentationRepublication.apply.entry.mjs",
});

export function assertServerMatchesBundle(sha, { readBlob = defaultReadBlob, readLocal = defaultReadLocal } = {}) {
  const blob = (file) => {
    try { return readBlob(sha, file); } catch { throw new Error(`--sha ${sha} is not a commit in this repository with ${file}.`); }
  };
  for (const [file, marker] of REQUIRED_SERVER_MARKERS) {
    if (!blob(file).includes(marker)) throw new Error(`--sha ${sha} does not publish DEXA Events in plain language (${file}).`);
  }
  for (const file of REQUIRED_IDENTICAL_FILES) {
    if (blob(file) !== readLocal(file)) throw new Error(`--sha ${sha} differs from the bundled ${file}.`);
  }
}

function defaultReadBlob(sha, file) {
  return execFileSync("git", ["-C", root, "show", `${sha}:${file}`], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}
function defaultReadLocal(file) { return fs.readFileSync(path.join(root, file), "utf8"); }

export async function buildDexaPresentationRepublicationPayload({
  sha, mode = "preview", seal = null, authorizationReference = "", marker, readBlob, readLocal,
} = {}) {
  if (!/^[0-9a-f]{40}$/.test(String(sha ?? ""))) throw new Error("--sha must be the 40-hex production commit the payload is authorized for.");
  if (!["preview", "apply", "postflight"].includes(mode)) throw new Error("--mode must be preview, apply or postflight.");
  if (mode === "apply" && !String(authorizationReference).trim()) throw new Error("apply mode requires --authorization-ref (the Founder's separate approval).");
  if (mode !== "preview" && !seal?.sealDigest) throw new Error(`${mode} mode requires --seal from a fresh preview.`);
  if (mode === "apply" && seal?.outcome !== "republish") throw new Error("The seal is not a republish preview.");
  assertServerMatchesBundle(sha, { ...(readBlob ? { readBlob } : {}), ...(readLocal ? { readLocal } : {}) });
  const successMarker = marker ?? `PHYSIQUEOS_DEXA_REPUBLICATION_${mode.toUpperCase()}_SUCCESS_${randomBytes(4).toString("hex")}`;
  const result = await build({
    entryPoints: [path.join(root, ENTRIES[mode])],
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
      __SEAL__: seal ? JSON.stringify({ sealDigest: seal.sealDigest, sealed: seal.sealed, otherBriefings: seal.otherBriefings ?? null }) : "null",
      __MARKER__: JSON.stringify(successMarker),
    },
  });
  return { code: result.outputFiles[0].text, marker: successMarker };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => (value.startsWith("--") ? [...pairs, [value.slice(2), all[index + 1]]] : pairs), []));
  if (!args.out) throw new Error("--out is required.");
  const seal = args.seal ? JSON.parse(fs.readFileSync(args.seal, "utf8")) : null;
  const { code, marker } = await buildDexaPresentationRepublicationPayload({
    sha: args.sha, mode: args.mode ?? "preview", seal, authorizationReference: args["authorization-ref"] ?? "",
  });
  fs.writeFileSync(args.out, `// PHYSIQUEOS_AUDIT_SUCCESS_MARKER: ${marker}\n${code}`, { mode: 0o600 });
  console.log(`wrote ${args.out}\nmarker ${marker}`);
}

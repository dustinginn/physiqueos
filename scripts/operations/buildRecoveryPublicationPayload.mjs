// Bundles a Recovery Briefing V1 publication operation (and the exact deployed domain code it
// depends on) into the single file the accepted console runner transports. Usage:
//   node scripts/operations/buildRecoveryPublicationPayload.mjs --operation authority --sha <40-hex deployed SHA> \
//     --action preview|apply|postverify|disable-preview|disable \
//     [--cadences weekly,monthly --effective-from YYYY-MM-DD --recovery-effective YYYY-MM-DD] \
//     [--authorization-ref <text>] [--expected-seal <seal from the preview>] [--expected-record-digest <32-hex>] --out <file>
//   node scripts/operations/buildRecoveryPublicationPayload.mjs --operation preview --sha <40-hex deployed SHA> \
//     --kind checkpoint|preview --cadence weekly|monthly --start YYYY-MM-DD --end YYYY-MM-DD \
//     [--simulated-effective-from YYYY-MM-DD (diagnostic: simulated authority only)] --out <file>
// Building a payload executes nothing. Running apply or disable in production is a separate,
// explicitly Founder-authorized act through the accepted console runner.
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ACTIONS = Object.freeze(["preview", "apply", "postverify", "disable-preview", "disable"]);

export async function buildRecoveryPublicationPayload({
  operation, sha, action = "preview", cadences = "weekly,monthly", effectiveFrom = "", recoveryEffective = "",
  authorizationReference = "", expectedSeal = "", expectedRecordDigest = "",
  kind = "checkpoint", cadence = "", start = "", end = "", simulatedEffectiveFrom = "", marker,
} = {}) {
  if (!/^[0-9a-f]{40}$/.test(String(sha ?? ""))) throw new Error("--sha must be the 40-hex production commit the payload is authorized for.");
  let define;
  let label;
  if (operation === "authority") {
    if (!ACTIONS.includes(action)) throw new Error(`--action must be one of ${ACTIONS.join(", ")}.`);
    const creating = ["preview", "apply"].includes(action);
    if (creating && (!DATE.test(effectiveFrom) || !DATE.test(recoveryEffective))) {
      throw new Error("preview/apply require --effective-from and --recovery-effective (YYYY-MM-DD).");
    }
    if (creating && !/^(weekly|monthly)(,(weekly|monthly))?$/.test(cadences)) throw new Error("--cadences must be weekly and/or monthly.");
    if (action !== "postverify" && !String(authorizationReference).trim()) throw new Error(`${action} requires --authorization-ref.`);
    if (["apply", "disable"].includes(action) && !/^seal_[0-9a-f]{32}$/.test(expectedSeal)) {
      throw new Error(`${action} requires --expected-seal from the immediately preceding preview.`);
    }
    if (action === "postverify" && !/^[0-9a-f]{32}$/.test(expectedRecordDigest)) {
      throw new Error("postverify requires --expected-record-digest from the applied plan.");
    }
    const desired = creating
      ? { cadences: cadences.split(","), effectiveFromPeriodStart: effectiveFrom, recoveryEffectiveSleepDay: recoveryEffective }
      : null;
    label = `AUTHORITY_${action.toUpperCase().replaceAll("-", "_")}`;
    define = { __OPERATION__: "authority", __ACTION__: action, __DESIRED_JSON__: desired ? JSON.stringify(desired) : "",
      __AUTHORIZATION_REFERENCE__: String(authorizationReference), __EXPECTED_SEAL__: String(expectedSeal),
      __EXPECTED_RECORD_DIGEST__: String(expectedRecordDigest), __PREVIEW_JSON__: "" };
  } else if (operation === "preview") {
    if (!["checkpoint", "preview"].includes(kind)) throw new Error("--kind must be checkpoint or preview.");
    if (!["weekly", "monthly"].includes(cadence)) throw new Error("--cadence must be weekly or monthly.");
    if (!DATE.test(start) || !DATE.test(end)) throw new Error("--start and --end must be YYYY-MM-DD.");
    if (simulatedEffectiveFrom && !DATE.test(simulatedEffectiveFrom)) throw new Error("--simulated-effective-from must be YYYY-MM-DD.");
    label = `PREVIEW_${kind.toUpperCase()}`;
    define = { __OPERATION__: "preview", __ACTION__: "", __DESIRED_JSON__: "", __AUTHORIZATION_REFERENCE__: "",
      __EXPECTED_SEAL__: "", __EXPECTED_RECORD_DIGEST__: "",
      __PREVIEW_JSON__: JSON.stringify({ kind, cadence, startDate: start, endDate: end,
        ...(simulatedEffectiveFrom ? { simulatedEffectiveFrom } : {}) }) };
  } else {
    throw new Error("--operation must be authority or preview.");
  }
  const successMarker = marker ?? `PHYSIQUEOS_RECOVERY_${label}_SUCCESS_${randomBytes(4).toString("hex")}`;
  const result = await build({
    entryPoints: [path.join(root, "scripts/operations/recoveryPublication.entry.mjs")],
    bundle: true, write: false, format: "esm", platform: "node", target: "node22", legalComments: "none", minify: true,
    external: ["pg"],
    define: Object.fromEntries([
      ["__EXPECTED_GIT_SHA__", sha], ...Object.entries(define), ["__MARKER__", successMarker],
    ].map(([key, value]) => [key, JSON.stringify(value)])),
  });
  return { code: `// PHYSIQUEOS_AUDIT_SUCCESS_MARKER: ${successMarker}\n${result.outputFiles[0].text}`, marker: successMarker };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) =>
    (value.startsWith("--") ? [...pairs, [value.slice(2), all[index + 1]]] : pairs), []));
  const { code, marker } = await buildRecoveryPublicationPayload({
    operation: args.operation, sha: args.sha, action: args.action, cadences: args.cadences ?? "weekly,monthly",
    effectiveFrom: args["effective-from"] ?? "", recoveryEffective: args["recovery-effective"] ?? "",
    authorizationReference: args["authorization-ref"] ?? "", expectedSeal: args["expected-seal"] ?? "",
    expectedRecordDigest: args["expected-record-digest"] ?? "",
    kind: args.kind, cadence: args.cadence, start: args.start, end: args.end,
    simulatedEffectiveFrom: args["simulated-effective-from"] ?? "",
  });
  if (!args.out) throw new Error("--out is required.");
  fs.writeFileSync(args.out, code, { mode: 0o600 });
  console.log(`wrote ${args.out} (${code.length} bytes)\nmarker ${marker}`);
}

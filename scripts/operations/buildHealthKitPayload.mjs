// Bundles a HealthKit production operation (and the exact domain code it depends on) into the
// single file the accepted console runner transports. Usage:
//   node scripts/operations/buildHealthKitPayload.mjs --kind policy --sha <40-hex> \
//     --action activate|deactivate --domains activity,nutrition --effective YYYY-MM-DD (--end YYYY-MM-DD | --open-ended) \
//     --mode dry-run|apply [--authorization-ref <text>] [--expected <json file>] --out <file>
//   (policy) add --policy-kind daily|workout (default daily)
//   node scripts/operations/buildHealthKitPayload.mjs --kind graduation --sha <40-hex> --mode dry-run|apply \
//     --desired '<json: {"projection":{...},"evidenceEligibility":{...}}>' [--authorization-ref <text>] [--expected <json file>] [--no-values] [--simulate-complete] --out <file>
//   node scripts/operations/buildHealthKitPayload.mjs --kind workout-audit --sha <40-hex> --start YYYY-MM-DD --end YYYY-MM-DD [--no-values] --out <file>
//   node scripts/operations/buildHealthKitPayload.mjs --kind audit --sha <40-hex> \
//     --start YYYY-MM-DD --end YYYY-MM-DD [--no-values] --out <file>
//   node scripts/operations/buildHealthKitPayload.mjs --kind link-confirm --sha <40-hex> \
//     --start YYYY-MM-DD --end YYYY-MM-DD --mode dry-run|apply [--authorization-ref <text>] [--expected <json file>] --out <file>
//   (link-confirm) confirms the single candidate strength link in the window through the guarded relationship service
//   node scripts/operations/buildHealthKitPayload.mjs --kind link-reassess --sha <40-hex> \
//     --start YYYY-MM-DD --mode dry-run|apply [--authorization-ref <text>] [--expected <json file>] --out <file>
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function buildHealthKitPayload({
  kind, sha, action, policyKind = "daily", domains = "", effective = "", end = "", start = "", mode = "dry-run",
  authorizationReference = "", expected = "", includeValues = true, marker, desired = "", simulateComplete = false,
  openEnded = false, families = "",
} = {}) {
  if (!/^[0-9a-f]{40}$/.test(String(sha ?? ""))) throw new Error("--sha must be the 40-hex production commit the payload is authorized for.");
  const suffix = randomBytes(4).toString("hex");
  if (kind === "policy") {
    if (!["activate", "deactivate"].includes(action)) throw new Error("--action must be activate or deactivate.");
    if (!["dry-run", "apply"].includes(mode)) throw new Error("--mode must be dry-run or apply.");
    if (!["daily", "workout"].includes(policyKind)) throw new Error("--policy-kind must be daily or workout.");
    if (families && policyKind !== "workout") throw new Error("--families is only supported for --policy-kind workout.");
    if (families && !/^(strength|cardio)(,(strength|cardio))*$/.test(families)) throw new Error("--families must be a comma-separated subset of strength,cardio.");
    if (!DATE.test(effective)) throw new Error("--effective must be YYYY-MM-DD.");
    if (!openEnded && !DATE.test(end)) throw new Error("--end must be YYYY-MM-DD (or pass --open-ended with no --end).");
    if (mode === "apply" && (!String(authorizationReference).trim() || !String(expected).trim())) {
      throw new Error("apply mode requires --authorization-ref and --expected.");
    }
    const successMarker = marker ?? `PHYSIQUEOS_HEALTHKIT_${policyKind === "workout" ? "WORKOUT_" : ""}ACTIVATION_${action.toUpperCase()}_${mode === "apply" ? "APPLY" : "DRYRUN"}_SUCCESS_${suffix}`;
    const result = await build({
      entryPoints: [path.join(root, "scripts/operations/healthKitActivationPolicy.entry.mjs")],
      bundle: true, write: false, format: "esm", platform: "node", target: "node22", legalComments: "none", minify: true,
      external: ["pg"],
      define: {
        __EXPECTED_GIT_SHA__: JSON.stringify(sha), __MODE__: JSON.stringify(mode), __ACTION__: JSON.stringify(action), __POLICY_KIND__: JSON.stringify(policyKind),
        __DOMAINS__: JSON.stringify(domains), __EFFECTIVE__: JSON.stringify(effective), __END__: JSON.stringify(end),
        __OPEN_ENDED__: JSON.stringify(Boolean(openEnded)), __FAMILIES__: JSON.stringify(String(families ?? "")),
        __AUTHORIZATION_REFERENCE__: JSON.stringify(String(authorizationReference)), __EXPECTED_JSON__: JSON.stringify(String(expected)),
        __MARKER__: JSON.stringify(successMarker),
      },
    });
    return { code: `// PHYSIQUEOS_AUDIT_SUCCESS_MARKER: ${successMarker}\n${result.outputFiles[0].text}`, marker: successMarker };
  }
  if (kind === "graduation") {
    if (!["dry-run", "apply"].includes(mode)) throw new Error("--mode must be dry-run or apply.");
    let parsed;
    try { parsed = JSON.parse(String(desired)); } catch { throw new Error("--desired must be valid JSON."); }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("--desired must be a JSON object.");
    if (mode === "apply" && (!String(authorizationReference).trim() || !String(expected).trim())) {
      throw new Error("apply mode requires --authorization-ref and --expected.");
    }
    if (simulateComplete && mode !== "dry-run") throw new Error("--simulate-complete is dry-run only.");
    const successMarker = marker ?? `PHYSIQUEOS_HEALTHKIT_GRADUATION_${mode === "apply" ? "APPLY" : "DRYRUN"}_SUCCESS_${suffix}`;
    const result = await build({
      entryPoints: [path.join(root, "scripts/operations/healthKitGraduationPolicy.entry.mjs")],
      bundle: true, write: false, format: "esm", platform: "node", target: "node22", legalComments: "none", minify: true,
      external: ["pg"],
      define: {
        __EXPECTED_GIT_SHA__: JSON.stringify(sha), __MODE__: JSON.stringify(mode), __DESIRED_JSON__: JSON.stringify(JSON.stringify(parsed)),
        __AUTHORIZATION_REFERENCE__: JSON.stringify(String(authorizationReference)), __EXPECTED_JSON__: JSON.stringify(String(expected)),
        __INCLUDE_VALUES__: JSON.stringify(Boolean(includeValues)), __SIMULATE_COMPLETE__: JSON.stringify(Boolean(simulateComplete)),
        __MARKER__: JSON.stringify(successMarker),
      },
    });
    return { code: `// PHYSIQUEOS_AUDIT_SUCCESS_MARKER: ${successMarker}\n${result.outputFiles[0].text}`, marker: successMarker };
  }
  if (kind === "audit") {
    if (!DATE.test(start) || !DATE.test(end) || start > end) throw new Error("--start and --end must be an ordered YYYY-MM-DD window.");
    const successMarker = marker ?? `PHYSIQUEOS_HEALTHKIT_ACCEPTANCE_AUDIT_SUCCESS_${suffix}`;
    const result = await build({
      entryPoints: [path.join(root, "scripts/operations/healthKitCanonicalAcceptanceAudit.entry.mjs")],
      bundle: true, write: false, format: "esm", platform: "node", target: "node22", legalComments: "none", minify: true,
      external: ["pg"],
      define: {
        __EXPECTED_GIT_SHA__: JSON.stringify(sha), __START__: JSON.stringify(start), __END__: JSON.stringify(end),
        __INCLUDE_VALUES__: JSON.stringify(Boolean(includeValues)), __MARKER__: JSON.stringify(successMarker),
      },
    });
    return { code: `// PHYSIQUEOS_AUDIT_SUCCESS_MARKER: ${successMarker}\n${result.outputFiles[0].text}`, marker: successMarker };
  }
  if (kind === "workout-audit") {
    if (!DATE.test(start) || !DATE.test(end) || start > end) throw new Error("--start and --end must be an ordered YYYY-MM-DD window.");
    const successMarker = marker ?? `PHYSIQUEOS_HEALTHKIT_WORKOUT_AUDIT_SUCCESS_${suffix}`;
    const result = await build({
      entryPoints: [path.join(root, "scripts/operations/healthKitWorkoutCanaryAudit.entry.mjs")],
      bundle: true, write: false, format: "esm", platform: "node", target: "node22", legalComments: "none", minify: true,
      external: ["pg"],
      define: {
        __EXPECTED_GIT_SHA__: JSON.stringify(sha), __START__: JSON.stringify(start), __END__: JSON.stringify(end),
        __INCLUDE_VALUES__: JSON.stringify(Boolean(includeValues)), __MARKER__: JSON.stringify(successMarker),
      },
    });
    return { code: `// PHYSIQUEOS_AUDIT_SUCCESS_MARKER: ${successMarker}\n${result.outputFiles[0].text}`, marker: successMarker };
  }
  if (kind === "link-confirm") {
    if (!["dry-run", "apply"].includes(mode)) throw new Error("--mode must be dry-run or apply.");
    if (!DATE.test(start) || !DATE.test(end) || start > end) throw new Error("--start and --end must be an ordered YYYY-MM-DD window.");
    if (mode === "apply" && (!String(authorizationReference).trim() || !String(expected).trim())) {
      throw new Error("apply mode requires --authorization-ref and --expected.");
    }
    const successMarker = marker ?? `PHYSIQUEOS_HEALTHKIT_LINK_CONFIRMATION_${mode === "apply" ? "APPLY" : "DRYRUN"}_SUCCESS_${suffix}`;
    const result = await build({
      entryPoints: [path.join(root, "scripts/operations/healthKitWorkoutLinkConfirmation.entry.mjs")],
      bundle: true, write: false, format: "esm", platform: "node", target: "node22", legalComments: "none", minify: true,
      external: ["pg"],
      define: {
        __EXPECTED_GIT_SHA__: JSON.stringify(sha), __MODE__: JSON.stringify(mode),
        __START__: JSON.stringify(start), __END__: JSON.stringify(end),
        __AUTHORIZATION_REFERENCE__: JSON.stringify(String(authorizationReference)), __EXPECTED_JSON__: JSON.stringify(String(expected)),
        __MARKER__: JSON.stringify(successMarker),
      },
    });
    return { code: `// PHYSIQUEOS_AUDIT_SUCCESS_MARKER: ${successMarker}\n${result.outputFiles[0].text}`, marker: successMarker };
  }
  if (kind === "link-reassess") {
    if (!["dry-run", "apply"].includes(mode)) throw new Error("--mode must be dry-run or apply.");
    if (!DATE.test(start)) throw new Error("--start must be the YYYY-MM-DD local date to reassess.");
    if (mode === "apply" && (!String(authorizationReference).trim() || !String(expected).trim())) {
      throw new Error("apply mode requires --authorization-ref and --expected.");
    }
    const successMarker = marker ?? `PHYSIQUEOS_HEALTHKIT_LINK_REASSESSMENT_${mode === "apply" ? "APPLY" : "DRYRUN"}_SUCCESS_${suffix}`;
    const result = await build({
      entryPoints: [path.join(root, "scripts/operations/healthKitWorkoutLinkReassessment.entry.mjs")],
      bundle: true, write: false, format: "esm", platform: "node", target: "node22", legalComments: "none", minify: true,
      external: ["pg"],
      define: {
        __EXPECTED_GIT_SHA__: JSON.stringify(sha), __MODE__: JSON.stringify(mode), __DATE__: JSON.stringify(start),
        __AUTHORIZATION_REFERENCE__: JSON.stringify(String(authorizationReference)), __EXPECTED_JSON__: JSON.stringify(String(expected)),
        __MARKER__: JSON.stringify(successMarker),
      },
    });
    return { code: `// PHYSIQUEOS_AUDIT_SUCCESS_MARKER: ${successMarker}\n${result.outputFiles[0].text}`, marker: successMarker };
  }
  if (kind === "training-audit") {
    if (!DATE.test(start)) throw new Error("--start must be the YYYY-MM-DD local date to audit.");
    const successMarker = marker ?? `PHYSIQUEOS_HEALTHKIT_TRAINING_AUDIT_SUCCESS_${suffix}`;
    const result = await build({
      entryPoints: [path.join(root, "scripts/operations/healthKitTrainingReconciliationAudit.entry.mjs")],
      bundle: true, write: false, format: "esm", platform: "node", target: "node22", legalComments: "none", minify: true,
      external: ["pg"],
      define: { __EXPECTED_GIT_SHA__: JSON.stringify(sha), __START__: JSON.stringify(start), __MARKER__: JSON.stringify(successMarker) },
    });
    return { code: `// PHYSIQUEOS_AUDIT_SUCCESS_MARKER: ${successMarker}\n${result.outputFiles[0].text}`, marker: successMarker };
  }
  throw new Error("--kind must be policy, graduation, audit, workout-audit, link-confirm, link-reassess, or training-audit.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) =>
    (value.startsWith("--") ? [...pairs, [value.slice(2), value.startsWith("--no-") ? true : all[index + 1]]] : pairs), []));
  const expected = args.expected ? fs.readFileSync(args.expected, "utf8").trim() : "";
  const { code, marker } = await buildHealthKitPayload({
    kind: args.kind, sha: args.sha, action: args.action, policyKind: args["policy-kind"] ?? "daily", domains: args.domains, effective: args.effective, end: args.end,
    start: args.start, mode: args.mode, authorizationReference: args["authorization-ref"], expected, desired: args.desired, simulateComplete: Boolean(args["simulate-complete"]),
    includeValues: !args["no-values"], openEnded: Boolean(args["open-ended"]), families: args.families ?? "",
  });
  if (!args.out) throw new Error("--out is required.");
  fs.writeFileSync(args.out, code, { mode: 0o600 });
  console.log(`wrote ${args.out} (${code.length} bytes)\nmarker ${marker}`);
}

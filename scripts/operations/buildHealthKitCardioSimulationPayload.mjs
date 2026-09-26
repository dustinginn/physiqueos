// Bundles the zero-write Phase 1 Cardio strategic-graduation simulation into the single file the
// accepted console runner transports.
//   node scripts/operations/buildHealthKitCardioSimulationPayload.mjs --sha <40-hex> \
//     --start YYYY-MM-DD --end YYYY-MM-DD [--tz <IANA>] --out <file>
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function buildHealthKitCardioSimulationPayload({ sha, start, end, timeZone = "America/Chicago", marker } = {}) {
  if (!/^[0-9a-f]{40}$/.test(String(sha ?? ""))) throw new Error("--sha must be the 40-hex production commit the payload is authorized for.");
  if (!DATE.test(start) || !DATE.test(end) || start > end) throw new Error("--start and --end must be an ordered YYYY-MM-DD window.");
  const successMarker = marker ?? `PHYSIQUEOS_HEALTHKIT_CARDIO_SIMULATION_SUCCESS_${randomBytes(4).toString("hex")}`;
  const result = await build({
    entryPoints: [path.join(root, "scripts/operations/healthKitCardioStrategicGraduationSimulation.entry.mjs")],
    bundle: true, write: false, format: "esm", platform: "node", target: "node22", legalComments: "none", minify: true,
    external: ["pg"],
    define: {
      __EXPECTED_GIT_SHA__: JSON.stringify(sha), __START__: JSON.stringify(start), __END__: JSON.stringify(end),
      __TIME_ZONE__: JSON.stringify(timeZone), __MARKER__: JSON.stringify(successMarker),
    },
  });
  return { code: `// PHYSIQUEOS_AUDIT_SUCCESS_MARKER: ${successMarker}\n${result.outputFiles[0].text}`, marker: successMarker };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) =>
    (value.startsWith("--") ? [...pairs, [value.slice(2), all[index + 1]]] : pairs), []));
  if (!args.out) { process.stderr.write("--out is required\n"); process.exit(1); }
  try {
    const { code, marker } = await buildHealthKitCardioSimulationPayload({ sha: args.sha, start: args.start, end: args.end, timeZone: args.tz });
    fs.writeFileSync(args.out, code, { mode: 0o600 });
    process.stdout.write(`wrote ${args.out} marker=${marker}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}

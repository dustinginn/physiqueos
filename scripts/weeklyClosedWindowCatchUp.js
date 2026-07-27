import { FounderRepositories } from "../src/data/repositories/founderRepositories.js";
import { createFounderWeeklyNarrativeService } from "../src/domain/services/WeeklyNarrativeService.js";

const REQUIRED = ["start", "end", "briefing-date", "time-zone", "expected-artifact-id"];

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const missing = REQUIRED.filter((key) => !args[key]);
  if (missing.length) return fail("invalid_window", `Missing required arguments: ${missing.join(", ")}`);
  const user = await FounderRepositories.users.getCurrentUser();
  if (!user?.id) return fail("generation_failure", "Founder user was not found.");
  const windowContract = {
    cadence: "weekly",
    startDate: args.start,
    endDate: args.end,
    briefingDate: args["briefing-date"],
    timeZone: args["time-zone"],
    expectedArtifactId: args["expected-artifact-id"],
    source: "controlled_cli",
    reason: args.reason ?? "manual_weekly_catch_up",
    idempotencyKey: args["idempotency-key"] ?? null,
  };
  const service = createFounderWeeklyNarrativeService({ repositories: FounderRepositories });
  const result = args.execute === true
    ? await service.catchUpClosedWindow({ userId: user.id, windowContract })
    : await service.prepareClosedWindow({ userId: user.id, windowContract });
  process.stdout.write(`${JSON.stringify({
    mode: args.execute === true ? "execute" : "dry_run",
    status: result.status,
    contract: result.contract ?? null,
    preparation: result.preparation ?? null,
    artifact: result.artifact ? {
      id: result.artifact.id,
      evidenceWindow: result.artifact.evidenceWindow,
      narrativeVersion: result.artifact.briefing?.weeklyNarrative?.provenance?.version ?? null,
      piMemoryId: result.artifact.piMemory?.id ?? null,
    } : null,
    error: result.error ?? null,
  }, null, 2)}\n`);
  if (!["prepared", "matched", "created"].includes(result.status)) process.exitCode = 1;
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--execute") { result.execute = true; continue; }
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) continue;
    result[key] = value;
    index += 1;
  }
  return result;
}
function fail(status, message) {
  process.stdout.write(`${JSON.stringify({ mode: "dry_run", status, error: { code: status, message } }, null, 2)}\n`);
  process.exitCode = 1;
}

main().catch((error) => {
  process.stdout.write(`${JSON.stringify({ status: "generation_failure", error: { code: error?.code ?? "unknown_error", message: String(error?.message ?? error) } }, null, 2)}\n`);
  process.exitCode = 1;
});

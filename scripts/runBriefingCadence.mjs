import { register } from "node:module";

register(new URL("./sourceModuleResolutionHook.mjs", import.meta.url));

const [
  { FounderRepositories },
  { createCadenceExecutionLock, createCadenceExecutionStore },
  { createBriefingCadenceExecutor },
  { createFounderMidweekBriefingService },
  { createFounderMonthlyBriefingService },
  { createFounderWeeklyNarrativeService },
] = await Promise.all([
  import("../src/data/repositories/founderRepositories.js"),
  import("../src/data/operations/CadenceExecutionStore.js"),
  import("../src/domain/services/BriefingCadenceExecutorService.js"),
  import("../src/domain/services/MidweekBriefingService.js"),
  import("../src/domain/services/MonthlyBriefingService.js"),
  import("../src/domain/services/WeeklyNarrativeService.js"),
]);

const argumentsMap = new Map(
  process.argv.slice(2).map((argument) => {
    const [key, ...values] = argument.replace(/^--/, "").split("=");
    return [key, values.join("=") || true];
  })
);
const source = String(argumentsMap.get("source") ?? "manual");
const asOf = argumentsMap.has("as-of")
  ? new Date(String(argumentsMap.get("as-of")))
  : new Date();
if (Number.isNaN(asOf.valueOf())) {
  throw new Error("--as-of must be a valid ISO timestamp.");
}

const executionStore = createCadenceExecutionStore();
const executor = createBriefingCadenceExecutor({
  repositories: FounderRepositories,
  generators: {
    midweek: createFounderMidweekBriefingService({
      repositories: FounderRepositories,
      now: () => asOf,
    }),
    monthly: createFounderMonthlyBriefingService({
      repositories: FounderRepositories,
      now: () => asOf,
    }),
    weekly: createFounderWeeklyNarrativeService({
      repositories: FounderRepositories,
      now: () => asOf,
    }),
  },
  executionStore,
  executionLock: createCadenceExecutionLock(),
  now: () => asOf,
  source,
  runtimeIdentity: {
    pid: process.pid,
    parentPid: process.ppid,
    platform: process.platform,
  },
});

const result = await executor.execute({ asOf });
process.stdout.write(`${JSON.stringify(result)}\n`);
if (result.outcomes.some((outcome) =>
  outcome.resultStatus === "terminal_failure"
)) {
  process.exitCode = 2;
}

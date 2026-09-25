import { createCoreNavigationReadService } from "../../../src/application/core/CoreNavigationReadService.js";
import { createPostgresCoreNavigationReadStore } from "../../../src/platform/database/PostgresCoreNavigationReadStore.js";
import { createTrainingNavigationReadService } from "../../../src/application/training/TrainingNavigationReadService.js";
import { createPostgresTrainingNavigationReadStore } from "../../../src/platform/database/PostgresTrainingNavigationReadStore.js";
import { createRegistryReader } from "./registry.mjs";

export const GROUP = "training";
export function createReaders(options) {
  const readCanonicalExerciseRegistry = createRegistryReader(options);
  return {
    core: createCoreNavigationReadService({ store: createPostgresCoreNavigationReadStore(options), readCanonicalExerciseRegistry }),
    training: createTrainingNavigationReadService({ store: createPostgresTrainingNavigationReadStore(options), readCanonicalExerciseRegistry }),
  };
}
export async function runGroup({ bench, deepFind }) {
  const landing = await bench("training.landing", "training-landing", { context: "all" });
  const myLibrary = await bench("training.library.my", "training-library", { context: "all", libraryScope: "my-library" });
  await bench("training.library.all", "training-library", { context: "all", libraryScope: "all" });
  const exercises = myLibrary?.data?.report?.canonicalExercises ?? [];
  const area = exercises.map((e) => e?.primaryNavigationCategory).find(Boolean);
  if (area) await bench("training.library.category", "training-library", { context: "all", libraryScope: "my-library", path: String(area) });
  const exerciseId = exercises.map((e) => e?.canonicalExerciseId).find(Boolean);
  if (exerciseId) await bench("training.exercise", "training-exercise", { context: "all", exerciseId });
  await bench("training.reporting", "training-reporting", { context: "all" });
  await bench("training.logger", "training-logger", {});
  const latestDay = landing?.data?.report?.latestTrainingDay?.date;
  if (latestDay) {
    const day = await bench("training.day", "training-day", { date: latestDay });
    const sessionId = deepFind(day?.data, (key, child) => key === "sessionId" && typeof child === "string")
      ?? deepFind(landing?.data?.report?.latestTrainingDay, (key, child) => key === "sessionId" && typeof child === "string");
    if (sessionId) await bench("training.session", "training-session", { sessionId });
  }
}

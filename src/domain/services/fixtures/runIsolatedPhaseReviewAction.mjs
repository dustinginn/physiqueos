import fs from "node:fs";
import { createIsolatedProductionShapedPhaseReviewCoordinatorFactory } from
  "../ProductionPhaseReviewCoordinatorFactory.js";

const [, , storePath, requestPath] = process.argv;
const liveStore = JSON.parse(fs.readFileSync(storePath, "utf8"));
const request = JSON.parse(fs.readFileSync(requestPath, "utf8"));
const factory = createIsolatedProductionShapedPhaseReviewCoordinatorFactory({
  runtimeStorePath: storePath,
  liveStore,
  now: () => new Date("2026-08-15T19:00:00.000Z"),
});
const result = await factory.execute(request);
process.stdout.write(`${JSON.stringify(result)}\n`);

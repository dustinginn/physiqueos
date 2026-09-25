import { createProgressEvidenceReadService } from "../../../src/application/progress/ProgressEvidenceReadService.js";
import { createPostgresProgressEvidenceReadStore } from "../../../src/platform/database/PostgresProgressEvidenceReadStore.js";
import { createProgressPhotosReadService } from "../../../src/application/progress/ProgressPhotosReadService.js";
import { createPostgresProgressPhotosReadStore } from "../../../src/platform/database/PostgresProgressPhotosReadStore.js";
import { createEvidenceTimelineReadService } from "../../../src/application/timeline/EvidenceTimelineReadService.js";
import { createPostgresEvidenceTimelineReadStore } from "../../../src/platform/database/PostgresEvidenceTimelineReadStore.js";

export const GROUP = "progress";
export function createReaders(options) {
  return {
    progress: createProgressEvidenceReadService({ store: createPostgresProgressEvidenceReadStore(options) }),
    photos: createProgressPhotosReadService({ store: createPostgresProgressPhotosReadStore(options) }),
    timeline: createEvidenceTimelineReadService({ store: createPostgresEvidenceTimelineReadStore(options) }),
  };
}
export async function runGroup({ bench }) {
  await bench("weight.all", "weight", { context: "all" });
  await bench("weight.lean-mass", "weight", { context: "build-lean-mass" });
  await bench("nutrition.all", "nutrition", { context: "all" });
  await bench("nutrition.lean-mass", "nutrition", { context: "build-lean-mass" });
  await bench("activity.all", "activity", { context: "all" });
  await bench("energy.all", "energy", { context: "all" });
  await bench("dexa.all", "dexa", { context: "all" });
  await bench("photos.all", "photos", { context: "all" });
  await bench("timeline", "timeline", {});
}

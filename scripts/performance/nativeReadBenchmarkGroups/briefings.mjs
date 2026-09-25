import { createBriefingNavigationReadService } from "../../../src/application/briefings/BriefingNavigationReadService.js";
import { createPostgresBriefingNavigationReadStore } from "../../../src/platform/database/PostgresBriefingNavigationReadStore.js";

export const GROUP = "briefings";
export function createReaders(options) {
  return { briefings: createBriefingNavigationReadService({ store: createPostgresBriefingNavigationReadStore(options) }) };
}
export async function runGroup({ bench }) {
  const history = await bench("briefing.history", "briefing-history", { limit: "50" });
  const items = Array.isArray(history?.data?.items) ? history.data.items : [];
  const ids = items.map((item) => item?.artifactId ?? item?.id).filter((id) => typeof id === "string");
  if (ids[0]) await bench("briefing.detail.latest", "briefing", { artifactId: ids[0] });
  const middle = ids[Math.floor(ids.length / 2)];
  if (middle && middle !== ids[0]) await bench("briefing.detail.mid", "briefing", { artifactId: middle });
}

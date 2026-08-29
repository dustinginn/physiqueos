import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { createSeedRepositories } from "../../data/repositories/createSeedRepositories.js";
import { createHomeBriefingService } from "../../domain/services/HomeBriefingService.js";
import { createPhase5SyntheticRuntime } from "../../platform/migration/phase5SyntheticPackage.js";
import { createRepositoryCoreNavigationReadStore } from "../../platform/database/PostgresCoreNavigationReadStore.js";
import { createGoalsHubReadService } from "../goals/GoalsHubReadService.js";
import { createLogReadService } from "../log/LogReadService.js";
import { createOperatingPlanReadService } from "../plan/OperatingPlanReadService.js";
import {
  CORE_NAVIGATION_COLLECTIONS,
  createCoreNavigationReadService,
} from "./CoreNavigationReadService.js";

const NOW = new Date("2026-08-29T12:00:00-07:00");

describe("provider-native core navigation reads", () => {
  it("keeps Home output equivalent to the existing domain composition", async () => {
    const { legacyRepositories, narrow, runtime } = services();
    expect(await narrow.getHome()).toEqual(
      await createHomeBriefingService({
        repositories: legacyRepositories,
        readRuntimeStore: () => runtime,
        now: () => NOW,
      }).getHomeBriefing(runtime.user.id)
    );
  });

  it("keeps Log output equivalent, including direct-entry date and pending reviews", async () => {
    const { legacyRepositories, narrow, principal, runtime } = services();
    expect(await narrow.getLog()).toEqual(
      await createLogReadService({ repositories: legacyRepositories, now: () => NOW }).getLog({
        principal,
        timeZone: runtime.user.timeZone ?? runtime.user.timezone,
      })
    );
  });

  it("keeps Goals output equivalent, including Confidence and transition state", async () => {
    const { legacyRepositories, narrow, principal, runtime } = services();
    expect(await narrow.getGoals()).toEqual(
      await createGoalsHubReadService({
        repositories: legacyRepositories,
        readRuntimeStore: () => runtime,
      }).getGoalsHub({ principal })
    );
  });

  it("keeps Operating Plan output equivalent", async () => {
    const { legacyRepositories, narrow, principal } = services();
    expect(await narrow.getOperatingPlan()).toEqual(
      await createOperatingPlanReadService({ repositories: legacyRepositories })
        .getOperatingPlan({ principal })
    );
  });

  it("uses screen-specific collection sets without reconstructing unrelated domains", () => {
    expect(CORE_NAVIGATION_COLLECTIONS.home).not.toContain("evidencePackages");
    expect(CORE_NAVIGATION_COLLECTIONS.home).not.toContain("trainingPerformanceEvents");
    expect(CORE_NAVIGATION_COLLECTIONS.log).toEqual([
      "user", "evidenceReviews", "canonicalEvidenceObjects",
    ]);
    expect(CORE_NAVIGATION_COLLECTIONS.goals).not.toContain("executionItems");
    expect(CORE_NAVIGATION_COLLECTIONS.operatingPlan).not.toContain("dailyBriefings");
    expect(CORE_NAVIGATION_COLLECTIONS.operatingPlan).not.toContain("analyses");
  });

  it("routes all four production surfaces through the narrow composition", () => {
    for (const route of [
      "src/screens/HomeScreen.jsx",
      "src/app/log/page.js",
      "src/screens/GoalsHubScreen.jsx",
      "src/app/profile/operating-plan/page.js",
    ]) {
      const source = fs.readFileSync(route, "utf8");
      expect(source).toContain("getProductionCoreNavigationReadService");
      expect(source).not.toContain("runInactiveLegacyWebReadScope");
    }
  });
});

function services() {
  const runtime = createPhase5SyntheticRuntime();
  const legacyRuntime = structuredClone(runtime);
  const legacyRepositories = createSeedRepositories(legacyRuntime, {
    allowStagedMutations: false,
  });
  const principal = Object.freeze({
    userId: runtime.user.id,
    deviceId: "test-device",
    sessionId: "test-session",
    scopes: Object.freeze([]),
  });
  return {
    runtime,
    principal,
    legacyRepositories,
    narrow: createCoreNavigationReadService({
      store: createRepositoryCoreNavigationReadStore({
        readRuntimeStore: () => runtime,
      }),
      now: () => NOW,
    }),
  };
}
